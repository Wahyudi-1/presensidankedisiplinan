// File: config.js 
// Tujuan: Konfigurasi dan inisialisasi koneksi ke Supabase.
// Ini adalah satu-satunya tempat di mana URL dan kunci API Anda ditulis.

// Pastikan URL dan Kunci ini sesuai dengan proyek Supabase Anda.
const SUPABASE_URL = 'https://qjlyqwyuotobnzllelta.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqbHlxd3l1b3RvYm56bGxlbHRhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM4NDk2NTAsImV4cCI6MjA2OTQyNTY1MH0.Bm3NUiQ6VtKuTwCDFOR-d7O2uodVXc6MgvRSPnAwkSE';

// Mengambil fungsi createClient dari library Supabase global yang sudah dimuat di HTML.
const { createClient } = window.supabase;

// Membuat satu instance klien Supabase.
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Mengekspor instance klien agar bisa diimpor dan digunakan di file lain.
// Contoh penggunaan di file lain: import { supabase } from './config.js';
export const supabase = supabaseClient;
