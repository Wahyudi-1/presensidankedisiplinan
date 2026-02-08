// File: walikelas.js
// Versi: 4.0 (Camera Resource Fix & Mobile Optimized)

import { supabase } from './config.js';
import { showLoading, showStatusMessage, playSound } from './utils.js';
import { handleLogout } from './auth.js';

let WaliState = {
    sekolahId: null,
    kelasAssigned: null,
    namaSekolah: '',
    siswaDiKelas: [],
    isScanning: false, // Flag agar tidak double scan
};

// Variabel Global untuk Instance Scanner
let globalQrInstance = null; 

// ====================================================================
// 1. INISIALISASI HALAMAN
// ====================================================================

export async function initWaliKelasPage() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return window.location.replace('index.html');

    const { data: user, error } = await supabase
        .from('pengguna')
        .select('sekolah_id, kelas_assigned, role, sekolah(nama_sekolah)')
        .eq('id', session.user.id)
        .single();

    if (error || user.role !== 'wali_kelas') { 
        alert("Akses Ditolak."); return handleLogout(); 
    }

    WaliState.sekolahId = user.sekolah_id;
    WaliState.kelasAssigned = user.kelas_assigned;
    WaliState.namaSekolah = user.sekolah.nama_sekolah;

    // UI Updates
    const welcomeEl = document.getElementById('welcomeMessage');
    if (welcomeEl) {
        welcomeEl.textContent = `Wali Kelas ${user.kelas_assigned}`;
        welcomeEl.style.display = 'inline';
    }
    document.getElementById('infoKelasTitle').textContent = `Kelas ${user.kelas_assigned}`;
    document.getElementById('infoSekolahSubtitle').textContent = user.sekolah.nama_sekolah;

    await loadSiswaSekolah();
    setupListeners();

    // Trigger klik tab pertama secara otomatis (tapi tunggu DOM siap)
    setTimeout(() => {
        document.querySelector('.section-nav button[data-section="datangSection"]')?.click();
    }, 500);
}

async function loadSiswaSekolah() {
    showLoading(true);
    // Hanya load siswa di kelas yg relevan
    const { data } = await supabase.from('siswa')
        .select('nisn, nama, kelas, whatsapp_ortu')
        .eq('sekolah_id', WaliState.sekolahId)
        .eq('kelas', WaliState.kelasAssigned);
    
    if (data) WaliState.siswaDiKelas = data;
    showLoading(false);
}

function setupListeners() {
    document.getElementById('logoutButton').addEventListener('click', handleLogout);

    document.querySelectorAll('.section-nav button').forEach(btn => {
        btn.addEventListener('click', async () => {
            // 1. Matikan Scanner Dulu Sebelum Pindah Tab (PENTING)
            await stopQrScanner();

            // 2. Update UI Tab
            document.querySelectorAll('.section-nav button').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            document.querySelectorAll('.content-section').forEach(s => s.style.display = 'none');
            
            const targetId = btn.dataset.section;
            const targetSection = document.getElementById(targetId);
            targetSection.style.display = 'block'; // Tampilkan dulu elemennya

            // 3. Logika Per Tab
            if(targetId === 'datangSection') { 
                // Beri jeda 300ms agar DOM benar-benar render sebelum kamera nyala
                setTimeout(() => { startQrScanner('datang'); }, 300);
                loadDailyLog('datang'); 
            } else if(targetId === 'pulangSection') { 
                setTimeout(() => { startQrScanner('pulang'); }, 300);
                loadDailyLog('pulang'); 
            }
        });
    });

    document.getElementById('btnCariRekap').addEventListener('click', loadRekap);
    document.getElementById('tglRekap').value = new Date().toISOString().split('T')[0];
    window.refreshLog = (type) => loadDailyLog(type);
}

// ====================================================================
// 2. LOGIKA KAMERA (PERBAIKAN UTAMA)
// ====================================================================

async function startQrScanner(type) {
    const elementId = type === 'datang' ? 'qrScannerDatang' : 'qrScannerPulang';
    const resultEl = document.getElementById(type === 'datang' ? 'scanResultDatang' : 'scanResultPulang');
    
    // Reset Pesan
    if(resultEl) {
        resultEl.className = 'scan-result';
        resultEl.innerHTML = 'Memulai kamera...';
    }

    // Pastikan scanner lama mati total
    await stopQrScanner();

    // Gunakan Class Html5Qrcode (Bukan Scanner UI) agar kontrol lebih baik
    const html5QrCode = new Html5Qrcode(elementId);
    globalQrInstance = html5QrCode; // Simpan ke global agar bisa distop nanti

    const config = { 
        fps: 10, 
        qrbox: { width: 250, height: 250 }, 
        aspectRatio: 1.0 
    };

    try {
        // Request kamera belakang (environment)
        await html5QrCode.start(
            { facingMode: "environment" }, 
            config, 
            (decodedText) => {
                onScanSuccess(decodedText, type, html5QrCode);
            },
            (errorMessage) => {
                // Ignore frame errors
            }
        );
        if(resultEl) resultEl.innerHTML = "Arahkan kamera ke QR Code...";
    } catch (err) {
        console.error("Gagal start kamera:", err);
        if(resultEl) {
            resultEl.className = 'scan-result error';
            resultEl.innerHTML = "Gagal akses kamera. <br>Izinkan kamera atau refresh halaman.";
        }
    }
}

