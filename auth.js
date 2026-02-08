// File: auth.js
// Tujuan: Menangani autentikasi, sesi, role management, dan halaman login dinamis.
// Versi: 3.0 (Added Wali Kelas Redirect Logic)

import { supabase } from './config.js';
import { showLoading, showStatusMessage, setupPasswordToggle } from './utils.js';

// ====================================================================
// 0. HALAMAN LOGIN DINAMIS
// ====================================================================

async function setupDynamicLoginPage() {
    try {
        const params = new URLSearchParams(window.location.search);
        const schoolSlug = params.get('sekolah');

        if (!schoolSlug) return;

        const { data: school, error } = await supabase
            .from('sekolah')
            .select('nama_sekolah, logo_url')
            .eq('slug', schoolSlug)
            .single();

        if (error || !school) {
            console.warn(`Sekolah dengan slug "${schoolSlug}" tidak ditemukan.`);
            const nameEl = document.getElementById('schoolName');
            if(nameEl) nameEl.textContent = "Sekolah Tidak Ditemukan";
            return;
        }

        const logoEl = document.getElementById('schoolLogo');
        const nameEl = document.getElementById('schoolName');

        if (logoEl && school.logo_url) {
            logoEl.src = school.logo_url;
            logoEl.alt = `Logo ${school.nama_sekolah}`;
        }
        if (nameEl) {
            nameEl.textContent = school.nama_sekolah;
        }
        
        document.title = `Login - ${school.nama_sekolah}`;

    } catch (e) {
        console.error("Gagal setup halaman login dinamis:", e);
    }
}


// ====================================================================
// 1. LOGIKA UTAMA: CEK SESI & REDIRECT BERDASARKAN ROLE
// ====================================================================
export async function checkAuthenticationAndSetup() {
    // Abaikan jika ini adalah proses reset password via link email
    if (window.location.hash && window.location.hash.includes('type=recovery')) {
        return; 
    }

    const { data: { session } } = await supabase.auth.getSession();
    const path = window.location.pathname;
    
    // Identifikasi halaman saat ini
    const isLoginPage = path.includes('index.html') || path === '/' || path.endsWith('/');
    const isDashboard = path.includes('dashboard.html');
    const isAdminPage = path.includes('superadmin.html');
    const isWaliPage  = path.includes('walikelas.html');

    // SKENARIO 1: Belum Login
    if (!session) {
        if (!isLoginPage) {
            // Jika akses halaman internal tanpa login -> tendang ke login
            window.location.replace('index.html');
        }
        return;
    }

    // SKENARIO 2: Sudah Login -> Cek Role
    if (session) {
        try {
            // Menggunakan .maybeSingle() agar aman dari error fatal jika data kosong
            const { data: userProfile, error } = await supabase
                .from('pengguna')
                .select('role')
                .eq('id', session.user.id)
                .maybeSingle();

            if (error) {
                console.error("Database Error:", error);
                throw new Error("Gagal membaca profil.");
            }

            if (!userProfile) {
                console.error("Profil pengguna tidak ditemukan.");
                alert("Akun terdaftar, tapi data profil belum ada di tabel 'pengguna'. Hubungi Admin.");
                await supabase.auth.signOut();
                window.location.replace('index.html');
                return;
            }
            
            // Normalisasi role (kecilkan huruf, hilangkan spasi)
            const userRole = userProfile.role?.trim().toLowerCase() || 'user';

            // --- LOGIKA REDIRECT ROLE ---

            // A. SUPER ADMIN
            if (userRole === 'super_admin') {
                if (!isAdminPage) {
                    window.location.replace('superadmin.html');
                } else {
                    updateWelcomeMessage(session.user.email);
                }
            } 
            // B. WALI KELAS (BARU)
            else if (userRole === 'wali_kelas') {
                if (!isWaliPage) {
                    // Jika wali kelas mencoba akses dashboard/admin, paksa ke halaman walikelas
                    window.location.replace('walikelas.html');
                }
                // Catatan: Welcome message untuk wali kelas dihandle di walikelas.js
            }
            // C. ADMIN SEKOLAH / OPERATOR (DEFAULT)
            else {
                if (!isDashboard) {
                    // Jika user biasa mencoba akses admin/walikelas, paksa ke dashboard
                    window.location.replace('dashboard.html');
                } else {
                    updateWelcomeMessage(session.user.email);
                }
            }

        } catch (err) {
            console.error("Gagal memverifikasi sesi:", err);
            await supabase.auth.signOut();
            if (!isLoginPage) window.location.replace('index.html');
            else showStatusMessage("Terjadi kesalahan sistem saat memuat profil.", 'error');
        }
    }
}

