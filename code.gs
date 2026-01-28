
/* =================================================================
   BACKEND: GOOGLE APPS SCRIPT (API HYBRID V25.0 - STABLE & CLEAN)
   Fitur:
   - Data Cleaning (Trim & String Force) pada getSiswa & getMapel
   - Smart Leger (Filter Mapel by Tingkat Kelas)
   - Optimized Lookup Key (mencegah data nilai null)
   ================================================================= */

function doGet(e) { return ContentService.createTextOutput("API Si-H2i V25 Online.").setMimeType(ContentService.MimeType.TEXT); }

function doPost(e) {
  var lock = LockService.getScriptLock();
  // Tunggu antrian maks 10 detik agar tidak bentrok saat simpan bersamaan
  if (!lock.tryLock(10000)) {
    return responseJSON({ status: 'error', message: 'Server sibuk. Mohon coba lagi.', statusCode: 503 });
  }

  try {
    var p = {}; 
    try { 
      p = JSON.parse(e.postData.contents); 
    } catch(err) { 
      return responseJSON({ status: 'error', message: 'Invalid JSON format', statusCode: 400 }); 
    }
    
    var r = {};
    switch(p.action) {
      // --- MASTER DATA ---
      case 'getDashboardStats': r = getDashboardStats(); break;
      case 'getMapel': r = getMapel(); break;
      case 'simpanMapel': r = simpanMapel(p); break;
      case 'hapusMapel': r = hapusMapel(p); break;
      case 'getSiswa': r = getSiswa(); break; // CORE FIX HERE
      case 'simpanSiswa': r = simpanSiswa(p); break;
      case 'hapusSiswa': r = hapusSiswa(p); break;
      case 'clearCache': r = clearCache(p.pattern); break;
      
      // --- PENILAIAN & REKAP ---
      case 'getDataPenilaian': r = getDataPenilaianOptimized(p); break;
      case 'getLegerKelas': r = getLegerKelasOptimized(p); break; // CORE FIX HERE
      case 'simpanNilai': r = simpanNilai(p); break;
      case 'hapusNilai': r = hapusNilai(p); break;
      
      // --- JURNAL & JADWAL ---
      case 'getJurnal': r = getJurnal(p); break;
      case 'simpanJurnal': r = simpanJurnal(p); break;
      case 'hapusJurnal': r = hapusJurnal(p); break;
      case 'getJadwal': r = getJadwal(p); break;
      case 'simpanJadwal': r = simpanJadwal(p); break;
      case 'hapusJadwal': r = hapusJadwal(p); break;
      
      // --- PRESENSI CRUD ---
      case 'getPresensi': r = getPresensi(p); break;
      case 'simpanPresensi': r = simpanPresensi(p); break;
      case 'hapusPresensi': r = hapusPresensi(p); break;
      case 'getRekapPresensi': r = getRekapPresensi(p); break;
      case 'getRekapPresensiOptimized': r = getRekapPresensiOptimized(p); break;
      case 'testPresensiData': r = testPresensiData(); break;
      case 'generateSamplePresensiData': r = generateSamplePresensiData(); break;
      case 'debugPresensiFlow': r = debugPresensiFlow(); break;
      case 'debugNISMatching': r = debugNISMatching(); break;
      case 'fixPresensiNIS': r = fixPresensiNIS(); break;
      
      // --- AUDIT ---
      case 'auditDataGap': r = auditDataGap(); break;
      case 'auditPresensiConsistency': r = auditPresensiConsistency(); break;
      
      default: r = { status: 'error', message: 'Action Unknown: ' + p.action, statusCode: 404 };
    }
    
    if (!r.statusCode) r.statusCode = r.status === 'success' ? 200 : 500;
    return responseJSON(r);
    
  } catch(err) {
    return responseJSON({ status: 'error', message: 'Server Error: ' + err.toString(), statusCode: 500 });
  } finally {
    lock.releaseLock(); 
  }
}

function responseJSON(d) { return ContentService.createTextOutput(JSON.stringify(d)).setMimeType(ContentService.MimeType.JSON); }
function getSheet(n) { var ss=SpreadsheetApp.getActiveSpreadsheet(); var s=ss.getSheetByName(n); if(!s) s=ss.insertSheet(n); return s; }
function getCache() { return CacheService.getScriptCache(); }

// --- MASTER DATA ---

function getMapel() {
  try {
    var cache = getCache();
    var cached = cache.get("mapelData");
    if (cached) return { status: 'success', data: JSON.parse(cached), source: 'cache' };

    var d = getSheet("DataMapel").getDataRange().getValues(), o = [];
    for(var i=1;i<d.length;i++){ 
      if(d[i][0]) o.push({
        id_bab: String(d[i][0]).trim(), 
        nama_bab: String(d[i][1]).trim(), 
        config_kolom: String(d[i][5]).trim(), 
        tingkat: String(d[i][6]).trim().toUpperCase(), // Force Uppercase X, XI, XII
        semester: d[i][7]
      }); 
    }
    cache.put("mapelData", JSON.stringify(o), 600); // Cache 10 menit
    return {status:'success', data:o, source: 'sheet'};
  } catch(e) { return {status:'error', message:e.toString()}; }
}

function simpanMapel(p){ 
  var s=getSheet("DataMapel"), d=s.getDataRange().getValues();
  // Clear cache agar data baru langsung muncul
  getCache().remove("mapelData");
  
  if(p.id_bab) {
    for(var i=1;i<d.length;i++){ 
      if(String(d[i][0])==p.id_bab){ 
        s.getRange(i+1, 2).setValue(p.nama_bab);
        s.getRange(i+1, 6).setValue(p.config_kolom);
        s.getRange(i+1, 7).setValue(p.tingkat);
        s.getRange(i+1, 8).setValue(p.semester);
        return {status:'success', message:'Updated'}; 
      } 
    }
  }
  var id="MPL-"+Date.now(); 
  s.appendRow(["'"+id, p.nama_bab, "-", "-", 1, p.config_kolom, p.tingkat, p.semester]); 
  return {status:'success', message:'Created'}; 
}
function hapusMapel(p){ 
  getCache().remove("mapelData");
  var s=getSheet("DataMapel"), d=s.getDataRange().getValues(); 
  for(var i=1;i<d.length;i++){ if(String(d[i][0])==p.id_bab){s.deleteRow(i+1); return {status:'success'};}} 
  return {status:'error'}; 
}

function getSiswa() {
  try {
    var cache = getCache();
    var cached = cache.get("siswaData");
    if (cached) return { status: 'success', data: JSON.parse(cached), source: 'cache' };

    var s = getSheet("DataSiswa");
    var lr = s.getLastRow();
    if(lr <= 1) return {status:'success', data:[]};
    
    var d = s.getRange(1, 1, lr, 3).getValues(); 
    var o = [];
    for(var i=1;i<d.length;i++){ 
      // PERBAIKAN: Pastikan NIS & Kelas di-convert ke String dan di-Trim agar Dropdown Frontend terbaca
      if(d[i][0] && d[i][1]) {
        o.push({
          nis: String(d[i][0]).trim(), 
          nama: String(d[i][1]).trim(), 
          kelas: String(d[i][2] || '').trim().toUpperCase() // Force Uppercase Kelas
        }); 
      }
    }
    
    cache.put("siswaData", JSON.stringify(o), 600);
    return {status:'success', data:o, source: 'sheet'};
  } catch(e) { return {status:'error', message:e.toString()}; }
}

function simpanSiswa(p){ 
  var s=getSheet("DataSiswa"), d=s.getDataRange().getValues();
  getCache().remove("siswaData"); // Clear cache
  getCache().remove("dashboardStats");

  for(var i=1;i<d.length;i++){ if(String(d[i][0])==p.nis){ s.getRange(i+1,2).setValue(p.nama); s.getRange(i+1,3).setValue(p.kelas); return {status:'success'}; } }
  s.appendRow(["'"+p.nis, p.nama, p.kelas]); return {status:'success'}; 
}
function hapusSiswa(p){ 
  getCache().remove("siswaData");
  getCache().remove("dashboardStats");
  var s=getSheet("DataSiswa"), d=s.getDataRange().getValues(); 
  for(var i=1;i<d.length;i++){ if(String(d[i][0])==p.nis){s.deleteRow(i+1); return {status:'success'};}} 
  return {status:'error'}; 
}

