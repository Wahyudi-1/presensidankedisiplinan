/**
 * =================================================================
 * SCRIPT PANEL SUPER ADMIN - SISTEM PRESENSI QR
 * =================================================================
 * @version 1.2 - Added Change School Link Feature
 * @author Gemini AI Expert for User
 *
 * Catatan:
 * - File ini HANYA untuk halaman superadmin.html.
 * - Bergantung pada RLS bypass dan fungsi database (PostgreSQL Functions)
 *   yang telah dibuat di backend.
 * - [FITUR v1.2] Menambahkan fungsi handleChangeUserSchool untuk
 *   mengubah tautan sekolah pengguna yang sudah ada.
 */

// ====================================================================
// TAHAP 1: KONFIGURASI GLOBAL DAN STATE
// ====================================================================
const SUPABASE_URL = 'https://qjlyqwyuotobnzllelta.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqbHlxd3l1b3RvYm56bGxlbHRhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM4NDk2NTAsImV4cCI6MjA2OTQyNTY1MH0.Bm3NUiQ6VtKuTwCDFOR-d7O2uodVXc6MgvRSPnAwkSE';

const { createClient } = window.supabase;
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// State untuk menyimpan data yang dimuat
const AppStateAdmin = {
    schools: [],
    users: []
};

// ====================================================================
// TAHAP 2: KEAMANAN & INISIALISASI
// ====================================================================

/**
 * Fungsi ini adalah gerbang keamanan. Ia memeriksa apakah pengguna yang
 * mengakses halaman ini adalah Super Admin. Jika tidak, akan langsung
 * dialihkan.
 */
async function checkSuperAdminAccess() {
    const { data: { session }, error } = await supabase.auth.getSession();

    if (!session) {
        window.location.replace('index.html'); // Jika belum login, ke halaman login
        return;
    }

    const isSuperAdmin = session.user.user_metadata?.is_super_admin === true;

    if (!isSuperAdmin) {
        alert('AKSES DITOLAK! Halaman ini hanya untuk Super Administrator.');
        window.location.replace('dashboard.html'); // Jika bukan admin, ke dashboard biasa
        return;
    }

    // Jika berhasil lolos, tampilkan info admin dan muat data
    document.getElementById('welcomeMessage').textContent = `Admin: ${session.user.email}`;
    await loadAdminData();
    setupEventListeners();
}

/**
 * Memuat semua data awal yang diperlukan untuk panel admin.
 */
async function loadAdminData() {
    showLoading(true);
    // Promise.all untuk memuat data sekolah dan pengguna secara bersamaan
    const [schoolsResponse, usersResponse] = await Promise.all([
        supabase.from('sekolah').select('*').order('nama_sekolah'),
        supabase.rpc('admin_get_all_users') // Memanggil fungsi database yang aman
    ]);
    showLoading(false);

    if (schoolsResponse.error) return showStatusMessage(`Gagal memuat sekolah: ${schoolsResponse.error.message}`, 'error');
    if (usersResponse.error) return showStatusMessage(`Gagal memuat pengguna: ${usersResponse.error.message}`, 'error');
    
    AppStateAdmin.schools = schoolsResponse.data;
    AppStateAdmin.users = usersResponse.data;

    renderSchoolsTable();
    renderUsersTable();
    populateSchoolDropdown();
}

// ====================================================================
// TAHAP 3: FUNGSI RENDER (MENAMPILKAN DATA KE HTML)
// ====================================================================

function renderSchoolsTable() {
    const tableBody = document.getElementById('schoolsTableBody');
    if (!tableBody) return;
    tableBody.innerHTML = AppStateAdmin.schools.map(school => `
        <tr>
            <td>${school.nama_sekolah}</td>
            <td>
                <button class="btn btn-sm btn-danger" onclick="handleDeleteSchool('${school.id}', '${school.nama_sekolah}')">Hapus</button>
            </td>
        </tr>
    `).join('');
}

