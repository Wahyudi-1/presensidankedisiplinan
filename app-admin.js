/**
 * =================================================================
 * SCRIPT PANEL SUPER ADMIN - (SOLUSI RADIKAL & FINAL)
 * =================================================================
 * @version 3.0 - Radical Overwrite Strategy
 * @author Gemini AI Expert for User
 *
 * Catatan Perbaikan:
 * - [RADICAL FIX] Mengubah logika `handleChangeUserSchool` untuk tidak
 *   lagi membaca metadata lama. Sebagai gantinya, ia akan langsung
 *   menimpa metadata dengan objek baru yang bersih untuk menghindari
 *   masalah data korup.
 */

// ====================================================================
// KONFIGURASI GLOBAL
// ====================================================================
const SUPABASE_URL = 'https://qjlyqwyuotobnzllelta.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqbHlxd3l1b3RvYm56bGxlbHRhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM4NDk2NTAsImV4cCI6MjA2OTQyNTY1MH0.Bm3NUiQ6VtKuTwCDFOR-d7O2uodVXc6MgvRSPnAwkSE';

const { createClient } = window.supabase;
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const AppStateAdmin = {
    schools: [],
    users: []
};

// ====================================================================
// INISIALISASI
// ====================================================================

async function checkSuperAdminAccess() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
        window.location.replace('index.html');
        return;
    }
    if (session.user.user_metadata?.is_super_admin !== true) {
        alert('AKSES DITOLAK! Halaman ini hanya untuk Super Administrator.');
        window.location.replace('dashboard.html');
        return;
    }
    document.getElementById('welcomeMessage').textContent = `Admin: ${session.user.email}`;
    await loadAdminData();
    setupEventListeners();
}