function clearCache(pattern) {
  try {
    var cache = getCache();
    if (pattern) cache.remove(pattern); else cache.removeAll();
    return { status: 'success', message: 'Cache cleared' };
  } catch (err) { return { status: 'error', message: err.toString() }; }
}

// --- PENILAIAN (OPTIMIZED) ---

function getDataPenilaianOptimized(p) {
  if(!p.id_bab) return { status: 'error', message: 'ID Mapel required' };

  var allSiswa = getSiswa().data || [];
  // Filter siswa case-insensitive untuk kelas
  var targetSiswa = p.kelas ? allSiswa.filter(function(s) { return s.kelas === p.kelas; }) : allSiswa;
  
  var sheetNilai = getSheet("DataNilai");
  var lr = sheetNilai.getLastRow();
  var dataNilai = [];
  
  if(lr > 1) {
    var rawValues = sheetNilai.getRange(2, 1, lr-1, 4).getValues(); 
    var nilaiMap = {};
    for(var i=0; i<rawValues.length; i++) {
      if(String(rawValues[i][1]).trim() === String(p.id_bab).trim()) {
        nilaiMap[String(rawValues[i][0]).trim()] = {
          detail: rawValues[i][2],
          akhir: rawValues[i][3]
        };
      }
    }
    
    for(var j=0; j<targetSiswa.length; j++) {
      var nis = targetSiswa[j].nis;
      if(nilaiMap[nis]) {
        dataNilai.push({
          nis: nis,
          detail_nilai: String(nilaiMap[nis].detail || ''),
          akhir: nilaiMap[nis].akhir || 0
        });
      }
    }
  }
  
  return { status: 'success', dataSiswa: targetSiswa, dataNilai: dataNilai };
}

function simpanNilai(p) {
  var sheet = getSheet("DataNilai");
  if(sheet.getLastRow()==0) sheet.appendRow(["NIS", "ID_BAB", "DETAIL_NILAI", "NILAI_AKHIR"]);
  
  if(!p.dataNilai || !Array.isArray(p.dataNilai)) return { status: 'error', message: 'Invalid data format' };

  var data = sheet.getDataRange().getValues();
  var mapRowIndex = {}; 
  
  for(var i=1; i<data.length; i++) {
    var key = String(data[i][0]).trim() + "_" + String(data[i][1]).trim();
    mapRowIndex[key] = i + 1;
  }
  
  p.dataNilai.forEach(function(item) {
    var key = String(item.nis).trim() + "_" + String(p.id_bab).trim();
    var rowIdx = mapRowIndex[key];
    var nilaiStr = item.nilai.join(",");
    var akhir = item.akhir || 0;

    if(rowIdx) {
      sheet.getRange(rowIdx, 3).setValue(nilaiStr);
      sheet.getRange(rowIdx, 4).setValue(akhir);
    } else {
      sheet.appendRow(["'" + item.nis, p.id_bab, nilaiStr, akhir]);
      mapRowIndex[key] = sheet.getLastRow();
    }
  });
  
  return { status: 'success', message: 'Data saved successfully' };
}

function getLegerKelasOptimized(p) {
  if(!p.kelas) return { status:'error', message:'Kelas required' };

  var siswaResp = getSiswa();
  if (siswaResp.status !== 'success') return { status:'error', message: 'Gagal ambil siswa' };

  // 1. Filter Siswa by Kelas (Case Insensitive & Trimmed)
  var siswas = siswaResp.data.filter(function(s){ 
    return String(s.kelas).trim().toUpperCase() === String(p.kelas).trim().toUpperCase(); 
  });

  // 2. Filter Mapel by Tingkat Kelas (Fix: Agar Leger Kelas X tidak muncul Mapel XII)
  var mapelResp = getMapel();
  var allMapels = mapelResp.data || [];
  
  // Deteksi Tingkat dari string Kelas (misal: "X IPA 1" -> "X")
  var kelasStr = String(p.kelas).trim().toUpperCase();
  var tingkat = "";
  if(kelasStr.indexOf("XII") === 0) tingkat = "XII";
  else if(kelasStr.indexOf("XI") === 0) tingkat = "XI";
  else if(kelasStr.indexOf("X") === 0) tingkat = "X";
  
  // Filter Mapel: Ambil yang tingkatnya sama, atau "-" (Umum/Semua)
  var mapels = allMapels.filter(function(m) {
    var mt = String(m.tingkat || "").trim().toUpperCase();
    return mt === tingkat || mt === "-" || mt === "";
  });
  
  // 3. Ambil Nilai
  var s = getSheet("DataNilai");
  var lr = s.getLastRow();
  var nilaiMap = {};
  
  if (lr > 1) {
    var raw = s.getRange(2, 1, lr-1, 4).getValues();
    for(var i=0; i<raw.length; i++){
      var nis = String(raw[i][0]).trim();
      var idBab = String(raw[i][1]).trim();
      if(nis && idBab) {
        nilaiMap[nis + "_" + idBab] = raw[i][3]; // Nilai Akhir
      }
    }
  }
  
  return { status:'success', siswa: siswas, mapel: mapels, nilai: nilaiMap };
}

function hapusNilai(p) {
  var s = getSheet("DataNilai");
  var d = s.getDataRange().getValues();
  var toDelete = [];
  
  if (p.nis && p.id_bab) {
    for (var i = d.length - 1; i >= 1; i--) {
      if (String(d[i][0]) == String(p.nis) && String(d[i][1]) == String(p.id_bab)) toDelete.push(i+1);
    }
  } else if (p.id_bab && p.kelas) {
    // Delete by Mapel & Kelas
    var siswaData = getSiswa().data;
    var nisList = siswaData.filter(function(si){ return si.kelas === p.kelas; }).map(function(si){ return si.nis; });
    
    for (var i = d.length - 1; i >= 1; i--) {
      if (String(d[i][1]) == String(p.id_bab) && nisList.indexOf(String(d[i][0])) > -1) toDelete.push(i+1);
    }
  } else if (p.nis) {
    for (var i = d.length - 1; i >= 1; i--) {
      if (String(d[i][0]) == String(p.nis)) toDelete.push(i+1);
    }
  }
  
  toDelete.forEach(function(r){ s.deleteRow(r); });
  return { status: 'success', message: 'Deleted ' + toDelete.length + ' records' };
}

// --- JURNAL & JADWAL ---
function getJurnal(p){ 
  var s=getSheet("DataJurnal"), lr=s.getLastRow(); 
  if(lr<=1)return {status:'success',data:[]}; 
  var limit=(p&&p.forExport)?5000:50; 
  var startRow = Math.max(2, lr - limit + 1);
  var numRows = lr - startRow + 1;
  var d=s.getRange(startRow,1,numRows,s.getLastColumn()).getDisplayValues(); 
  
  // Convert to object structure for frontend compatibility
  var o = [];
  for(var i = 0; i < d.length; i++) {
    if(d[i][0]) {
      o.push({ 
        id: String(d[i][0]), 
        tanggal: d[i][1] || "", 
        guru: d[i][2] || "",
        mapel: d[i][3] || "", 
        kelas: d[i][4] || "",
        jam: d[i][5] || "",
        materi: d[i][6] || "",
        absensi: d[i][7] || "",
        hadir: parseInt(d[i][9]) || 0,
        sakit: parseInt(d[i][10]) || 0,
        izin: parseInt(d[i][11]) || 0,
        alpha: parseInt(d[i][12]) || 0
      });
    }
  }
  
  return {status:'success', data:o}; 
}

