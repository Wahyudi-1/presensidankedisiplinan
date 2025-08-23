// File: auth.js
// Tujuan: Menangani semua logika yang berkaitan dengan autentikasi,
//         termasuk login, logout, lupa password, dan manajemen sesi.
// Versi: Diperbaiki dengan Ekspor yang Benar

import { supabase } from './config.js';
import { showLoading, showStatusMessage, setupPasswordToggle } from './utils.js';

/**
 * Memeriksa sesi pengguna saat ini dan mengarahkan mereka ke halaman yang sesuai.
 * Diekspor agar bisa digunakan oleh modul dashboard dan admin.
 */
export async function checkAuthenticationAndSetup() {
    const isPasswordRecovery = window.location.hash.includes('type=recovery');
    const { data: { session } } = await supabase.auth.getSession();
    const currentPath = window.location.pathname;

    if (!session && (currentPath.includes('dashboard.html') || currentPath.includes('superadmin.html'))) {
        window.location.replace('index.html');
        return;
    }

    if (session && (currentPath.includes('index.html') || currentPath.endsWith('/')) && !isPasswordRecovery) {
        const { data: userProfile } = await supabase
            .from('pengguna')
            .select('role')
            .eq('id', session.user.id)
            .single();

        const userRole = userProfile?.role?.trim().toLowerCase();

        if (userRole === 'super_admin') {
            window.location.replace('superadmin.html');
        } else {
            window.location.replace('dashboard.html');
        }
        return;
    }

    if (session) {
        const welcomeEl = document.getElementById('welcomeMessage');
        if (welcomeEl) {
             welcomeEl.textContent = `Selamat Datang, ${session.user.email}!`;
        }
    }
}

/**
 * Menyiapkan listener untuk event perubahan status autentikasi.
 * Diekspor agar bisa digunakan oleh modul dashboard dan admin.
 */
export function setupAuthListener() {
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
                    window.location.hash = ''; 
                    window.location.reload();
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

    await checkAuthenticationAndSetup();
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
            window.location.replace('index.html');
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
    const redirectTo = window.location.origin + window.location.pathname;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    showLoading(false);

    if (error) {
        return showStatusMessage(`Gagal mengirim email: ${error.message}`, 'error');
    }
    showStatusMessage('Email untuk reset password telah dikirim! Silakan periksa kotak masuk (dan folder spam) Anda.', 'success');
}

/**
 * Inisialisasi semua fungsi dan event listener yang diperlukan untuk Halaman Login.
 */
export async function initLoginPage() {
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
