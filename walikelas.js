// File: walikelas.js
// Versi: 4.0 (Robust Camera Switching & Core Library)

import { supabase } from './config.js';
import { showLoading, showStatusMessage, playSound } from './utils.js';
import { handleLogout } from './auth.js';

let WaliState = {
    sekolahId: null,
    kelasAssigned: null,
    siswaDiKelas: [],
    isProcessing: false, // Flag agar tidak double process database
    currentScanner: null, // Menyimpan instance Html5Qrcode aktif
    activeTab: 'datang' // Melacak tab mana yang aktif
};

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

    // UI Update
    document.getElementById('welcomeMessage').textContent = `Hai, ${session.user.email.split('@')[0]}`;
    document.getElementById('welcomeMessage').style.display = 'inline';
    document.getElementById('infoKelasTitle').textContent = `Kelas ${user.kelas_assigned || '-'}`;
    document.getElementById('infoSekolahSubtitle').textContent = user.sekolah.nama_sekolah;

    await loadSiswaSekolah();
    setupListeners();
    
    // Auto-click tab datang
    document.querySelector('.section-nav button[data-section="datangSection"]')?.click();
}

async function loadSiswaSekolah() {
    showLoading(true);
    const { data } = await supabase.from('siswa')
        .select('nisn, nama, kelas')
        .eq('sekolah_id', WaliState.sekolahId)
        .eq('kelas', WaliState.kelasAssigned);
    showLoading(false);
    if (data) WaliState.siswaDiKelas = data;
}

function setupListeners() {
    document.getElementById('logoutButton').addEventListener('click', handleLogout);

    document.querySelectorAll('.section-nav button').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const targetSection = btn.dataset.section;
            
            // Cegah klik ganda pada tab yang sama
            if (btn.classList.contains('active')) return;

            // UI Updates
            document.querySelectorAll('.section-nav button').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            document.querySelectorAll('.content-section').forEach(s => s.style.display = 'none');
            document.getElementById(targetSection).style.display = 'block';

            // === LOGIKA GANTI KAMERA YANG AMAN ===
            
            // 1. Matikan kamera yang sedang jalan (tunggu sampai benar-benar mati)
            await stopQrScanner();

            // 2. Beri jeda sedikit agar browser melepas hardware resource
            await new Promise(r => setTimeout(r, 300));

            // 3. Nyalakan kamera sesuai tab
            if (targetSection === 'datangSection') {
                WaliState.activeTab = 'datang';
                startQrScanner('qrScannerDatang', 'datang');
                loadDailyLog('datang');
            } else if (targetSection === 'pulangSection') {
                WaliState.activeTab = 'pulang';
                startQrScanner('qrScannerPulang', 'pulang');
                loadDailyLog('pulang');
            }
        });
    });

    document.getElementById('btnCariRekap').addEventListener('click', loadRekap);
    document.getElementById('tglRekap').value = new Date().toISOString().split('T')[0];
    window.refreshLog = (type) => loadDailyLog(type);
}

// ====================================================================
// CORE CAMERA LOGIC (MENGGUNAKAN Html5Qrcode CLASS)
// ====================================================================

async function startQrScanner(elementId, type) {
    const resultEl = document.getElementById(type === 'datang' ? 'scanResultDatang' : 'scanResultPulang');
    if (resultEl) {
        resultEl.className = 'scan-result';
        resultEl.textContent = "Mengaktifkan kamera...";
    }

    try {
        // Buat instance baru
        const scanner = new Html5Qrcode(elementId);
        WaliState.currentScanner = scanner;

        // Config
        const config = { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 };
        
        // Start Scanning (Menggunakan Promise)
        await scanner.start(
            { facingMode: "environment" }, // Kamera Belakang
            config,
            (decodedText) => onScanSuccess(decodedText, type, resultEl, scanner) // Success Callback
        );

        if (resultEl) resultEl.textContent = "Kamera aktif. Arahkan ke QR Code.";
        
    } catch (err) {
        console.error("Gagal start kamera:", err);
        if (resultEl) resultEl.textContent = "Gagal akses kamera. Refresh halaman atau periksa izin.";
    }
}

async function stopQrScanner() {
    if (WaliState.currentScanner) {
        try {
            // Cek apakah scanner sedang berjalan
            if (WaliState.currentScanner.isScanning) {
                await WaliState.currentScanner.stop();
            }
            WaliState.currentScanner.clear();
        } catch (e) {
            console.warn("Error stopping scanner:", e);
        }
        WaliState.currentScanner = null;
    }
}

// Callback saat QR terdeteksi
async function onScanSuccess(decodedText, type, resultEl, scannerInstance) {
    if (WaliState.isProcessing) return; // Debounce
    
    WaliState.isProcessing = true;
    
    // Pause kamera sementara
    try { scannerInstance.pause(); } catch(e){}

    await processPresensiWali(decodedText, type, resultEl);

    // Resume kamera setelah 2 detik
    setTimeout(() => {
        WaliState.isProcessing = false;
        try { 
            // Cek apakah tab masih sama sebelum resume (kasus user pindah tab cepat)
            if (WaliState.activeTab === type && scannerInstance === WaliState.currentScanner) {
                scannerInstance.resume();
                if(resultEl) resultEl.textContent = "Siap memindai berikutnya...";
            }
        } catch(e){}
    }, 2000);
}

// ====================================================================
// LOGIKA DATABASE
// ====================================================================