function simpanJurnal(p) {
  try {
    console.log("Saving jurnal:", p);
    
    var sheet = getSheet("DataJurnal");
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(["ID_JURNAL", "TANGGAL", "GURU", "MAPEL", "KELAS", "JAM_KE", "MATERI", "DETAIL_ABSENSI", "TOTAL_SISWA", "JML_HADIR", "JML_SAKIT", "JML_IZIN", "JML_ALPHA"]);
    }

    var strAbsen = "-";
    var stats = { H:0, S:0, I:0, A:0 };
    if (p.absen && Array.isArray(p.absen)) {
      strAbsen = p.absen.map(function(s){ 
        if(stats[s.status] !== undefined) stats[s.status]++;
        else if(s.status == 'S') stats.S++; else if(s.status == 'I') stats.I++; else if(s.status == 'A') stats.A++;
        return s.nama + " (" + s.status + ")"; 
      }).join(", ");
    }

    var total = parseInt(p.totalSiswa) || 0;
    var hadir = total - ((p.absen) ? p.absen.length : 0);
    if(p.stats) stats = p.stats;

    if (p.id) {
      var data = sheet.getDataRange().getValues();
      for (var i = 1; i < data.length; i++) {
        if (String(data[i][0]) === String(p.id)) {
          sheet.getRange(i + 1, 1, 1, 13).setValues([[p.id, p.tanggal, p.guru, p.mapel, p.kelas, p.jam, p.materi, strAbsen, total, stats.H || hadir, stats.S, stats.I, stats.A]]);
          
          // SIMPAN PRESENSI KE SHEET TERPISAH (DataPresensi)
          if (p.absen && Array.isArray(p.absen)) {
            try {
              var presensiData = {
                tanggal: p.tanggal,
                guru: p.guru,
                mapel: p.mapel,
                kelas: p.kelas,
                jam: p.jam,
                absen: p.absen.map(function(student) {
                  return {
                    nis: student.nis,
                    nama: student.nama,
                    status: student.status,
                    keterangan: student.keterangan || ""
                  };
                })
              };
              
              var batchResult = simpanBatchPresensi(presensiData);
              console.log("Batch presensi result:", batchResult);
            } catch (presensiError) {
              console.warn("Failed to save presensi to DataPresensi sheet:", presensiError);
            }
          }
          
          // Clear cache untuk sinkronisasi data
          try {
            var cache = getCache();
            cache.remove("jurnalData");
            console.log("Cleared jurnal cache after update");
          } catch (e) {
            console.warn("Failed to clear jurnal cache:", e);
          }
          
          return { status: 'success', message: 'Updated' };
        }
      }
    }

    var newId = "JRN-" + Date.now();
    sheet.appendRow(["'" + newId, p.tanggal, p.guru, p.mapel, p.kelas, p.jam, p.materi, strAbsen, total, stats.H || hadir, stats.S, stats.I, stats.A]);
    
    // SIMPAN PRESENSI KE SHEET TERPISAH (DataPresensi)
    if (p.absen && Array.isArray(p.absen)) {
      try {
        var presensiData = {
          tanggal: p.tanggal,
          guru: p.guru,
          mapel: p.mapel,
          kelas: p.kelas,
          jam: p.jam,
          absen: p.absen.map(function(student) {
            return {
              nis: student.nis,
              nama: student.nama,
              status: student.status,
              keterangan: student.keterangan || ""
            };
          })
        };
        
        var batchResult = simpanBatchPresensi(presensiData);
        console.log("Batch presensi result:", batchResult);
      } catch (presensiError) {
        console.warn("Failed to save presensi to DataPresensi sheet:", presensiError);
      }
    }
    
    // Clear cache untuk sinkronisasi data
    try {
      var cache = getCache();
      cache.remove("jurnalData");
      console.log("Cleared jurnal cache");
    } catch (e) {
      console.warn("Failed to clear jurnal cache:", e);
    }
    
    return { status: 'success', message: 'Saved', id: newId };
  } catch (err) {
    console.error("Error in simpanJurnal: " + err.toString());
    return { status: 'error', message: 'Gagal simpan jurnal: ' + err.toString() };
  }
}
function hapusJurnal(p) {
  try {
    console.log("Deleting jurnal:", p);
    
    var sheet = getSheet("DataJurnal");
    var data = sheet.getDataRange().getValues();
    var deleted = false;
    var jurnalData = null;
    
    // Find and get jurnal data before deletion
    for (var i = data.length - 1; i >= 1; i--) {
      if (String(data[i][0]) === p.id) {
        jurnalData = {
          id: String(data[i][0]),
          tanggal: data[i][1] || "",
          guru: data[i][2] || "",
          mapel: data[i][3] || "",
          kelas: data[i][4] || "",
          jam: data[i][5] || ""
        };
        sheet.deleteRow(i + 1);
        deleted = true;
        console.log("Deleted jurnal ID: " + p.id);
        break;
      }
    }
    
    if (!deleted) {
      return { status: 'error', message: 'Jurnal tidak ditemukan' };
    }
    
    // DELETE RELATED PRESENSI DATA
    if (jurnalData) {
      try {
        var presensiSheet = getSheet("DataPresensi");
        var presensiData = presensiSheet.getDataRange().getValues();
        var deletedPresensi = 0;
        
        // Find and delete presensi records matching the jurnal
        for (var i = presensiData.length - 1; i >= 1; i--) {
          var presensiRecord = {
            tanggal: presensiData[i][1] || "",
            kelas: presensiData[i][4] || "",
            mapel: presensiData[i][5] || "",
            guru: presensiData[i][6] || "",
            jam: presensiData[i][7] || ""
          };
          
          // Match by tanggal, kelas, mapel, guru, jam
          if (presensiRecord.tanggal === jurnalData.tanggal &&
              presensiRecord.kelas === jurnalData.kelas &&
              presensiRecord.mapel === jurnalData.mapel &&
              presensiRecord.guru === jurnalData.guru &&
              presensiRecord.jam === jurnalData.jam) {
            presensiSheet.deleteRow(i + 1);
            deletedPresensi++;
          }
        }
        
        console.log("Deleted " + deletedPresensi + " related presensi records");
        
        // Clear presensi cache
        clearPresensiCache();
        
      } catch (presensiError) {
        console.warn("Failed to delete related presensi data:", presensiError);
        // Don't fail the main delete if presensi delete fails
      }
    }
    
    // Clear jurnal cache
    try {
      var cache = getCache();
      cache.remove("jurnalData");
      console.log("Cleared jurnal cache");
    } catch (e) {
      console.warn("Failed to clear jurnal cache:", e);
    }
    
    return { status: 'success', message: 'Jurnal dan data presensi terkait berhasil dihapus' };
  } catch (err) {
    console.error("Error in hapusJurnal: " + err.toString());
    return { status: 'error', message: 'Gagal hapus jurnal: ' + err.toString() };
  }
}

function getJadwal(){ 
  try {
    var cache = getCache();
    var cached = cache.get("jadwalData");
    if (cached) return { status: 'success', data: JSON.parse(cached), source: 'cache' };

    var d=getSheet("DataJadwal").getDataRange().getValues(), o=[]; 
    for(var i=1;i<d.length;i++){if(d[i][0])o.push({id:String(d[i][0]),hari:d[i][1],jam:d[i][2],kelas:d[i][3],mapel:d[i][4]});} 
    
    cache.put("jadwalData", JSON.stringify(o), 600);
    return {status:'success',data:o, source: 'sheet'}; 
  } catch(e) { return {status:'error', message:e.toString()}; }
}
function simpanJadwal(p){ 
  var s=getSheet("DataJadwal"), d=s.getDataRange().getValues();
  getCache().remove("jadwalData");
  getCache().remove("dashboardStats");
  
  if(p.id) {
    for(var i=1;i<d.length;i++){ 
      if(String(d[i][0])==p.id){ s.getRange(i+1, 2, 1, 4).setValues([[p.hari, p.jam, p.kelas, p.mapel]]); return {status:'success', message:'Updated'}; } 
    }
  }
  var id="JDW-"+Date.now(); s.appendRow(["'"+id, p.hari, p.jam, p.kelas, p.mapel]); return {status:'success', message:'Created'}; 
}
function hapusJadwal(p){ 
  getCache().remove("jadwalData");
  getCache().remove("dashboardStats");
  var s=getSheet("DataJadwal"), d=s.getDataRange().getValues(); 
  for(var i=1;i<d.length;i++){ if(String(d[i][0])==p.id){s.deleteRow(i+1); return {status:'success'};}} 
  return {status:'error'}; 
}

