// File: dashboard.js
// Tujuan: Logika utama Dashboard (Presensi, Siswa, Disiplin).
// Versi: 2.1 (Stable, Anti-Spam Scan, Secure Import)

import { supabase } from './config.js';
import { showLoading, showStatusMessage, playSound } from './utils.js';
import { checkAuthenticationAndSetup, handleLogout, setupAuthListener } from './auth.js';

// ====================================================================
// 1. STATE & GLOBAL VARIABLES
// ====================================================================

const AppState = {
    siswa: [],
    pelanggaran: [],
    userSekolahId: null,
    namaSekolah: "Sekolah Kak Rose",
    isScanning: false // Flag untuk mencegah scan ganda
};

// Instance Scanner Global
let html5QrcodeScanner = null;

// ====================================================================
// 2. INISIALISASI HALAMAN
// ====================================================================

export async function initDashboardPage() {
    // 1. Cek Auth & Setup Redirect
    await checkAuthenticationAndSetup();
    setupAuthListener();

    // 2. Ambil Session
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return; // Auth.js akan menangani redirect

    // 3. Muat Profil Pengguna & Sekolah ID
    try {
        const { data: userProfile, error } = await supabase
            .from('pengguna')
            .select('sekolah_id, sekolah ( nama_sekolah )')
            .eq('id', session.user.id)
            .single();

        if (error || !userProfile || !userProfile.sekolah_id) {
            console.error("Profile Error:", error);
            alert("AKUN BERMASALAH: Akun Anda tidak terhubung ke data sekolah manapun. Hubungi Admin.");
            await handleLogout();
            return;
        }

        // Simpan ke State Global
        AppState.userSekolahId = userProfile.sekolah_id;
        if (userProfile.sekolah) {
            AppState.namaSekolah = userProfile.sekolah.nama_sekolah;
            // Update UI Nama Sekolah
            const schoolNameEl = document.getElementById('schoolNameDisplay');
            if (schoolNameEl) {
                schoolNameEl.textContent = AppState.namaSekolah;
                schoolNameEl.style.display = 'inline';
            }
        }

        // 4. Muat Data Awal
        await loadSiswaData(); // Cache data siswa untuk performa scan cepat
        setupDashboardListeners();
        
        // Buka tab default
        document.querySelector('.section-nav button[data-section="datangSection"]')?.click();

    } catch (err) {
        console.error("Init Error:", err);
        showStatusMessage("Gagal memuat dashboard. Coba refresh halaman.", "error");
    }
}

// ====================================================================
// 3. LOGIKA QR SCANNER (PRESENSI)
// ====================================================================

function startQrScanner(type) {
    // Hentikan scanner lama jika ada
    if (html5QrcodeScanner) {
        html5QrcodeScanner.clear().catch(err => console.warn("Clear error", err));
        html5QrcodeScanner = null;
    }

    const elementId = type === 'datang' ? 'qrScannerDatang' : 'qrScannerPulang';
    const resultEl = document.getElementById(type === 'datang' ? 'scanResultDatang' : 'scanResultPulang');
    
    // Reset pesan
    if (resultEl) {
        resultEl.className = 'scan-result';
        resultEl.textContent = "Arahkan kamera ke QR Code Siswa...";
    }

    // Callback saat scan sukses
    const onScanSuccess = async (decodedText, decodedResult) => {
        if (AppState.isScanning) return; // Cegah spam scan
        
        AppState.isScanning = true; // Lock scanner
        
        // Pause scanner visual
        if (html5QrcodeScanner) html5QrcodeScanner.pause(true);

        await processPresensi(decodedText, type);

        // Cooldown 2.5 detik sebelum bisa scan lagi
        setTimeout(() => {
            AppState.isScanning = false; // Unlock
            if (html5QrcodeScanner) {
                html5QrcodeScanner.resume();
                if (resultEl) resultEl.innerHTML = "Siap memindai berikutnya...";
            }
        }, 2500); 
    };

    // Konfigurasi Scanner
    const config = { 
        fps: 10, 
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1.0 
    };
    
    html5QrcodeScanner = new Html5QrcodeScanner(elementId, config, false);
    html5QrcodeScanner.render(onScanSuccess, (error) => {
        // Abaikan error "QR code parse error" yang muncul tiap frame kosong
    });
}