async function processPresensiWali(nisn, type, resultEl) {
    const siswa = WaliState.siswaDiKelas.find(s => s.nisn == nisn);
    
    if (!siswa) {
        playSound('error');
        resultEl.className = 'scan-result error';
        resultEl.innerHTML = `<strong>DITOLAK:</strong><br>NISN ${nisn} tidak dikenal di kelas ini.`;
        return;
    }

    const today = new Date(); today.setHours(0,0,0,0);
    const { data: logHarian } = await supabase
        .from('presensi')
        .select('*')
        .eq('nisn_siswa', nisn)
        .gte('waktu_datang', today.toISOString())
        .maybeSingle();

    if (type === 'datang') {
        if (logHarian) {
            playSound('error');
            resultEl.className = 'scan-result error';
            resultEl.innerHTML = `<strong>SUDAH ABSEN:</strong><br>${siswa.nama} sudah masuk.`;
        } else {
            const { error } = await supabase.from('presensi').insert({ 
                nisn_siswa: nisn, 
                waktu_datang: new Date(), 
                sekolah_id: WaliState.sekolahId 
            });
            if (!error) {
                playSound('success');
                resultEl.className = 'scan-result success';
                resultEl.innerHTML = `<strong>BERHASIL DATANG:</strong><br>${siswa.nama}`;
                loadDailyLog('datang');
            }
        }
    } else { // Pulang
        if (!logHarian) {
            playSound('error');
            resultEl.className = 'scan-result error';
            resultEl.innerHTML = `<strong>DITOLAK:</strong><br>${siswa.nama} belum absen datang.`;
        } else if (logHarian.waktu_pulang) {
            playSound('error');
            resultEl.className = 'scan-result error';
            resultEl.innerHTML = `<strong>SUDAH PULANG:</strong><br>${siswa.nama} sudah scan pulang.`;
        } else {
            const { error } = await supabase.from('presensi').update({ waktu_pulang: new Date() }).eq('id', logHarian.id);
            if (!error) {
                playSound('success');
                resultEl.className = 'scan-result success';
                resultEl.innerHTML = `<strong>BERHASIL PULANG:</strong><br>${siswa.nama}`;
                loadDailyLog('pulang');
            }
        }
    }
}

async function loadDailyLog(type) {
    const tableBody = document.getElementById(type === 'datang' ? 'tableBodyDatang' : 'tableBodyPulang');
    if (!tableBody) return;

    tableBody.innerHTML = `<tr><td colspan="3" align="center">...</td></tr>`;
    
    const today = new Date(); today.setHours(0,0,0,0);
    let query = supabase.from('presensi')
        .select(`waktu_datang, waktu_pulang, siswa!inner(nisn, nama)`)
        .eq('sekolah_id', WaliState.sekolahId)
        .eq('siswa.kelas', WaliState.kelasAssigned) // Filter Kelas
        .gte('waktu_datang', today.toISOString())
        .order(type === 'datang' ? 'waktu_datang' : 'waktu_pulang', { ascending: false });

    if (type === 'pulang') query = query.not('waktu_pulang', 'is', null);

    const { data } = await query;
    if (!data || data.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="3" align="center">Kosong</td></tr>`;
        return;
    }

    tableBody.innerHTML = data.map(row => {
        const time = type === 'datang' ? row.waktu_datang : row.waktu_pulang;
        const timeStr = new Date(time).toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit'});
        return `<tr>
            <td style="font-weight:bold;">${timeStr}</td>
            <td>${row.siswa.nama}</td>
            <td>${row.siswa.nisn}</td>
        </tr>`;
    }).join('');
}

async function loadRekap() {
    const tgl = document.getElementById('tglRekap').value;
    if (!tgl) return;
    
    showLoading(true);
    const start = new Date(tgl); start.setHours(0,0,0,0);
    const end = new Date(tgl); end.setHours(23,59,59,999);

    const { data } = await supabase.from('presensi')
        .select(`waktu_datang, waktu_pulang, status, siswa!inner(nama, whatsapp_ortu)`)
        .eq('sekolah_id', WaliState.sekolahId)
        .eq('siswa.kelas', WaliState.kelasAssigned)
        .gte('waktu_datang', start.toISOString())
        .lte('waktu_datang', end.toISOString())
        .order('siswa(nama)', { ascending: true });

    showLoading(false);
    const tbody = document.getElementById('tableBodyRekap');
    if (!data || data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" align="center">Tidak ada data.</td></tr>`;
    } else {
        tbody.innerHTML = data.map(row => {
            const jM = new Date(row.waktu_datang).toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit'});
            const jP = row.waktu_pulang ? new Date(row.waktu_pulang).toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit'}) : '-';
            let wa = '-';
            if (row.siswa.whatsapp_ortu) {
                wa = `<button class="btn btn-sm btn-success" onclick="window.sendWA('${row.siswa.nama}', '${row.siswa.whatsapp_ortu}', '${row.waktu_datang}', '${row.waktu_pulang}')">WA</button>`;
            }
            return `<tr><td>${row.siswa.nama}</td><td>${jM}</td><td>${jP}</td><td>${row.status||'Hadir'}</td><td>${wa}</td></tr>`;
        }).join('');
    }
}

window.sendWA = function(nama, noHp, tglMasuk, tglPulang) {
    let cleanHp = noHp.replace(/\D/g, '');
    if (cleanHp.startsWith('0')) cleanHp = '62' + cleanHp.slice(1);
    const psn = `Yth. Ortu ${nama}, Siswa hadir pukul ${new Date(tglMasuk).toLocaleTimeString('id-ID')}. Pulang: ${tglPulang ? new Date(tglPulang).toLocaleTimeString('id-ID') : 'Belum'}.`;
    window.open(`https://api.whatsapp.com/send?phone=${cleanHp}&text=${encodeURIComponent(psn)}`, '_blank');
};
