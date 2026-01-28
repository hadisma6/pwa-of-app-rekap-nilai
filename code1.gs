/* ================================================================
   SOLUSI KODE - FIX GAP DATA JURNAL & PRESENSI
   Implementasi untuk code.gs
   
   CARA PAKAI:
   1. Backup code.gs yang lama
   2. Replace function-function di bawah ini
   3. Test di Apps Script Editor
   4. Deploy ulang web app
   ================================================================ */

// API Handler
function doGet(e) { return ContentService.createTextOutput("API Si-H2i V25 Online.").setMimeType(ContentService.MimeType.TEXT); }

function doPost(e) {
  var lock = LockService.getScriptLock();
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
      case 'testAPI': r = { status: 'success', message: 'API is working', timestamp: new Date().toISOString() }; break;
      case 'debugPresensiFlow': r = debugPresensiFlow(); break;
      case 'testPresensiData': r = testPresensiData(); break;
      case 'generateSamplePresensiData': r = generateSamplePresensiData(); break;
      case 'getRekapPresensi': r = getRekapPresensi(p); break;
      case 'getPresensi': r = getPresensi(p); break;
      case 'getRekapPresensiOptimized': r = getRekapPresensiOptimized(p); break;
      
      // --- AUDIT ---
      case 'auditDataGap': r = auditDataGap(); break;
      
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

// Debug function for presensi flow
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

// Test function for presensi data
function testPresensiData() {
  try {
    console.log("=== TESTING PRESENSI DATA ===");
    
    var siswaResp = getSiswa({});
    var presensiResp = getPresensi({});
    var rekapResp = getRekapPresensi({ kelas: "", tipe: "bulanan", bulan: "1", tahun: "2024" });
    
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

// Generate sample presensi data
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
    
    if (sampleData.length > 0) {
      sheet.getRange(sheet.getLastRow() + 1, 1, sampleData.length, 12).setValues(sampleData);
    }
    
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

// ============================================================
// FIX GAP #2: DATA VALIDATION
// Tambahkan function validation sebelum simpan
// ============================================================

/**
 * Validate student data before saving to presensi
 * @param {Array} absenData - Array of student attendance data
 * @returns {Object} - Validation result with valid flag and errors
 */
function validateStudentData(absenData) {
  try {
    // Get all valid students from master data
    var siswaResp = getSiswa();
    if (siswaResp.status !== 'success') {
      return { 
        valid: false, 
        errors: ['Gagal mengambil data siswa master'] 
      };
    }
    
    // Create lookup map for O(1) validation
    var validNIS = {};
    var validNISNames = {};
    siswaResp.data.forEach(function(s) {
      validNIS[s.nis] = true;
      validNISNames[s.nis] = s.nama;
    });
    
    var errors = [];
    var warnings = [];
    
    // Validate each student in attendance data
    if (!absenData || !Array.isArray(absenData)) {
      return { 
        valid: false, 
        errors: ['Data absensi tidak valid (bukan array)'] 
      };
    }
    
    absenData.forEach(function(student, index) {
      // Check if NIS exists
      if (!student.nis) {
        errors.push('Baris ' + (index + 1) + ': NIS kosong');
        return;
      }
      
      // Check if NIS is valid (exists in master)
      if (!validNIS[student.nis]) {
        errors.push('NIS tidak valid: ' + student.nis + ' (' + (student.nama || 'Unknown') + ')');
        return;
      }
      
      // Check if name matches (warning only)
      if (validNISNames[student.nis] !== student.nama) {
        warnings.push('NIS ' + student.nis + ': Nama tidak sama dengan master. Master: "' + validNISNames[student.nis] + '", Input: "' + student.nama + '"');
      }
      
      // Check if status is valid
      var validStatus = ['H', 'S', 'I', 'A'];
      if (!student.status || validStatus.indexOf(student.status) === -1) {
        errors.push('NIS ' + student.nis + ': Status tidak valid (' + (student.status || 'kosong') + '). Harus: H, S, I, atau A');
      }
    });
    
    return {
      valid: errors.length === 0,
      errors: errors,
      warnings: warnings,
      checkedCount: absenData.length,
      validCount: absenData.length - errors.length
    };
    
  } catch (err) {
    console.error("Error in validateStudentData: " + err.toString());
    return {
      valid: false,
      errors: ['Error validasi: ' + err.toString()]
    };
  }
}

// ============================================================
// FIX GAP #3: DUPLICATE DETECTION
// Improve ID generation and add duplicate check
// ============================================================

/**
 * Generate unique presensi ID with full composite key
 * @param {string} tanggal - Date in YYYY-MM-DD format
 * @param {string} kelas - Class name
 * @param {string} mapel - Subject
 * @param {string} jam - Time/Period
 * @param {string} nis - Student NIS
 * @returns {string} - Unique ID
 */
function generatePresensiId(tanggal, kelas, mapel, jam, nis) {
  // Clean strings (remove spaces, special chars)
  var cleanKelas = String(kelas).replace(/[^a-zA-Z0-9]/g, '');
  var cleanMapel = String(mapel).replace(/[^a-zA-Z0-9]/g, '').substring(0, 10); // Max 10 char
  var cleanJam = String(jam).replace(/[^a-zA-Z0-9]/g, '');
  var cleanNIS = String(nis).replace(/[^a-zA-Z0-9]/g, '');
  
  return "PRS-" + tanggal + "-" + cleanKelas + "-" + cleanMapel + "-" + cleanJam + "-" + cleanNIS;
}

/**
 * Check if presensi record already exists
 * @param {string} tanggal - Date
 * @param {string} kelas - Class
 * @param {string} mapel - Subject
 * @param {string} guru - Teacher
 * @param {string} jam - Time/Period
 * @param {string} nis - Student NIS
 * @returns {Object|null} - Existing record or null
 */
function checkDuplicatePresensi(tanggal, kelas, mapel, guru, jam, nis) {
  try {
    var sheet = getSheet("DataPresensi");
    var data = sheet.getDataRange().getValues();
    
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][1]) === String(tanggal) &&
          String(data[i][4]) === String(kelas) &&
          String(data[i][5]) === String(mapel) &&
          String(data[i][6]) === String(guru) &&
          String(data[i][7]) === String(jam) &&
          String(data[i][2]) === String(nis)) {
        return {
          exists: true,
          id: String(data[i][0]),
          row: i + 1,
          currentStatus: String(data[i][8]),
          currentKeterangan: String(data[i][9])
        };
      }
    }
    
    return { exists: false };
    
  } catch (err) {
    console.error("Error in checkDuplicatePresensi: " + err.toString());
    return { exists: false, error: err.toString() };
  }
}