function renderUsersTable() {
    const tableBody = document.getElementById('usersTableBody');
    if (!tableBody) return;
    tableBody.innerHTML = AppStateAdmin.users.map(user => {
        const schoolId = user.raw_user_meta_data?.sekolah_id;
        const linkedSchool = AppStateAdmin.schools.find(s => s.id === schoolId);
        const schoolName = linkedSchool ? linkedSchool.nama_sekolah : '<span style="color: #e74c3c;">Belum Tertaut</span>';
        
        return `
            <tr>
                <td>${user.email}</td>
                <td>${schoolName}</td>
                <td>
                    <button class="btn btn-sm btn-secondary" onclick="handleChangeUserSchool('${user.id}', '${user.email}')">Ubah</button>
                    <button class="btn btn-sm btn-danger" onclick="handleDeleteUser('${user.id}', '${user.email}')">Hapus</button>
                </td>
            </tr>
        `;
    }).join('');
}

function populateSchoolDropdown() {
    const select = document.getElementById('userSchoolLink');
    if (!select) return;
    select.innerHTML = '<option value="">-- Pilih Sekolah untuk Ditautkan --</option>'; // Opsi default
    AppStateAdmin.schools.forEach(school => {
        const option = document.createElement('option');
        option.value = school.id;
        option.textContent = school.nama_sekolah;
        select.appendChild(option);
    });
}

// ====================================================================
// TAHAP 4: EVENT HANDLERS (AKSI PENGGUNA)
// ====================================================================

function setupEventListeners() {
    document.getElementById('formTambahSekolah')?.addEventListener('submit', handleCreateSchoolSubmit);
    document.getElementById('formPengguna')?.addEventListener('submit', handleCreateUserSubmit);
    document.getElementById('logoutButton')?.addEventListener('click', () => {
         if (confirm('Yakin ingin logout dari Panel Admin?')) {
            supabase.auth.signOut().then(() => window.location.href = 'index.html');
         }
    });
}

async function handleCreateSchoolSubmit(event) {
    event.preventDefault();
    const schoolName = document.getElementById('schoolNameInput').value;
    if (!schoolName) return;

    showLoading(true);
    const { error } = await supabase.from('sekolah').insert({ nama_sekolah: schoolName });
    showLoading(false);

    if (error) return showStatusMessage(`Gagal membuat sekolah: ${error.message}`, 'error');
    
    showStatusMessage(`Sekolah "${schoolName}" berhasil dibuat.`, 'success');
    event.target.reset();
    await loadAdminData();
}

async function handleCreateUserSubmit(event) {
    event.preventDefault();
    const email = document.getElementById('userEmail').value;
    const password = document.getElementById('userPassword').value;
    const schoolId = document.getElementById('userSchoolLink').value;

    if (!email || !password || !schoolId) {
        return showStatusMessage('Harap isi semua field: Email, Password, dan Sekolah.', 'error');
    }

    if (password.length < 6) {
        return showStatusMessage('Password minimal 6 karakter.', 'error');
    }

    showLoading(true);
    const { data, error } = await supabase.rpc('admin_create_user_for_school', {
        user_email: email,
        user_password: password,
        target_school_id: schoolId
    });
    showLoading(false);

    if (error) return showStatusMessage(`Gagal membuat pengguna: ${error.message}`, 'error');

    showStatusMessage(`Pengguna ${data.email} berhasil dibuat dan ditautkan.`, 'success');
    event.target.reset();
    await loadAdminData();
}

async function handleDeleteSchool(schoolId, schoolName) {
    if (!confirm(`PERINGATAN:\nAnda akan menghapus sekolah "${schoolName}".\n\nSEMUA DATA SISWA, PRESENSI, DAN DISIPLIN yang terkait dengan sekolah ini akan HILANG PERMANEN.\n\nLanjutkan?`)) {
        return;
    }
    showLoading(true);
    const { error } = await supabase.from('sekolah').delete().eq('id', schoolId);
    showLoading(false);

    if (error) return showStatusMessage(`Gagal menghapus sekolah: ${error.message}`, 'error');
    
    showStatusMessage(`Sekolah "${schoolName}" berhasil dihapus.`, 'success');
    await loadAdminData();
}

