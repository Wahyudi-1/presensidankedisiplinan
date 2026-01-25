// File: main.js
// Tujuan: Router sisi klien. Mengatur file mana yang harus dijalankan
//         berdasarkan URL halaman saat ini.

// Event saat HTML selesai dimuat
document.addEventListener('DOMContentLoaded', async () => {
    
    // 1. Dapatkan path URL saat ini
    const path = window.location.pathname;
    
    // Variabel untuk menyimpan modul yang akan dimuat
    let currentModule;

    try {
        // 2. Tentukan halaman mana yang sedang dibuka
        if (path.includes('dashboard.html')) {
            console.log("🚀 Memuat Modul Dashboard...");
            // Dynamic Import: Hanya load dashboard.js jika di halaman dashboard
            currentModule = await import('./dashboard.js');
            
            // Jalankan fungsi inisialisasi dari dashboard.js
            if (currentModule.initDashboardPage) {
                await currentModule.initDashboardPage();
            }

        } else if (path.includes('superadmin.html')) {
            console.log("🛡️ Memuat Modul Super Admin...");
            // Dynamic Import: Hanya load app-admin.js jika di halaman admin
            // Kode di app-admin.js biasanya auto-run via event listener,
            // tapi kita import agar script-nya dieksekusi.
            await import('./app-admin.js');

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
