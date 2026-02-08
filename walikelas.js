// File: walikelas.js
import { supabase } from './config.js';
import { showLoading, showStatusMessage } from './utils.js';
import { handleLogout } from './auth.js';

let WaliState = {
    sekolahId: null,
    kelasAssigned: null,
    namaSekolah: ''
};

export async function initWaliKelasPage() {
    // 1. Cek User & Profile
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

    // 2. Update UI
    document.getElementById('welcomeMessage').textContent = `Halo, Wali Kelas ${user.kelas_assigned}`;
    document.getElementById('infoKelasTitle').textContent = `${user.sekolah.nama_sekolah} - Kelas ${user.kelas_assigned}`;
    
    setupListeners();
    loadMonitoring('datang'); // Load default
}

function setupListeners() {
    document.getElementById('logoutButton').addEventListener('click', handleLogout);

    // Navigasi Tab
    document.querySelectorAll('.section-nav button').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.section-nav button').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            document.querySelectorAll('.content-section').forEach(s => s.style.display = 'none');
            
            const target = btn.dataset.section;
            document.getElementById(target).style.display = 'block';

            if(target === 'datangSection') loadMonitoring('datang');
            if(target === 'pulangSection') loadMonitoring('pulang');
        });
    });

    document.getElementById('refreshDatang').addEventListener('click', () => loadMonitoring('datang'));
    document.getElementById('refreshPulang').addEventListener('click', () => loadMonitoring('pulang'));
    document.getElementById('btnCariRekap').addEventListener('click', loadRekap);
    
    // Set Default Date
    document.getElementById('tglRekap').value = new Date().toISOString().split('T')[0];
}

// === LOGIC MONITORING ===
async function loadMonitoring(type) {
    showLoading(true);
    const today = new Date();
    today.setHours(0,0,0,0);

    const tableId = type === 'datang' ? 'tableBodyDatang' : 'tableBodyPulang';
    
    // QUERY PENTING: Filter berdasarkan kelas siswa
    // Syntax: siswa!inner(kelas) artinya kita join tabel siswa DAN wajib filter kolom kelasnya
    let query = supabase
        .from('presensi')
        .select(`
            waktu_datang, waktu_pulang, status,
            siswa!inner ( nisn, nama, kelas )
        `)
        .eq('sekolah_id', WaliState.sekolahId)
        .eq('siswa.kelas', WaliState.kelasAssigned) // <--- FILTER KELAS DISINI
        .gte('waktu_datang', today.toISOString())
        .order('waktu_datang', { ascending: false });

    if (type === 'pulang') {
        query = query.not('waktu_pulang', 'is', null);
    }

    const { data, error } = await query;
    showLoading(false);

    const tbody = document.getElementById(tableId);
    if (error) {
        console.error(error);
        tbody.innerHTML = `<tr><td colspan="4">Gagal memuat data.</td></tr>`;
        return;
    }

    if (data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" align="center">Belum ada data siswa ${WaliState.kelasAssigned}.</td></tr>`;
        return;
    }

    tbody.innerHTML = data.map(row => {
        const time = type === 'datang' ? row.waktu_datang : row.waktu_pulang;
        const timeStr = new Date(time).toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit'});
        
        // Baris HTML
        let html = `<tr>
            <td>${timeStr}</td>
            <td>${row.siswa.nisn}</td>
            <td>${row.siswa.nama}</td>`;
        
        if (type === 'datang') {
            html += `<td><span style="background:#d4edda; padding:2px 5px; border-radius:4px; font-size:0.8em;">Hadir</span></td>`;
        }
        
        html += `</tr>`;
        return html;
    }).join('');
}

// === LOGIC REKAP ===
async function loadRekap() {
    const tgl = document.getElementById('tglRekap').value;
    if (!tgl) return alert("Pilih tanggal dulu.");

    showLoading(true);
    const start = new Date(tgl); start.setHours(0,0,0,0);
    const end = new Date(tgl); end.setHours(23,59,59,999);

    const { data, error } = await supabase
        .from('presensi')
        .select(`
            waktu_datang, waktu_pulang, status,
            siswa!inner ( nisn, nama, kelas )
        `)
        .eq('sekolah_id', WaliState.sekolahId)
        .eq('siswa.kelas', WaliState.kelasAssigned) // <--- FILTER KELAS LAGI
        .gte('waktu_datang', start.toISOString())
        .lte('waktu_datang', end.toISOString())
        .order('siswa(nama)', { ascending: true }); // Urutkan berdasarkan nama siswa

    showLoading(false);
    const tbody = document.getElementById('tableBodyRekap');

    if (error) {
        console.error(error);
        return showStatusMessage('Gagal memuat rekap.', 'error');
    }

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