async function stopQrScanner() {
    if (globalQrInstance) {
        try {
            // Cek apakah scanner sedang berjalan (isScanning)
            if (globalQrInstance.isScanning) {
                await globalQrInstance.stop();
            }
            globalQrInstance.clear();
        } catch (e) {
            console.warn("Error stopping scanner:", e);
        }
        globalQrInstance = null;
        WaliState.isScanning = false;
    }
}

async function onScanSuccess(decodedText, type, scannerInstance) {
    // Cegah spam scan (Cooldown 2.5 detik)
    if (WaliState.isScanning) return;
    WaliState.isScanning = true;

    // Pause UI video (opsional, memberi efek 'freeze' saat sukses)
    try { scannerInstance.pause(); } catch(e){}

    await processPresensiWali(decodedText, type);

    // Resume scanning setelah jeda
    setTimeout(() => {
        WaliState.isScanning = false;
        try { scannerInstance.resume(); } catch(e){}
        const resultEl = document.getElementById(type === 'datang' ? 'scanResultDatang' : 'scanResultPulang');
        if (resultEl) resultEl.innerHTML = "Siap memindai berikutnya...";
    }, 2500);
}


// ====================================================================
// 3. LOGIKA PRESENSI
// ====================================================================

async function processPresensiWali(nisn, type) {
    const resultEl = document.getElementById(type === 'datang' ? 'scanResultDatang' : 'scanResultPulang');
    
    // Cek Siswa di Kelas
    const siswa = WaliState.siswaDiKelas.find(s => s.nisn == nisn);
    if (!siswa) {
        playSound('error');
        resultEl.className = 'scan-result error';
        resultEl.innerHTML = `<strong>GAGAL:</strong><br>NISN ${nisn} tidak ditemukan di kelas ini.`;
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
            resultEl.innerHTML = `<strong>SUDAH ABSEN:</strong><br>${siswa.nama} sudah scan masuk.`;
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
            resultEl.innerHTML = `<strong>GAGAL:</strong><br>${siswa.nama} belum scan datang hari ini.`;
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

// ====================================================================
// 4. LOAD LOG & REKAP
// ====================================================================

async function loadDailyLog(type) {
    const tableBody = document.getElementById(type === 'datang' ? 'tableBodyDatang' : 'tableBodyPulang');
    if(!tableBody) return;
    
    tableBody.innerHTML = `<tr><td colspan="3" align="center">Memuat...</td></tr>`;
    
    const today = new Date(); today.setHours(0,0,0,0);
    let query = supabase.from('presensi')
        .select(`waktu_datang, waktu_pulang, siswa!inner(nisn, nama, kelas)`)
        .eq('sekolah_id', WaliState.sekolahId)
        .eq('siswa.kelas', WaliState.kelasAssigned)
        .gte('waktu_datang', today.toISOString())
        .order(type === 'datang' ? 'waktu_datang' : 'waktu_pulang', { ascending: false });

    if (type === 'pulang') query = query.not('waktu_pulang', 'is', null);

    const { data, error } = await query;
    if (error || !data || data.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="3" align="center">Belum ada data.</td></tr>`;
        return;
    }

    tableBody.innerHTML = data.map(row => {
        const time = type === 'datang' ? row.waktu_datang : row.waktu_pulang;
        const timeStr = new Date(time).toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit'});
        return `<tr>
            <td data-label="Waktu"><strong>${timeStr}</strong></td>
            <td data-label="Nama">${row.siswa.nama}</td>
            <td data-label="NISN">${row.siswa.nisn}</td>
        </tr>`;
    }).join('');
}

async function loadRekap() {
    const tgl = document.getElementById('tglRekap').value;
    if (!tgl) return showStatusMessage("Pilih tanggal.", "error");

    showLoading(true);
    const start = new Date(tgl); start.setHours(0,0,0,0);
    const end = new Date(tgl); end.setHours(23,59,59,999);

    const { data, error } = await supabase.from('presensi')
        .select(`waktu_datang, waktu_pulang, status, siswa!inner(nisn, nama, kelas, whatsapp_ortu)`)
        .eq('sekolah_id', WaliState.sekolahId)
        .eq('siswa.kelas', WaliState.kelasAssigned)
        .gte('waktu_datang', start.toISOString())
        .lte('waktu_datang', end.toISOString())
        .order('siswa(nama)', { ascending: true });

    showLoading(false);
    const tbody = document.getElementById('tableBodyRekap');
    if (error || !data.length) {
        tbody.innerHTML = `<tr><td colspan="5" align="center">Tidak ada data.</td></tr>`;
        return;
    }

    tbody.innerHTML = data.map(row => {
        const jamMasuk = new Date(row.waktu_datang).toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit'});
        const jamPulang = row.waktu_pulang ? new Date(row.waktu_pulang).toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit'}) : '-';
        let waBtn = row.siswa.whatsapp_ortu 
            ? `<button class="btn btn-sm btn-success" onclick="window.sendWA('${row.siswa.nama}', '${row.siswa.whatsapp_ortu}', '${row.waktu_datang}', '${row.waktu_pulang}')">📱</button>`
            : '-';
        
        return `<tr>
            <td data-label="Nama">${row.siswa.nama}</td>
            <td data-label="Masuk">${jamMasuk}</td>
            <td data-label="Pulang">${jamPulang}</td>
            <td data-label="Ket">${row.status || 'Hadir'}</td>
            <td data-label="Aksi">${waBtn}</td>
        </tr>`;
    }).join('');
}
