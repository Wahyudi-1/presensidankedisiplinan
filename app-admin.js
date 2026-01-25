// File: app-admin.js
// Tujuan: Logika untuk Panel Super Admin.
// Versi: 2.2 (Fix: Removed dependency on created_at column)

import { supabase } from './config.js';
import { showLoading, showStatusMessage } from './utils.js';

// State Internal Aplikasi
const AppStateAdmin = {
    schools: [],
    users: [],
    isInitialized: false,
    currentUserEmail: ''
};

// ====================================================================
// 1. INISIALISASI & OTENTIKASI
// ====================================================================

// Fungsi utama untuk memulai halaman admin
async function initAdminPage(session) {
    if (AppStateAdmin.isInitialized) return;
    
    if (!session) {
        window.location.replace('index.html');
        return;
    }

    try {
        // Cek Role di Database
        const { data: userProfile, error } = await supabase
            .from('pengguna')
            .select('role')
            .eq('id', session.user.id)
            .single();

        // Normalisasi role
        const userRole = userProfile?.role?.trim().toLowerCase();

        if (error || userRole !== 'super_admin') {
            console.warn("Akses ilegal terdeteksi.");
            alert('AKSES DITOLAK! Halaman ini hanya untuk Super Administrator.');
            await supabase.auth.signOut();
            window.location.replace('index.html');
            return;
        }

        // Jika lolos verifikasi:
        AppStateAdmin.isInitialized = true;
        AppStateAdmin.currentUserEmail = session.user.email;
        
        // Update UI
        const welcomeEl = document.getElementById('welcomeMessage');
        if (welcomeEl) welcomeEl.textContent = `Admin: ${session.user.email}`;

        // Setup Event Listener & Muat Data
        setupEventListeners();
        await loadAdminData();

    } catch (err) {
        console.error("Kesalahan inisialisasi:", err);
        showStatusMessage("Terjadi kesalahan sistem saat memuat profil.", "error");
    }
}

// Listener Perubahan Auth
supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
        initAdminPage(session);
    } else if (event === 'SIGNED_OUT') {
        AppStateAdmin.isInitialized = false;
        window.location.replace('index.html');
    }
});

// ====================================================================
// 2. MANAJEMEN DATA (LOAD & RENDER)
// ====================================================================

async function loadAdminData() {
    showLoading(true);
    try {
        // Request paralel untuk performa lebih cepat
        // PERBAIKAN: Mengurutkan user berdasarkan 'email', bukan 'created_at'
        const [schoolsReq, usersReq] = await Promise.all([
            supabase.from('sekolah').select('*').order('nama_sekolah', { ascending: true }),
            supabase.from('pengguna').select(`
                id, email, sekolah_id, role, 
                sekolah ( nama_sekolah )
            `).order('email', { ascending: true }) 
        ]);

        if (schoolsReq.error) throw new Error(`Gagal memuat sekolah: ${schoolsReq.error.message}`);
        if (usersReq.error) throw new Error(`Gagal memuat pengguna: ${usersReq.error.message}`);

        AppStateAdmin.schools = schoolsReq.data;
        AppStateAdmin.users = usersReq.data;

        renderSchoolsTable();
        renderUsersTable();
        populateSchoolDropdown();

    } catch (error) {
        showStatusMessage(error.message, 'error');
    } finally {
        showLoading(false);
    }
}

function renderSchoolsTable() {
    const tableBody = document.getElementById('schoolsTableBody');
    if (!tableBody) return;

    if (AppStateAdmin.schools.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="2" style="text-align: center; padding: 20px;">Belum ada sekolah terdaftar.</td></tr>`;
        return;
    }

    tableBody.innerHTML = AppStateAdmin.schools.map(school => `
        <tr>
            <td><strong>${school.nama_sekolah}</strong></td>
            <td style="text-align: right;">
                <button class="btn btn-sm btn-danger" 
                    onclick="handleDeleteSchool('${school.id}', '${school.nama_sekolah.replace(/'/g, "\\'")}')">
                    Hapus
                </button>
            </td>
        </tr>
    `).join('');
}

function renderUsersTable() {
    const tableBody = document.getElementById('usersTableBody');
    if (!tableBody) return;

    if (AppStateAdmin.users.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="3" style="text-align: center; padding: 20px;">Belum ada pengguna terdaftar.</td></tr>`;
        return;
    }

    tableBody.innerHTML = AppStateAdmin.users.map(user => {
        const schoolName = user.sekolah?.nama_sekolah 
            ? `<span style="color: var(--success-dark); font-weight:500;">${user.sekolah.nama_sekolah}</span>` 
            : `<span style="color: var(--danger-color); font-style:italic;">Belum Tertaut</span>`;
            
        const isSuperAdmin = user.role === 'super_admin';
        
        // Tombol aksi
        let actionButtons = '';
        if (isSuperAdmin) {
            actionButtons = `<span class="badge" style="background:#ccc; padding:2px 5px; border-radius:4px; font-size:0.8em;">Super Admin</span>`;
        } else {
            actionButtons = `
                <button class="btn btn-sm btn-secondary" onclick="handleChangeUserSchool('${user.id}', '${user.email}')">Ubah</button>
                <button class="btn btn-sm btn-danger" onclick="handleDeleteUser('${user.id}', '${user.email}')">Hapus</button>
            `;
        }

        return `
            <tr>
                <td>${user.email}</td>
                <td>${schoolName}</td>
                <td style="text-align: right; white-space: nowrap;">
                    ${actionButtons}
                </td>
            </tr>
        `;
    }).join('');
}

