// File: utils.js
// Tujuan: Menyediakan fungsi-fungsi pembantu umum (utilities)
//         yang dapat digunakan kembali di seluruh aplikasi.

/**
 * Menampilkan atau menyembunyikan overlay loading spinner.
 * @param {boolean} isLoading - True untuk menampilkan, false untuk menyembunyikan.
 */
export function showLoading(isLoading) {
    const loader = document.getElementById('loadingIndicator');
    if (loader) {
        loader.style.display = isLoading ? 'flex' : 'none';
    }
}

/**
 * Menampilkan pesan status sementara di bagian atas halaman.
 * Jika elemen status tidak ditemukan, akan menampilkan alert sebagai fallback.
 * @param {string} message - Pesan yang akan ditampilkan.
 * @param {('info'|'success'|'error')} [type='info'] - Jenis pesan, mempengaruhi warna.
 * @param {number} [duration=5000] - Durasi tampilan pesan dalam milidetik.
 */
export function showStatusMessage(message, type = 'info', duration = 5000) {
    const statusEl = document.getElementById('statusMessage');
    if (!statusEl) { 
        alert(message); // Fallback jika elemen tidak ada di HTML
        return; 
    }
    statusEl.textContent = message;
    statusEl.className = `status-message ${type}`;
    statusEl.style.display = 'block';
    
    // Gulir ke atas agar pesan pasti terlihat oleh pengguna.
    window.scrollTo({ top: 0, behavior: 'smooth' }); 
    
    setTimeout(() => { 
        if (statusEl) statusEl.style.display = 'none'; 
    }, duration);
}

/**
 * Memainkan suara sederhana menggunakan Web Audio API untuk memberikan umpan balik audio.
 * @param {('success'|'error')} type - Jenis suara yang akan dimainkan.
 */
export function playSound(type) {
    try {
        // Memastikan kompatibilitas dengan browser lama
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        const audioContext = new AudioContext();
        
        // Setup node audio
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        // Atur parameter suara
        gainNode.gain.setValueAtTime(0, audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.5, audioContext.currentTime + 0.05);
        
        oscillator.type = (type === 'success') ? 'sine' : 'square'; // 'sine' lebih lembut, 'square' lebih tajam
        oscillator.frequency.setValueAtTime((type === 'success') ? 600 : 200, audioContext.currentTime);
        
        // Mainkan dan hentikan suara
        oscillator.start(audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.00001, audioContext.currentTime + 0.3);
        oscillator.stop(audioContext.currentTime + 0.3);
    } catch (e) { 
        console.warn("Web Audio API tidak didukung atau gagal dijalankan.", e); 
    }
}

/**
 * Menyiapkan fungsionalitas untuk ikon mata (toggle) pada input password.
 * Fungsi ini mencari elemen yang relevan di DOM dan menambahkan event listener.
 */
export function setupPasswordToggle() {
    const toggleIcon = document.getElementById('togglePassword');
    const passwordInput = document.getElementById('password');
    
    // Keluar dari fungsi jika elemen tidak ditemukan, mencegah error.
    if (!toggleIcon || !passwordInput) return;
    
    // Simpan SVG ikon agar tidak perlu menuliskannya berulang kali.
    const eyeIcon = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>`;
    const eyeSlashIcon = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.243 4.243l-4.243-4.243" /></svg>`;
    
    // Atur ikon awal
    toggleIcon.innerHTML = eyeIcon;
    
    // Tambahkan event listener untuk mengubah tipe input dan ikon saat diklik.
    toggleIcon.addEventListener('click', () => {
        const isPassword = passwordInput.type === 'password';
        passwordInput.type = isPassword ? 'text' : 'password';
        toggleIcon.innerHTML = isPassword ? eyeSlashIcon : eyeIcon;
    });
}
