// File: config.js
// Tujuan: Konfigurasi pusat untuk koneksi ke Supabase.
//         File ini diekspor agar bisa dipakai di auth.js, dashboard.js, dll.

// ====================================================================
// 1. KREDENSIAL SUPABASE
// ====================================================================
// Catatan: Dalam proyek Vanilla JS tanpa bundler (seperti Vite/Webpack),
// kredensial ini harus ditulis di sini.
// Pastikan "SUPABASE_ANON_KEY" (Kunci Publik) yang dipakai, JANGAN "SERVICE_ROLE_KEY".

const SUPABASE_URL = 'https://qjlyqwyuotobnzllelta.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqbHlxd3l1b3RvYm56bGxlbHRhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM4NDk2NTAsImV4cCI6MjA2OTQyNTY1MH0.Bm3NUiQ6VtKuTwCDFOR-d7O2uodVXc6MgvRSPnAwkSE';

// ====================================================================
// 2. INISIALISASI KLIEN
// ====================================================================

// Pengecekan Keamanan: Pastikan library Supabase dari CDN sudah termuat di HTML
if (!window.supabase) {
    const errorMsg = "FATAL ERROR: Library Supabase tidak ditemukan. Periksa koneksi internet atau script tag di index.html.";
    console.error(errorMsg);
    alert("Gagal memuat sistem: Koneksi ke server database terputus. Coba refresh halaman.");
    throw new Error(errorMsg);
}

const { createClient } = window.supabase;

// Membuat satu instance koneksi yang akan dipakai berulang-ulang
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        persistSession: true, // Menyimpan login agar user tidak perlu login ulang tiap refresh
        autoRefreshToken: true, // Otomatis perbarui token keamanan
        detectSessionInUrl: true // Mendeteksi link reset password di URL
    }
});

// Mengekspor instance agar bisa di-import file lain
export const supabase = supabaseClient;