// ============================================================
// FIX GAP #1 & #6: IMPROVED simpanJurnal with Better Feedback
// Replace existing simpanJurnal function with this
// ============================================================

function simpanJurnal(p) {
  try {
    console.log("Saving jurnal with data:", JSON.stringify(p));
    
    var sheet = getSheet("DataJurnal");
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(["ID", "TANGGAL", "GURU", "MAPEL", "KELAS", "JAM", "MATERI", "ABSENSI", "TOTAL", "H", "S", "I", "A"]);
    }
    
    // Build absensi string & stats
    var strAbsen = "-";
    var stats = { H: 0, S: 0, I: 0, A: 0 };
    if (p.absen && Array.isArray(p.absen)) {
      strAbsen = p.absen.map(function(s) {
        if (stats[s.status] !== undefined) stats[s.status]++;
        return s.nama + " (" + s.status + ")";
      }).join(", ");
    }

    var total = parseInt(p.totalSiswa) || 0;
    var hadir = total - ((p.absen) ? p.absen.length : 0);
    if (p.stats) stats = p.stats;

    var presensiResult = { saved: false, count: 0, errors: [] };

    // UPDATE EXISTING JURNAL
    if (p.id) {
      var data = sheet.getDataRange().getValues();
      var updated = false;
      
      for (var i = 1; i < data.length; i++) {
        if (String(data[i][0]) === String(p.id)) {
          // Update jurnal row
          sheet.getRange(i + 1, 1, 1, 13).setValues([[
            p.id, p.tanggal, p.guru, p.mapel, p.kelas, p.jam, p.materi, 
            strAbsen, total, stats.H || hadir, stats.S, stats.I, stats.A
          ]]);
          updated = true;
          console.log("Jurnal updated: " + p.id);
          
          // DELETE OLD PRESENSI DATA for this jurnal
          try {
            deletePresensiByJurnalKey(p.tanggal, p.kelas, p.mapel, p.guru, p.jam);
            console.log("Old presensi deleted for update");
          } catch (deleteErr) {
            console.warn("Failed to delete old presensi:", deleteErr);
            presensiResult.errors.push("Gagal hapus presensi lama: " + deleteErr.toString());
          }
          
          // SAVE NEW PRESENSI DATA
          if (p.absen && Array.isArray(p.absen)) {
            try {
              // VALIDATE FIRST
              var validation = validateStudentData(p.absen);
              if (!validation.valid) {
                return {
                  status: 'error',
                  message: 'Data siswa tidak valid',
                  errors: validation.errors,
                  warnings: validation.warnings,
                  jurnalSaved: false,
                  presensiSaved: false
                };
              }
              
              // Show warnings but continue
              if (validation.warnings && validation.warnings.length > 0) {
                console.warn("Validation warnings:", validation.warnings);
                presensiResult.warnings = validation.warnings;
              }
              
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
              
              var batchResult = simpanBatchPresensiImproved(presensiData);
              console.log("Batch presensi result:", batchResult);
              
              if (batchResult.status === 'success') {
                presensiResult.saved = true;
                presensiResult.count = batchResult.total;
                presensiResult.details = batchResult.results;
              } else {
                presensiResult.errors.push(batchResult.message);
              }
              
            } catch (presensiError) {
              console.error("Failed to save presensi:", presensiError);
              presensiResult.errors.push(presensiError.toString());
            }
          }
          
          break;
        }
      }
      
      if (!updated) {
        return { status: 'error', message: 'Jurnal ID tidak ditemukan: ' + p.id };
      }
      
      // Clear cache
      clearAllCacheForJurnalPresensi();
      
      // Return detailed response
      return {
        status: presensiResult.errors.length > 0 ? 'warning' : 'success',
        message: presensiResult.errors.length > 0 
          ? 'Jurnal tersimpan, tapi ada masalah presensi' 
          : 'Jurnal dan presensi berhasil diupdate',
        id: p.id,
        jurnalSaved: true,
        presensiSaved: presensiResult.saved,
        presensiCount: presensiResult.count,
        presensiErrors: presensiResult.errors,
        presensiWarnings: presensiResult.warnings || []
      };
    }

    // INSERT NEW JURNAL
    var newId = "JRN-" + Date.now();
    sheet.appendRow([
      "'" + newId, p.tanggal, p.guru, p.mapel, p.kelas, p.jam, p.materi, 
      strAbsen, total, stats.H || hadir, stats.S, stats.I, stats.A
    ]);
    console.log("New jurnal created: " + newId);
    
    // SAVE PRESENSI DATA
    if (p.absen && Array.isArray(p.absen)) {
      try {
        // VALIDATE FIRST
        var validation = validateStudentData(p.absen);
        if (!validation.valid) {
          // Rollback jurnal
          var rollbackData = sheet.getDataRange().getValues();
          for (var i = rollbackData.length - 1; i >= 1; i--) {
            if (String(rollbackData[i][0]) === "'" + newId) {
              sheet.deleteRow(i + 1);
              console.log("Rolled back jurnal due to validation error");
              break;
            }
          }
          
          return {
            status: 'error',
            message: 'Data siswa tidak valid, jurnal tidak disimpan',
            errors: validation.errors,
            warnings: validation.warnings,
            jurnalSaved: false,
            presensiSaved: false
          };
        }
        
        // Show warnings but continue
        if (validation.warnings && validation.warnings.length > 0) {
          console.warn("Validation warnings:", validation.warnings);
          presensiResult.warnings = validation.warnings;
        }
        
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
        
        var batchResult = simpanBatchPresensiImproved(presensiData);
        console.log("Batch presensi result:", batchResult);
        
        if (batchResult.status === 'success') {
          presensiResult.saved = true;
          presensiResult.count = batchResult.total;
          presensiResult.details = batchResult.results;
        } else {
          presensiResult.errors.push(batchResult.message);
        }
        
      } catch (presensiError) {
        console.error("Failed to save presensi:", presensiError);
        presensiResult.errors.push(presensiError.toString());
      }
    }
    
    // Clear cache
    clearAllCacheForJurnalPresensi();
    
    // Return detailed response
    return {
      status: presensiResult.errors.length > 0 ? 'warning' : 'success',
      message: presensiResult.errors.length > 0 
        ? 'Jurnal tersimpan, tapi ada masalah presensi' 
        : 'Jurnal dan presensi berhasil disimpan',
      id: newId,
      jurnalSaved: true,
      presensiSaved: presensiResult.saved,
      presensiCount: presensiResult.count,
      presensiErrors: presensiResult.errors,
      presensiWarnings: presensiResult.warnings || [],
      presensiDetails: presensiResult.details
    };
    
  } catch (err) {
    console.error("Error in simpanJurnal: " + err.toString());
    return {
      status: 'error',
      message: 'Gagal simpan jurnal: ' + err.toString(),
      jurnalSaved: false,
      presensiSaved: false
    };
  }
}

