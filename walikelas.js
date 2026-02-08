// File: walikelas.js
// Versi: 2.1 (FIXED: Scanner logic & CHANGED: Wali Kelas can scan all students in the school)

import { supabase } from './config.js';
import { showLoading, showStatusMessage, playSound } from './utils.js';
import { handleLogout } from './auth.js';

let WaliState = {
    sekolahId: null,
    kelasAssigned: null,
    namaSekolah: '',
    siswaDiSekolah: [], // PERUBAHAN: Menyimpan semua siswa di sekolah, bukan per kelas
    isScanning: false,
};

// Instance Scanner Global
let html5QrcodeScanner = null;

export async function initWaliKelasPage() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return window.location.replace('index.html');

    const { data: user, error } = await supabase
        .from('pengguna')
        .select('sekolah_id, kelas_assigned, role, sekolah(nama_sekolah)')
        .eq('id', session.user.id)
        .single();

    if (error || user.role !== 'wali_kelas') {
        alert("Akses Ditolak.");
        return handleLogout();
    }

    WaliState.sekolahId = user.sekolah_id;
    WaliState.kelasAssigned = user.kelas_assigned;
    WaliState.namaSekolah = user.sekolah.nama_sekolah;

    document.getElementById('welcomeMessage').textContent = `Halo, Wali Kelas ${user.kelas_assigned || ''}`;
    document.getElementById('infoKelasTitle').textContent = `${user.sekolah.nama_sekolah} - Kelas ${user.kelas_assigned || 'Semua Kelas'}`;
    
    await loadSiswaSekolah(); // PERUBAHAN: Memuat semua siswa di sekolah
    setupListeners();
    document.querySelector('.section-nav button[data-section="datangSection"]')?.click();
}

// === PERUBAHAN LOGIKA DI SINI ===
// Fungsi ini sekarang memuat SEMUA siswa di sekolah untuk validasi scan
async function loadSiswaSekolah() {
    const { data, error } = await supabase
        .from('siswa')
        .select('nisn, nama, kelas')
        .eq('sekolah_id', WaliState.sekolahId);
    
    if(error) {
        console.error("Gagal memuat data siswa:", error);
        return;
    }
    WaliState.siswaDiSekolah = data;
    console.log(`Berhasil memuat ${data.length} siswa dari sekolah ini.`);
}
// ===============================

function setupListeners() {
    document.getElementById('logoutButton').addEventListener('click', handleLogout);

    document.querySelectorAll('.section-nav button').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.section-nav button').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            document.querySelectorAll('.content-section').forEach(s => s.style.display = 'none');
            
            const target = btn.dataset.section;
            document.getElementById(target).style.display = 'block';
            
            stopQrScanner();

            if(target === 'datangSection') {
                startQrScanner('datang');
                loadDailyLog('datang');
            }
            if(target === 'pulangSection') {
                startQrScanner('pulang');
                loadDailyLog('pulang');
            }
        });
    });

    document.getElementById('btnCariRekap').addEventListener('click', loadRekap);
    document.getElementById('tglRekap').value = new Date().toISOString().split('T')[0];
}

// === LOGIKA SCANNER ===
function startQrScanner(type) {
    if (html5QrcodeScanner && html5QrcodeScanner.isScanning) {
        stopQrScanner();
    }

    const elementId = type === 'datang' ? 'qrScannerDatang' : 'qrScannerPulang';
    const resultEl = document.getElementById(type === 'datang' ? 'scanResultDatang' : 'scanResultPulang');
    
    if (resultEl) resultEl.className = 'scan-result';

    const onScanSuccess = async (decodedText) => {
        if (WaliState.isScanning) return;
        
        WaliState.isScanning = true;
        html5QrcodeScanner.pause(true); // PERBAIKAN TYPO DI SINI

        await processPresensiWali(decodedText, type);

        setTimeout(() => {
            WaliState.isScanning = false;
            if (html5QrcodeScanner) {
                try { html5QrcodeScanner.resume(); } catch(e) { console.error("Gagal resume scanner", e); }
                if (resultEl) resultEl.innerHTML = "Siap memindai berikutnya...";
            }
        }, 2500); 
    };

    const config = { fps: 10, qrbox: { width: 250, height: 250 }};
    html5QrcodeScanner = new Html5QrcodeScanner(elementId, config, false);
    html5QrcodeScanner.render(onScanSuccess, () => {});
}

function stopQrScanner() {
    if (html5QrcodeScanner) {
        try {
            if (html5QrcodeScanner.getState() === 2) { // 2 = scanning
                html5QrcodeScanner.stop();
            }
            html5QrcodeScanner.clear();
        } catch (e) {
            console.warn("Gagal membersihkan scanner:", e);
        }
        html5QrcodeScanner = null;
    }
}

