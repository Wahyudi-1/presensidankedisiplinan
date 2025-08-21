/**
 * =================================================================
 * SCRIPT UTAMA FRONTEND - SISTEM PRESENSI QR (DENGAN MODUL KEDISIPLINAN)
 * =================================================================
 * @version 5.0 - Multi-Tenancy (Multi-Sekolah) Implementation
 * @author Gemini AI Expert for User
 *
 * PERUBAHAN UTAMA (v5.0):
 * - Menambahkan dukungan untuk banyak sekolah dalam satu database.
 * - Menggunakan Row-Level Security (RLS) di Supabase.
 * - Menambahkan state `userSekolahId` untuk menyimpan ID sekolah pengguna.
 * - Fungsi `initDashboardPage` kini mengambil ID dan nama sekolah pengguna.
 * - Semua fungsi INSERT (saveSiswa, processQrScan, handleSubmitDisiplin)
 *   kini menyertakan `sekolah_id` secara otomatis.
 */

// ====================================================================
// TAHAP 1: KONFIGURASI GLOBAL DAN STATE APLIKASI
// ====================================================================

// --- Inisialisasi Klien Supabase ---
const SUPABASE_URL = 'https://qjlyqwyuotobnzllelta.supabase.co'; 
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqbHlxd3l1b3RvYm56bGxlbHRhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM4NDk2NTAsImV4cCI6MjA2OTQyNTY1MH0.Bm3NUiQ6VtKuTwCDFOR-d7O2uodVXc6MgvRSPnAwkSE';

const { createClient } = window.supabase; 
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);


// --- State Aplikasi ---
const AppState = {
    siswa: [],
    users: [],
    rekap: [],
    pelanggaran: [],
    userSekolahId: null // <-- State untuk menyimpan ID sekolah pengguna
};

let qrScannerDatang, qrScannerPulang;
let isScanning = { datang: false, pulang: false };

// ====================================================================
// TAHAP 2: FUNGSI-FUNGSI PEMBANTU (HELPERS)
// ====================================================================

function showLoading(isLoading) {
    const loader = document.getElementById('loadingIndicator');
    if (loader) {
        loader.style.display = isLoading ? 'flex' : 'none';
    }
}

function showStatusMessage(message, type = 'info', duration = 5000) {
    const statusEl = document.getElementById('statusMessage');
    if (!statusEl) { alert(message); return; }
    statusEl.textContent = message;
    statusEl.className = `status-message ${type}`;
    statusEl.style.display = 'block';
    window.scrollTo(0, 0);
    setTimeout(() => { statusEl.style.display = 'none'; }, duration);
}

function playSound(type) {
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        gainNode.gain.setValueAtTime(0, audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.5, audioContext.currentTime + 0.05);
        oscillator.type = (type === 'success') ? 'sine' : 'square';
        oscillator.frequency.setValueAtTime((type === 'success') ? 600 : 200, audioContext.currentTime);
        oscillator.start(audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.00001, audioContext.currentTime + 0.3);
        oscillator.stop(audioContext.currentTime + 0.3);
    } catch (e) { console.warn("Web Audio API tidak didukung atau gagal.", e); }
}

function setupPasswordToggle() {
    const toggleIcon = document.getElementById('togglePassword');
    const passwordInput = document.getElementById('password');
    if (!toggleIcon || !passwordInput) return;
    const eyeIcon = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>`;
    const eyeSlashIcon = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.243 4.243l-4.243-4.243" /></svg>`;
    toggleIcon.innerHTML = eyeIcon;
    toggleIcon.addEventListener('click', () => {
        const isPassword = passwordInput.type === 'password';
        passwordInput.type = isPassword ? 'text' : 'password';
        toggleIcon.innerHTML = isPassword ? eyeSlashIcon : eyeIcon;
    });
}

// ====================================================================
// TAHAP 3: FUNGSI-FUNGSI UTAMA
// ====================================================================

// --- FUNGSI OTENTIKASI & MANAJEMEN SESI ---
async function checkAuthenticationAndSetup() {
    const isPasswordRecovery = window.location.hash.includes('type=recovery');
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session && window.location.pathname.includes('dashboard.html')) {
        window.location.href = 'index.html';
        return;
    }

    if (session && window.location.pathname.includes('index.html') && !isPasswordRecovery) {
        window.location.href = 'dashboard.html';
        return;
    }

    if (session) {
        const welcomeEl = document.getElementById('welcomeMessage');
        if (welcomeEl) {
             welcomeEl.textContent = `Selamat Datang, ${session.user.email}!`;
        }
    }
}