// ============================================================
// FIX GAP #3 & #6: IMPROVED simpanBatchPresensi
// Replace existing simpanBatchPresensi with this
// ============================================================

function simpanBatchPresensiImproved(jurnalData) {
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
    var errors = [];
    var duplicates = [];
    
    if (!jurnalData.absen || !Array.isArray(jurnalData.absen)) {
      return {
        status: 'error',
        message: 'Data absen tidak valid',
        total: 0
      };
    }
    
    jurnalData.absen.forEach(function(student) {
      try {
        // Generate unique ID with composite key
        var id = generatePresensiId(
          jurnalData.tanggal,
          jurnalData.kelas,
          jurnalData.mapel,
          jurnalData.jam,
          student.nis
        );
        
        // Check duplicate
        var dupCheck = checkDuplicatePresensi(
          jurnalData.tanggal,
          jurnalData.kelas,
          jurnalData.mapel,
          jurnalData.guru,
          jurnalData.jam,
          student.nis
        );
        
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
        
        if (dupCheck.exists) {
          // Update existing record
          var existingData = sheet.getDataRange().getValues();
          for (var i = 1; i < existingData.length; i++) {
            if (String(existingData[i][0]) === dupCheck.id) {
              sheet.getRange(i + 1, 1, 1, 12).setValues([rowData]);
              results.push({
                nis: student.nis,
                nama: student.nama,
                status: student.status,
                action: 'updated',
                previousStatus: dupCheck.currentStatus
              });
              
              duplicates.push({
                nis: student.nis,
                nama: student.nama,
                message: 'Data sudah ada, diupdate'
              });
              break;
            }
          }
        } else {
          // Insert new record
          sheet.appendRow(rowData);
          results.push({
            nis: student.nis,
            nama: student.nama,
            status: student.status,
            action: 'created'
          });
        }
        
      } catch (studentError) {
        console.error("Error processing student " + student.nis + ":", studentError);
        errors.push({
          nis: student.nis,
          nama: student.nama,
          error: studentError.toString()
        });
      }
    });
    
    // Clear cache
    clearPresensiCache();
    
    return {
      status: errors.length === 0 ? 'success' : 'partial',
      message: errors.length === 0 
        ? 'Batch presensi berhasil disimpan' 
        : 'Batch presensi sebagian berhasil',
      results: results,
      errors: errors,
      duplicates: duplicates,
      total: results.length,
      created: results.filter(r => r.action === 'created').length,
      updated: results.filter(r => r.action === 'updated').length,
      failed: errors.length
    };
    
  } catch (err) {
    console.error("Error in simpanBatchPresensiImproved: " + err.toString());
    return {
      status: 'error',
      message: 'Gagal simpan batch presensi: ' + err.toString(),
      total: 0
    };
  }
}