function stopQrScanner() {
    if (html5QrcodeScanner) {
        try {
            html5QrcodeScanner.clear();
        } catch (e) { 
            console.warn("Scanner clear error:", e); 
        }
        html5QrcodeScanner = null;
    }
}

async function processPresensi(nisn, type) {
    const resultEl = document.getElementById(type === 'datang' ? 'scanResultDatang' : 'scanResultPulang');
    
    // 1. Cek apakah siswa ada di sekolah ini (menggunakan cache AppState untuk kecepatan)
    const siswa = AppState.siswa.find(s => s.nisn == nisn);

    if (!siswa) {
        playSound('error');
        resultEl.className = 'scan-result error';
        resultEl.innerHTML = `<strong>GAGAL:</strong><br>Siswa dengan NISN ${nisn}<br>tidak terdaftar di sekolah ini.`;
        return;
    }

    // 2. Cek Log Presensi Hari Ini di Database
    const today = new Date();
    today.setHours(0,0,0,0); // Reset jam ke 00:00 hari ini
    const todayStr = today.toISOString();

    // Query Cek
    const { data: logHarian, error: checkError } = await supabase
        .from('presensi')
        .select('*')
        .eq('nisn_siswa', nisn)
        .gte('waktu_datang', todayStr) // Lebih besar dari jam 00:00 hari ini
        .maybeSingle();

    if (checkError) {
        resultEl.textContent = "Koneksi Error. Coba lagi.";
        return;
    }

    // 3. Logika DATANG vs PULANG
    if (type === 'datang') {
        if (logHarian) {
            playSound('error');
            resultEl.className = 'scan-result error';
            resultEl.innerHTML = `<strong>DITOLAK:</strong><br>${siswa.nama}<br>Sudah absen datang jam ${new Date(logHarian.waktu_datang).toLocaleTimeString('id-ID', {hour: '2-digit', minute:'2-digit'})}.`;
        } else {
            // Insert Presensi Baru
            const { error: insertError } = await supabase.from('presensi').insert({
                nisn_siswa: nisn,
                waktu_datang: new Date(),
                sekolah_id: AppState.userSekolahId
            });

            if (insertError) {
                resultEl.textContent = "Gagal menyimpan data.";
            } else {
                playSound('success');
                resultEl.className = 'scan-result success';
                resultEl.innerHTML = `<strong>BERHASIL DATANG:</strong><br>${siswa.nama}<br>(${siswa.kelas || '-'})`;
                loadDailyLog('datang'); // Refresh tabel
            }
        }
    } 
    else { // type === 'pulang'
        if (!logHarian) {
            playSound('error');
            resultEl.className = 'scan-result error';
            resultEl.innerHTML = `<strong>DITOLAK:</strong><br>${siswa.nama}<br>Belum melakukan presensi datang hari ini.`;
        } else if (logHarian.waktu_pulang) {
            playSound('error');
            resultEl.className = 'scan-result error';
            resultEl.innerHTML = `<strong>DITOLAK:</strong><br>${siswa.nama}<br>Sudah absen pulang sebelumnya.`;
        } else {
            // Update Waktu Pulang
            const { error: updateError } = await supabase
                .from('presensi')
                .update({ waktu_pulang: new Date() })
                .eq('id', logHarian.id); // Update berdasarkan ID record yang ditemukan

            if (updateError) {
                resultEl.textContent = "Gagal menyimpan data.";
            } else {
                playSound('success');
                resultEl.className = 'scan-result success';
                resultEl.innerHTML = `<strong>BERHASIL PULANG:</strong><br>${siswa.nama}`;
                loadDailyLog('pulang'); // Refresh tabel
            }
        }
    }
}

