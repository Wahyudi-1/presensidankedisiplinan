// File: dashboard.js
// Tujuan: Logika utama Dashboard Admin Sekolah
// Versi: 3.1 (Added Wali Kelas Management & Fixed CSV Headers)

import { supabase } from './config.js';
import { showLoading, showStatusMessage, playSound } from './utils.js';
import { checkAuthenticationAndSetup, handleLogout, setupAuthListener } from './auth.js';

// ====================================================================
// 1. STATE & GLOBAL VARIABLES
// ====================================================================

const AppState = {
    siswa: [],
    waliKelas: [], // State untuk menyimpan data Wali Kelas
    lastRekapData: [],
    userSekolahId: null,
    namaSekolah: "Sekolah Kak Rose",
    isScanning: false
};

// Instance Scanner Global
let html5QrcodeScanner = null;

// ====================================================================
// 2. INISIALISASI HALAMAN
// ====================================================================

export async function initDashboardPage() {
    await checkAuthenticationAndSetup();
    setupAuthListener();

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    try {
        const { data: userProfile, error } = await supabase
            .from('pengguna')
            .select('sekolah_id, sekolah ( nama_sekolah )')
            .eq('id', session.user.id)
            .single();

        if (error || !userProfile || !userProfile.sekolah_id) {
            console.error("Profile Error:", error);
            alert("AKUN BERMASALAH: Hubungi Admin.");
            await handleLogout();
            return;
        }

        AppState.userSekolahId = userProfile.sekolah_id;
        if (userProfile.sekolah) {
            AppState.namaSekolah = userProfile.sekolah.nama_sekolah;
            const schoolNameEl = document.getElementById('schoolNameDisplay');
            if (schoolNameEl) {
                schoolNameEl.textContent = AppState.namaSekolah;
                schoolNameEl.style.display = 'inline';
            }
        }

        // Muat data awal
        await loadSiswaData();
        setupDashboardListeners();
        
        // Buka tab default
        document.querySelector('.section-nav button[data-section="datangSection"]')?.click();

    } catch (err) {
        console.error("Init Error:", err);
        showStatusMessage("Gagal memuat dashboard.", "error");
    }
}

// ====================================================================
// 3. LOGIKA QR SCANNER (PRESENSI)
// ====================================================================

function startQrScanner(type) {
    if (html5QrcodeScanner) {
        html5QrcodeScanner.clear().catch(err => console.warn("Clear error", err));
        html5QrcodeScanner = null;
    }

    const elementId = type === 'datang' ? 'qrScannerDatang' : 'qrScannerPulang';
    const resultEl = document.getElementById(type === 'datang' ? 'scanResultDatang' : 'scanResultPulang');
    
    if (resultEl) {
        resultEl.className = 'scan-result';
        resultEl.textContent = "Arahkan kamera ke QR Code Siswa...";
    }

    const onScanSuccess = async (decodedText, decodedResult) => {
        if (AppState.isScanning) return;
        
        AppState.isScanning = true;
        if (html5QrcodeScanner) html5QrcodeScanner.pause(true);

        await processPresensi(decodedText, type);

        setTimeout(() => {
            AppState.isScanning = false;
            if (html5QrcodeScanner) {
                html5QrcodeScanner.resume();
                if (resultEl) resultEl.innerHTML = "Siap memindai berikutnya...";
            }
        }, 2500); 
    };

    const config = { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 };
    html5QrcodeScanner = new Html5QrcodeScanner(elementId, config, false);
    html5QrcodeScanner.render(onScanSuccess, () => {});
}

function stopQrScanner() {
    if (html5QrcodeScanner) {
        try { html5QrcodeScanner.clear(); } catch (e) { console.warn(e); }
        html5QrcodeScanner = null;
    }
}

