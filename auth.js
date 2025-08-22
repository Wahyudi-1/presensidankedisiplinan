// File: auth.js
// Tujuan: Menangani semua logika yang berkaitan dengan autentikasi,
//         termasuk login, logout, lupa password, dan manajemen sesi.

import { supabase } from './config.js';
import { showLoading, showStatusMessage, setupPasswordToggle } from './utils.js';

/**
 * Memeriksa sesi pengguna saat ini dan mengarahkan mereka ke halaman yang sesuai.
 * Mencegah pengguna yang belum login mengakses dashboard, dan sebaliknya.
 */
async function checkAuthenticationAndSetup() {
    const isPasswordRecovery = window.location.hash.includes('type=recovery');
    const { data: { session } } = await supabase.auth.getSession();
    
    // Jika tidak ada sesi dan pengguna mencoba mengakses dashboard, kembalikan ke login.
    if (!session && window.location.pathname.includes('dashboard.html')) {
        window.location.href = 'index.html';
        return;
    }

    // Jika ada sesi dan pengguna berada di halaman login (dan bukan dalam proses recovery password),
    // arahkan ke halaman yang benar berdasarkan perannya.
    if (session && (window.location.pathname.includes('index.html') || window.location.pathname.endsWith('/presensidankedisiplinan/')) && !isPasswordRecovery) {
        const isSuperAdmin = session.user.user_metadata?.is_super_admin === true;
        if (isSuperAdmin) {
            window.location.href = 'superadmin.html';
        } else {
            window.location.href = 'dashboard.html';
        }
        return;
    }

    // Jika ada sesi, tampilkan pesan selamat datang.
    if (session) {
        const welcomeEl = document.getElementById('welcomeMessage');
        if (welcomeEl) {
             welcomeEl.textContent = `Selamat Datang, ${session.user.email}!`;
        }
    }
}

/**
 * Menyiapkan listener untuk event perubahan status autentikasi,
 * khususnya untuk menangani alur pemulihan password.
 */
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
                    window.location.hash = ''; // Hapus hash dari URL
                    resetContainer.style.display = 'none';
                    loginBox.style.display = 'grid';
                }, 3000);
            };
        }
    });
}

/**
 * Menangani proses login saat form di halaman login disubmit.
 */
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

    // Setelah login berhasil, periksa peran dan arahkan
    const isSuperAdmin = data.user.user_metadata?.is_super_admin === true;
    if (isSuperAdmin) {
        window.location.href = 'superadmin.html';
    } else {
        window.location.href = 'dashboard.html';
    }
}

/**
 * Menangani proses logout.
 */
export async function handleLogout() {
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

/**
 * Menangani permintaan reset password.
 */
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
        redirectTo: window.location.origin + window.location.pathname,
    });
    showLoading(false);

    if (error) {
        return showStatusMessage(`Gagal mengirim email: ${error.message}`, 'error');
    }
    showStatusMessage('Email untuk reset password telah dikirim! Silakan periksa kotak masuk (dan folder spam) Anda.', 'success');
}

/**
 * Inisialisasi semua fungsi dan event listener yang diperlukan untuk halaman login.
 */
export async function initLoginPage() {
    setupPasswordToggle();
    
    // Cek apakah URL berisi hash untuk recovery password
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
    
    // Lampirkan event listener secara eksplisit ke elemen form
    const loginForm = document.querySelector('.login-form-container form');
    if(loginForm) {
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

// Ekspor fungsi yang mungkin dibutuhkan oleh modul lain (seperti dashboard.js)
export { checkAuthenticationAndSetup, setupAuthListener };