// ============================================================
// FIX GAP #5: DELETE PRESENSI BY JURNAL KEY
// Helper function for update scenario
// ============================================================

function deletePresensiByJurnalKey(tanggal, kelas, mapel, guru, jam) {
  try {
    var sheet = getSheet("DataPresensi");
    var data = sheet.getDataRange().getValues();
    var deletedCount = 0;
    
    // Delete from bottom to top to avoid index shifting
    for (var i = data.length - 1; i >= 1; i--) {
      if (String(data[i][1]) === String(tanggal) &&
          String(data[i][4]) === String(kelas) &&
          String(data[i][5]) === String(mapel) &&
          String(data[i][6]) === String(guru) &&
          String(data[i][7]) === String(jam)) {
        sheet.deleteRow(i + 1);
        deletedCount++;
      }
    }
    
    console.log("Deleted " + deletedCount + " presensi records for jurnal update");
    return { deleted: deletedCount };
    
  } catch (err) {
    console.error("Error in deletePresensiByJurnalKey: " + err.toString());
    throw err;
  }
}

// ============================================================
// FIX GAP #4: IMPROVED CACHE CLEARING
// Replace existing clearPresensiCache with this
// ============================================================

function clearAllCacheForJurnalPresensi() {
  try {
    var cache = getCache();
    
    // Nuclear option: clear all cache
    // This ensures no stale data remains
    cache.removeAll();
    
    console.log("All cache cleared for jurnal-presensi sync");
    
    // Alternative: Clear specific patterns (if we tracked all keys)
    // var keysToRemove = [
    //   'jurnalData',
    //   'presensiData',
    //   'dashboardStats',
    //   'siswaData',
    //   'mapelData'
    // ];
    // keysToRemove.forEach(function(key) {
    //   cache.remove(key);
    // });
    
  } catch (e) {
    console.warn("Failed to clear cache:", e);
    // Don't fail the operation if cache clear fails
  }
}

