// File: utils.js
// Tujuan: Menyediakan fungsi-fungsi pembantu umum (utilities)
//         yang digunakan di seluruh modul aplikasi.
// Versi: 2.1 (Audio Fix & Better UI Feedback)

// ====================================================================
// 1. MANAJEMEN LOADING SPINNER
// ====================================================================

/**
 * Menampilkan atau menyembunyikan overlay loading.
 * @param {boolean} isLoading - True untuk tampil, False untuk sembunyi.
 */
export function showLoading(isLoading) {
    const loader = document.getElementById('loadingIndicator');
    if (loader) {
        loader.style.display = isLoading ? 'flex' : 'none';
    }
}

// ====================================================================
// 2. MANAJEMEN PESAN STATUS (TOAST)
// ====================================================================

let statusTimeout = null; // Variabel untuk menyimpan ID timer agar bisa di-reset

/**
 * Menampilkan pesan status sementara di bagian atas halaman.
 * @param {string} message - Pesan yang akan ditampilkan.
 * @param {('info'|'success'|'error')} [type='info'] - Jenis pesan.
 * @param {number} [duration=4000] - Durasi dalam milidetik.
 */
export function showStatusMessage(message, type = 'info', duration = 4000) {
    const statusEl = document.getElementById('statusMessage');
    
    // Fallback jika elemen HTML tidak ditemukan
    if (!statusEl) { 
        console.log(`[${type.toUpperCase()}] ${message}`);
        if (type === 'error') alert(message);
        return; 
    }

    // 1. Hentikan timer sebelumnya jika ada (agar pesan tidak hilang tiba-tiba)
    if (statusTimeout) {
        clearTimeout(statusTimeout);
        statusTimeout = null;
    }

    // 2. Tampilkan pesan baru
    statusEl.textContent = message;
    statusEl.className = `status-message ${type}`; // Reset class
    statusEl.style.display = 'block';
    
    // Scroll ke atas agar pesan terlihat di HP
    window.scrollTo({ top: 0, behavior: 'smooth' }); 

    // 3. Set timer baru untuk menyembunyikan
    statusTimeout = setTimeout(() => { 
        if (statusEl) {
            statusEl.style.display = 'none'; 
            statusEl.className = 'status-message'; // Bersihkan class
        }
    }, duration);
}

// ====================================================================
// 3. AUDIO FEEDBACK (SINGLETON PATTERN)
// ====================================================================

// Inisialisasi AudioContext hanya SEKALI di luar fungsi (Hemat Memori)
const AudioContext = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;

/**
 * Memainkan suara 'beep' sintetis tanpa perlu file MP3 eksternal.
 * @param {('success'|'error')} type - Jenis suara.
 */
export function playSound(type) {
    try {
        // Lazy initialization: Buat context hanya saat pertama kali dibutuhkan
        if (!audioCtx) {
            audioCtx = new AudioContext();
        }

        // Browser sering menahan audio context (suspended) sampai ada interaksi user
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }

        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        const now = audioCtx.currentTime;

        if (type === 'success') {
            // Suara "Ting" (High pitch, smooth decay)
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(880, now); // A5
            oscillator.frequency.exponentialRampToValueAtTime(440, now + 0.1);
            
            gainNode.gain.setValueAtTime(0.1, now);
            gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
            
            oscillator.start(now);
            oscillator.stop(now + 0.5);

        } else {
            // Suara "Buzz/Error" (Low pitch, sawtooth)
            oscillator.type = 'sawtooth';
            oscillator.frequency.setValueAtTime(150, now);
            oscillator.frequency.linearRampToValueAtTime(100, now + 0.3);
            
            gainNode.gain.setValueAtTime(0.1, now);
            gainNode.gain.linearRampToValueAtTime(0.001, now + 0.3);
            
            oscillator.start(now);
            oscillator.stop(now + 0.3);
        }

    } catch (e) {
        console.warn("Audio feedback gagal:", e);
    }
}

// ====================================================================
// 4. PASSWORD TOGGLE (SHOW/HIDE)
// ====================================================================

/**
 * Menyiapkan interaksi ikon mata pada input password.
 */
export function setupPasswordToggle() {
    // Cari semua wrapper password (bisa lebih dari satu, misal di halaman admin)
    const wrappers = document.querySelectorAll('.password-wrapper');

    wrappers.forEach(wrapper => {
        const input = wrapper.querySelector('input');
        const icon = wrapper.querySelector('.toggle-password-icon');

        if (!input || !icon) return;

        // SVG Ikon (Mata Terbuka & Tertutup)
        const eyeOpen = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
        const eyeClosed = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`;

        // Set ikon awal
        icon.innerHTML = eyeOpen;

        // Event Listener: Klik ikon ubah tipe input
        icon.addEventListener('click', () => {
            const isPassword = input.type === 'password';
            
            // Toggle tipe input
            input.type = isPassword ? 'text' : 'password';
            
            // Toggle ikon
            icon.innerHTML = isPassword ? eyeClosed : eyeOpen;
            
            // Toggle warna agar user sadar
            icon.style.color = isPassword ? 'var(--primary-color)' : '#888';
        });
    });
}