async function handleChangeUserSchool(userId, userEmail) {
    const schoolOptions = AppStateAdmin.schools.map((school, index) => 
        `${index + 1}: ${school.nama_sekolah}`
    ).join('\n');

    const promptMessage = `Pilih sekolah baru untuk pengguna:\n${userEmail}\n\n${schoolOptions}\n\nMasukkan nomor pilihan:`;
    
    const choice = prompt(promptMessage);

    if (!choice) return;

    const choiceIndex = parseInt(choice, 10) - 1;

    if (isNaN(choiceIndex) || choiceIndex < 0 || choiceIndex >= AppStateAdmin.schools.length) {
        alert('Pilihan tidak valid. Harap masukkan nomor yang benar.');
        return;
    }

    const selectedSchool = AppStateAdmin.schools[choiceIndex];
    const newSchoolId = selectedSchool.id;

    if (!confirm(`Anda yakin ingin menautkan ${userEmail} ke sekolah "${selectedSchool.nama_sekolah}"?`)) {
        return;
    }

    showLoading(true);
    const { error } = await supabase.rpc('admin_link_user_to_school', {
        target_user_id: userId,
        target_school_id: newSchoolId
    });
    showLoading(false);

    if (error) {
        return showStatusMessage(`Gagal mengubah tautan: ${error.message}`, 'error');
    }

    showStatusMessage(`Pengguna ${userEmail} berhasil ditautkan ke ${selectedSchool.nama_sekolah}.`, 'success');
    await loadAdminData();
}

async function handleDeleteUser(userId, userEmail) {
    if (!confirm(`Anda yakin ingin menghapus pengguna ${userEmail} secara permanen?`)) {
        return;
    }
    alert("Fungsionalitas hapus pengguna memerlukan pembuatan fungsi 'admin_delete_user' di SQL Editor untuk keamanan.");
    // Untuk mengaktifkan, buat fungsi SQL berikut:
    // CREATE OR REPLACE FUNCTION public.admin_delete_user(user_id UUID)
    // RETURNS TEXT AS $$
    // BEGIN
    //   IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'Akses Ditolak'; END IF;
    //   DELETE FROM auth.users WHERE id = user_id;
    //   RETURN 'Pengguna berhasil dihapus';
    // END;
    // $$ LANGUAGE plpgsql SECURITY DEFINER;
    //
    // Lalu uncomment kode di bawah ini:
    /*
    showLoading(true);
    const { error } = await supabase.rpc('admin_delete_user', { user_id: userId });
    showLoading(false);
    if (error) return showStatusMessage(`Gagal menghapus pengguna: ${error.message}`, 'error');
    showStatusMessage(`Pengguna ${userEmail} berhasil dihapus.`, 'success');
    await loadAdminData();
    */
}


// ====================================================================
// TAHAP 5: FUNGSI PEMBANTU
// ====================================================================
function showLoading(isLoading) {
    const loader = document.getElementById('loadingIndicator');
    if (loader) {
        loader.style.display = isLoading ? 'flex' : 'none';
    } else if (isLoading) {
        console.log('Loading...');
    }
}

function showStatusMessage(message, type = 'info', duration = 5000) {
    const statusEl = document.getElementById('statusMessage');
    if (!statusEl) {
        alert(`${type.toUpperCase()}: ${message}`);
        return;
    }
    statusEl.textContent = message;
    statusEl.className = `status-message ${type}`;
    statusEl.style.display = 'block';
    window.scrollTo(0, 0);
    setTimeout(() => { statusEl.style.display = 'none'; }, duration);
}


// ====================================================================
// TAHAP 6: ENTRY POINT
// ====================================================================
document.addEventListener('DOMContentLoaded', checkSuperAdminAccess);