function setupAuthListener() {
    supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'PASSWORD_RECOVERY') {
            const loginBox = document.querySelector('.login-box');
            const resetContainer = document.getElementById('resetPasswordContainer');
            if (!loginBox || !resetContainer) return;
            
            loginBox.style.display = 'none';
            resetContainer.style.display = 'grid';
            
            const resetForm = document.getElementById('resetPasswordForm');
            resetForm.onsubmit = async (e) => {
                e.preventDefault();
                const newPassword = document.getElementById('newPassword').value;
                if (!newPassword || newPassword.length < 6) {
                    return showStatusMessage('Password baru minimal 6 karakter.', 'error');
                }

                showLoading(true);
                const { error } = await supabase.auth.updateUser({ password: newPassword });
                showLoading(false);

                if (error) {
                    return showStatusMessage(`Gagal memperbarui password: ${error.message}`, 'error');
                }
                
                showStatusMessage('Password berhasil diperbarui! Silakan login dengan password baru Anda.', 'success');

                setTimeout(() => {
                    resetContainer.style.display = 'none';
                    loginBox.style.display = 'grid';
                }, 3000);
            };
        }
    });
}

async function handleLogin() {
    const usernameEl = document.getElementById('username');
    const passwordEl = document.getElementById('password');
    if (!usernameEl.value || !passwordEl.value) {
        return showStatusMessage("Email dan password harus diisi.", 'error');
    }
    showLoading(true);

    const { data, error } = await supabase.auth.signInWithPassword({
        email: usernameEl.value,
        password: passwordEl.value,
    });

    showLoading(false);
    if (error) {
        return showStatusMessage(`Login Gagal: ${error.message}`, 'error');
    }
    window.location.href = 'dashboard.html';
}

async function handleLogout() {
    if (confirm('Apakah Anda yakin ingin logout?')) {
        showLoading(true);
        const { error } = await supabase.auth.signOut();
        showLoading(false);
        if (error) {
            alert('Gagal logout: ' + error.message);
        } else {
            window.location.href = 'index.html';
        }
    }
}

async function handleForgotPassword() {
    const emailEl = document.getElementById('username');
    const email = emailEl.value;

    if (!email) {
        return showStatusMessage('Silakan masukkan alamat email Anda terlebih dahulu, lalu klik "Lupa Password?".', 'error');
    }

    if (!confirm(`Anda akan mengirimkan link reset password ke alamat: ${email}. Lanjutkan?`)) {
        return;
    }

    showLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.href.split('#')[0],
    });
    showLoading(false);

    if (error) {
        return showStatusMessage(`Gagal mengirim email: ${error.message}`, 'error');
    }
    showStatusMessage('Email untuk reset password telah dikirim! Silakan periksa kotak masuk (dan folder spam) Anda.', 'success');
}


// --- FUNGSI-FUNGSI SCANNER & PRESENSI ---
function startQrScanner(type) {
    if (isScanning[type]) return;
    const scannerId = type === 'datang' ? 'qrScannerDatang' : 'qrScannerPulang';
    const scanner = new Html5QrcodeScanner(scannerId, { fps: 10, qrbox: { width: 250, height: 250 } }, false);
    const onScanSuccess = (decodedText) => {
        scanner.pause(true);
        processQrScan(decodedText, type);
        setTimeout(() => scanner.resume(), 1000); // Jeda 1 detik
    };
    scanner.render(onScanSuccess, () => {});
    if (type === 'datang') qrScannerDatang = scanner; else qrScannerPulang = scanner;
    isScanning[type] = true;
    document.getElementById(type === 'datang' ? 'scanResultDatang' : 'scanResultPulang').textContent = "Arahkan kamera ke QR Code Siswa";
}

function stopQrScanner(type) {
    const scanner = type === 'datang' ? qrScannerDatang : qrScannerPulang;
    if (scanner && isScanning[type]) {
        try { scanner.clear().catch(err => console.error(`Gagal menghentikan scanner ${type}:`, err)); } 
        catch(e) { console.error('Error saat membersihkan scanner:', e); } 
        finally { isScanning[type] = false; }
    }
}