async function loadDailyLog(type) {
    const tableBody = document.getElementById(type === 'datang' ? 'logTableBodyDatang' : 'logTableBodyPulang');
    
    const today = new Date();
    today.setHours(0,0,0,0);

    const { data, error } = await supabase
        .from('presensi')
        .select(`
            waktu_datang, 
            waktu_pulang, 
            siswa (nisn, nama)
        `)
        .eq('sekolah_id', AppState.userSekolahId)
        .gte('waktu_datang', today.toISOString())
        .order(type === 'datang' ? 'waktu_datang' : 'waktu_pulang', { ascending: false })
        .limit(10); // Hanya ambil 10 terakhir agar ringan

    if (error || !data) return;

    // Filter lokal untuk presensi pulang (karena query di atas filter waktu_datang)
    const filteredData = type === 'datang' 
        ? data 
        : data.filter(row => row.waktu_pulang !== null);

    if (filteredData.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="3" style="text-align:center;">Belum ada data.</td></tr>`;
        return;
    }

    tableBody.innerHTML = filteredData.map(row => {
        const time = type === 'datang' ? row.waktu_datang : row.waktu_pulang;
        const timeStr = new Date(time).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
        return `<tr>
            <td>${timeStr}</td>
            <td>${row.siswa.nisn}</td>
            <td>${row.siswa.nama}</td>
        </tr>`;
    }).join('');
}

// ====================================================================
// 4. LOGIKA REKAP & WHATSAPP
// ====================================================================

async function handleFilterRekap() {
    const start = document.getElementById('rekapFilterTanggalMulai').value;
    const end = document.getElementById('rekapFilterTanggalSelesai').value;

    if (!start || !end) return showStatusMessage("Pilih rentang tanggal.", "error");

    showLoading(true);
    // Tambahkan jam akhir hari untuk tanggal selesai
    const endDateObj = new Date(end);
    endDateObj.setHours(23, 59, 59, 999);

    const { data, error } = await supabase
        .from('presensi')
        .select(`
            waktu_datang, waktu_pulang, status,
            siswa ( nisn, nama, whatsapp_ortu )
        `)
        .eq('sekolah_id', AppState.userSekolahId)
        .gte('waktu_datang', start)
        .lte('waktu_datang', endDateObj.toISOString())
        .order('waktu_datang', { ascending: false });

    showLoading(false);

    if (error) return showStatusMessage(`Gagal: ${error.message}`, 'error');

    renderRekapTable(data);
    
    // Tampilkan tombol export jika ada data
    document.getElementById('exportRekapButton').style.display = data.length > 0 ? 'inline-block' : 'none';
}

function renderRekapTable(data) {
    const tbody = document.getElementById('rekapTableBody');
    if (!data.length) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;">Tidak ditemukan data pada tanggal tersebut.</td></tr>`;
        return;
    }

    tbody.innerHTML = data.map(row => {
        const tgl = new Date(row.waktu_datang).toLocaleDateString('id-ID');
        const jamMasuk = new Date(row.waktu_datang).toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit'});
        const jamPulang = row.waktu_pulang 
            ? new Date(row.waktu_pulang).toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit'}) 
            : '<span style="color:red">-</span>';
        
        // Tombol WA
        let waBtn = '-';
        if (row.siswa && row.siswa.whatsapp_ortu) {
            waBtn = `<button class="btn btn-sm btn-success" onclick="window.sendWA('${row.siswa.nama}', '${row.siswa.whatsapp_ortu}', '${row.waktu_datang}', '${row.waktu_pulang}')">📱 Kirim WA</button>`;
        }

        return `<tr>
            <td data-label="Tanggal">${tgl}</td>
            <td data-label="NISN">${row.siswa?.nisn || '?'}</td>
            <td data-label="Nama">${row.siswa?.nama || 'Terhapus'}</td>
            <td data-label="Masuk">${jamMasuk}</td>
            <td data-label="Pulang">${jamPulang}</td>
            <td data-label="Status">${row.status || 'Hadir'}</td>
            <td data-label="Aksi">${waBtn}</td>
        </tr>`;
    }).join('');
}