// ============================================================
// NEW: DATA INTEGRITY CHECK FUNCTION
// Run this periodically or on-demand
// ============================================================

function checkDataIntegrity() {
  try {
    console.log("=== CHECKING DATA INTEGRITY ===");
    
    var issues = [];
    
    // Get all data
    var jurnalResp = getJurnal({});
    var presensiResp = getPresensi({});
    var siswaResp = getSiswa();
    
    if (jurnalResp.status !== 'success' || 
        presensiResp.status !== 'success' || 
        siswaResp.status !== 'success') {
      return {
        status: 'error',
        message: 'Failed to load data for integrity check'
      };
    }
    
    var jurnalData = jurnalResp.data || [];
    var presensiData = presensiResp.data || [];
    var siswaData = siswaResp.data || [];
    
    // Build lookup maps
    var validNIS = {};
    siswaData.forEach(function(s) {
      validNIS[s.nis] = s.nama;
    });
    
    var jurnalKeys = {};
    jurnalData.forEach(function(j) {
      var key = j.tanggal + "|" + j.kelas + "|" + j.mapel + "|" + j.guru + "|" + j.jam;
      jurnalKeys[key] = j;
    });
    
    // CHECK 1: Presensi with invalid NIS
    console.log("Checking for invalid NIS in presensi...");
    presensiData.forEach(function(p) {
      if (!validNIS[p.nis]) {
        issues.push({
          type: 'invalid_nis',
          severity: 'high',
          presensi_id: p.id,
          nis: p.nis,
          nama: p.nama,
          tanggal: p.tanggal,
          kelas: p.kelas,
          message: 'NIS tidak ada di master data siswa'
        });
      }
    });
    
    // CHECK 2: Orphan presensi (no matching jurnal)
    console.log("Checking for orphan presensi...");
    presensiData.forEach(function(p) {
      var key = p.tanggal + "|" + p.kelas + "|" + p.mapel + "|" + p.guru + "|" + p.jam;
      if (!jurnalKeys[key]) {
        issues.push({
          type: 'orphan_presensi',
          severity: 'medium',
          presensi_id: p.id,
          nis: p.nis,
          nama: p.nama,
          tanggal: p.tanggal,
          kelas: p.kelas,
          message: 'Presensi tidak memiliki jurnal terkait'
        });
      }
    });
    
    // CHECK 3: Jurnal without presensi (should have but doesn't)
    console.log("Checking for jurnal without presensi...");
    jurnalData.forEach(function(j) {
      if (j.absensi && j.absensi !== "-") {
        var key = j.tanggal + "|" + j.kelas + "|" + j.mapel + "|" + j.guru + "|" + j.jam;
        var hasPresensi = presensiData.some(function(p) {
          var pKey = p.tanggal + "|" + p.kelas + "|" + p.mapel + "|" + p.guru + "|" + p.jam;
          return pKey === key;
        });
        
        if (!hasPresensi) {
          issues.push({
            type: 'missing_presensi',
            severity: 'high',
            jurnal_id: j.id,
            tanggal: j.tanggal,
            kelas: j.kelas,
            mapel: j.mapel,
            message: 'Jurnal memiliki absensi tapi tidak ada data presensi'
          });
        }
      }
    });
    
    // CHECK 4: Duplicate presensi
    console.log("Checking for duplicate presensi...");
    var seen = {};
    presensiData.forEach(function(p) {
      var key = p.tanggal + "|" + p.kelas + "|" + p.mapel + "|" + p.jam + "|" + p.nis;
      if (seen[key]) {
        issues.push({
          type: 'duplicate_presensi',
          severity: 'medium',
          presensi_id: p.id,
          duplicate_of: seen[key],
          nis: p.nis,
          nama: p.nama,
          tanggal: p.tanggal,
          kelas: p.kelas,
          message: 'Presensi duplicate untuk siswa yang sama'
        });
      } else {
        seen[key] = p.id;
      }
    });
    
    // Summarize
    var summary = {
      invalid_nis: issues.filter(i => i.type === 'invalid_nis').length,
      orphan_presensi: issues.filter(i => i.type === 'orphan_presensi').length,
      missing_presensi: issues.filter(i => i.type === 'missing_presensi').length,
      duplicate_presensi: issues.filter(i => i.type === 'duplicate_presensi').length,
      total: issues.length,
      severity_high: issues.filter(i => i.severity === 'high').length,
      severity_medium: issues.filter(i => i.severity === 'medium').length
    };
    
    console.log("Integrity check complete:", summary);
    
    return {
      status: 'success',
      message: issues.length === 0 
        ? 'Data integrity check passed' 
        : issues.length + ' issues found',
      summary: summary,
      issues: issues,
      stats: {
        totalJurnal: jurnalData.length,
        totalPresensi: presensiData.length,
        totalSiswa: siswaData.length
      }
    };
    
  } catch (err) {
    console.error("Error in checkDataIntegrity: " + err.toString());
    return {
      status: 'error',
      message: 'Integrity check failed: ' + err.toString()
    };
  }
}

