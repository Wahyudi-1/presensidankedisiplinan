/**
 * =================================================================
 * SCRIPT PANEL SUPER ADMIN - SISTEM PRESENSI QR (DENGAN PERBAIKAN)
 * =================================================================
 * @version 1.4 - Fixed Edge Function name mismatch
 * @author Gemini AI Expert for User
 *
 * Catatan Perbaikan:
 * - [FIX] Mengubah nama panggilan Edge Function dari 'admin-user-manager'
 *   menjadi 'quick-task' agar sesuai dengan nama fungsi yang sebenarnya
 *   ter-deploy di Supabase.
 * - [PREVENTIVE FIX] Menambahkan parsing JSON yang aman di handleChangeUserSchool.
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

async function checkSuperAdminAccess() {
    const { data: { session }, error } = await supabase.auth.getSession();

    if (!session) {
        window.location.replace('index.html');
        return;
    }

    const isSuperAdmin = session.user.user_metadata?.is_super_admin === true;

    if (!isSuperAdmin) {
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
    `).join('') || `<tr><td colspan="2" style="text-align: center;">Belum ada sekolah terdaftar.</td></tr>`;
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

    // =======================================================================
    // PERUBAHAN UTAMA DI SINI: Mengganti 'admin-user-manager' menjadi 'quick-task'
    // =======================================================================
    const { data, error } = await supabase.functions.invoke('quick-task', {
        body: {
            action: 'createUser',
            payload: {
                email: email,
                password: password,
                schoolId: schoolId
            }
        }
    });
    // =======================================================================
    // AKHIR DARI PERUBAHAN
    // =======================================================================
    
    showLoading(false);

    // Penanganan error yang lebih spesifik dari Edge Function
    if (error) {
         // Coba untuk mem-parsing error dari body respons jika ada
        const errorMessage = data?.error || error.message;
        return showStatusMessage(`Gagal membuat pengguna: ${errorMessage}`, 'error');
    }
    
    const userEmail = data.user ? data.user.email : email;
    showStatusMessage(`Pengguna ${userEmail} berhasil dibuat dan ditautkan.`, 'success');
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
        alert('Pilihan tidak valid.');
        return;
    }
    const selectedSchool = AppStateAdmin.schools[choiceIndex];
    if (!confirm(`Anda yakin ingin menautkan ${userEmail} ke sekolah "${selectedSchool.nama_sekolah}"?`)) {
        return;
    }

    showLoading(true);

    try {
        const { data: currentMetaText, error: getError } = await supabase.rpc('admin_get_user_metadata', { target_user_id: userId });
        if (getError) throw getError;

        let currentMetaData = {};
        if (currentMetaText) {
            try {
                currentMetaData = JSON.parse(currentMetaText);
            } catch (e) {
                console.warn("Gagal mem-parsing metadata, akan ditimpa.", e);
                currentMetaData = {};
            }
        }

        if (typeof currentMetaData !== 'object' || currentMetaData === null) {
            currentMetaData = {};
        }

        currentMetaData.sekolah_id = selectedSchool.id;

        const { error: setError } = await supabase.rpc('admin_set_user_metadata', {
            target_user_id: userId,
            new_metadata: currentMetaData
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

async function handleDeleteUser(userId, userEmail) {
    if (!confirm(`Anda yakin ingin menghapus pengguna ${userEmail} secara permanen?`)) {
        return;
    }
    alert("Fungsionalitas hapus pengguna memerlukan pembuatan Edge Function atau fungsi SQL 'admin_delete_user' untuk keamanan.");
}


// ====================================================================
// TAHAP 5: FUNGSI PEMBANTU
// ====================================================================
function showLoading(isLoading) {
    const loader = document.getElementById('loadingIndicator');
    if (loader) {
        loader.style.display = isLoading ? 'flex' : 'none';
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