function getDashboardStats() {
  try {
    var cache = getCache();
    var cached = cache.get("dashboardStats");
    if (cached) return { status: 'success', data: JSON.parse(cached), source: 'cache' };

    var siswa = getSheet("DataSiswa").getLastRow() - 1;
    var mapel = getSheet("DataMapel").getLastRow() - 1;
    var jurnal = getSheet("DataJurnal").getLastRow() - 1;
    var jadwal = getSheet("DataJadwal").getLastRow() - 1;
    
    var stats = { totalSiswa: Math.max(0,siswa), totalMapel: Math.max(0,mapel), totalJurnal: Math.max(0,jurnal), totalJadwal: Math.max(0,jadwal) };
    
    cache.put("dashboardStats", JSON.stringify(stats), 300);
    return { status: 'success', data: stats, source: 'sheet' };
  } catch(e) { return {status:'error', message:e.toString()}; }
}

function auditDataGap() {
  var siswaData = getSiswa().data || [];
  var mapelData = getMapel().data || [];
  var nilaiValues = getSheet("DataNilai").getDataRange().getValues();
  
  var siswaSet = new Set(siswaData.map(function(s){ return s.nis; }));
  var mapelSet = new Set(mapelData.map(function(m){ return m.id_bab; }));
  
  var issues = [];
  var orphanNilai = 0;
  
  for (var i = 1; i < nilaiValues.length; i++) {
    if (nilaiValues[i][0] && !siswaSet.has(String(nilaiValues[i][0]).trim())) orphanNilai++;
    else if (nilaiValues[i][1] && !mapelSet.has(String(nilaiValues[i][1]).trim())) orphanNilai++;
  }
  
  if (orphanNilai > 0) issues.push({ description: "Data nilai tanpa siswa/mapel (Orphan)", count: orphanNilai });
  
  var kelasCount = {};
  siswaData.forEach(function(s){ if(s.kelas) kelasCount[s.kelas] = (kelasCount[s.kelas]||0)+1; });
  
  var dist = [];
  for(var k in kelasCount) dist.push({kelas:k, jumlah:kelasCount[k]});
  
  return { status: 'success', data: { totalSiswa: siswaData.length, totalMapel: mapelData.length, totalKelas: Object.keys(kelasCount).length, issues: issues, kelasDistribution: dist } };
}

function getRekapPresensi(p) {
  try {
    console.log("getRekapPresensi called with params:", p);
    
    // Get siswa data first
    var siswaResp = getSiswa({});
    if (siswaResp.status !== 'success') {
      console.error("Failed to get siswa data:", siswaResp);
      return { status: 'error', message: 'Gagal mengambil data siswa' };
    }
    
    var allSiswa = siswaResp.data || [];
    console.log("Total siswa found:", allSiswa.length);
    
    // Get presensi data from DataPresensi sheet
    var presensiResp = getPresensi({});
    if (presensiResp.status !== 'success') {
      console.error("Failed to get presensi data:", presensiResp);
      return { status: 'error', message: 'Gagal mengambil data presensi' };
    }
    
    var allPresensi = presensiResp.data || [];
    console.log("Total presensi records found:", allPresensi.length);
    
    // Filter siswa by kelas if specified
    if (p.kelas && p.kelas !== "") {
      allSiswa = allSiswa.filter(function(s) {
        return s.kelas === p.kelas;
      });
      console.log("Siswa filtered by kelas", p.kelas, ":", allSiswa.length);
    }
    
    // Filter presensi by date range based on tipe
    var today = new Date();
    var startDate, endDate;
    
    if (p.tipe === "harian" && p.tanggal) {
      // Daily filter
      startDate = new Date(p.tanggal);
      endDate = new Date(p.tanggal);
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 999);
    } else if (p.tipe === "mingguan" && p.minggu && p.tahun) {
      // Weekly filter
      var weekNumber = parseInt(p.minggu);
      var year = parseInt(p.tahun);
      startDate = getDateOfWeek(weekNumber, year);
      endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + 6);
    } else if (p.tipe === "bulanan" && p.bulan && p.tahun) {
      // Monthly filter
      var month = parseInt(p.bulan) - 1; // JavaScript months are 0-indexed
      var year = parseInt(p.tahun);
      startDate = new Date(year, month, 1);
      endDate = new Date(year, month + 1, 0); // Last day of month
    } else if (p.tipe === "semester" && p.semester && p.tahun) {
      // Semester filter
      var semester = parseInt(p.semester);
      var year = parseInt(p.tahun);
      
      if (semester === 1) {
        // Ganjil: Juli - Desember
        startDate = new Date(year, 6, 1); // July 1
        endDate = new Date(year, 11, 31); // December 31
      } else {
        // Genap: Januari - Juni
        startDate = new Date(year, 0, 1); // January 1
        endDate = new Date(year, 5, 30); // June 30
      }
    } else {
      // Default to current month if no filter specified
      startDate = new Date(today.getFullYear(), today.getMonth(), 1);
      endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    }
    
    console.log("Date range filter:", startDate, "to", endDate);
    
    // Filter presensi data by date range and kelas
    var filteredPresensi = allPresensi.filter(function(pr) {
      if (!pr.tanggal) {
        console.log("Skipping presensi record without tanggal:", pr);
        return false;
      }
      var presensiDate = new Date(pr.tanggal);
      var dateInRange = presensiDate >= startDate && presensiDate <= endDate;
      var kelasMatch = (!p.kelas || p.kelas === "") || pr.kelas === p.kelas;
      return dateInRange && kelasMatch;
    });
    
    console.log("Presensi filtered by date and kelas:", filteredPresensi.length);
    
    // Process data per siswa
    var processedData = [];
    var totals = { hadir: 0, sakit: 0, izin: 0, alpha: 0 };
    
    allSiswa.forEach(function(siswa) {
      // Get presensi for this siswa in the date range
      var siswaPresensi = filteredPresensi.filter(function(pr) {
        return pr.nis === siswa.nis;
      });
      
      // Count attendance status
      var hadir = 0, sakit = 0, izin = 0, alpha = 0;
      
      siswaPresensi.forEach(function(pr) {
        switch(pr.status) {
          case 'H': hadir++; break;
          case 'S': sakit++; break;
          case 'I': izin++; break;
          case 'A': alpha++; break;
        }
      });
      
      var total = hadir + sakit + izin + alpha;
      
      // Add to processed data
      processedData.push({
        nis: siswa.nis,
        nama: siswa.nama,
        kelas: siswa.kelas,
        hadir: hadir,
        sakit: sakit,
        izin: izin,
        alpha: alpha,
        total: total,
        persentaseHadir: total > 0 ? Math.round((hadir / total) * 100) : 0
      });
      
      // Add to totals
      totals.hadir += hadir;
      totals.sakit += sakit;
      totals.izin += izin;
      totals.alpha += alpha;
    });
    
    console.log("Processed data for", processedData.length, "students");
    console.log("Sample processed data:", processedData.slice(0, 3));
    console.log("Totals:", totals);
    
    // Sort by nama
    processedData.sort(function(a, b) {
      return a.nama.localeCompare(b.nama);
    });
    
    var result = {
      status: 'success',
      data: processedData,
      totals: totals,
      summary: {
        periode: p.tipe || "bulanan",
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0],
        totalSiswa: processedData.length,
        kelas: p.kelas || "Semua Kelas"
      }
    };
    
    console.log("Final result:", result);
    return result;
    
  } catch(err) {
    console.error("Error in getRekapPresensi: " + err.toString());
    return { status: 'error', message: 'Gagal mengambil rekap presensi: ' + err.toString() };
  }
}

