// File: walikelas.js
// Versi: 3.1 (Camera Fix & Mobile Optimized)

import { supabase } from './config.js';
import { showLoading, showStatusMessage, playSound } from './utils.js';
import { handleLogout } from './auth.js';

let WaliState = {
    sekolahId: null,
    kelasAssigned: null,
    namaSekolah: '',
    siswaDiKelas: [], // Hanya menyimpan siswa di kelas ini
    isScanning: false,
    lastScanTime: 0 // Untuk cooldown
};

let html5QrcodeScanner = null;

// ====================================================================
// 1. INISIALISASI HALAMAN
// ====================================================================

export async function initWaliKelasPage() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return window.location.replace('index.html');

    // 1. Cek User & Role
    const { data: user, error } = await supabase
        .from('pengguna')
        .select('sekolah_id, kelas_assigned, role, sekolah(nama_sekolah)')
        .eq('id', session.user.id)
        .single();

    if (error || user.role !== 'wali_kelas') { 
        alert("Akses Ditolak. Anda bukan Wali Kelas."); 
        return handleLogout(); 
    }

    WaliState.sekolahId = user.sekolah_id;
    WaliState.kelasAssigned = user.kelas_assigned;
    WaliState.namaSekolah = user.sekolah.nama_sekolah;

    // 2. Set UI Info
    const welcomeEl = document.getElementById('welcomeMessage');
    const infoTitle = document.getElementById('infoKelasTitle');
    const infoSub = document.getElementById('infoSekolahSubtitle');

    if (welcomeEl) {
        welcomeEl.textContent = `Hai, ${session.user.email.split('@')[0]}`;
        welcomeEl.style.display = 'inline';
    }
    if (infoTitle) infoTitle.textContent = `Kelas ${user.kelas_assigned || '-'}`;
    if (infoSub) infoSub.textContent = user.sekolah.nama_sekolah;

    // 3. Load Data Siswa (Filtered by Kelas)
    await loadSiswaSekolah();

    // 4. Setup Listeners
    setupListeners();

    // 5. Buka tab default (Datang)
    document.querySelector('.section-nav button[data-section="datangSection"]')?.click();
}

async function loadSiswaSekolah() {
    showLoading(true);
    // OPTIMASI: Hanya ambil siswa di kelas yang diampu
    const { data, error } = await supabase
        .from('siswa')
        .select('nisn, nama, kelas, whatsapp_ortu')
        .eq('sekolah_id', WaliState.sekolahId)
        .eq('kelas', WaliState.kelasAssigned); // Filter penting!

    showLoading(false);

    if (error) {
        showStatusMessage("Gagal memuat data siswa.", "error");
        return;
    }
    WaliState.siswaDiKelas = data;
    console.log(`Memuat ${data.length} siswa untuk kelas ${WaliState.kelasAssigned}`);
}

function setupListeners() {
    document.getElementById('logoutButton').addEventListener('click', handleLogout);

    document.querySelectorAll('.section-nav button').forEach(btn => {
        btn.addEventListener('click', async () => {
            // UI Toggle
            document.querySelectorAll('.section-nav button').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            document.querySelectorAll('.content-section').forEach(s => s.style.display = 'none');
            
            const target = btn.dataset.section;
            document.getElementById(target).style.display = 'block';

            // SECURITY: Matikan scanner tab sebelumnya SEBELUM menyalakan yang baru
            await stopQrScanner();

            if(target === 'datangSection') { 
                await startQrScanner('datang'); 
                loadDailyLog('datang'); 
            } else if(target === 'pulangSection') { 
                await startQrScanner('pulang'); 
                loadDailyLog('pulang'); 
            }
        });
    });

    document.getElementById('btnCariRekap').addEventListener('click', loadRekap);
    document.getElementById('tglRekap').value = new Date().toISOString().split('T')[0];

    // Ekspos fungsi refresh ke window agar bisa dipanggil onclick HTML
    window.refreshLog = (type) => loadDailyLog(type);
}

// ====================================================================
// 2. LOGIKA KAMERA (SCANNER) - FIXED
// ====================================================================

async function startQrScanner(type) {
    const elementId = type === 'datang' ? 'qrScannerDatang' : 'qrScannerPulang';
    const resultEl = document.getElementById(type === 'datang' ? 'scanResultDatang' : 'scanResultPulang');
    
    if (resultEl) {
        resultEl.className = 'scan-result';
        resultEl.textContent = "Arahkan kamera ke QR Code...";
    }

    // Pastikan scanner sebelumnya benar-benar mati
    await stopQrScanner();

    // Konfigurasi Scanner
    const config = { 
        fps: 10, 
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1.0, // Penting untuk mobile agar tidak gepeng
        supportedScanTypes: [Html5QrcodeScanType.SCAN_TYPE_CAMERA] // Paksa pakai kamera
    };

    html5QrcodeScanner = new Html5QrcodeScanner(elementId, config, /* verbose= */ false);

    const onScanSuccess = async (decodedText) => {
        // Cooldown 2 Detik (Mencegah double scan)
        const now = Date.now();
        if (WaliState.isScanning || (now - WaliState.lastScanTime < 2000)) return;
        
        WaliState.isScanning = true;
        WaliState.lastScanTime = now;

        html5QrcodeScanner.pause(true); // Pause kamera saat memproses
        
        await processPresensiWali(decodedText, type);

        // Resume setelah selesai
        setTimeout(() => {
            WaliState.isScanning = false;
            if (html5QrcodeScanner) {
                try { html5QrcodeScanner.resume(); } catch(e) {}
                if (resultEl) resultEl.innerHTML = "Siap memindai berikutnya...";
            }
        }, 1500); 
    };

    try {
        html5QrcodeScanner.render(onScanSuccess, (errorMessage) => {
            // Ignore parse errors, scanning in progress...
        });
    } catch (e) {
        console.error("Scanner Error:", e);
        if(resultEl) resultEl.textContent = "Gagal memulai kamera. Pastikan izin diberikan.";
    }
}

async function stopQrScanner() {
    if (html5QrcodeScanner) {
        try {
            // Coba clear() dulu, ini akan menghapus UI scanner dan stop kamera
            await html5QrcodeScanner.clear();
        } catch (e) {
            console.warn("Gagal stop scanner:", e);
        }
        html5QrcodeScanner = null;
    }
}

// ====================================================================
// 3. LOGIKA PRESENSI
// ====================================================================

async function processPresensiWali(nisn, type) {
    const resultEl = document.getElementById(type === 'datang' ? 'scanResultDatang' : 'scanResultPulang');
    
    // Validasi: Apakah siswa ada di kelas ini?
    const siswa = WaliState.siswaDiKelas.find(s => s.nisn == nisn);
    
    if (!siswa) {
        playSound('error');
        resultEl.className = 'scan-result error';
        resultEl.innerHTML = `<strong>DITOLAK:</strong><br>NISN ${nisn} bukan siswa kelas ${WaliState.kelasAssigned}.`;
        return;
    }

    const today = new Date(); today.setHours(0,0,0,0);
    const { data: logHarian } = await supabase
        .from('presensi')
        .select('*')
        .eq('nisn_siswa', nisn)
        .gte('wa
