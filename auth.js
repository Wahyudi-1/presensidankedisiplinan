// File: auth.js
// Tujuan: Menangani logika autentikasi, manajemen sesi, dan routing role-based.
// Versi: 2.1 (Optimized & Secure)

import { supabase } from './config.js';
import { showLoading, showStatusMessage, setupPasswordToggle } from './utils.js';

// ====================================================================
// 1. LOGIKA UTAMA: CEK SESI & REDIRECT
// ====================================================================

/**
 * Memeriksa sesi pengguna dan mengarahkan ke halaman yang sesuai berdasarkan Role.
 * Fungsi ini dijalankan setiap kali halaman dimuat.
 */
export async function checkAuthenticationAndSetup() {
    // Cek apakah ini mode reset password (ada hash #type=recovery di URL)
    if (window.location.hash && window.location.hash.includes('type=recovery')) {
        return; // Biarkan logika setupAuthListener menangani ini
    }

    const { data: { session } } = await supabase.auth.getSession();
    const path = window.location.pathname;
    
    // Normalisasi path agar bekerja di localhost maupun production folder
    const isLoginPage = path.includes('index.html') || path === '/' || path.endsWith('/');
    const isDashboard = path.includes('dashboard.html');
    const isAdminPage = path.includes('superadmin.html');

    // KASUS 1: Tidak ada sesi (Belum Login)
    if (!session) {
        if (!isLoginPage) {
            window.location.replace('index.html');
        }
        return;
    }

    // KASUS 2: Sudah Login, Cek Role Pengguna
    if (session) {
        try {
            // Ambil role dari tabel pengguna
            const { data: userProfile, error } = await supabase
                .from('pengguna')
                .select('role')
                .eq('id', session.user.id)
                .single();

            if (error) throw error;

            // Bersihkan string role untuk keamanan
            const userRole = userProfile?.role?.trim().toLowerCase() || 'user';

            // Logika Redirect Cerdas (Mencegah Loop)
            if (userRole === 'super_admin') {
                if (!isAdminPage) {
                    window.location.replace('superadmin.html');
                } else {
                    updateWelcomeMessage(session.user.email);
                }
            } else {
                // User biasa (Sekolah/Guru)
                if (!isDashboard) {
                    window.location.replace('dashboard.html');
                } else {
                    updateWelcomeMessage(session.user.email);
                }
            }
        } catch (err) {
            console.error("Gagal memverifikasi role:", err);
            // Jika gagal cek role, logout paksa demi keamanan
            await supabase.auth.signOut();
            window.location.replace('index.html');
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
        
        // Menangani Reset Password (saat user klik link dari email)
        if (event === 'PASSWORD_RECOVERY') {
            const loginBox = document.querySelector('.login-box');
            const resetContainer = document.getElementById('resetPasswordContainer');
            
            // Sembunyikan login, tampilkan form reset
            if (loginBox) loginBox.style.display = 'none';
            if (resetContainer) {
                resetContainer.style.display = 'grid'; // Sesuaikan dengan CSS grid Anda
                // Scroll ke form reset
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
    
    // Bersihkan URL dan reload untuk masuk sebagai user normal
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
    
    const { data, error } = await supabase.auth.signInWithPassword({
        email: email,
        password: password,
    });

    showLoading(false);

    if (error) {
        let msg = error.message;
        // Terjemahkan pesan error umum agar lebih ramah pengguna
        if (msg.includes("Invalid login credentials")) msg = "Email atau password salah.";
        if (msg.includes("Email not confirmed")) msg = "Email belum diverifikasi.";
        
        return showStatusMessage(msg, 'error');
    }

    // Login sukses, fungsi checkAuthenticationAndSetup akan menangani redirect
    // karena halaman akan mendeteksi session baru.
    await checkAuthenticationAndSetup();
}

export async function handleLogout() {
    if (confirm('Apakah Anda yakin ingin keluar aplikasi?')) {
        showLoading(true);
        const { error } = await supabase.auth.signOut();
        showLoading(false);
        
        if (error) {
            alert('Gagal logout: ' + error.message);
        } else {
            window.location.replace('index.html');
        }
    }
}

async function handleForgotPassword() {
    const emailEl = document.getElementById('username');
    const email = emailEl.value.trim();

    if (!email) {
        // Fokuskan ke input email dan beri highlight
        emailEl.focus();
        emailEl.style.borderColor = 'var(--primary-color)';
        return showStatusMessage('Masukkan alamat email Anda di kolom Email, lalu klik "Lupa Password?" lagi.', 'info');
    }

    if (!confirm(`Kirim link reset password ke email: ${email}?`)) {
        return;
    }

    showLoading(true);
    
    // Redirect URL harus mengarah kembali ke index.html di domain Anda
    const redirectTo = window.location.origin + window.location.pathname;
    
    const { error } = await supabase.auth.resetPasswordForEmail(email, { 
        redirectTo: redirectTo 
    });
    
    showLoading(false);

    if (error) {
        return showStatusMessage(`Gagal mengirim email: ${error.message}`, 'error');
    }
    
    showStatusMessage('Cek inbox email (dan folder Spam) Anda untuk link reset password.', 'success');
}

// ====================================================================
// 4. INISIALISASI HALAMAN LOGIN
// ====================================================================

export async function initLoginPage() {
    setupPasswordToggle();
    setupAuthListener();
    
    // Cek apakah user sudah login, jika ya, lempar ke dashboard/admin
    await checkAuthenticationAndSetup();
    
    // Setup Form Listener
    const loginForm = document.querySelector('form');
    // Pastikan kita mengambil form yang benar (bukan form reset password)
    // Biasanya di halaman login, form pertama adalah form login
    if(loginForm && loginForm.closest('.login-form-content')) {
        loginForm.addEventListener('submit', (event) => {
            event.preventDefault();
            // Cek apakah ini form reset password atau login
            if (event.target.id === 'resetPasswordForm') return; 
            handleLogin();
        });
    }

    document.getElementById('forgotPasswordLink')?.addEventListener('click', (e) => {
        e.preventDefault();
        handleForgotPassword();
    });
}