// Test function to debug presensi data
function testPresensiData() {
  try {
    console.log("=== TESTING PRESENSI DATA ===");
    
    // Test getSiswa
    var siswaResp = getSiswa({});
    console.log("Siswa response:", siswaResp);
    if (siswaResp.status === 'success') {
      console.log("Sample siswa data:", siswaResp.data.slice(0, 2));
    }
    
    // Test getPresensi
    var presensiResp = getPresensi({});
    console.log("Presensi response:", presensiResp);
    if (presensiResp.status === 'success') {
      console.log("Sample presensi data:", presensiResp.data.slice(0, 5));
      
      // Check data structure
      if (presensiResp.data.length > 0) {
        console.log("First presensi record structure:", presensiResp.data[0]);
        console.log("All presensi records:");
        presensiResp.data.forEach(function(p, index) {
          console.log("Record " + (index + 1) + ":", {
            id: p.id,
            tanggal: p.tanggal,
            nis: p.nis,
            nama: p.nama,
            kelas: p.kelas,
            mapel: p.mapel,
            status: p.status
          });
        });
      }
    }
    
    // Test getRekapPresensi with simple params
    var testParams = { kelas: "", tipe: "bulanan", bulan: "1", tahun: "2024" };
    console.log("Testing getRekapPresensi with params:", testParams);
    var rekapResp = getRekapPresensi(testParams);
    console.log("Rekap response:", rekapResp);
    
    // Test with different date ranges
    console.log("=== TESTING DIFFERENT DATE RANGES ===");
    var dateTests = [
      { kelas: "", tipe: "bulanan", bulan: "12", tahun: "2023" },
      { kelas: "", tipe: "bulanan", bulan: "2", tahun: "2024" },
      { kelas: "", tipe: "semester", semester: "1", tahun: "2024" },
      { kelas: "", tipe: "semester", semester: "2", tahun: "2024" }
    ];
    
    dateTests.forEach(function(params, index) {
      console.log("Date test " + (index + 1) + ":", params);
      var testResult = getRekapPresensi(params);
      console.log("Result " + (index + 1) + ":", {
        status: testResult.status,
        dataCount: testResult.data ? testResult.data.length : 0,
        sampleData: testResult.data ? testResult.data.slice(0, 2) : []
      });
    });
    
    return { 
      status: 'success',
      siswaCount: siswaResp.data ? siswaResp.data.length : 0,
      presensiCount: presensiResp.data ? presensiResp.data.length : 0,
      rekapCount: rekapResp.data ? rekapResp.data.length : 0,
      siswaSample: siswaResp.data ? siswaResp.data.slice(0, 2) : [],
      presensiSample: presensiResp.data ? presensiResp.data.slice(0, 2) : [],
      rekapSample: rekapResp.data ? rekapResp.data.slice(0, 2) : []
    };
    
  } catch(err) {
    console.error("Error in testPresensiData:", err);
    return { status: 'error', message: err.toString() };
  }
}

// Function to generate sample presensi data for testing
function generateSamplePresensiData() {
  try {
    console.log("=== GENERATING SAMPLE PRESENSI DATA ===");
    
    var siswaResp = getSiswa({});
    if (siswaResp.status !== 'success') {
      return { status: 'error', message: 'Failed to get siswa data' };
    }
    
    var sheet = getSheet("DataPresensi");
    if (sheet.getLastRow() === 0) {
      sheet.appendRow([
        "ID_PRESENSI", "TANGGAL", "NIS", "NAMA_SISWA", "KELAS",
        "MAPEL", "GURU", "JAM", "STATUS", "KETERANGAN",
        "CREATED_AT", "UPDATED_AT"
      ]);
    }
    
    var sampleData = [];
    var dates = ['2024-01-15', '2024-01-16', '2024-01-17', '2024-01-18', '2024-01-19'];
    var statuses = ['H', 'S', 'I', 'A'];
    var mapels = ['Matematika', 'Bahasa Indonesia', 'Fisika', 'Kimia'];
    var jamOptions = ['07:00-08:00', '08:00-09:00', '09:00-10:00', '10:00-11:00'];
    
    // Generate data for first 10 students
    var studentsToGenerate = siswaResp.data.slice(0, 10);
    var now = new Date().toISOString();
    
    studentsToGenerate.forEach(function(siswa, siswaIndex) {
      dates.forEach(function(tanggal, dateIndex) {
        var status = statuses[Math.floor(Math.random() * statuses.length)];
        var mapel = mapels[dateIndex % mapels.length];
        var jam = jamOptions[dateIndex % jamOptions.length];
        
        var id = "PRS-SAMPLE-" + tanggal + "-" + siswa.nis;
        
        sampleData.push([
          "'" + id,
          tanggal,
          siswa.nis,
          siswa.nama,
          siswa.kelas,
          mapel,
          "Test Guru " + mapel,
          jam,
          status,
          status === 'H' ? 'Hadir' : status === 'S' ? 'Sakit' : status === 'I' ? 'Izin' : 'Tanpa Keterangan',
          now,
          now
        ]);
      });
    });
    
    // Batch insert
    if (sampleData.length > 0) {
      sheet.getRange(sheet.getLastRow() + 1, 1, sampleData.length, 12).setValues(sampleData);
    }
    
    // Clear cache
    try {
      getCache().remove("presensiData");
      getCache().removeAll();
    } catch (e) {
      console.warn("Failed to clear cache:", e);
    }
    
    console.log("Generated " + sampleData.length + " sample presensi records");
    
    return {
      status: 'success',
      message: 'Generated ' + sampleData.length + ' sample presensi records',
      recordsGenerated: sampleData.length,
      studentsCount: studentsToGenerate.length,
      datesCount: dates.length
    };
    
  } catch(err) {
    console.error("Error in generateSamplePresensiData:", err);
    return { status: 'error', message: err.toString() };
  }
}

// Enhanced debug function to check data flow step by step
function debugPresensiFlow() {
  try {
    console.log("=== DEBUGGING PRESENSI FLOW STEP BY STEP ===");
    
    var debugResults = {};
    
    // Step 1: Check DataSiswa sheet
    console.log("Step 1: Checking DataSiswa sheet...");
    var siswaSheet = getSheet("DataSiswa");
    var siswaData = siswaSheet.getDataRange().getValues();
    debugResults.dataSiswa = {
      sheetExists: true,
      totalRows: siswaData.length,
      dataRows: siswaData.length - 1,
      sampleData: siswaData.slice(1, 4).map(function(row) {
        return { nis: row[0], nama: row[1], kelas: row[2] };
      })
    };
    console.log("DataSiswa:", debugResults.dataSiswa);
    
    // Step 2: Check DataPresensi sheet
    console.log("Step 2: Checking DataPresensi sheet...");
    var presensiSheet = getSheet("DataPresensi");
    var presensiData = presensiSheet.getDataRange().getValues();
    debugResults.dataPresensi = {
      sheetExists: true,
      totalRows: presensiData.length,
      dataRows: presensiData.length - 1,
      headers: presensiData[0] || [],
      sampleData: presensiData.slice(1, 6).map(function(row) {
        return {
          id: row[0],
          tanggal: row[1],
          nis: row[2],
          nama: row[3],
          kelas: row[4],
          mapel: row[5],
          status: row[8]
        };
      })
    };
    console.log("DataPresensi:", debugResults.dataPresensi);
    
    // Step 3: Test getSiswa function
    console.log("Step 3: Testing getSiswa function...");
    var siswaResp = getSiswa({});
    debugResults.getSiswaResult = {
      status: siswaResp.status,
      dataCount: siswaResp.data ? siswaResp.data.length : 0,
      sampleData: siswaResp.data ? siswaResp.data.slice(0, 3) : []
    };
    console.log("getSiswa result:", debugResults.getSiswaResult);
    
    // Step 4: Test getPresensi function
    console.log("Step 4: Testing getPresensi function...");
    var presensiResp = getPresensi({});
    debugResults.getPresensiResult = {
      status: presensiResp.status,
      dataCount: presensiResp.data ? presensiResp.data.length : 0,
      sampleData: presensiResp.data ? presensiResp.data.slice(0, 3) : []
    };
    console.log("getPresensi result:", debugResults.getPresensiResult);
    
    // Step 5: Test getRekapPresensi with different parameters
    console.log("Step 5: Testing getRekapPresensi with different parameters...");
    var testParams = [
      { kelas: "", tipe: "bulanan", bulan: "1", tahun: "2024" },
      { kelas: "", tipe: "harian", tanggal: "2024-01-15" },
      { kelas: "", tipe: "semester", semester: "1", tahun: "2024" }
    ];
    
    debugResults.rekapTests = [];
    testParams.forEach(function(params, index) {
      console.log("Testing rekap with params:", params);
      var rekapResult = getRekapPresensi(params);
      debugResults.rekapTests.push({
        params: params,
        status: rekapResult.status,
        dataCount: rekapResult.data ? rekapResult.data.length : 0,
        message: rekapResult.message || '',
        sampleData: rekapResult.data ? rekapResult.data.slice(0, 2) : []
      });
    });
    
    // Step 6: Check cache
    console.log("Step 6: Checking cache...");
    var cache = getCache();
    debugResults.cache = {
      presensiData_all: cache.get("presensiData_all_all"),
      presensiData_filtered: cache.get("presensiData_X-1_all"),
      siswaData: cache.get("siswaData")
    };
    console.log("Cache data:", debugResults.cache);
    
    // Step 7: Manual data processing test
    console.log("Step 7: Manual data processing test...");
    if (presensiResp.status === 'success' && siswaResp.status === 'success') {
      var manualTest = manualRekapTest(siswaResp.data, presensiResp.data);
      debugResults.manualTest = manualTest;
    }
    
    console.log("=== DEBUG RESULTS COMPLETE ===");
    return {
      status: 'success',
      debugResults: debugResults
    };
    
  } catch(err) {
    console.error("Error in debugPresensiFlow:", err);
    return {
      status: 'error',
      message: err.toString()
    };
  }
}

