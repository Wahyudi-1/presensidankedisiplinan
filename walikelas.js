// File: walikelas.js
// Versi: 2.0 (Added QR Scanner Feature)

import { supabase } from './config.js';
import { showLoading, showStatusMessage, playSound } from './utils.js';
import { handleLogout } from './auth.js';

let WaliState = {
    sekolahId: null,
    kelasAssigned: null,
    namaSekolah: '',
    siswaDiKelas: [], // Menyimpan data siswa di kelas ini agar scan cepat
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

    if (error || user.role !== 'wali_kelas' || !user.kelas_assigned) {
        alert("Akses Ditolak: Anda bukan Wali Kelas atau Kelas belum di-assign.");
        return handleLogout();
    }

    WaliState.sekolahId = user.sekolah_id;
    WaliState.kelasAssigned = user.kelas_assigned;
    WaliState.namaSekolah = user.sekolah.nama_sekolah;

    document.getElementById('welcomeMessage').textContent = `Halo, Wali Kelas ${user.kelas_assigned}`;
    document.getElementById('infoKelasTitle').textContent = `${user.sekolah.nama_sekolah} - Kelas ${user.kelas_assigned}`;
    
    await loadSiswaKelas(); // Load data siswa kelas ini untuk validasi scan
    setupListeners();
    document.querySelector('.section-nav button[data-section="datangSection"]')?.click();
}

// === FUNGSI BARU: Load siswa di kelas ini ===
async function loadSiswaKelas() {
    const { data, error } = await supabase
        .from('siswa')
        .select('nisn, nama, kelas')
        .eq('sekolah_id', WaliState.sekolahId)
        .eq('kelas', WaliState.kelasAssigned);
    
    if(error) {
        console.error("Gagal memuat data siswa:", error);
        return;
    }
    WaliState.siswaDiKelas = data;
}

function setupListeners() {
    document.getElementById('logoutButton').addEventListener('click', handleLogout);

    document.querySelectorAll('.section-nav button').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.section-nav button').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            document.querySelectorAll('.content-section').forEach(s => s.style.display = 'none');
            
            const target = btn.dataset.section;
            document.getElementById(target).style.display = 'block';
            
            stopQrScanner(); // Hentikan scanner saat ganti tab

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

// === LOGIKA SCANNER (Diadaptasi dari dashboard.js) ===
function startQrScanner(type) {
    if (html5QrcodeScanner) {
        html5QrcodeScanner.clear().catch(err => console.warn("Clear error", err));
        html5QrcodeScanner = null;
    }

    const elementId = type === 'datang' ? 'qrScannerDatang' : 'qrScannerPulang';
    const resultEl = document.getElementById(type === 'datang' ? 'scanResultDatang' : 'scanResultPulang');
    
    if (resultEl) {
        resultEl.className = 'scan-result';
        resultEl.textContent = "Arahkan kamera ke QR Code Siswa...";
    }

    const onScanSuccess = async (decodedText) => {
        if (WaliState.isScanning) return;
        
        WaliState.isScanning = true;
        if (html5QqrcodeScanner) html5QrcodeScanner.pause(true);

        await processPresensiWali(decodedText, type);

        setTimeout(() => {
            WaliState.isScanning = false;
            if (html5QrcodeScanner) {
                html5QrcodeScanner.resume();
                if (resultEl) resultEl.innerHTML = "Siap memindai berikutnya...";
            }
        }, 2500); 
    };

    const config = { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 };
    html5QrcodeScanner = new Html5QrcodeScanner(elementId, config, false);
    html5QrcodeScanner.render(onScanSuccess, () => {});
}

function stopQrScanner() {
    if (html5QrcodeScanner) {
        try { html5QrcodeScanner.clear(); } catch (e) { console.warn(e); }
        html5QrcodeScanner = null;
    }
}

async function processPresensiWali(nisn, type) {
    const resultEl = document.getElementById(type === 'datang' ? 'scanResultDatang' : 'scanResultPulang');
    
    // Validasi: Apakah siswa ini ada di kelas yang dipegang wali kelas?
    const siswa = WaliState.siswaDiKelas.find(s => s.nisn == nisn);

    if (!siswa) {
        playSound('error');
        resultEl.className = 'scan-result error';
        resultEl.innerHTML = `<strong>GAGAL:</strong><br>Siswa dengan NISN ${nisn}<br>bukan dari kelas ${WaliState.kelasAssigned}.`;
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
            resultEl.innerHTML = `<strong>DITOLAK:</strong><br>${siswa.nama}<br>Sudah absen datang.`;
        } else {
            const { error } = await supabase.from('presensi').insert({ nisn_siswa: nisn, waktu_datang: new Date(), sekolah_id: WaliState.sekolahId });
            if (error) { resultEl.textContent = "Gagal simpan."; } 
            else {
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
            resultEl.innerHTML = `<strong>DITOLAK:</strong><br>${siswa.nama}<br>Belum presensi datang.`;
        } else if (logHarian.waktu_pulang) {
            playSound('error');
            resultEl.className = 'scan-result error';
            resultEl.innerHTML = `<strong>DITOLAK:</strong><br>${siswa.nama}<br>Sudah absen pulang.`;
        } else {
            const { error } = await supabase.from('presensi').update({ waktu_pulang: new Date() }).eq('id', logHarian.id);
            if (error) { resultEl.textContent = "Gagal simpan."; }
            else {
                playSound('success');
                resultEl.className = 'scan-result success';
                resultEl.innerHTML = `<strong>BERHASIL PULANG:</strong><br>${siswa.nama}`;
                loadDailyLog('pulang');
            }
        }
    }
}

// === LOGIKA MONITORING (Tabel) ===
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
        return;
    }
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
