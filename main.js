// File: main.js
// Tujuan: Titik masuk (entry point) utama untuk semua skrip JavaScript.
//         Mendeteksi halaman yang sedang aktif dan memuat modul yang relevan.

// Impor fungsi inisialisasi dari modul-modul lain.
import { initLoginPage } from './auth.js';
import { initDashboardPage } from './dashboard.js';
// Jika Anda memecah app-admin.js, impor juga initSuperAdminPage di sini.
// import { initializeAdminPage } from './admin.js';

/**
 * Event listener ini akan berjalan setelah seluruh konten HTML halaman
 * selesai dimuat.
 */
document.addEventListener('DOMContentLoaded', () => {
    // Dapatkan path URL saat ini untuk menentukan halaman mana yang aktif.
    const path = window.location.pathname;

    // Arahkan ke fungsi inisialisasi yang benar berdasarkan path URL.
    if (path.includes('dashboard.html')) {
        initDashboardPage();
    } 
    else if (path.includes('superadmin.html')) {
        // Jika Anda memecah app-admin.js, panggil fungsinya di sini.
        // initializeAdminPage(); 
        console.log("Super admin page loaded, but its module is not yet imported in main.js");
    }
    // Asumsikan semua path lain (termasuk root '/') adalah halaman login.
    else { 
        initLoginPage();
    }
});