async function processPresensi(nisn, type) {
    const resultEl = document.getElementById(type === 'datang' ? 'scanResultDatang' : 'scanResultPulang');
    
    // Cari data siswa di memori lokal (AppState) agar cepat
    const siswa = AppState.siswa.find(s => s.nisn == nisn);

    if (!siswa) {
        playSound('error');
        resultEl.className = 'scan-result error';
        resultEl.innerHTML = `<strong>GAGAL:</strong><br>Siswa dengan NISN ${nisn}<br>tidak terdaftar.`;
        return;
    }

    const today = new Date();
    today.setHours(0,0,0,0);
    const todayStr = today.toISOString();

    // Cek apakah hari ini sudah absen
    const { data: logHarian, error: checkError } = await supabase
        .from('presensi')
        .select('*')
        .eq('nisn_siswa', nisn)
        .gte('waktu_datang', todayStr)
        .maybeSingle();

    if (checkError) {
        resultEl.textContent = "Koneksi Error.";
        return;
    }

    if (type === 'datang') {
        if (logHarian) {
            playSound('error');
            resultEl.className = 'scan-result error';
            resultEl.innerHTML = `<strong>DITOLAK:</strong><br>${siswa.nama}<br>Sudah absen datang.`;
        } else {
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
                resultEl.innerHTML = `<strong>BERHASIL DATANG:</strong><br>${siswa.nama}`;
                loadDailyLog('datang');
            }
        }
    } else { // Pulang
        if (!logHarian) {
            playSound('error');
            resultEl.className = 'scan-result error';
            resultEl.innerHTML = `<strong>DITOLAK:</strong><br>${siswa.nama}<br>Belum presensi datang.`;
        } else if (logHarian.waktu_pulang) {
            playSound('error');
            resultEl.className = 'scan-result error';
            resultEl.innerHTML = `<strong>DITOLAK:</strong><br>${siswa.nama}<br>Sudah absen pulang.`;
        } else {
            const { error: updateError } = await supabase
                .from('presensi')
                .update({ waktu_pulang: new Date() })
                .eq('id', logHarian.id);

            if (updateError) {
                resultEl.textContent = "Gagal menyimpan data.";
            } else {
                playSound('success');
                resultEl.className = 'scan-result success';
                resultEl.innerHTML = `<strong>BERHASIL PULANG:</strong><br>${siswa.nama}`;
                loadDailyLog('pulang');
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
        .select(`waktu_datang, waktu_pulang, siswa (nisn, nama)`)
        .eq('sekolah_id', AppState.userSekolahId)
        .gte('waktu_datang', today.toISOString())
        .order(type === 'datang' ? 'waktu_datang' : 'waktu_pulang', { ascending: false })
        .limit(10);

    if (error || !data) return;

    const filteredData = type === 'datang' ? data : data.filter(row => row.waktu_pulang !== null);

    if (filteredData.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="3" style="text-align:center;">Belum ada data.</td></tr>`;
        return;
    }

    tableBody.innerHTML = filteredData.map(row => {
        const time = type === 'datang' ? row.waktu_datang : row.waktu_pulang;
        const timeStr = new Date(time).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
        return `<tr><td>${timeStr}</td><td>${row.siswa.nisn}</td><td>${row.siswa.nama}</td></tr>`;
    }).join('');
}


// ====================================================================
// 4. LOGIKA MANAJEMEN WALI KELAS (BARU!)
// ====================================================================

async function loadWaliKelasData() {
    const tableBody = document.getElementById('waliKelasTableBody');
    if(!tableBody) return;

    showLoading(true);
    // Filter pengguna yang role-nya wali_kelas dan di sekolah ini
    const { data, error } = await supabase
        .from('pengguna')
        .select('id, email, kelas_assigned')
        .eq('sekolah_id', AppState.userSekolahId)
        .eq('role', 'wali_kelas')
        .order('kelas_assigned', { ascending: true });

    showLoading(false);

    if (error) {
        console.error("Load Wali Kelas Error:", error);
        return;
    }

    AppState.waliKelas = data;

    if (data.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="3" align="center" style="padding:15px;">Belum ada wali kelas. Silakan tambah baru.</td></tr>`;
        return;
    }

    tableBody.innerHTML = data.map(u => `
        <tr>
            <td>${u.email}</td>
            <td><span class="badge" style="background:#e3f2fd; color:#0d47a1; padding:2px 8px; border-radius:4px; font-weight:500;">${u.kelas_assigned}</span></td>
            <td style="text-align: right;">
                <button class="btn btn-sm btn-danger" onclick="window.deleteWaliKelas('${u.id}', '${u.email}')">Hapus</button>
            </td>
        </tr>
    `).join('');
}

async function handleAddWaliKelas(e) {
    e.preventDefault();
    const email = document.getElementById('waliEmail').value.trim();
    const password = document.getElementById('waliPassword').value;
    const kelas = document.getElementById('waliKelasAssigned').value.trim();

    if (!email || !password || !kelas) return showStatusMessage('Semua kolom wajib diisi.', 'error');

    showLoading(true);

    // MENGGUNAKAN EDGE FUNCTION 'quick-task'
    // Digunakan untuk membuat user baru tanpa logout admin
    const { data, error } = await supabase.functions.invoke('quick-task', {
        body: {
            action: 'createUser',
            payload: {
                email: email,
                password: password,
                schoolId: AppState.userSekolahId,
                role: 'wali_kelas', // Role Khusus
                kelasAssigned: kelas // Kelas yang dipegang
            }
        }
    });

    showLoading(false);

    if (error || (data && data.error)) {
        showStatusMessage(`Gagal membuat akun: ${error?.message || data?.error}`, 'error');
    } else {
        showStatusMessage(`Berhasil! Wali Kelas ${kelas} (${email}) telah dibuat.`, 'success');
        document.getElementById('formWaliKelas').reset();
        loadWaliKelasData();
    }
}

window.deleteWaliKelas = async (id, email) => {
    if (!confirm(`Hapus akun Wali Kelas ${email}?`)) return;

    showLoading(true);
    // Menggunakan Edge Function untuk menghapus user dari Auth + Table
    const { data, error } = await supabase.functions.invoke('quick-task', {
        body: { action: 'deleteUser', payload: { userId: id } }
    });
    showLoading(false);

    if (error || (data && data.error)) {
        showStatusMessage(`Gagal hapus: ${error?.message || data?.error}`, 'error');
    } else {
        showStatusMessage('Akun Wali Kelas dihapus.', 'success');
        loadWaliKelasData();
    }
};

// ====================================================================
// 5. MANAJEMEN SISWA (CRUD, IMPORT, EXPORT)
// ====================================================================

async function loadSiswaData() {
    const { data, error } = await supabase
        .from('siswa')
        .select('*')
        .eq('sekolah_id', AppState.userSekolahId)
        .order('nama');

    if (error) {
        console.error("Load Siswa Error:", error);
        return;
    }
    AppState.siswa = data;
    renderSiswaTable();
}

function renderSiswaTable() {
    const tbody = document.getElementById('siswaResultsTableBody');
    if (!tbody) return;

    if (!AppState.siswa.length) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;">Belum ada data siswa.</td></tr>`;
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
        const { error: err } = await supabase.from('siswa').update(payload).eq('nisn', oldNisn);
        error = err;
    } else {
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
        loadSiswaData();
    }
}

window.editSiswa = (nisn) => {
    const s = AppState.siswa.find(item => item.nisn == nisn);
    if (!s) return;
    document.getElementById('formNisn').value = s.nisn;
    document.getElementById('formNisnOld').value = s.nisn;
    document.getElementById('formNama').value = s.nama;
    document.getElementById('formKelas').value = s.kelas || '';
    document.getElementById('formWhatsappOrtu').value = s.whatsapp_ortu || '';
    
    document.getElementById('saveSiswaButton').textContent = 'Update Data';
    document.getElementById('formSiswa').scrollIntoView({behavior:'smooth'});
};

window.deleteSiswa = async (nisn) => {
    if (!confirm(`Hapus siswa NISN ${nisn}? Data presensi juga akan hilang!`)) return;
    
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
    
    new QRCode(canvas, { text: nisn.toString(), width: 180, height: 180 });
    document.getElementById('qrModal').style.display = 'flex';
};

// Logic Import Siswa (Dengan perbaikan Header WhatsappOrtu)
function handleImportSiswa(event) {
    const file = event.target.files[0];
    if (!file) return;

    showLoading(true);
    Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: async (results) => {
            const validData = [];
            
            results.data.forEach(row => {
                const nisn = row.NISN || row.nisn || row.Nisn;
                const nama = row.Nama || row.nama || row.NAMA;
                const kelas = row.Kelas || row.kelas;
                
                // === PERBAIKAN: Support 'WhatsappOrtu' header ===
                const wa = row.Whatsapp || row.WA || row.wa || row.whatsapp_ortu || row.WhatsappOrtu;

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
                return showStatusMessage("Format CSV salah atau file kosong.", "error");
            }

            const { error } = await supabase.from('siswa').upsert(validData, { onConflict: 'nisn' });
            
            showLoading(false);
            if (error) {
                showStatusMessage(`Import Gagal: ${error.message}`, 'error');
            } else {
                showStatusMessage(`Berhasil mengimpor ${validData.length} siswa!`, 'success');
                loadSiswaData();
            }
            event.target.value = '';
        },
        error: (err) => {
            showLoading(false);
            showStatusMessage("Gagal membaca file CSV.", "error");
        }
    });
}