async function processQrScan(nisn, type) {
    const resultEl = document.getElementById(type === 'datang' ? 'scanResultDatang' : 'scanResultPulang');
    
    // RLS akan otomatis memfilter siswa berdasarkan sekolah pengguna
    const { data: siswa, error: siswaError } = await supabase
        .from('siswa')
        .select('nama')
        .eq('nisn', nisn)
        .single();
        
    if (siswaError || !siswa) {
        const errorMessage = `Siswa dengan NISN ${nisn} tidak terdaftar di sekolah Anda.`;
        resultEl.className = 'scan-result error';
        resultEl.textContent = errorMessage;
        playSound('error');
        showStatusMessage(errorMessage, 'error');
        return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const { data: presensiHariIni, error: cekError } = await supabase
        .from('presensi')
        .select('waktu_datang, waktu_pulang')
        .eq('nisn_siswa', nisn)
        .gte('waktu_datang', today.toISOString())
        .lt('waktu_datang', tomorrow.toISOString())
        .maybeSingle(); // RLS juga berlaku di sini

    if (cekError) {
        const errorMessage = `Gagal memeriksa data presensi: ${cekError.message}`;
        resultEl.className = 'scan-result error';
        resultEl.textContent = errorMessage;
        playSound('error');
        return;
    }

    if (type === 'datang') {
        if (presensiHariIni) {
            const errorMessage = `DITOLAK: ${siswa.nama} sudah melakukan presensi datang hari ini.`;
            resultEl.className = 'scan-result error';
            resultEl.textContent = errorMessage;
            playSound('error');
            return;
        }

        const { error: insertError } = await supabase
            .from('presensi')
            .insert({ 
                nisn_siswa: nisn, 
                waktu_datang: new Date(),
                sekolah_id: AppState.userSekolahId // <-- Menyertakan ID sekolah
            });
        
        if (insertError) {
            resultEl.className = 'scan-result error';
            resultEl.textContent = `Gagal menyimpan: ${insertError.message}`;
            playSound('error');
        } else {
            const waktu = new Date().toLocaleTimeString('id-ID');
            playSound('success');
            resultEl.className = 'scan-result success';
            resultEl.innerHTML = `<strong>Presensi Datang Berhasil!</strong><br>${siswa.nama} (${nisn}) - ${waktu}`;
            loadAndRenderDailyLog('datang');
        }

    } else { // Presensi Pulang
        if (!presensiHariIni) {
            const errorMessage = `DITOLAK: ${siswa.nama} belum melakukan presensi datang hari ini.`;
            resultEl.className = 'scan-result error';
            resultEl.textContent = errorMessage;
            playSound('error');
            return;
        }

        if (presensiHariIni && presensiHariIni.waktu_pulang) {
            const errorMessage = `DITOLAK: ${siswa.nama} sudah melakukan presensi pulang hari ini.`;
            resultEl.className = 'scan-result error';
            resultEl.textContent = errorMessage;
            playSound('error');
            return;
        }

        const { error: updateError } = await supabase
            .from('presensi')
            .update({ waktu_pulang: new Date() })
            .eq('nisn_siswa', nisn)
            .gte('waktu_datang', today.toISOString()); // RLS akan memastikan kita hanya bisa update data sekolah kita

        if (updateError) {
            resultEl.className = 'scan-result error';
            resultEl.textContent = `Gagal menyimpan: ${updateError.message}`;
            playSound('error');
        } else {
            const waktu = new Date().toLocaleTimeString('id-ID');
            playSound('success');
            resultEl.className = 'scan-result success';
            resultEl.innerHTML = `<strong>Presensi Pulang Berhasil!</strong><br>${siswa.nama} (${nisn}) - ${waktu}`;
            loadAndRenderDailyLog('pulang');
        }
    }
}
async function loadAndRenderDailyLog(type) {
    const tableBodyId = type === 'datang' ? 'logTableBodyDatang' : 'logTableBodyPulang';
    const tableBody = document.getElementById(tableBodyId);
    if (!tableBody) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    // RLS otomatis memfilter data berdasarkan sekolah pengguna
    const { data, error } = await supabase
        .from('presensi')
        .select('waktu_datang, waktu_pulang, siswa (nisn, nama)')
        .gte('waktu_datang', today.toISOString())
        .lt('waktu_datang', tomorrow.toISOString())
        .order('waktu_datang', { ascending: false });

    if (error) {
        console.error(`Gagal memuat log ${type}:`, error);
        tableBody.innerHTML = `<tr><td colspan="3">Gagal memuat data.</td></tr>`;
        return;
    }

    tableBody.innerHTML = data.length === 0
        ? `<tr><td colspan="3" style="text-align: center;">Belum ada data presensi hari ini.</td></tr>`
        : data.map(row => {
            const waktuTampil = type === 'datang' ? row.waktu_datang : row.waktu_pulang;
            if (type === 'pulang' && !waktuTampil) return '';
            return `
                <tr>
                    <td>${new Date(waktuTampil).toLocaleTimeString('id-ID')}</td>
                    <td>${row.siswa.nisn}</td>
                    <td>${row.siswa.nama}</td>
                </tr>`;
        }).join('');
}

// --- FUNGSI REKAP PRESENSI ---
async function filterAndRenderRekap() {
    const startDateStr = document.getElementById('rekapFilterTanggalMulai').value;
    const endDateStr = document.getElementById('rekapFilterTanggalSelesai').value;
    if (!startDateStr || !endDateStr) return showStatusMessage('Harap pilih rentang tanggal.', 'error');

    showLoading(true);
    // RLS otomatis memfilter data berdasarkan sekolah pengguna
    const { data, error } = await supabase
        .from('presensi')
        .select(`waktu_datang, waktu_pulang, status, siswa ( nisn, nama )`)
        .gte('waktu_datang', startDateStr)
        .lte('waktu_datang', `${endDateStr}T23:59:59`);

    showLoading(false);
    if (error) {
        return showStatusMessage(`Gagal memuat rekap: ${error.message}`, 'error');
    }
    
    renderRekapTable(data);
    document.getElementById('exportRekapButton').style.display = data.length > 0 ? 'inline-block' : 'none';
}

function renderRekapTable(data) {
    const tableBody = document.getElementById('rekapTableBody');
    tableBody.innerHTML = data.length === 0 
        ? '<tr><td colspan="6" style="text-align: center;">Tidak ada data rekap ditemukan.</td></tr>'
        : data.map(row => {
            const datangDate = new Date(row.waktu_datang);
            return `<tr>
                <td data-label="Tanggal">${datangDate.toLocaleDateString('id-ID', {day:'2-digit', month:'long', year:'numeric'})}</td>
                <td data-label="NISN">${row.siswa.nisn}</td>
                <td data-label="Nama">${row.siswa.nama}</td>
                <td data-label="Datang">${datangDate.toLocaleTimeString('id-ID')}</td>
                <td data-label="Pulang">${row.waktu_pulang ? new Date(row.waktu_pulang).toLocaleTimeString('id-ID') : 'Belum'}</td>
                <td data-label="Status">${row.status || '-'}</td>
            </tr>`
        }).join('');
}

function exportRekapToExcel() {
    const tableBody = document.getElementById('rekapTableBody');
    if (tableBody.rows.length === 0 || (tableBody.rows.length === 1 && tableBody.rows[0].cells.length === 1)) {
         return showStatusMessage('Tidak ada data untuk diekspor.', 'info');
    }
    const table = document.querySelector("#rekapSection table");
    const wb = XLSX.utils.table_to_book(table, { sheet: "Rekap Presensi" });
    XLSX.writeFile(wb, `Rekap_Presensi_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

// --- FUNGSI MANAJEMEN SISWA ---
async function loadSiswaAndRenderTable(force = false) {
    if (!force && AppState.siswa.length > 0) {
        renderSiswaTable(AppState.siswa);
        return;
    }
    showLoading(true);
    // RLS otomatis memfilter data berdasarkan sekolah pengguna
    const { data, error } = await supabase.from('siswa').select('*').order('nama', { ascending: true });
    showLoading(false);
    
    if (error) return showStatusMessage(`Gagal memuat data siswa: ${error.message}`, 'error');
    
    AppState.siswa = data.map(s => ({
        NISN: s.nisn, Nama: s.nama, Kelas: s.kelas, WhatsappOrtu: s.whatsapp_ortu
    }));
    renderSiswaTable(AppState.siswa);
}

function renderSiswaTable(siswaArray) {
    const tableBody = document.getElementById('siswaResultsTableBody');
    tableBody.innerHTML = siswaArray.length === 0
        ? '<tr><td colspan="5" style="text-align: center;">Data siswa tidak ditemukan.</td></tr>'
        : siswaArray.map(siswa => `
            <tr>
                <td data-label="NISN">${siswa.NISN}</td>
                <td data-label="Nama">${siswa.Nama}</td>
                <td data-label="Kelas">${siswa.Kelas || '-'}</td>
                <td data-label="Whatsapp Ortu">${siswa.WhatsappOrtu || '-'}</td>
                <td data-label="Aksi">
                    <button class="btn btn-sm btn-primary" onclick="generateQRHandler('${siswa.NISN}')">QR</button>
                    <button class="btn btn-sm btn-secondary" onclick="editSiswaHandler('${siswa.NISN}')">Ubah</button>
                    <button class="btn btn-sm btn-danger" onclick="deleteSiswaHandler('${siswa.NISN}')">Hapus</button>
                </td>
            </tr>`).join('');
}

async function saveSiswa() {
    const oldNisn = document.getElementById('formNisnOld').value;
    const siswaData = {
        nisn: document.getElementById('formNisn').value,
        nama: document.getElementById('formNama').value,
        kelas: document.getElementById('formKelas').value,
        whatsapp_ortu: document.getElementById('formWhatsappOrtu').value || null,
        sekolah_id: AppState.userSekolahId // <-- Menyertakan ID sekolah
    };

    showLoading(true);
    const { error } = oldNisn
        ? await supabase.from('siswa').update(siswaData).eq('nisn', oldNisn) // RLS memastikan hanya bisa update data sekolah kita
        : await supabase.from('siswa').insert(siswaData);
    showLoading(false);

    if (error) return showStatusMessage(`Gagal menyimpan: ${error.message}`, 'error');
    
    showStatusMessage(oldNisn ? 'Data siswa berhasil diperbarui.' : 'Siswa baru berhasil ditambahkan.', 'success');
    resetFormSiswa();
    await loadSiswaAndRenderTable(true);
}

function editSiswaHandler(nisn) {
    const siswa = AppState.siswa.find(s => s.NISN == nisn);
    if (!siswa) return;
    document.getElementById('formNisn').value = siswa.NISN;
    document.getElementById('formNama').value = siswa.Nama;
    document.getElementById('formKelas').value = siswa.Kelas;
    document.getElementById('formWhatsappOrtu').value = siswa.WhatsappOrtu || '';
    document.getElementById('formNisnOld').value = siswa.NISN;
    document.getElementById('saveSiswaButton').textContent = 'Update Data Siswa';
    document.getElementById('formSiswa').scrollIntoView({ behavior: 'smooth' });
}

function resetFormSiswa() {
    document.getElementById('formSiswa').reset();
    document.getElementById('formNisnOld').value = '';
    document.getElementById('saveSiswaButton').textContent = 'Simpan Data Siswa';
}

async function deleteSiswaHandler(nisn) {
    if (confirm(`Yakin ingin menghapus siswa dengan NISN: ${nisn}?`)) {
        showLoading(true);
        // RLS memastikan hanya bisa hapus data sekolah kita
        const { error } = await supabase.from('siswa').delete().eq('nisn', nisn);
        showLoading(false);

        if (error) return showStatusMessage(`Gagal menghapus: ${error.message}`, 'error');
        
        showStatusMessage('Siswa berhasil dihapus.', 'success');
        await loadSiswaAndRenderTable(true);
    }
}

// --- FUNGSI IMPOR CSV ---
async function handleSiswaFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    showLoading(true);
    Papa.parse(file, {
        header: true, skipEmptyLines: true,
        complete: async function(results) {
            if (!results.data || results.data.length === 0) {
                showLoading(false);
                return showStatusMessage('File CSV kosong atau formatnya salah.', 'error');
            }
            const dataToInsert = results.data
                .filter(row => row.NISN || row.Nisn || row.nisn)
                .map(row => ({
                    nisn: row.NISN || row.Nisn || row.nisn,
                    nama: row.Nama || row.nama,
                    kelas: row.Kelas || row.kelas,
                    whatsapp_ortu: row['Whatsapp Ortu'] || row.WhatsappOrtu || row.whatsapp_ortu || null,
                    sekolah_id: AppState.userSekolahId // <-- Menyertakan ID sekolah
                }));
            
            if (dataToInsert.length === 0) {
                showLoading(false);
                return showStatusMessage('Tidak ada data siswa yang valid untuk diimpor.', 'info');
            }

            const { error } = await supabase
                .from('siswa')
                .upsert(dataToInsert, { onConflict: 'nisn' });
            
            showLoading(false);
            
            if (error) return showStatusMessage(`Gagal Impor: ${error.message}`, 'error');
            
            showStatusMessage(`${dataToInsert.length} data siswa berhasil diimpor/diperbarui!`, 'success');
            await loadSiswaAndRenderTable(true);
        },
        error: (err) => {
            showLoading(false);
            showStatusMessage(`Gagal membaca file CSV: ${err.message}`, 'error');
        }
    });
    event.target.value = '';
}

async function handlePelanggaranFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    showLoading(true);
    Papa.parse(file, {
        header: true, skipEmptyLines: true,
        complete: async function(results) {
            if (!results.data || results.data.length === 0) {
                showLoading(false);
                return showStatusMessage('File CSV kosong atau formatnya salah.', 'error');
            }
            const dataToInsert = results.data.map(row => ({
                tingkat: row.Tingkat, deskripsi: row.Deskripsi || row.DeskripsiPelanggaran, poin: row.Poin
            }));
            // Tabel pelanggaran bersifat global, tidak perlu sekolah_id
            const { error } = await supabase.from('pelanggaran').insert(dataToInsert);
            showLoading(false);
            if (error) return showStatusMessage(`Gagal impor: ${error.message}`, 'error');
            showStatusMessage(`${dataToInsert.length} data pelanggaran berhasil diimpor!`, 'success');
            await loadPelanggaranData();
        },
        error: (err) => {
            showLoading(false);
            showStatusMessage(`Gagal membaca file CSV: ${err.message}`, 'error');
        }
    });
    event.target.value = '';
}


// --- FUNGSI QR CODE & EKSPOR LAINNYA ---
function generateQRHandler(nisn) {
    const siswa = AppState.siswa.find(s => s.NISN == nisn);
    if (!siswa) return;
    document.getElementById('qrModalStudentName').textContent = `QR Code: ${siswa.Nama}`;
    document.getElementById('qrModalStudentNisn').textContent = `NISN: ${siswa.NISN}`;
    const canvas = document.getElementById('qrCodeCanvas');
    canvas.innerHTML = '';
    new QRCode(canvas, { text: siswa.NISN.toString(), width: 200, height: 200, correctLevel: QRCode.CorrectLevel.H });
    document.getElementById('qrModal').style.display = 'flex';
}
function printQrCode() {
    const modalContent = document.querySelector("#qrModal .modal-content").cloneNode(true);
    modalContent.querySelector('.modal-close-button')?.remove();
    modalContent.querySelector('#printQrButton')?.remove();
    const printWindow = window.open('', '', 'height=600,width=800');
    printWindow.document.write(`<html><head><title>Cetak QR</title><style>body{font-family:sans-serif;text-align:center}#qrCodeCanvas img{display:block;margin:20px auto}</style></head><body>${modalContent.innerHTML}</body></html>`);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => { printWindow.print(); printWindow.close(); }, 500);
}
function exportSiswaToExcel() {
    if (AppState.siswa.length === 0) return showStatusMessage('Tidak ada data siswa untuk diekspor.', 'info');
    const dataForSheet = [['NISN', 'Nama', 'Kelas', 'Whatsapp Orang Tua']];
    AppState.siswa.forEach(siswa => {
        dataForSheet.push([siswa.NISN, siswa.Nama, siswa.Kelas, siswa.WhatsappOrtu || '']);
    });
    const worksheet = XLSX.utils.aoa_to_sheet(dataForSheet);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Data Siswa");
    XLSX.writeFile(workbook, `Data_Siswa_${new Date().toISOString().slice(0, 10)}.xlsx`);
    showStatusMessage('Data siswa berhasil diekspor ke Excel.', 'success');
}
function exportAllQrCodes() {
    if (AppState.siswa.length === 0) return showStatusMessage("Tidak ada data siswa untuk mencetak QR code.", "info");
    showLoading(true);
    const printWindow = window.open('', '_blank');
    printWindow.document.write('<html><head><title>Cetak Semua QR Code Siswa</title>');
    printWindow.document.write(`<style>@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500&display=swap');body{font-family:'Poppins',sans-serif;margin:20px;}.page-container{display:flex;flex-wrap:wrap;justify-content:flex-start;gap:15px;}.qr-card{page-break-inside:avoid;display:flex;flex-direction:column;align-items:center;text-align:center;border:1px solid #ccc;border-radius:8px;padding:15px;width:220px;}.qr-canvas{margin:10px 0;}h4,p{margin:2px 0;}p{font-size:0.9em;color:#555;}@media print{body{margin:10px;-webkit-print-color-adjust:exact;}.qr-card{border:1px solid #eee;}}</style>`);
    printWindow.document.write('</head><body><h3>Daftar QR Code Siswa</h3><div class="page-container">');
    AppState.siswa.forEach(siswa => {
        printWindow.document.write(`<div class="qr-card"><h4>${siswa.Nama}</h4><p>NISN: ${siswa.NISN}</p><div id="qr-canvas-${siswa.NISN}" class="qr-canvas"></div></div>`);
    });
    printWindow.document.write('</div></body></html>');
    setTimeout(() => {
        AppState.siswa.forEach(siswa => {
            const canvas = printWindow.document.getElementById(`qr-canvas-${siswa.NISN}`);
            if (canvas) new QRCode(canvas, { text: siswa.NISN.toString(), width: 180, height: 180, correctLevel: QRCode.CorrectLevel.H });
        });
        setTimeout(() => { showLoading(false); printWindow.document.close(); printWindow.focus(); printWindow.print(); }, 1000);
    }, 500);
}


// --- FUNGSI MODUL KEDISIPLINAN ---
async function loadPelanggaranData() {
    const { data, error } = await supabase.from('pelanggaran').select('*');
    if (error) return console.error("Gagal memuat data pelanggaran:", error);
    AppState.pelanggaran = data;
    populateDisciplineRecommendations();
}

function handleNisnDisiplinInput() {
    const nisn = document.getElementById('nisnDisiplinInput').value;
    const namaEl = document.getElementById('namaSiswaDisiplin');
    const siswa = AppState.siswa.find(s => s.NISN == nisn);
    namaEl.value = siswa ? siswa.Nama : '';
}

function populateDisciplineRecommendations() {
    const tingkatList = document.getElementById('tingkatList');
    const deskripsiList = document.getElementById('deskripsiList');
    if (!tingkatList || !deskripsiList) return;
    const semuaTingkat = [...new Set(AppState.pelanggaran.map(p => p.tingkat))];
    tingkatList.innerHTML = semuaTingkat.map(t => `<option value="${t}"></option>`).join('');
    deskripsiList.innerHTML = AppState.pelanggaran.map(p => `<option value="${p.deskripsi}"></option>`).join('');
}

function handleTingkatChange() {
    const tingkatInput = document.getElementById('tingkatDisiplinInput').value;
    const deskripsiList = document.getElementById('deskripsiList');
    if (!deskripsiList) return;
    let filteredPelanggaran = tingkatInput ? AppState.pelanggaran.filter(p => p.tingkat === tingkatInput) : AppState.pelanggaran;
    deskripsiList.innerHTML = filteredPelanggaran.map(p => `<option value="${p.deskripsi}"></option>`).join('');
}

async function handleSubmitDisiplin(event) {
    event.preventDefault();
    const nisn = document.getElementById('nisnDisiplinInput').value;
    const tingkat = document.getElementById('tingkatDisiplinInput').value;
    const deskripsi = document.getElementById('deskripsiDisiplinInput').value;

    const pelanggaran = AppState.pelanggaran.find(p => p.deskripsi === deskripsi);
    const poin = pelanggaran ? pelanggaran.poin : 0;

    const { error } = await supabase.from('catatan_disiplin').insert({
        nisn_siswa: nisn, 
        tingkat, 
        deskripsi, 
        poin,
        sekolah_id: AppState.userSekolahId // <-- Menyertakan ID sekolah
    });

    if (error) return showStatusMessage(`Gagal menyimpan catatan: ${error.message}`, 'error');
    
    showStatusMessage('Catatan kedisiplinan berhasil disimpan.', 'success');
    document.getElementById('formDisiplin').reset();
    document.getElementById('namaSiswaDisiplin').value = '';
}

async function handleSearchRiwayatDisiplin() {
    const nisn = document.getElementById('searchNisnDisiplin').value;
    if (!nisn) return showStatusMessage("Harap masukkan NISN untuk mencari riwayat.", "info");
    
    showLoading(true);
    // RLS otomatis memfilter data berdasarkan sekolah pengguna
    const { data, error } = await supabase
        .from('catatan_disiplin')
        .select('*')
        .eq('nisn_siswa', nisn)
        .order('created_at', { ascending: false });
    showLoading(false);

    if (error) return showStatusMessage(`Gagal mencari riwayat: ${error.message}`, 'error');

    renderRiwayatDisiplinTable(data);
}

function renderRiwayatDisiplinTable(riwayatArray) {
    const tableBody = document.getElementById('riwayatDisiplinTableBody');
    if (riwayatArray.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="4" style="text-align: center;">Tidak ada riwayat kedisiplinan ditemukan.</td></tr>';
        return;
    }
    tableBody.innerHTML = riwayatArray.map(r => `<tr>
        <td data-label="Tanggal">${new Date(r.created_at).toLocaleDateString('id-ID')}</td>
        <td data-label="Tingkat">${r.tingkat}</td>
        <td data-label="Deskripsi">${r.deskripsi}</td>
        <td data-label="Poin">${r.poin}</td>
    </tr>`).join('');
}

// ====================================================================
// TAHAP 4: INISIALISASI DAN EVENT LISTENERS
// ====================================================================
function setupDashboardListeners() {
    document.getElementById('logoutButton')?.addEventListener('click', handleLogout);
    document.querySelectorAll('.section-nav button').forEach(button => {
        button.addEventListener('click', () => {
            document.querySelectorAll('.section-nav button').forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            stopQrScanner('datang'); stopQrScanner('pulang');
            const sectionId = button.dataset.section;
            document.querySelectorAll('.content-section').forEach(section => {
                section.style.display = section.id === sectionId ? 'block' : 'none';
            });
            const actions = {
                datangSection: () => { startQrScanner('datang'); loadAndRenderDailyLog('datang'); },
                pulangSection: () => { startQrScanner('pulang'); loadAndRenderDailyLog('pulang'); },
                rekapSection: () => {
                    const today = new Date().toISOString().slice(0, 10);
                    document.getElementById('rekapFilterTanggalMulai').value = today;
                    document.getElementById('rekapFilterTanggalSelesai').value = today;
                    filterAndRenderRekap();
                },
                disiplinSection: () => {},
                siswaSection: () => loadSiswaAndRenderTable(),
            };
            actions[sectionId]?.();
        });
    });

    document.getElementById('refreshSiswaButton')?.addEventListener('click', () => loadSiswaAndRenderTable(true));
    document.getElementById('filterRekapButton')?.addEventListener('click', filterAndRenderRekap);
    document.getElementById('exportRekapButton')?.addEventListener('click', exportRekapToExcel);
    document.getElementById('formSiswa')?.addEventListener('submit', (e) => { e.preventDefault(); saveSiswa(); });
    document.getElementById('resetSiswaButton')?.addEventListener('click', resetFormSiswa);
    document.querySelector('#qrModal .modal-close-button')?.addEventListener('click', () => document.getElementById('qrModal').style.display = 'none');
    document.getElementById('printQrButton')?.addEventListener('click', printQrCode);
    document.getElementById('exportSiswaExcelButton')?.addEventListener('click', exportSiswaToExcel);
    document.getElementById('exportAllQrButton')?.addEventListener('click', exportAllQrCodes);
    document.getElementById('importSiswaButton')?.addEventListener('click', () => document.getElementById('importSiswaInput').click());
    document.getElementById('importSiswaInput')?.addEventListener('change', handleSiswaFileSelect);
    document.getElementById('importPelanggaranButton')?.addEventListener('click', () => document.getElementById('importPelanggaranInput').click());
    document.getElementById('importPelanggaranInput')?.addEventListener('change', handlePelanggaranFileSelect);
    document.getElementById('nisnDisiplinInput')?.addEventListener('blur', handleNisnDisiplinInput);
    document.getElementById('tingkatDisiplinInput')?.addEventListener('input', handleTingkatChange);
    document.getElementById('formDisiplin')?.addEventListener('submit', handleSubmitDisiplin);
    document.getElementById('searchDisiplinButton')?.addEventListener('click', handleSearchRiwayatDisiplin);
}

async function initDashboardPage() {
    await checkAuthenticationAndSetup();

    // === BLOK KODE BARU UNTUK MENGAMBIL ID DAN NAMA SEKOLAH ===
    const { data: { session } } = await supabase.auth.getSession();
    if (session && session.user.user_metadata.sekolah_id) {
        AppState.userSekolahId = session.user.user_metadata.sekolah_id;

        const schoolNameEl = document.getElementById('schoolNameDisplay');
        if (schoolNameEl) {
            const { data: schoolData, error } = await supabase
                .from('sekolah')
                .select('nama_sekolah')
                .eq('id', AppState.userSekolahId)
                .single();

            if (schoolData) {
                schoolNameEl.textContent = `[${schoolData.nama_sekolah}]`;
            }
        }
    } else {
        // Jika tidak ada sekolah_id, cegah pengguna melakukan aksi dan paksa logout
        alert('Error: Akun Anda tidak terhubung ke sekolah manapun. Hubungi administrator.');
        handleLogout();
        return; // Hentikan eksekusi lebih lanjut
    }
    // === AKHIR BLOK KODE BARU ===

    setupAuthListener();
    setupDashboardListeners();
    await loadSiswaAndRenderTable();
    await loadPelanggaranData();
    document.querySelector('.section-nav button[data-section="datangSection"]')?.click();
}

async function initLoginPage() {
    setupPasswordToggle();
    if (window.location.hash.includes('type=recovery')) {
        const loginBox = document.querySelector('.login-box');
        const resetContainer = document.getElementById('resetPasswordContainer');
        if (loginBox && resetContainer) {
            loginBox.style.display = 'none';
            resetContainer.style.display = 'grid';
        }
    }
    setupAuthListener();
    await checkAuthenticationAndSetup();
    document.getElementById('forgotPasswordLink')?.addEventListener('click', (e) => {
        e.preventDefault();
        handleForgotPassword();
    });
}

// ====================================================================
// TAHAP 5: TITIK MASUK APLIKASI (ENTRY POINT)
// ====================================================================
document.addEventListener('DOMContentLoaded', () => {
    if (window.location.pathname.includes('dashboard.html')) {
        initDashboardPage();
    } else {
        initLoginPage();
    }
});