function updateWelcomeMessage(email) {
    const welcomeEl = document.getElementById('welcomeMessage');
    if (welcomeEl) {
        welcomeEl.textContent = `Hai, ${email}`;
    }
}

// ====================================================================
// 2. LISTENER PERUBAHAN AUTH & RESET PASSWORD
// ====================================================================

export function setupAuthListener() {
    supabase.auth.onAuthStateChange(async (event, session) => {
        if (event === 'PASSWORD_RECOVERY') {
            const loginBox = document.querySelector('.login-box');
            const resetContainer = document.getElementById('resetPasswordContainer');
            if (loginBox) loginBox.style.display = 'none';
            if (resetContainer) {
                resetContainer.style.display = 'grid';
                resetContainer.scrollIntoView({ behavior: 'smooth' });
            }
            const resetForm = document.getElementById('resetPasswordForm');
            if (resetForm) {
                resetForm.onsubmit = handlePasswordResetSubmit;
            }
        }
    });
}

async function handlePasswordResetSubmit(e) {
    e.preventDefault();
    const newPassword = document.getElementById('newPassword').value;
    if (!newPassword || newPassword.length < 6) {
        return showStatusMessage('Password baru minimal 6 karakter.', 'error');
    }
    showLoading(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    showLoading(false);
    if (error) {
        return showStatusMessage(`Gagal update password: ${error.message}`, 'error');
    }
    showStatusMessage('Password berhasil diperbarui! Mengalihkan...', 'success');
    setTimeout(() => {
        window.location.hash = '';
        window.location.reload();
    }, 2000);
}

// ====================================================================
// 3. HANDLERS (LOGIN, LOGOUT, FORGOT PASSWORD)
// ====================================================================

async function handleLogin() {
    const emailEl = document.getElementById('username');
    const passwordEl = document.getElementById('password');
    const email = emailEl.value.trim();
    const password = passwordEl.value;
    
    if (!email || !password) {
        return showStatusMessage("Harap masukkan Email dan Password.", 'error');
    }
    
    showLoading(true);
    
    // 1. Login Authentication
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    
    showLoading(false);
    
    if (error) {
        let msg = error.message;
        if (msg.includes("Invalid login credentials")) msg = "Email atau password salah.";
        if (msg.includes("Email not confirmed")) msg = "Email belum diverifikasi.";
        return showStatusMessage(msg, 'error');
    }
    
    // 2. Cek Profil & Redirect (Fungsi ini akan menangani routing berdasarkan role)
    await checkAuthenticationAndSetup();
}

export async function handleLogout() {
    if (confirm('Apakah Anda yakin ingin keluar aplikasi?')) {
        showLoading(true);
        const { error } = await supabase.auth.signOut();
        showLoading(false);
        if (error) alert('Gagal logout: ' + error.message);
        else window.location.replace('index.html');
    }
}

async function handleForgotPassword() {
    const emailEl = document.getElementById('username');
    const email = emailEl.value.trim();
    if (!email) {
        emailEl.focus();
        emailEl.style.borderColor = 'var(--primary-color)';
        return showStatusMessage('Masukkan alamat email Anda, lalu klik "Lupa Password?".', 'info');
    }
    if (!confirm(`Kirim link reset password ke email: ${email}?`)) {
        return;
    }
    showLoading(true);
    
    // URL Redirect setelah klik link di email
    // Ganti URL ini dengan URL website production Anda jika sudah online
    const redirectTo = window.location.href.split('?')[0]; 

    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    
    showLoading(false);
    if (error) {
        return showStatusMessage(`Gagal mengirim email: ${error.message}`, 'error');
    }
    showStatusMessage('Cek inbox email (dan folder Spam) Anda untuk link reset.', 'success');
}

// ====================================================================
// 4. INISIALISASI HALAMAN LOGIN
// ====================================================================

export async function initLoginPage() {
    await setupDynamicLoginPage();
    setupPasswordToggle();
    setupAuthListener();
    await checkAuthenticationAndSetup();
    
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', (event) => {
            event.preventDefault();
            handleLogin();
        });
    }

    document.getElementById('forgotPasswordLink')?.addEventListener('click', (e) => {
        e.preventDefault();
        handleForgotPassword();
    });
}