// ============================================================
// NEW: AUTO-FIX FUNCTION
// Run this to auto-fix common issues
// ============================================================

function autoFixDataIssues() {
  try {
    console.log("=== AUTO-FIXING DATA ISSUES ===");
    
    var integrityCheck = checkDataIntegrity();
    if (integrityCheck.status !== 'success') {
      return integrityCheck;
    }
    
    var issues = integrityCheck.issues;
    var fixed = [];
    var failed = [];
    
    // FIX 1: Delete orphan presensi
    var orphans = issues.filter(i => i.type === 'orphan_presensi');
    orphans.forEach(function(issue) {
      try {
        hapusPresensi({ id: issue.presensi_id });
        fixed.push({
          type: 'orphan_presensi',
          id: issue.presensi_id,
          action: 'deleted'
        });
      } catch (err) {
        failed.push({
          type: 'orphan_presensi',
          id: issue.presensi_id,
          error: err.toString()
        });
      }
    });
    
    // FIX 2: Delete presensi with invalid NIS
    var invalidNIS = issues.filter(i => i.type === 'invalid_nis');
    invalidNIS.forEach(function(issue) {
      try {
        hapusPresensi({ id: issue.presensi_id });
        fixed.push({
          type: 'invalid_nis',
          id: issue.presensi_id,
          action: 'deleted'
        });
      } catch (err) {
        failed.push({
          type: 'invalid_nis',
          id: issue.presensi_id,
          error: err.toString()
        });
      }
    });
    
    // FIX 3: Delete duplicate presensi (keep first, delete rest)
    var duplicates = issues.filter(i => i.type === 'duplicate_presensi');
    duplicates.forEach(function(issue) {
      try {
        hapusPresensi({ id: issue.presensi_id });
        fixed.push({
          type: 'duplicate_presensi',
          id: issue.presensi_id,
          action: 'deleted'
        });
      } catch (err) {
        failed.push({
          type: 'duplicate_presensi',
          id: issue.presensi_id,
          error: err.toString()
        });
      }
    });
    
    // FIX 4: Create missing presensi from jurnal
    // This is more complex, skip for auto-fix
    // Manual intervention recommended
    
    // Clear cache
    clearAllCacheForJurnalPresensi();
    
    return {
      status: 'success',
      message: fixed.length + ' issues fixed, ' + failed.length + ' failed',
      fixed: fixed,
      failed: failed,
      summary: {
        total_issues: issues.length,
        fixed_count: fixed.length,
        failed_count: failed.length,
        remaining_issues: issues.length - fixed.length
      }
    };
    
  } catch (err) {
    console.error("Error in autoFixDataIssues: " + err.toString());
    return {
      status: 'error',
      message: 'Auto-fix failed: ' + err.toString()
    };
  }
}