// ====================================================================
// 6. LOGIKA REKAP, DISIPLIN & LAINNYA
// ====================================================================

async function handleFilterRekap() {
    const start = document.getElementById('rekapFilterTanggalMulai').value;
    const end = document.getElementById('rekapFilterTanggalSelesai').value;

    if (!start || !end) return showStatusMessage("Pilih rentang tanggal.", "error");

    showLoading(true);
    const endDateObj = new Date(end);
    endDateObj.setHours(23, 59, 59, 999);

    const { data, error } = await supabase
        .from('presensi')
        .select(`waktu_datang, waktu_pulang, status, siswa ( nisn, nama, whatsapp_ortu )`)
        .eq('sekolah_id', AppState.userSekolahId)
        .gte('waktu_datang', start)
        .lte('waktu_datang', endDateObj.toISOString())
        .order('waktu_datang', { ascending: false });

    showLoading(false);

    if (error) return showStatusMessage(`Gagal: ${error.message}`, 'error');

    // Simpan data untuk keperluan Export Excel
    AppState.lastRekapData = data;

    renderRekapTable(data);
    document.getElementById('exportRekapButton').style.display = data.length > 0 ? 'inline-block' : 'none';
}

function renderRekapTable(data) {
    const tbody = document.getElementById('rekapTableBody');
    if (!data.length) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;">Tidak ditemukan data.</td></tr>`;
        return;
    }

    tbody.innerHTML = data.map(row => {
        const tgl = new Date(row.waktu_datang).toLocaleDateString('id-ID');
        const jamMasuk = new Date(row.waktu_datang).toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit'});
        const jamPulang = row.waktu_pulang 
            ? new Date(row.waktu_pulang).toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit'}) 
            : '<span style="color:red">-</span>';
        
        let waBtn = '-';
        if (row.siswa && row.siswa.whatsapp_ortu) {
            waBtn = `<button class="btn btn-sm btn-success" onclick="window.sendWA('${row.siswa.nama}', '${row.siswa.whatsapp_ortu}', '${row.waktu_datang}', '${row.waktu_pulang}')">📱 WA</button>`;
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

window.sendWA = function(nama, noHp, tglMasuk, tglPulang) {
    let cleanHp = noHp.replace(/\D/g, '');
    if (cleanHp.startsWith('0')) cleanHp = '62' + cleanHp.slice(1);
    if (!cleanHp.startsWith('62')) cleanHp = '62' + cleanHp;

    const dMasuk = new Date(tglMasuk);
    const textMasuk = dMasuk.toLocaleString('id-ID', {weekday:'long', day:'numeric', month:'long', hour:'2-digit', minute:'2-digit'});
    
    let textPulang = "Belum Presensi Pulang";
    if (tglPulang && tglPulang !== 'null' && tglPulang !== 'undefined') {
        textPulang = new Date(tglPulang).toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit'});
    }

    const pesan = `Assalamualaikum Wr. Wb.
Yth. Wali Murid dari *${nama}*.
Informasi presensi dari ${AppState.namaSekolah}:
📅 *Datang:* ${textMasuk}
🏠 *Pulang:* ${textPulang}
Terima kasih.`;

    window.open(`https://api.whatsapp.com/send?phone=${cleanHp}&text=${encodeURIComponent(pesan)}`, '_blank');
};

function setupDisiplinListeners() {
    const nisnInput = document.getElementById('nisnDisiplinInput');
    const namaDisplay = document.getElementById('namaSiswaDisiplin');
    
    if(!nisnInput) return;

    nisnInput.addEventListener('blur', () => {
        const val = nisnInput.value;
        const s = AppState.siswa.find(item => item.nisn == val);
        if (s) {
            namaDisplay.value = s.nama;
            namaDisplay.style.backgroundColor = '#d4edda';
        } else {
            namaDisplay.value = "Siswa tidak ditemukan";
            namaDisplay.style.backgroundColor = '#f8d7da';
        }
    });

    document.getElementById('formDisiplin').addEventListener('submit', async (e) => {
        e.preventDefault();
        const nisn = nisnInput.value;
        const tingkat = document.getElementById('tingkatDisiplinInput').value;
        const deskripsi = document.getElementById('deskripsiDisiplinInput').value;
        
        if (namaDisplay.value === "Siswa tidak ditemukan" || !namaDisplay.value) {
            return showStatusMessage("NISN Siswa tidak valid.", "error");
        }

        showLoading(true);
        const { error } = await supabase.from('catatan_disiplin').insert({
            nisn_siswa: nisn,
            sekolah_id: AppState.userSekolahId,
            tingkat: tingkat,
            deskripsi: deskripsi,
            poin: 0 
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
    
    document.getElementById('importPelanggaranButton')?.addEventListener('click', () => {
        document.getElementById('importPelanggaranInput').click();
    });
    document.getElementById('importPelanggaranInput')?.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) return;

        showLoading(true);
        Papa.parse(file, {
            header: true, skipEmptyLines: true,
            complete: async (results) => {
                const validData = [];
                const availableNisns = AppState.siswa.map(s => s.nisn);
                results.data.forEach(row => {
                    const n = row.NISN || row.nisn;
                    if (n && availableNisns.includes(n.toString())) {
                        validData.push({
                            nisn_siswa: n.toString().trim(),
                            tingkat: row.Tingkat || 'Ringan',
                            deskripsi: row.Deskripsi || 'Pelanggaran',
                            poin: 0,
                            sekolah_id: AppState.userSekolahId
                        });
                    }
                });
                const { error } = await supabase.from('catatan_disiplin').insert(validData);
                showLoading(false);
                if (error) showStatusMessage(`Import Gagal: ${error.message}`, 'error');
                else showStatusMessage(`Berhasil import ${validData.length} pelanggaran!`, 'success');
            }
        });
    });
}

function setupDashboardListeners() {
    // 1. Logout
    document.getElementById('logoutButton')?.addEventListener('click', handleLogout);

    // 2. Navigasi Tab
    document.querySelectorAll('.section-nav button').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.section-nav button').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const targetId = btn.dataset.section;
            document.querySelectorAll('.content-section').forEach(sec => sec.style.display = 'none');
            document.getElementById(targetId).style.display = 'block';

            stopQrScanner();

            if (targetId === 'datangSection') {
                startQrScanner('datang');
                loadDailyLog('datang');
            } else if (targetId === 'pulangSection') {
                startQrScanner('pulang');
                loadDailyLog('pulang');
            } else if (targetId === 'waliKelasSection') {
                // Tab Wali Kelas Diklik
                loadWaliKelasData();
            } else if (targetId === 'rekapSection') {
                const today = new Date().toISOString().split('T')[0];
                document.getElementById('rekapFilterTanggalMulai').value = today;
                document.getElementById('rekapFilterTanggalSelesai').value = today;
            }
        });
    });

    // 3. Forms & Actions
    document.getElementById('formSiswa')?.addEventListener('submit', handleSaveSiswa);
    document.getElementById('resetSiswaButton')?.addEventListener('click', () => {
        document.getElementById('formSiswa').reset();
        document.getElementById('formNisnOld').value = '';
        document.getElementById('saveSiswaButton').textContent = 'Simpan Data';
    });
    
    // Form Wali Kelas (Baru)
    document.getElementById('formWaliKelas')?.addEventListener('submit', handleAddWaliKelas);

    // Import Siswa
    document.getElementById('importSiswaButton')?.addEventListener('click', () => {
        document.getElementById('importSiswaInput').click();
    });
    document.getElementById('importSiswaInput')?.addEventListener('change', handleImportSiswa);

    // Export Excel Siswa
    document.getElementById('exportSiswaExcelButton')?.addEventListener('click', () => {
        if (!AppState.siswa.length) return showStatusMessage("Tidak ada data siswa.", "error");
        
        const dataToExport = AppState.siswa.map(s => ({
            "NISN": s.nisn, "Nama": s.nama, "Kelas": s.kelas, "WA Ortu": s.whatsapp_ortu
        }));

        const ws = XLSX.utils.json_to_sheet(dataToExport);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Siswa");
        XLSX.writeFile(wb, `Data_Siswa_${AppState.namaSekolah}.xlsx`);
    });

    // Print All QR
    document.getElementById('exportAllQrButton')?.addEventListener('click', () => {
        if (!AppState.siswa.length) return showStatusMessage("Tidak ada siswa.", "error");
        if (!confirm("Cetak semua QR Code?")) return;

        const win = window.open('', '', 'width=900,height=600');
        let htmlContent = `<html><head><style>
            body { font-family: sans-serif; }
            .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; padding: 10px; }
            .card { border: 1px dashed #ccc; padding: 10px; text-align: center; page-break-inside: avoid; }
            .qr-img { width: 100px; height: 100px; margin: 5px 0; }
            @media print { button { display: none; } }
        </style></head><body>
        <div style="text-align:center;"><h2>Kartu QR - ${AppState.namaSekolah}</h2><button onclick="window.print()">PRINT</button></div>
        <div class="grid">`;

        AppState.siswa.forEach(s => {
            htmlContent += `
                <div class="card">
                    <img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${s.nisn}" class="qr-img">
                    <h4>${s.nama}</h4>
                    <p>${s.nisn}<br>${s.kelas || ''}</p>
                </div>
            `;
        });

        htmlContent += `</div></body></html>`;
        win.document.write(htmlContent);
        win.document.close();
    });

    // Rekap Actions
    document.getElementById('filterRekapButton')?.addEventListener('click', handleFilterRekap);
    document.getElementById('refreshRekapButton')?.addEventListener('click', handleFilterRekap);
    document.getElementById('exportRekapButton')?.addEventListener('click', () => {
        if (!AppState.lastRekapData.length) return showStatusMessage("Tampilkan data rekap dahulu.", "error");

        const dataToExport = AppState.lastRekapData.map(row => ({
            "Tanggal": new Date(row.waktu_datang).toLocaleDateString('id-ID'),
            "Jam Masuk": new Date(row.waktu_datang).toLocaleTimeString('id-ID'),
            "Jam Pulang": row.waktu_pulang ? new Date(row.waktu_pulang).toLocaleTimeString('id-ID') : "-",
            "NISN": row.siswa?.nisn,
            "Nama": row.siswa?.nama,
            "Status": row.status || "Hadir"
        }));

        const ws = XLSX.utils.json_to_sheet(dataToExport);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Rekap Absensi");
        XLSX.writeFile(wb, `Rekap_Absensi_${AppState.namaSekolah}.xlsx`);
    });

    // Modal QR Single
    document.querySelector('.modal-close-button')?.addEventListener('click', () => {
        document.getElementById('qrModal').style.display = 'none';
    });
    
    document.getElementById('printQrButton')?.addEventListener('click', () => {
        const content = document.querySelector('#qrModal .modal-content').innerHTML;
        const win = window.open('', '', 'height=500,width=500');
        win.document.write('<html><body style="text-align:center;">' + content + '</body></html>');
        const btn = win.document.getElementById('printQrButton');
        if(btn) btn.remove();
        win.document.close();
        win.focus();
        setTimeout(() => { win.print(); win.close(); }, 500);
    });

    setupDisiplinListeners();
}