function populateSchoolDropdown() {
    const select = document.getElementById('userSchoolLink');
    if (!select) return;
    
    select.innerHTML = '<option value="">-- Pilih Sekolah untuk Ditautkan --</option>';
    AppStateAdmin.schools.forEach(school => {
        const option = document.createElement('option');
        option.value = school.id;
        option.textContent = school.nama_sekolah;
        select.appendChild(option);
    });
}

// ====================================================================
// 3. LOGIKA AKSI (HANDLERS)
// ====================================================================

function setupEventListeners() {
    // Form Tambah Sekolah
    document.getElementById('formTambahSekolah')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const nameInput = document.getElementById('schoolNameInput');
        const schoolName = nameInput.value.trim();
        
        if (!schoolName) return;

        showLoading(true);
        const { error } = await supabase.from('sekolah').insert({ nama_sekolah: schoolName });
        showLoading(false);

        if (error) {
            showStatusMessage(`Gagal: ${error.message}`, 'error');
        } else {
            showStatusMessage(`Sekolah "${schoolName}" berhasil ditambahkan.`, 'success');
            nameInput.value = '';
            await loadAdminData();
        }
    });

    // Form Tambah Pengguna (Memanggil Edge Function)
    document.getElementById('formPengguna')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('userEmail').value.trim();
        const password = document.getElementById('userPassword').value;
        const schoolId = document.getElementById('userSchoolLink').value;

        if (!email || !password || !schoolId) return showStatusMessage('Semua kolom wajib diisi.', 'error');
        if (password.length < 6) return showStatusMessage('Password minimal 6 karakter.', 'error');

        showLoading(true);
        // Memanggil Edge Function 'quick-task'
        const { data, error } = await supabase.functions.invoke('quick-task', {
            body: { 
                action: 'createUser', 
                payload: { email, password, schoolId } 
            }
        });
        showLoading(false);

        if (error || (data && data.error)) {
            const msg = error?.message || data?.error;
            showStatusMessage(`Gagal membuat pengguna: ${msg}`, 'error');
        } else {
            showStatusMessage(`Pengguna ${email} berhasil dibuat!`, 'success');
            document.getElementById('formPengguna').reset();
            await loadAdminData();
        }
    });

    // Tombol Logout
    document.getElementById('logoutButton')?.addEventListener('click', async () => {
        if (confirm('Keluar dari Panel Admin?')) {
            showLoading(true);
            await supabase.auth.signOut();
            window.location.replace('index.html');
        }
    });
}

// Fungsi Global Window
window.handleDeleteSchool = async function(schoolId, schoolName) {
    const verification = prompt(`PERINGATAN KERAS:\nMenghapus sekolah akan menghapus SEMUA data terkait (Siswa, Presensi, Pelanggaran).\n\nKetik nama sekolah "${schoolName}" untuk konfirmasi:`);
    
    if (verification !== schoolName) {
        if (verification !== null) alert("Penghapusan dibatalkan. Nama tidak cocok.");
        return;
    }

    showLoading(true);
    const { error } = await supabase.from('sekolah').delete().eq('id', schoolId);
    showLoading(false);

    if (error) {
        showStatusMessage(`Gagal menghapus: ${error.message}`, 'error');
    } else {
        showStatusMessage(`Sekolah "${schoolName}" telah dihapus.`, 'success');
        await loadAdminData();
    }
};

window.handleDeleteUser = async function(userId, userEmail) {
    if (!confirm(`Yakin ingin menghapus pengguna ${userEmail}?`)) return;

    showLoading(true);
    const { data, error } = await supabase.functions.invoke('quick-task', {
        body: { 
            action: 'deleteUser', 
            payload: { userId: userId } 
        }
    });
    showLoading(false);

    if (error || (data && data.error)) {
        showStatusMessage(`Gagal menghapus: ${error?.message || data?.error}`, 'error');
    } else {
        showStatusMessage(`Pengguna ${userEmail} berhasil dihapus.`, 'success');
        await loadAdminData();
    }
};

window.handleChangeUserSchool = async function(userId, userEmail) {
    const schoolList = AppStateAdmin.schools
        .map((s, i) => `${i + 1}. ${s.nama_sekolah}`)
        .join('\n');
        
    const input = prompt(`Pilih ID nomor sekolah baru untuk ${userEmail}:\n\n${schoolList}\n\nMasukkan Angka (1-${AppStateAdmin.schools.length}):`);
    
    if (!input) return;
    const index = parseInt(input) - 1;

    if (isNaN(index) || index < 0 || index >= AppStateAdmin.schools.length) {
        alert("Pilihan tidak valid.");
        return;
    }

    const selectedSchool = AppStateAdmin.schools[index];

    if (!confirm(`Pindahkan ${userEmail} ke sekolah "${selectedSchool.nama_sekolah}"?`)) return;

    showLoading(true);
    const { error } = await supabase
        .from('pengguna')
        .update({ sekolah_id: selectedSchool.id })
        .eq('id', userId);
    showLoading(false);

    if (error) {
        showStatusMessage(`Gagal update: ${error.message}`, 'error');
    } else {
        showStatusMessage(`Pengguna dipindahkan ke ${selectedSchool.nama_sekolah}`, 'success');
        await loadAdminData();
    }
};