/* ================================================================
   TESTING FUNCTIONS
   Run these to test the fixes
   ================================================================ */

function testValidation() {
  var testData = [
    { nis: "12345", nama: "Test Student", status: "H" },
    { nis: "99999", nama: "Invalid NIS", status: "S" }, // Should fail
    { nis: "12345", nama: "Test Student", status: "X" }  // Invalid status
  ];
  
  var result = validateStudentData(testData);
  console.log("Validation test result:", result);
  return result;
}

function testDuplicateCheck() {
  var result = checkDuplicatePresensi(
    "2024-01-15",
    "X-1",
    "Matematika",
    "Pak Budi",
    "07:00-08:00",
    "12345"
  );
  console.log("Duplicate check result:", result);
  return result;
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

    /* ================================================================
       TESTING FUNCTIONS
       Run these to test the fixes
       ================================================================ */

    function testValidation() {
      var testData = [
        { nis: "12345", nama: "Test Student", status: "H" },
        { nis: "99999", nama: "Invalid NIS", status: "S" }, // Should fail
        { nis: "12345", nama: "Test Student", status: "X" }  // Invalid status
      ];
      
      var result = validateStudentData(testData);
      console.log("Validation test result:", result);
      return result;
    }

    function testDuplicateCheck() {
      var result = checkDuplicatePresensi(
        "2024-01-15",
        "X-1",
        "Matematika",
        "Pak Budi",
        "07:00-08:00",
        "12345"
      );
      console.log("Duplicate check result:", result);
      return result;
    }

    function testIntegrityCheck() {
      var result = checkDataIntegrity();
      console.log("Integrity check result:", result);
      return result;
    }

    /* ================================================================
       DEPLOYMENT CHECKLIST
   
       1. ✅ Backup code.gs yang lama
       2. ✅ Copy-paste functions di atas ke code.gs
       3. ✅ Save dan test di Apps Script Editor
       4. ✅ Run testValidation() untuk test validation
       5. ✅ Run testIntegrityCheck() untuk cek data existing
       6. ✅ Deploy as web app (versi baru)
       7. ✅ Test di frontend
       8. ✅ Monitor logs untuk errors
       9. ✅ Run autoFixDataIssues() jika perlu cleanup data
   
       ================================================================ */