async function loadAdminData() {
    showLoading(true);
    const [schoolsResponse, usersResponse] = await Promise.all([
        supabase.from('sekolah').select('*').order('nama_sekolah'),
        supabase.rpc('admin_get_all_users')
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

// ... SEMUA FUNGSI RENDER TETAP SAMA ...
function renderSchoolsTable() {
    const tableBody = document.getElementById('schoolsTableBody');
    if (!tableBody) return;
    tableBody.innerHTML = AppStateAdmin.schools.map(school => `<tr><td>${school.nama_sekolah}</td><td><button class="btn btn-sm btn-danger" onclick="handleDeleteSchool('${school.id}', '${school.nama_sekolah}')">Hapus</button></td></tr>`).join('') || `<tr><td colspan="2" style="text-align: center;">Belum ada sekolah terdaftar.</td></tr>`;
}
function renderUsersTable() {
    const tableBody = document.getElementById('usersTableBody');
    if (!tableBody) return;
    tableBody.innerHTML = AppStateAdmin.users.map(user => {
        const schoolId = user.raw_user_meta_data?.sekolah_id;
        const linkedSchool = AppStateAdmin.schools.find(s => s.id === schoolId);
        const schoolName = linkedSchool ? linkedSchool.nama_sekolah : '<span style="color: #e74c3c;">Belum Tertaut</span>';
        return `<tr><td>${user.email}</td><td>${schoolName}</td><td><button class="btn btn-sm btn-secondary" onclick="handleChangeUserSchool('${user.id}', '${user.email}')">Ubah</button><button class="btn btn-sm btn-danger" onclick="handleDeleteUser('${user.id}', '${user.email}')">Hapus</button></td></tr>`;
    }).join('') || `<tr><td colspan="3" style="text-align: center;">Belum ada pengguna terdaftar.</td></tr>`;
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
// EVENT HANDLERS
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
    if (!email || !password || !schoolId) return showStatusMessage('Harap isi semua field.', 'error');
    if (password.length < 6) return showStatusMessage('Password minimal 6 karakter.', 'error');

    showLoading(true);
    const { data, error } = await supabase.functions.invoke('quick-task', { body: { action: 'createUser', payload: { email, password, schoolId } } });
    showLoading(false);
    if (error) {
        const errorMessage = data?.error || error.message;
        return showStatusMessage(`Gagal membuat pengguna: ${errorMessage}`, 'error');
    }
    showStatusMessage(`Pengguna ${email} berhasil dibuat dan ditautkan.`, 'success');
    event.target.reset();
    await loadAdminData();
}

async function handleChangeUserSchool(userId, userEmail) {
    const schoolOptions = AppStateAdmin.schools.map((school, index) => `${index + 1}: ${school.nama_sekolah}`).join('\n');
    const choice = prompt(`Pilih sekolah baru untuk ${userEmail}:\n\n${schoolOptions}\n\nMasukkan nomor pilihan:`);
    if (!choice) return;
    
    const choiceIndex = parseInt(choice, 10) - 1;
    if (isNaN(choiceIndex) || !AppStateAdmin.schools[choiceIndex]) return alert('Pilihan tidak valid.');
    
    const selectedSchool = AppStateAdmin.schools[choiceIndex];
    if (!confirm(`Anda yakin ingin menautkan ${userEmail} ke sekolah "${selectedSchool.nama_sekolah}"?`)) return;

    showLoading(true);

    try {
        // ==================================================================
        // LOGIKA BARU YANG RADIKAL DAN SEDERHANA
        // ==================================================================

        // Cari pengguna di state aplikasi untuk memeriksa status super_admin.
        const user = AppStateAdmin.users.find(u => u.id === userId);
        const isSuperAdmin = user?.raw_user_meta_data?.is_super_admin === true;

        // Buat objek metadata baru yang 100% bersih dari nol.
        const newCleanMetaData = {
            sekolah_id: selectedSchool.id
        };

        // Jika pengguna adalah super admin, pastikan status itu tidak hilang.
        if (isSuperAdmin) {
            newCleanMetaData.is_super_admin = true;
        }

        // Langsung panggil fungsi SET dengan objek yang bersih.
        // Kita tidak lagi memanggil 'admin_get_user_metadata'.
        const { error: setError } = await supabase.rpc('admin_set_user_metadata', {
            target_user_id: userId,
            new_metadata: newCleanMetaData
        });
        
        if (setError) throw setError;
        
        showLoading(false);
        showStatusMessage(`Pengguna ${userEmail} berhasil ditautkan ke ${selectedSchool.nama_sekolah}.`, 'success');
        await loadAdminData();

    } catch (error) {
        showLoading(false);
        showStatusMessage(`Terjadi error: ${error.message}`, 'error');
    }
}

// ... FUNGSI LAINNYA TETAP SAMA ...
async function handleDeleteSchool(schoolId, schoolName) {
    if (!confirm(`PERINGATAN:\nMenghapus sekolah "${schoolName}" akan menghapus SEMUA data terkait secara permanen.\n\nLanjutkan?`)) return;
    showLoading(true);
    const { error } = await supabase.from('sekolah').delete().eq('id', schoolId);
    showLoading(false);
    if (error) return showStatusMessage(`Gagal menghapus sekolah: ${error.message}`, 'error');
    showStatusMessage(`Sekolah "${schoolName}" berhasil dihapus.`, 'success');
    await loadAdminData();
}
async function handleDeleteUser(userId, userEmail) {
    if (!confirm(`Anda yakin ingin menghapus pengguna ${userEmail} secara permanen?`)) return;
    alert("Fungsionalitas hapus pengguna belum diimplementasikan.");
}
function showLoading(isLoading) {
    document.getElementById('loadingIndicator').style.display = isLoading ? 'flex' : 'none';
}
function showStatusMessage(message, type = 'info', duration = 5000) {
    const statusEl = document.getElementById('statusMessage');
    if (!statusEl) return alert(`${type.toUpperCase()}: ${message}`);
    statusEl.textContent = message;
    statusEl.className = `status-message ${type}`;
    statusEl.style.display = 'block';
    window.scrollTo(0, 0);
    setTimeout(() => { statusEl.style.display = 'none'; }, duration);
}

// ====================================================================
// ENTRY POINT
// ====================================================================
document.addEventListener('DOMContentLoaded', checkSuperAdminAccess);