// Fungsi WA Helper (Dipasang di window agar bisa diakses onclick HTML)
window.sendWA = function(nama, noHp, tglMasuk, tglPulang) {
    // 1. Format Nomor HP (08xx -> 628xx)
    let cleanHp = noHp.replace(/\D/g, ''); // Hapus karakter non-angka
    if (cleanHp.startsWith('0')) cleanHp = '62' + cleanHp.slice(1);
    if (!cleanHp.startsWith('62')) cleanHp = '62' + cleanHp;

    // 2. Format Pesan
    const dMasuk = new Date(tglMasuk);
    const textMasuk = dMasuk.toLocaleString('id-ID', {weekday:'long', day:'numeric', month:'long', hour:'2-digit', minute:'2-digit'});
    
    let textPulang = "Belum Presensi Pulang";
    if (tglPulang && tglPulang !== 'null' && tglPulang !== 'undefined') {
        textPulang = new Date(tglPulang).toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit'});
    }

    const pesan = `Assalamualaikum Wr. Wb.
Yth. Wali Murid dari *${nama}*.

Kami dari ${AppState.namaSekolah} menginformasikan presensi ananda:
📅 *Tanggal/Waktu Datang:* ${textMasuk}
🏠 *Waktu Pulang:* ${textPulang}

Terima kasih.`;

    const url = `https://api.whatsapp.com/send?phone=${cleanHp}&text=${encodeURIComponent(pesan)}`;
    window.open(url, '_blank');
};

// ====================================================================
// 5. MANAJEMEN SISWA (CRUD & IMPORT)
// ====================================================================

async function loadSiswaData() {
    // Tidak pakai loading spinner agar background refresh halus
    const { data, error } = await supabase
        .from('siswa')
        .select('*')
        .eq('sekolah_id', AppState.userSekolahId)
        .order('nama');

    if (error) {
        console.error("Load Siswa Error:", error);
        return;
    }

    // Simpan ke State (cache) untuk scan cepat
    AppState.siswa = data;
    renderSiswaTable();
}

function renderSiswaTable() {
    const tbody = document.getElementById('siswaResultsTableBody');
    if (!tbody) return;

    if (!AppState.siswa.length) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;">Belum ada data siswa. Silakan Import atau Tambah Manual.</td></tr>`;
        return;
    }

    tbody.innerHTML = AppState.siswa.map(s => `
        <tr>
            <td data-label="NISN">${s.nisn}</td>
            <td data-label="Nama">${s.nama}</td>
            <td data-label="Kelas">${s.kelas || '-'}</td>
            <td data-label="WA">${s.whatsapp_ortu || '-'}</td>
            <td data-label="Aksi" style="white-space:nowrap;">
                <button class="btn btn-sm btn-primary" onclick="window.showQrModal('${s.nisn}', '${s.nama.replace(/'/g,"\\'")}')">QR</button>
                <button class="btn btn-sm btn-secondary" onclick="window.editSiswa('${s.nisn}')">Edit</button>
                <button class="btn btn-sm btn-danger" onclick="window.deleteSiswa('${s.nisn}')">Hapus</button>
            </td>
        </tr>
    `).join('');
}

async function handleSaveSiswa(e) {
    e.preventDefault();
    const nisn = document.getElementById('formNisn').value;
    const nama = document.getElementById('formNama').value;
    const kelas = document.getElementById('formKelas').value;
    const wa = document.getElementById('formWhatsappOrtu').value;
    const oldNisn = document.getElementById('formNisnOld').value;

    const payload = {
        nisn: nisn,
        nama: nama,
        kelas: kelas,
        whatsapp_ortu: wa,
        sekolah_id: AppState.userSekolahId
    };

    showLoading(true);
    let error;

    if (oldNisn) {
        // Mode Update
        const { error: err } = await supabase.from('siswa').update(payload).eq('nisn', oldNisn);
        error = err;
    } else {
        // Mode Insert
        const { error: err } = await supabase.from('siswa').insert(payload);
        error = err;
    }
    showLoading(false);

    if (error) {
        showStatusMessage(`Gagal Simpan: ${error.message}`, 'error');
    } else {
        showStatusMessage("Data siswa berhasil disimpan!", 'success');
        document.getElementById('formSiswa').reset();
        document.getElementById('formNisnOld').value = '';
        document.getElementById('saveSiswaButton').textContent = 'Simpan Data';
        loadSiswaData(); // Refresh tabel & cache
    }
}

