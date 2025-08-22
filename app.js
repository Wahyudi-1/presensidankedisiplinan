/**
 * =================================================================
 * SCRIPT UTAMA FRONTEND - SISTEM PRESENSI QR
 * =================================================================
 * @version 5.2 - Fixed Infinite Redirect Loop
 * @author Gemini AI Expert for User
 *
 * PERUBAHAN UTAMA (v5.2):
 * - [FIX] Menggunakan onAuthStateChange untuk semua logika pengalihan
 *   dan inisialisasi halaman untuk mencegah redirect loop.
 */

// Konfigurasi Supabase
const SUPABASE_URL = 'https://qjlyqwuotobnzllelta.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqbHlxd3l1b3RvYm56bGxlbHRhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM4NDk2NTAsImV4cCI6MjA2OTQyNTY1MH0.Bm3NUiQ6VtKuTwCDFOR-d7O2uodVXc6MgvRSPnAwkSE';

const { createClient } = window.supabase;
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// State Aplikasi
const AppState = {
    siswa: [],
    rekap: [],
    pelanggaran: [],
    userSekolahId: null
};
let qrScannerDatang, qrScannerPulang;
let isScanning = { datang: false, pulang: false };


// --- FUNGSI UTAMA UNTUK SETIAP HALAMAN ---
function initLoginPage() {
    setupPasswordToggle();
    document.querySelector('form[onsubmit*="handleLogin"]')?.addEventListener('submit', (e) => { e.preventDefault(); handleLogin(); });
    document.getElementById('forgotPasswordLink')?.addEventListener('click', (e) => { e.preventDefault(); handleForgotPassword(); });

    supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
             if (session) {
                const isSuperAdmin = session.user.user_metadata?.is_super_admin === true;
                if (isSuperAdmin) {
                    window.location.replace('superadmin.html');
                } else {
                    window.location.replace('dashboard.html');
                }
            }
        }
        
        if (event === 'PASSWORD_RECOVERY') {
            document.querySelector('.login-box').style.display = 'none';
            document.getElementById('resetPasswordContainer').style.display = 'grid';
            document.getElementById('resetPasswordForm').onsubmit = handlePasswordReset;
        }
    });
}

function initDashboardPage() {
    supabase.auth.onAuthStateChange((event, session) => {
        if (session) {
            const isSuperAdmin = session.user.user_metadata?.is_super_admin === true;
            if(isSuperAdmin) {
                window.location.replace('superadmin.html');
                return;
            }
            setupDashboard(session);
        } else {
            window.location.replace('index.html');
        }
    });
}

async function setupDashboard(session) {
    document.getElementById('welcomeMessage').textContent = `Selamat Datang, ${session.user.email}!`;
    AppState.userSekolahId = session.user.user_metadata.sekolah_id;

    if (!AppState.userSekolahId) {
        alert('Error: Akun Anda tidak terhubung ke sekolah manapun. Hubungi administrator.');
        handleLogout();
        return;
    }
    
    const { data: schoolData } = await supabase.from('sekolah').select('nama_sekolah').eq('id', AppState.userSekolahId).single();
    if (schoolData) {
        document.getElementById('schoolNameDisplay').textContent = `[${schoolData.nama_sekolah}]`;
    }
    
    setupDashboardListeners();
    await loadSiswaAndRenderTable();
    await loadPelanggaranData();
    document.querySelector('.section-nav button[data-section="datangSection"]')?.click();
}

// --- FUNGSI-FUNGSI AKSI ---
async function handleLogin() {
    const usernameEl = document.getElementById('username');
    const passwordEl = document.getElementById('password');
    if (!usernameEl.value || !passwordEl.value) return showStatusMessage("Email dan password harus diisi.", 'error');
    showLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: usernameEl.value, password: passwordEl.value });
    showLoading(false);
    if (error) return showStatusMessage(`Login Gagal: ${error.message}`, 'error');
    // Pengalihan ditangani oleh onAuthStateChange
}

async function handlePasswordReset(e) {
    e.preventDefault();
    const newPassword = document.getElementById('newPassword').value;
    if (!newPassword || newPassword.length < 6) return showStatusMessage('Password baru minimal 6 karakter.', 'error');
    showLoading(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    showLoading(false);
    if (error) return showStatusMessage(`Gagal memperbarui password: ${error.message}`, 'error');
    showStatusMessage('Password berhasil diperbarui! Silakan login.', 'success');
    setTimeout(() => {
        window.location.hash = '';
        document.getElementById('resetPasswordContainer').style.display = 'none';
        document.querySelector('.login-box').style.display = 'grid';
    }, 3000);
}

async function handleLogout() {
    await supabase.auth.signOut(); // onAuthStateChange akan menangani pengalihan
}

async function handleForgotPassword() {
    const emailEl = document.getElementById('username');
    const email = emailEl.value;
    if (!email) return showStatusMessage('Silakan masukkan alamat email Anda terlebih dahulu.', 'error');
    if (!confirm(`Anda akan mengirimkan link reset password ke alamat: ${email}. Lanjutkan?`)) return;
    showLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + window.location.pathname });
    showLoading(false);
    if (error) return showStatusMessage(`Gagal mengirim email: ${error.message}`, 'error');
    showStatusMessage('Email untuk reset password telah dikirim! Silakan periksa kotak masuk Anda.', 'success');
}


// ... SEMUA FUNGSI PEMBANTU DAN FUNGSI DASHBOARD LAINNYA DI SINI ...
function showLoading(isLoading) {
    const loader = document.getElementById('loadingIndicator');
    if (loader) loader.style.display = isLoading ? 'flex' : 'none';
}
function showStatusMessage(message, type = 'info', duration = 5000) {
    const statusEl = document.getElementById('statusMessage');
    if (!statusEl) { alert(`${type.toUpperCase()}: ${message}`); return; }
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
        oscillator.type = (type === 'success') ? 'sine' : 'square';
        oscillator.frequency.setValueAtTime((type === 'success') ? 600 : 200, audioContext.currentTime);
        oscillator.start();
        setTimeout(() => oscillator.stop(), 300);
    } catch (e) { console.warn("Web Audio API tidak didukung.", e); }
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
function setupDashboardListeners() {
    document.getElementById('logoutButton')?.addEventListener('click', handleLogout);
    document.querySelectorAll('.section-nav button').forEach(button => {
        button.addEventListener('click', () => {
            document.querySelectorAll('.section-nav button').forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            stopQrScanner('datang'); stopQrScanner('pulang');
            const sectionId = button.dataset.section;
            document.querySelectorAll('.content-section').forEach(section => { section.style.display = section.id === sectionId ? 'block' : 'none'; });
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
// Sisipkan semua fungsi-fungsi lain seperti processQrScan, loadSiswa, dll di sini.
// (Kode dari jawaban sebelumnya untuk fungsi-fungsi ini sudah benar)

// --- ENTRY POINT ---
document.addEventListener('DOMContentLoaded', () => {
    // Router sederhana berdasarkan nama file
    if (window.location.pathname.includes('dashboard.html')) {
        initDashboardPage();
    } else if (window.location.pathname.includes('superadmin.html')) {
        // Halaman ini memiliki file JS-nya sendiri (app-admin.js)
    } else {
        // Asumsikan semua halaman lain adalah halaman login
        initLoginPage();
    }
});
