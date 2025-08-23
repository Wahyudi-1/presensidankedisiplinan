// File: main.js
// Tujuan: Titik masuk (entry point) utama untuk semua skrip JavaScript.
//         Bertindak sebagai "router" sederhana yang mendeteksi halaman aktif
//         dan memuat modul JavaScript yang relevan.

// Impor fungsi inisialisasi dari modul-modul spesifik.
// Setiap modul bertanggung jawab atas fungsionalitas di halamannya masing-masing.
import { initLoginPage } from './auth.js';
import { initDashboardPage } from './dashboard.js';
// Impor untuk halaman superadmin. Pastikan file app-admin.js juga menggunakan ES Module.
// import { initSuperAdminPage } from './app-admin.js'; 

/**
 * Event listener ini akan berjalan setelah seluruh konten HTML (DOM) halaman
 * selesai dimuat dan siap untuk dimanipulasi oleh JavaScript.
 */
document.addEventListener('DOMContentLoaded', () => {
    // Dapatkan path URL saat ini untuk menentukan halaman mana yang aktif.
    // Contoh: "/dashboard.html", "/superadmin.html", atau "/" untuk halaman login.
    const path = window.location.pathname;

    // Arahkan ke fungsi inisialisasi yang benar berdasarkan path URL.
    // Ini memastikan hanya kode yang diperlukan untuk halaman saat ini yang berjalan.
    if (path.includes('dashboard.html')) {
        initDashboardPage();
    } 
    else if (path.includes('superadmin.html')) {
        // Jika Anda ingin mengintegrasikan app-admin.js ke dalam sistem modul ini,
        // Anda perlu memastikan app-admin.js juga mengekspor fungsi inisialisasi
        // dan Anda mengimpornya di atas. Untuk saat ini, kita biarkan terpisah.
        console.log("Super admin page loaded. It runs its own script.");
    }
    // Asumsikan semua path lain (termasuk root '/' atau 'index.html') adalah halaman login.
    else { 
        initLoginPage();
    }
});