// Manual rekap test to isolate the issue
function manualRekapTest(siswaData, presensiData) {
  try {
    console.log("Manual rekap test with:", {
      siswaCount: siswaData.length,
      presensiCount: presensiData.length
    });
    
    // Test date filtering
    var startDate = new Date("2024-01-01");
    var endDate = new Date("2024-01-31");
    
    var filteredPresensi = presensiData.filter(function(pr) {
      if (!pr.tanggal) return false;
      var presensiDate = new Date(pr.tanggal);
      return presensiDate >= startDate && presensiDate <= endDate;
    });
    
    console.log("Filtered presensi for Jan 2024:", filteredPresensi.length);
    
    // Test processing for first 3 students
    var testStudents = siswaData.slice(0, 3);
    var results = [];
    
    testStudents.forEach(function(siswa) {
      var studentPresensi = filteredPresensi.filter(function(p) {
        return p.nis === siswa.nis;
      });
      
      var counts = { H: 0, S: 0, I: 0, A: 0 };
      studentPresensi.forEach(function(p) {
        if (counts[p.status] !== undefined) {
          counts[p.status]++;
        }
      });
      
      results.push({
        nis: siswa.nis,
        nama: siswa.nama,
        kelas: siswa.kelas,
        presensiRecords: studentPresensi.length,
        counts: counts,
        total: studentPresensi.length,
        persentase: studentPresensi.length > 0 ? Math.round((counts.H / studentPresensi.length) * 100) : 0
      });
    });
    
    return {
      dateRange: "Jan 2024",
      totalFiltered: filteredPresensi.length,
      studentResults: results
    };
    
  } catch(err) {
    console.error("Error in manualRekapTest:", err);
    return { error: err.toString() };
  }
}
function getDateOfWeek(week, year) {
  var d = new Date(year, 0, 1 + (week - 1) * 7);
  var dayOfWeek = d.getDay();
  var days = [1, 2, 3, 4, 5, 6, 0]; // Monday = 1, Sunday = 0
  var diff = days[dayOfWeek] - 1;
  d.setDate(d.getDate() - diff);
  return d;
}

// Helper function to get day name in Indonesian
function getHariNama(date) {
  var days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  return days[date.getDay()] || '-';
}

// --- PRESENSI CRUD (NEW SHEET) ---
function getPresensi(p) {
  try {
    var cache = getCache();
    var cacheKey = "presensiData_" + (p.kelas || 'all') + "_" + (p.tanggal || 'all');
    var cached = cache.get(cacheKey);
    if (cached && !p.forceRefresh) {
      return { status: 'success', data: JSON.parse(cached), source: 'cache' };
    }

    var sheet = getSheet("DataPresensi");
    var d = sheet.getDataRange().getValues();
    var o = [];
    
    for (var i = 1; i < d.length; i++) {
      if (d[i][0]) {
        var record = {
          id: String(d[i][0]),
          tanggal: d[i][1] || "",
          nis: d[i][2] || "",
          nama: d[i][3] || "",
          kelas: d[i][4] || "",
          mapel: d[i][5] || "",
          guru: d[i][6] || "",
          jam: d[i][7] || "",
          status: d[i][8] || "",
          keterangan: d[i][9] || "",
          createdAt: d[i][10] || "",
          updatedAt: d[i][11] || ""
        };
        
        // Apply filters
        if (p.kelas && record.kelas !== p.kelas) continue;
        if (p.tanggal && record.tanggal !== p.tanggal) continue;
        if (p.nis && record.nis !== p.nis) continue;
        if (p.mapel && record.mapel !== p.mapel) continue;
        
        o.push(record);
      }
    }
    
    // Sort by tanggal descending, then nama
    o.sort(function(a, b) {
      if (a.tanggal !== b.tanggal) {
        return new Date(b.tanggal) - new Date(a.tanggal);
      }
      return a.nama.localeCompare(b.nama);
    });
    
    cache.put(cacheKey, JSON.stringify(o), 300);
    return { status: 'success', data: o, source: 'sheet' };
  } catch (err) {
    console.error("Error in getPresensi: " + err.toString());
    return { status: 'error', message: 'Gagal ambil presensi: ' + err.toString() };
  }
}

function simpanPresensi(p) {
  try {
    var sheet = getSheet("DataPresensi");
    if (sheet.getLastRow() === 0) {
      // Create header if sheet is empty
      sheet.appendRow([
        "ID_PRESENSI", "TANGGAL", "NIS", "NAMA_SISWA", "KELAS", 
        "MAPEL", "GURU", "JAM", "STATUS", "KETERANGAN", 
        "CREATED_AT", "UPDATED_AT"
      ]);
    }
    
    var now = new Date().toISOString();
    var id = p.id || "PRS-" + Date.now();
    
    if (p.id) {
      // Update existing record
      var data = sheet.getDataRange().getValues();
      for (var i = 1; i < data.length; i++) {
        if (String(data[i][0]) === p.id) {
          sheet.getRange(i + 1, 1, 1, 12).setValues([[
            p.id,
            p.tanggal || "",
            p.nis || "",
            p.nama || "",
            p.kelas || "",
            p.mapel || "",
            p.guru || "",
            p.jam || "",
            p.status || "",
            p.keterangan || "",
            data[i][10], // Keep original created_at
            now // Update updated_at
          ]]);
          
          // Clear cache
          clearPresensiCache();
          return { status: 'success', message: 'Presensi berhasil diupdate', id: p.id };
        }
      }
    } else {
      // Add new record
      sheet.appendRow([
        "'" + id,
        p.tanggal || "",
        p.nis || "",
        p.nama || "",
        p.kelas || "",
        p.mapel || "",
        p.guru || "",
        p.jam || "",
        p.status || "",
        p.keterangan || "",
        now, // created_at
        now  // updated_at
      ]);
      
      // Clear cache
      clearPresensiCache();
      return { status: 'success', message: 'Presensi berhasil disimpan', id: id };
    }
    
    return { status: 'error', message: 'Presensi tidak ditemukan' };
  } catch (err) {
    console.error("Error in simpanPresensi: " + err.toString());
    return { status: 'error', message: 'Gagal simpan presensi: ' + err.toString() };
  }
}

function hapusPresensi(p) {
  try {
    var sheet = getSheet("DataPresensi");
    var data = sheet.getDataRange().getValues();
    var deleted = false;
    
    for (var i = data.length - 1; i >= 1; i--) {
      if (String(data[i][0]) === p.id) {
        sheet.deleteRow(i + 1);
        deleted = true;
        break;
      }
    }
    
    if (!deleted) {
      return { status: 'error', message: 'Presensi tidak ditemukan' };
    }
    
    // Clear cache
    clearPresensiCache();
    return { status: 'success', message: 'Presensi berhasil dihapus' };
  } catch (err) {
    console.error("Error in hapusPresensi: " + err.toString());
    return { status: 'error', message: 'Gagal hapus presensi: ' + err.toString() };
  }
}

function clearPresensiCache() {
  try {
    var cache = getCache();
    // Clear all presensi-related cache keys
    var keys = ['presensiData_all_all', 'presensiData_X-1_all', 'presensiData_all_2024-01-15'];
    keys.forEach(function(key) {
      cache.remove(key);
    });
  } catch (e) {
    console.warn("Failed to clear presensi cache:", e);
  }
}