// Handlers Siswa Global
window.editSiswa = (nisn) => {
    const s = AppState.siswa.find(item => item.nisn == nisn);
    if (!s) return;
    document.getElementById('formNisn').value = s.nisn;
    document.getElementById('formNisnOld').value = s.nisn; // Key untuk update
    document.getElementById('formNama').value = s.nama;
    document.getElementById('formKelas').value = s.kelas || '';
    document.getElementById('formWhatsappOrtu').value = s.whatsapp_ortu || '';
    
    document.getElementById('saveSiswaButton').textContent = 'Update Data';
    document.getElementById('formSiswa').scrollIntoView({behavior:'smooth'});
};

window.deleteSiswa = async (nisn) => {
    if (!confirm(`Hapus siswa dengan NISN ${nisn}? Data presensi mereka juga akan hilang!`)) return;
    
    showLoading(true);
    const { error } = await supabase.from('siswa').delete().eq('nisn', nisn);
    showLoading(false);

    if (error) showStatusMessage(`Gagal hapus: ${error.message}`, 'error');
    else {
        showStatusMessage('Siswa dihapus.', 'success');
        loadSiswaData();
    }
};

window.showQrModal = (nisn, nama) => {
    document.getElementById('qrModalStudentName').textContent = nama;
    document.getElementById('qrModalStudentNisn').textContent = `NISN: ${nisn}`;
    const canvas = document.getElementById('qrCodeCanvas');
    canvas.innerHTML = '';
    
    // Generate QR
    new QRCode(canvas, {
        text: nisn.toString(),
        width: 180,
        height: 180
    });
    
    document.getElementById('qrModal').style.display = 'flex';
};

// Import CSV Handler
function handleImportSiswa(event) {
    const file = event.target.files[0];
    if (!file) return;

    showLoading(true);
    Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: async (results) => {
            const validData = [];
            
            // Validasi Data CSV
            results.data.forEach(row => {
                // Support berbagai format header (NISN, nisn, Nisn, dll)
                const nisn = row.NISN || row.nisn || row.Nisn;
                const nama = row.Nama || row.nama || row.NAMA;
                const kelas = row.Kelas || row.kelas;
                const wa = row.Whatsapp || row.WA || row['Whatsapp Ortu'] || row.whatsapp_ortu;

                if (nisn && nama) {
                    validData.push({
                        nisn: nisn.toString().trim(),
                        nama: nama.toString().trim(),
                        kelas: kelas ? kelas.toString().trim() : null,
                        whatsapp_ortu: wa ? wa.toString().replace(/\D/g,'') : null,
                        sekolah_id: AppState.userSekolahId
                    });
                }
            });

            if (validData.length === 0) {
                showLoading(false);
                return showStatusMessage("Format CSV salah atau file kosong. Pastikan ada kolom NISN dan Nama.", "error");
            }

            // Upsert (Insert or Update) ke Supabase
            const { error } = await supabase.from('siswa').upsert(validData, { onConflict: 'nisn' });
            
            showLoading(false);
            if (error) {
                showStatusMessage(`Import Gagal: ${error.message}`, 'error');
            } else {
                showStatusMessage(`Berhasil mengimpor ${validData.length} siswa!`, 'success');
                loadSiswaData();
            }
            event.target.value = ''; // Reset input file
        },
        error: (err) => {
            showLoading(false);
            showStatusMessage("Gagal membaca file CSV.", "error");
        }
    });
}

// ====================================================================
// 6. LOGIKA DISIPLIN
// ====================================================================

