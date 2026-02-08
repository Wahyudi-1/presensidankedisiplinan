// File: main.js
// Tujuan: Router sisi klien. Mengatur file JS mana yang harus dijalankan
//         berdasarkan URL halaman HTML saat ini.
// Versi: 2.1 (Added Wali Kelas Route)

// Event saat HTML selesai dimuat
document.addEventListener('DOMContentLoaded', async () => {
    
    // 1. Dapatkan path URL saat ini
    const path = window.location.pathname;
    
    // Variabel untuk menyimpan modul yang akan dimuat
    let currentModule;

    try {
        // 2. Tentukan halaman mana yang sedang dibuka
        
        // --- ROUTE 1: DASHBOARD ADMIN SEKOLAH / OPERATOR ---
        if (path.includes('dashboard.html')) {
            console.log("🚀 Memuat Modul Dashboard...");
            // Dynamic Import: Hanya load dashboard.js jika di halaman dashboard
            currentModule = await import('./dashboard.js');
            
            // Jalankan fungsi inisialisasi dari dashboard.js
            if (currentModule.initDashboardPage) {
                await currentModule.initDashboardPage();
            }

        // --- ROUTE 2: PANEL SUPER ADMIN ---
        } else if (path.includes('superadmin.html')) {
            console.log("🛡️ Memuat Modul Super Admin...");
            // Dynamic Import: Hanya load app-admin.js jika di halaman admin
            await import('./app-admin.js');

        // --- ROUTE 3: PANEL WALI KELAS (BARU) ---
        } else if (path.includes('walikelas.html')) {
            console.log("👨‍🏫 Memuat Modul Wali Kelas...");
            // Dynamic Import: Hanya load walikelas.js jika di halaman wali kelas
            currentModule = await import('./walikelas.js');
            
            // Jalankan fungsi inisialisasi dari walikelas.js
            if (currentModule.initWaliKelasPage) {
                await currentModule.initWaliKelasPage();
            }

        // --- ROUTE DEFAULT: HALAMAN LOGIN ---
        } else {
            // Default: Asumsikan Halaman Login (index.html atau root '/')
            console.log("🔐 Memuat Modul Login...");
            currentModule = await import('./auth.js');
            
            // Jalankan fungsi inisialisasi dari auth.js
            if (currentModule.initLoginPage) {
                await currentModule.initLoginPage();
            }
        }

    } catch (error) {
        console.error("❌ Gagal memuat modul aplikasi:", error);
        
        // Tampilkan pesan error ke user jika script gagal total
        const statusEl = document.getElementById('statusMessage');
        if (statusEl) {
            statusEl.style.display = 'block';
            statusEl.className = 'status-message error';
            statusEl.textContent = "Gagal memuat sistem. Periksa koneksi internet Anda atau refresh halaman.";
        }
    }
});

// Global Error Handler untuk menangkap error yang tidak terduga
window.addEventListener('unhandledrejection', event => {
    console.warn("⚠️ Unhandled Promise Rejection:", event.reason);
});