// Batch presensi operations (for bulk save from jurnal)
function simpanBatchPresensi(jurnalData) {
  try {
    var sheet = getSheet("DataPresensi");
    if (sheet.getLastRow() === 0) {
      sheet.appendRow([
        "ID_PRESENSI", "TANGGAL", "NIS", "NAMA_SISWA", "KELAS", 
        "MAPEL", "GURU", "JAM", "STATUS", "KETERANGAN", 
        "CREATED_AT", "UPDATED_AT"
      ]);
    }
    
    var now = new Date().toISOString();
    var results = [];
    
    if (jurnalData.absen && Array.isArray(jurnalData.absen)) {
      jurnalData.absen.forEach(function(student) {
        var id = "PRS-" + jurnalData.tanggal + "-" + student.nis;
        var rowData = [
          "'" + id,
          jurnalData.tanggal || "",
          student.nis || "",
          student.nama || "",
          jurnalData.kelas || "",
          jurnalData.mapel || "",
          jurnalData.guru || "",
          jurnalData.jam || "",
          student.status || "",
          student.keterangan || "",
          now,
          now
        ];
        
        // Check if exists (update) or new (insert)
        var existingData = sheet.getDataRange().getValues();
        var found = false;
        
        for (var i = 1; i < existingData.length; i++) {
          if (String(existingData[i][0]) === id) {
            sheet.getRange(i + 1, 1, 1, 12).setValues([rowData]);
            found = true;
            break;
          }
        }
        
        if (!found) {
          sheet.appendRow(rowData);
        }
        
        results.push({
          nis: student.nis,
          nama: student.nama,
          status: student.status,
          action: found ? 'updated' : 'created'
        });
      });
    }
    
    // Clear cache
    clearPresensiCache();
    
    return {
      status: 'success',
      message: 'Batch presensi berhasil disimpan',
      results: results,
      total: results.length
    };
  } catch (err) {
    console.error("Error in simpanBatchPresensi: " + err.toString());
    return { status: 'error', message: 'Gagal simpan batch presensi: ' + err.toString() };
  }
}

// --- AUDIT DATA CONSISTENCY ---
function auditPresensiConsistency() {
  try {
    var issues = [];
    
    // Get all jurnal data
    var jurnalResp = getJurnal({});
    if (jurnalResp.status !== 'success') {
      return { status: 'error', message: 'Failed to get jurnal data' };
    }
    
    // Get all presensi data
    var presensiResp = getPresensi({});
    if (presensiResp.status !== 'success') {
      return { status: 'error', message: 'Failed to get presensi data' };
    }
    
    var jurnalData = jurnalResp.data || [];
    var presensiData = presensiResp.data || [];
    
    console.log("Auditing " + jurnalData.length + " jurnal records against " + presensiData.length + " presensi records");
    
    // Create presensi lookup map
    var presensiMap = {};
    presensiData.forEach(function(p) {
      var key = p.tanggal + "|" + p.kelas + "|" + p.mapel + "|" + p.guru + "|" + p.jam + "|" + p.nis;
      presensiMap[key] = p;
    });
    
    // Check each jurnal record
    jurnalData.forEach(function(j) {
      if (j.absensi && j.absensi !== "-") {
        // Parse absensi string to get student list
        var absensiMatches = j.absensi.match(/([^()]+)\s*\(([^)]+)\)/g);
        if (absensiMatches) {
          absensiMatches.forEach(function(match) {
            var parts = match.match(/([^()]+)\s*\(([^)]+)\)/);
            if (parts && parts.length >= 3) {
              var nama = parts[1].trim();
              var status = parts[2].trim();
              
              // Try to find matching presensi record
              var foundPresensi = false;
              for (var key in presensiMap) {
                var p = presensiMap[key];
                if (p.tanggal === j.tanggal && 
                    p.kelas === j.kelas && 
                    p.mapel === j.mapel && 
                    p.guru === j.guru && 
                    p.jam === j.jam &&
                    p.nama === nama) {
                  foundPresensi = true;
                  
                  // Check status consistency
                  if (p.status !== status) {
                    issues.push({
                      type: 'status_mismatch',
                      jurnal_id: j.id,
                      tanggal: j.tanggal,
                      kelas: j.kelas,
                      nama: nama,
                      jurnal_status: status,
                      presensi_status: p.status,
                      presensi_id: p.id
                    });
                  }
                  break;
                }
              }
              
              if (!foundPresensi) {
                issues.push({
                  type: 'missing_presensi',
                  jurnal_id: j.id,
                  tanggal: j.tanggal,
                  kelas: j.kelas,
                  nama: nama,
                  status: status
                });
              }
            }
          });
        }
      }
    });
    
    // Check for orphan presensi records (no matching jurnal)
    var jurnalKeys = {};
    jurnalData.forEach(function(j) {
      var key = j.tanggal + "|" + j.kelas + "|" + j.mapel + "|" + j.guru + "|" + j.jam;
      jurnalKeys[key] = j;
    });
    
    presensiData.forEach(function(p) {
      var key = p.tanggal + "|" + p.kelas + "|" + p.mapel + "|" + p.guru + "|" + p.jam;
      if (!jurnalKeys[key]) {
        issues.push({
          type: 'orphan_presensi',
          presensi_id: p.id,
          tanggal: p.tanggal,
          kelas: p.kelas,
          nama: p.nama,
          status: p.status
        });
      }
    });
    
    return {
      status: 'success',
      data: {
        totalJurnal: jurnalData.length,
        totalPresensi: presensiData.length,
        issues: issues,
        summary: {
          status_mismatch: issues.filter(i => i.type === 'status_mismatch').length,
          missing_presensi: issues.filter(i => i.type === 'missing_presensi').length,
          orphan_presensi: issues.filter(i => i.type === 'orphan_presensi').length,
          total_issues: issues.length
        }
      }
    };
  } catch (err) {
    console.error("Error in auditPresensiConsistency: " + err.toString());
    return { status: 'error', message: 'Audit failed: ' + err.toString() };
  }
}

// Debug NIS matching issue
function debugNISMatching() {
  try {
    console.log("=== DEBUGGING NIS MATCHING ===");
    
    var siswaResp = getSiswa({});
    var presensiResp = getPresensi({});
    
    if (siswaResp.status !== 'success' || presensiResp.status !== 'success') {
      return { status: 'error', message: 'Failed to get data' };
    }
    
    var siswaData = siswaResp.data || [];
    var presensiData = presensiResp.data || [];
    
    // Get unique NIS from both datasets
    var siswaNIS = siswaData.map(function(s) { return s.nis; });
    var presensiNIS = presensiData.map(function(p) { return p.nis; });
    
    // Find mismatches
    var siswaNISUnique = [...new Set(siswaNIS)];
    var presensiNISUnique = [...new Set(presensiNIS)];
    
    var presensiNISNotInSiswa = presensiNISUnique.filter(function(nis) {
      return !siswaNISUnique.includes(nis);
    });
    
    var siswaNISNotInPresensi = siswaNISUnique.filter(function(nis) {
      return !presensiNISUnique.includes(nis);
    });
    
    // Sample comparison
    var sampleComparison = [];
    siswaData.slice(0, 5).forEach(function(siswa) {
      var matchingPresensi = presensiData.filter(function(p) {
        return p.nis === siswa.nis;
      });
      
      sampleComparison.push({
        siswaNIS: siswa.nis,
        siswaNama: siswa.nama,
        siswaNISType: typeof siswa.nis,
        siswaNISLength: siswa.nis.length,
        matchingPresensiCount: matchingPresensi.length,
        presensiSamples: matchingPresensi.slice(0, 2).map(function(p) {
          return {
            presensiNIS: p.nis,
            presensiNISType: typeof p.nis,
            presensiNISLength: p.nis.length,
            exactMatch: p.nis === siswa.nis,
            tanggal: p.tanggal,
            status: p.status
          };
        })
      });
    });
    
    return {
      status: 'success',
      analysis: {
        totalSiswaNIS: siswaNISUnique.length,
        totalPresensiNIS: presensiNISUnique.length,
        presensiNISNotInSiswa: presensiNISNotInSiswa,
        siswaNISNotInPresensi: siswaNISNotInPresensi,
        sampleComparison: sampleComparison
      }
    };
    
  } catch(err) {
    console.error("Error in debugNISMatching:", err);
    return { status: 'error', message: err.toString() };
  }
}