async function processPresensiWali(nisn, type) {
    const resultEl = document.getElementById(type === 'datang' ? 'scanResultDatang' : 'scanResultPulang');
    
    // === PERUBAHAN LOGIKA DI SINI ===
    // Validasi: Apakah siswa terdaftar di sekolah ini?
    const siswa = WaliState.siswaDiSekolah.find(s => s.nisn == nisn);

    if (!siswa) {
        playSound('error');
        resultEl.className = 'scan-result error';
        resultEl.innerHTML = `<strong>GAGAL:</strong><br>Siswa dengan NISN ${nisn}<br>tidak terdaftar di sekolah ini.`;
        return;
    }

    // Proses presensi sama seperti dashboard.js
    const today = new Date();
    today.setHours(0,0,0,0);

    const { data: logHarian, error: checkError } = await supabase
        .from('presensi').select('*').eq('nisn_siswa', nisn).gte('waktu_datang', today.toISOString()).maybeSingle();

    if (checkError) { resultEl.textContent = "Koneksi Error."; return; }

    if (type === 'datang') {
        if (logHarian) {
            playSound('error');
            resultEl.className = 'scan-result error';
            resultEl.innerHTML = `<strong>DITOLAK:</strong><br>${siswa.nama} (${siswa.kelas})<br>Sudah absen datang.`;
        } else {
            const { error } = await supabase.from('presensi').insert({ nisn_siswa: nisn, waktu_datang: new Date(), sekolah_id: WaliState.sekolahId });
            if (error) { resultEl.textContent = "Gagal simpan."; } 
            else {
                playSound('success');
                resultEl.className = 'scan-result success';
                resultEl.innerHTML = `<strong>BERHASIL DATANG:</strong><br>${siswa.nama} (${siswa.kelas})`;
                loadDailyLog('datang');
            }
        }
    } else { // Pulang
        if (!logHarian) {
            playSound('error');
            resultEl.className = 'scan-result error';
            resultEl.innerHTML = `<strong>DITOLAK:</strong><br>${siswa.nama} (${siswa.kelas})<br>Belum presensi datang.`;
        } else if (logHarian.waktu_pulang) {
            playSound('error');
            resultEl.className = 'scan-result error';
            resultEl.innerHTML = `<strong>DITOLAK:</strong><br>${siswa.nama} (${siswa.kelas})<br>Sudah absen pulang.`;
        } else {
            const { error } = await supabase.from('presensi').update({ waktu_pulang: new Date() }).eq('id', logHarian.id);
            if (error) { resultEl.textContent = "Gagal simpan."; }
            else {
                playSound('success');
                resultEl.className = 'scan-result success';
                resultEl.innerHTML = `<strong>BERHASIL PULANG:</strong><br>${siswa.nama} (${siswa.kelas})`;
                loadDailyLog('pulang');
            }
        }
    }
}

// === LOGIKA MONITORING (Tabel) ===
// Tabel tetap HANYA menampilkan data dari kelas yang ditugaskan
async function loadDailyLog(type) {
    showLoading(true);
    const today = new Date();
    today.setHours(0,0,0,0);
    const tableId = type === 'datang' ? 'tableBodyDatang' : 'tableBodyPulang';
    
    let query = supabase.from('presensi').select(`waktu_datang, waktu_pulang, siswa!inner(nisn, nama, kelas)`)
        .eq('sekolah_id', WaliState.sekolahId)
        .eq('siswa.kelas', WaliState.kelasAssigned)
        .gte('waktu_datang', today.toISOString())
        .order('waktu_datang', { ascending: false });

    if (type === 'pulang') {
        query = query.not('waktu_pulang', 'is', null);
    }

    const { data, error } = await query;
    showLoading(false);

    const tbody = document.getElementById(tableId);
    if (error || !data || data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" align="center">Belum ada data siswa ${WaliState.kelasAssigned}.</td></tr>`;
        return;
    }
    tbody.innerHTML = data.map(row => {
        const time = type === 'datang' ? row.waktu_datang : row.waktu_pulang;
        const timeStr = new Date(time).toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit'});
        return `<tr><td>${timeStr}</td><td>${row.siswa.nisn}</td><td>${row.siswa.nama}</td></tr>`;
    }).join('');
}

// === LOGIKA REKAP ===
// Rekap tetap HANYA menampilkan data dari kelas yang ditugaskan
async function loadRekap() {
    const tgl = document.getElementById('tglRekap').value;
    if (!tgl) return alert("Pilih tanggal dulu.");

    showLoading(true);
    const start = new Date(tgl); start.setHours(0,0,0,0);
    const end = new Date(tgl); end.setHours(23,59,59,999);

    const { data, error } = await supabase
        .from('presensi').select(`waktu_datang, waktu_pulang, status, siswa!inner(nisn, nama, kelas)`)
        .eq('sekolah_id', WaliState.sekolahId)
        .eq('siswa.kelas', WaliState.kelasAssigned)
        .gte('waktu_datang', start.toISOString())
        .lte('waktu_datang', end.toISOString())
        .order('siswa(nama)', { ascending: true });

    showLoading(false);
    const tbody = document.getElementById('tableBodyRekap');
    if (error) return showStatusMessage('Gagal memuat rekap.', 'error');

    if (data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" align="center">Tidak ada data presensi pada tanggal ini.</td></tr>`;
    } else {
        tbody.innerHTML = data.map(row => {
            const jamMasuk = new Date(row.waktu_datang).toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit'});
            const jamPulang = row.waktu_pulang ? new Date(row.waktu_pulang).toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit'}) : '-';
            return `<tr>
                <td>${new Date(row.waktu_datang).toLocaleDateString('id-ID')}</td>
                <td>${row.siswa.nama}</td>
                <td>${jamMasuk}</td>
                <td>${jamPulang}</td>
                <td>${row.status || 'Hadir'}</td>
            </tr>`;
        }).join('');
    }
}