// Auto-fill nama saat NISN diketik di form disiplin
function setupDisiplinListeners() {
    const nisnInput = document.getElementById('nisnDisiplinInput');
    const namaDisplay = document.getElementById('namaSiswaDisiplin');

    nisnInput.addEventListener('blur', () => {
        const val = nisnInput.value;
        const s = AppState.siswa.find(item => item.nisn == val);
        if (s) {
            namaDisplay.value = s.nama;
            namaDisplay.style.backgroundColor = '#d4edda'; // Hijau muda
        } else {
            namaDisplay.value = "Siswa tidak ditemukan";
            namaDisplay.style.backgroundColor = '#f8d7da'; // Merah muda
        }
    });

    document.getElementById('formDisiplin').addEventListener('submit', async (e) => {
        e.preventDefault();
        const nisn = nisnInput.value;
        const tingkat = document.getElementById('tingkatDisiplinInput').value;
        const deskripsi = document.getElementById('deskripsiDisiplinInput').value;
        
        // Cek Siswa valid
        if (namaDisplay.value === "Siswa tidak ditemukan" || !namaDisplay.value) {
            return showStatusMessage("NISN Siswa tidak valid.", "error");
        }

        showLoading(true);
        // Cari poin dari deskripsi (jika master pelanggaran ada logic poin, sementara manual/dummy)
        // Disini kita simpan text-nya saja dulu. Idealnya ambil dari master pelanggaran.
        
        const { error } = await supabase.from('catatan_disiplin').insert({
            nisn_siswa: nisn,
            sekolah_id: AppState.userSekolahId,
            tingkat: tingkat,
            deskripsi: deskripsi,
            poin: 0 // Default 0, logic poin bisa dikembangkan nanti
        });

        showLoading(false);
        if (error) showStatusMessage(`Gagal: ${error.message}`, 'error');
        else {
            showStatusMessage("Catatan pelanggaran tersimpan.", "success");
            e.target.reset();
            namaDisplay.value = "";
            namaDisplay.style.backgroundColor = "#f0f0f0";
        }
    });

    // Fitur Import Master Pelanggaran (Optional)
    // ... Implementasi mirip Import Siswa ...
}

// ====================================================================
// 7. EVENT LISTENERS UTAMA
// ====================================================================

function setupDashboardListeners() {
    // 1. Logout
    document.getElementById('logoutButton')?.addEventListener('click', handleLogout);

    // 2. Navigasi Tab (Single Page Feel)
    document.querySelectorAll('.section-nav button').forEach(btn => {
        btn.addEventListener('click', () => {
            // UI Active State
            document.querySelectorAll('.section-nav button').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Hide/Show Section
            const targetId = btn.dataset.section;
            document.querySelectorAll('.content-section').forEach(sec => sec.style.display = 'none');
            document.getElementById(targetId).style.display = 'block';

            // Stop Scanner jika pindah dari tab presensi
            stopQrScanner();

            // Logic per Section
            if (targetId === 'datangSection') {
                startQrScanner('datang');
                loadDailyLog('datang');
            } else if (targetId === 'pulangSection') {
                startQrScanner('pulang');
                loadDailyLog('pulang');
            } else if (targetId === 'rekapSection') {
                // Set default date hari ini
                const today = new Date().toISOString().split('T')[0];
                document.getElementById('rekapFilterTanggalMulai').value = today;
                document.getElementById('rekapFilterTanggalSelesai').value = today;
            }
        });
    });

    // 3. Siswa Form & Actions
    document.getElementById('formSiswa')?.addEventListener('submit', handleSaveSiswa);
    document.getElementById('resetSiswaButton')?.addEventListener('click', () => {
        document.getElementById('formSiswa').reset();
        document.getElementById('formNisnOld').value = '';
        document.getElementById('saveSiswaButton').textContent = 'Simpan Data';
    });
    
    // Import CSV
    document.getElementById('importSiswaButton')?.addEventListener('click', () => {
        document.getElementById('importSiswaInput').click();
    });
    document.getElementById('importSiswaInput')?.addEventListener('change', handleImportSiswa);

    // Rekap
    document.getElementById('filterRekapButton')?.addEventListener('click', handleFilterRekap);
    document.getElementById('refreshRekapButton')?.addEventListener('click', handleFilterRekap);

    // Modal QR Close
    document.querySelector('.modal-close-button')?.addEventListener('click', () => {
        document.getElementById('qrModal').style.display = 'none';
    });
    
    // Print QR
    document.getElementById('printQrButton')?.addEventListener('click', () => {
        const content = document.querySelector('#qrModal .modal-content').innerHTML;
        const win = window.open('', '', 'height=500,width=500');
        win.document.write('<html><body style="text-align:center;">' + content + '</body></html>');
        // Hapus tombol print di jendela baru
        const btn = win.document.getElementById('printQrButton');
        if(btn) btn.remove();
        win.document.close();
        win.focus();
        setTimeout(() => { win.print(); win.close(); }, 500);
    });

    // Setup Disiplin
    setupDisiplinListeners();
}