// Fix NIS in presensi data
function fixPresensiNIS() {
  try {
    console.log("=== FIXING NIS IN PRESENSI DATA ===");
    
    var siswaResp = getSiswa({});
    var presensiResp = getPresensi({});
    
    if (siswaResp.status !== 'success' || presensiResp.status !== 'success') {
      return { status: 'error', message: 'Failed to get data' };
    }
    
    var siswaData = siswaResp.data || [];
    var presensiData = presensiResp.data || [];
    
    // Create NIS lookup map from siswa data
    var nisMap = {};
    siswaData.forEach(function(siswa) {
      nisMap[siswa.nis] = siswa.nama;
    });
    
    var sheet = getSheet("DataPresensi");
    var data = sheet.getDataRange().getValues();
    var fixedCount = 0;
    var notFoundNIS = [];
    
    for (var i = 1; i < data.length; i++) {
      var currentNIS = String(data[i][2]);
      var currentNama = String(data[i][3] || "");
      
      // Check if NIS exists in siswa data
      if (!nisMap[currentNIS]) {
        // Try to find matching NIS by name
        var foundNIS = null;
        for (var j = 0; j < siswaData.length; j++) {
          if (siswaData[j].nama.toLowerCase() === currentNama.toLowerCase()) {
            foundNIS = siswaData[j].nis;
            break;
          }
        }
        
        if (foundNIS) {
          // Update NIS to match siswa data
          sheet.getRange(i + 1, 3).setValue(foundNIS);
          fixedCount++;
          console.log("Fixed NIS for:", currentNama, "from", currentNIS, "to", foundNIS);
        } else {
          notFoundNIS.push({
            row: i + 1,
            nama: currentNama,
            oldNIS: currentNIS,
            kelas: data[i][4] || ""
          });
        }
      }
    }
    
    // Clear cache
    try {
      getCache().removeAll();
    } catch (e) {
      console.warn("Failed to clear cache:", e);
    }
    
    console.log("Fixed", fixedCount, "NIS records");
    
    return {
      status: 'success',
      message: 'Fixed ' + fixedCount + ' NIS records',
      fixedCount: fixedCount,
      notFoundCount: notFoundNIS.length,
      notFoundRecords: notFoundNIS.slice(0, 10) // Show first 10
    };
    
  } catch(err) {
    console.error("Error in fixPresensiNIS:", err);
    return { status: 'error', message: err.toString() };
  }
}

/**
 * Get optimized rekap presensi data following successful input nilai pattern
 * @param {Object} p - Parameters object
 * @returns {Object} - Response with optimized presensi rekap data
 */
function getRekapPresensiOptimized(p) {
  try {
    console.log("=== GET REKAP PRESENSI OPTIMIZED ===");
    console.log("Parameters:", p);
    
    // 1. Get siswa data (filtered by kelas if specified)
    var siswaResp = getSiswa({});
    if (siswaResp.status !== 'success') {
      return { status: 'error', message: 'Failed to get siswa data' };
    }
    
    var allSiswa = siswaResp.data || [];
    var filteredSiswa = p.kelas ? 
      allSiswa.filter(s => s.kelas === p.kelas) : 
      allSiswa;
    
    console.log("Total siswa:", allSiswa.length, "Filtered siswa:", filteredSiswa.length);
    
    // 2. Get presensi data with smart filtering
    var presensiResp = getPresensi({});
    if (presensiResp.status !== 'success') {
      return { status: 'error', message: 'Failed to get presensi data' };
    }
    
    var allPresensi = presensiResp.data || [];
    console.log("Total presensi records:", allPresensi.length);
    
    // 3. Filter presensi based on date parameters (like input nilai pattern)
    var filteredPresensi = filterPresensiByDate(allPresensi, p);
    console.log("Filtered presensi records:", filteredPresensi.length);
    
    // 4. Create efficient lookup maps (like input nilai pattern)
    var siswaMap = {};
    filteredSiswa.forEach(function(siswa) {
      siswaMap[siswa.nis] = siswa;
    });
    
    // 5. Aggregate presensi data per student (optimized)
    var rekapData = [];
    var summaryStats = { H: 0, S: 0, I: 0, A: 0 };
    
    // Initialize all students with zero counts
    filteredSiswa.forEach(function(siswa) {
      rekapData.push({
        nis: siswa.nis,
        nama: siswa.nama,
        kelas: siswa.kelas,
        hadir: 0,
        sakit: 0,
        izin: 0,
        alpha: 0,
        total: 0,
        persentase: 0
      });
    });
    
    // Create lookup for rekap data
    var rekapMap = {};
    rekapData.forEach(function(item) {
      rekapMap[item.nis] = item;
    });
    
    // Process presensi records (optimized bulk processing)
    filteredPresensi.forEach(function(presensi) {
      var nis = presensi.nis;
      var status = presensi.status ? presensi.status.toUpperCase() : '';
      
      if (rekapMap[nis]) {
        var student = rekapMap[nis];
        
        switch(status) {
          case 'H':
            student.hadir++;
            summaryStats.H++;
            break;
          case 'S':
            student.sakit++;
            summaryStats.S++;
            break;
          case 'I':
            student.izin++;
            summaryStats.I++;
            break;
          case 'A':
            student.alpha++;
            summaryStats.A++;
            break;
        }
        
        student.total++;
      }
    });
    
    // Calculate percentages
    rekapData.forEach(function(student) {
      if (student.total > 0) {
        student.persentase = Math.round((student.hadir / student.total) * 100);
      }
    });
    
    // Sort by name
    rekapData.sort(function(a, b) {
      return a.nama.localeCompare(b.nama);
    });
    
    console.log("Rekap summary:", summaryStats);
    console.log("Rekap data count:", rekapData.length);
    
    return {
      status: 'success',
      data: rekapData,
      summary: summaryStats,
      parameters: p,
      meta: {
        totalSiswa: filteredSiswa.length,
        totalPresensiRecords: filteredPresensi.length,
        processedAt: new Date().toISOString()
      }
    };
    
  } catch(err) {
    console.error("Error in getRekapPresensiOptimized:", err);
    return { 
      status: 'error', 
      message: 'Failed to get optimized rekap presensi: ' + err.toString() 
    };
  }
}

/**
 * Filter presensi data based on date parameters
 * @param {Array} presensiData - Array of presensi records
 * @param {Object} params - Filter parameters
 * @returns {Array} - Filtered presensi data
 */
function filterPresensiByDate(presensiData, params) {
  if (!presensiData || presensiData.length === 0) {
    return [];
  }
  
  var tipe = params.tipe || 'harian';
  var filtered = [];
  
  presensiData.forEach(function(record) {
    var tanggal = record.tanggal;
    if (!tanggal) return;
    
    var recordDate = new Date(tanggal);
    var include = false;
    
    switch(tipe) {
      case 'harian':
        var targetDate = params.tanggal;
        if (targetDate && tanggal === targetDate) {
          include = true;
        }
        break;
        
      case 'mingguan':
        var targetWeek = params.minggu;
        var targetYear = params.tahun;
        if (targetWeek && targetYear) {
          var weekNumber = getWeekNumber(recordDate);
          if (weekNumber == targetWeek && recordDate.getFullYear() == targetYear) {
            include = true;
          }
        }
        break;
        
      case 'bulanan':
        var targetMonth = params.bulan;
        var targetYear = params.tahun;
        if (targetMonth && targetYear) {
          if (recordDate.getMonth() + 1 == targetMonth && recordDate.getFullYear() == targetYear) {
            include = true;
          }
        }
        break;
        
      case 'semester':
        var targetSemester = params.semester;
        var targetYear = params.tahun;
        if (targetSemester && targetYear) {
          var month = recordDate.getMonth() + 1;
          var year = recordDate.getFullYear();
          var semester = (month >= 7 && month <= 12) ? 1 : 2;
          
          if (semester == targetSemester && year == targetYear) {
            include = true;
          }
        }
        break;
    }
    
    if (include) {
      filtered.push(record);
    }
  });
  
  return filtered;
}

/**
 * Get week number from date
 * @param {Date} date - Date object
 * @returns {Number} - Week number
 */
function getWeekNumber(date) {
  var d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  var dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  var yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
  return Math.ceil((((d - yearStart) / 86400000) + 1)/7);
}
