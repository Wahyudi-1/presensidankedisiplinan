// File: auth.js
// Tujuan: Menangani autentikasi, sesi, dan halaman login dinamis.
// Versi: 2.3 (RLS-Compatible & Robust Error Handling)

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
// 1. LOGIKA UTAMA: CEK SESI & REDIRECT (BAGIAN INI YANG DIPERBAIKI)
// ====================================================================
export async function checkAuthenticationAndSetup() {
    if (window.location.hash && window.location.hash.includes('type=recovery')) {
        return; 
    }

    const { data: { session } } = await supabase.auth.getSession();
    const path = window.location.pathname;
    
    const isLoginPage = path.includes('index.html') || path === '/' || path.endsWith('/');
    const isDashboard = path.includes('dashboard.html');
    const isAdminPage = path.includes('superadmin.html');

    // SKENARIO 1: Belum Login
    if (!session) {
        if (!isLoginPage) {
            window.location.replace('index.html');
        }
        return;
    }

    // SKENARIO 2: Sudah Login
    if (session) {
        try {
            // PENGGUNAAN .maybeSingle() AGAR LEBIH AMAN SAAT RLS AKTIF
            const { data: userProfile, error } = await supabase
                .from('pengguna')
                .select('role')
                .eq('id', session.user.id)
                .maybeSingle();

            // Jika error RLS atau data kosong
            if (error) {
                console.error("Database Error (RLS mungkin memblokir):", error);
                throw new Error("Gagal membaca profil. Pastikan Policy RLS aktif.");
            }

            if (!userProfile) {
                console.error("Profil pengguna tidak ditemukan.");
                alert("Akun terdaftar, tapi data profil belum ada. Hubungi Admin.");
                await supabase.auth.signOut();
                window.location.replace('index.html');
                return;
            }
            
            const userRole = userProfile.role?.trim().toLowerCase() || 'user';

            if (userRole === 'super_admin') {
                if (!isAdminPage) window.location.replace('superadmin.html');
                else updateWelcomeMessage(session.user.email);
            } else {
                if (!isDashboard) window.location.replace('dashboard.html');
                else updateWelcomeMessage(session.user.email);
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
    
    // 2. Cek Profil & Redirect (Akan memanggil fungsi checkAuthenticationAndSetup yang sudah diperbaiki)
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
    const redirectTo = window.location.origin + window.location.pathname;
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
