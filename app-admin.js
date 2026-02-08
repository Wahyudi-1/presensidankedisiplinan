// File: app-admin.js
// Purpose: Logic for the Super Admin Panel.
// Version: 3.2 (Added Edit Feature & Fixed Create Wali Kelas)

import { supabase } from './config.js';
import { showLoading, showStatusMessage } from './utils.js';

const AppStateAdmin = {
    schools: [],
    users: [],
    isInitialized: false,
    editingUserId: null // Untuk melacak user mana yang sedang diedit
};

// ====================================================================
// 1. INITIALIZATION
// ====================================================================
async function initAdminPage(session) {
    if (AppStateAdmin.isInitialized) return;
    if (!session) return window.location.replace('index.html');
    
    try {
        const { data: userProfile, error } = await supabase
            .from('pengguna').select('role').eq('id', session.user.id).single();
        
        if (error || userProfile?.role?.trim().toLowerCase() !== 'super_admin') {
            alert('ACCESS DENIED!');
            await supabase.auth.signOut();
            window.location.replace('index.html');
            return;
        }
        AppStateAdmin.isInitialized = true;
        document.getElementById('welcomeMessage').textContent = `Super Admin: ${session.user.email}`;
        setupEventListeners();
        await loadAdminData();
    } catch (err) {
        console.error(err);
    }
}

supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') initAdminPage(session);
    else if (event === 'SIGNED_OUT') window.location.replace('index.html');
});

// ====================================================================
// 2. DATA MANAGEMENT
// ====================================================================
async function loadAdminData() {
    showLoading(true);
    try {
        const [schoolsReq, usersReq] = await Promise.all([
            supabase.from('sekolah').select('*').order('nama_sekolah', { ascending: true }),
            supabase.from('pengguna')
                .select(`id, email, sekolah_id, role, kelas_assigned, sekolah(nama_sekolah)`)
                .neq('role', 'super_admin') 
                .order('email', { ascending: true })
        ]);

        if (schoolsReq.error) throw new Error(schoolsReq.error.message);
        if (usersReq.error) throw new Error(usersReq.error.message);

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

function renderUsersTable() {
    const tableBody = document.getElementById('usersTableBody');
    if (!tableBody) return;
    
    if (AppStateAdmin.users.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="3" align="center">No users found.</td></tr>`;
        return;
    }
    
    tableBody.innerHTML = AppStateAdmin.users.map(user => {
        const schoolName = user.sekolah?.nama_sekolah || `<span style="color:red">No School</span>`;
        
        let roleBadge = '';
        if (user.role === 'wali_kelas') {
            roleBadge = `<br><span class="badge" style="background:#e3f2fd; color:#0d47a1; padding:2px 6px; font-size:0.8em; border-radius:4px;">Wali Kelas: ${user.kelas_assigned || '?'}</span>`;
        } else {
            roleBadge = `<br><span class="badge" style="background:#e8f5e9; color:#2e7d32; padding:2px 6px; font-size:0.8em; border-radius:4px;">Admin Sekolah</span>`;
        }

        // TAMBAHKAN TOMBOL EDIT DI SINI
        const actionButtons = `
            <button class="btn btn-sm btn-secondary" onclick="window.handleEditUser('${user.id}')">Edit</button>
            <button class="btn btn-sm btn-danger" onclick="window.handleDeleteUser('${user.id}', '${user.email}')">Hapus</button>
        `;

        return `<tr>
            <td>${user.email}</td>
            <td><strong>${schoolName}</strong>${roleBadge}</td>
            <td style="text-align: right; white-space: nowrap; gap:5px; display:flex; justify-content:flex-end;">${actionButtons}</td>
        </tr>`;
    }).join('');
}

function populateSchoolDropdown() {
    const select = document.getElementById('userSchoolLink');
    if (!select) return;
    // Simpan value lama jika sedang edit
    const currentValue = select.value;
    select.innerHTML = '<option value="">-- Pilih Sekolah --</option>';
    AppStateAdmin.schools.forEach(school => {
        const option = document.createElement('option');
        option.value = school.id;
        option.textContent = school.nama_sekolah;
        select.appendChild(option);
    });
    if(currentValue) select.value = currentValue;
}

// ====================================================================
// 3. ACTION HANDLERS
// ====================================================================

function resetUserForm() {
    document.getElementById('formPengguna').reset();
    AppStateAdmin.editingUserId = null;
    
    // Kembalikan tombol ke mode "Buat"
    const btn = document.querySelector('#formPengguna button[type="submit"]');
    btn.textContent = '+ Buat & Tautkan Pengguna';
    btn.classList.remove('btn-accent');
    btn.classList.add('btn-success');

    // Reset input
    document.getElementById('userEmail').disabled = false; // Email bisa diedit saat create, tapi readonly saat edit (opsional)
    document.getElementById('groupKelasInput').style.display = 'none';
    
    // Tampilkan tombol Batal jika ada
    const cancelBtn = document.getElementById('cancelEditUserBtn');
    if(cancelBtn) cancelBtn.remove();
}

function setupEventListeners() {
    // 1. Add/Edit School (Kode Sekolah tetap sama...)
    document.getElementById('formTambahSekolah')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const schoolId = document.getElementById('schoolIdInput').value;
        const payload = {
            nama_sekolah: document.getElementById('schoolNameInput').value.trim(),
            slug: document.getElementById('schoolSlugInput').value.trim().toLowerCase(),
            logo_url: document.getElementById('schoolLogoInput').value.trim() || null
        };
        showLoading(true);
        let result = schoolId 
            ? await supabase.from('sekolah').update(payload).eq('id', schoolId)
            : await supabase.from('sekolah').insert(payload);
        showLoading(false);
        if (result.error) showStatusMessage(result.error.message, 'error');
        else {
            showStatusMessage('Sekolah berhasil disimpan.', 'success');
            document.getElementById('formTambahSekolah').reset();
            document.getElementById('schoolIdInput').value = '';
            document.getElementById('cancelEditButton').style.display = 'none';
            document.getElementById('submitSchoolButton').textContent = '+ Tambah Sekolah';
            await loadAdminData();
        }
    });
    document.getElementById('cancelEditButton')?.addEventListener('click', () => {
        document.getElementById('formTambahSekolah').reset();
        document.getElementById('schoolIdInput').value = '';
        document.getElementById('cancelEditButton').style.display = 'none';
        document.getElementById('submitSchoolButton').textContent = '+ Tambah Sekolah';
    });

    // 2. Add/Edit USER (LOGIC UPDATE ADA DI SINI)
    document.getElementById('formPengguna')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const email = document.getElementById('userEmail').value.trim();
        const password = document.getElementById('userPassword').value;
        const schoolId = document.getElementById('userSchoolLink').value;
        const role = document.getElementById('userRole').value;
        const kelas = document.getElementById('userKelas').value.trim();

        if (!email || !schoolId) return showStatusMessage('Email dan Sekolah wajib diisi.', 'error');
        if (role === 'wali_kelas' && !kelas) return showStatusMessage('Nama Kelas wajib diisi untuk Wali Kelas.', 'error');

        showLoading(true);

        // A. MODE EDIT (UPDATE)
        if (AppStateAdmin.editingUserId) {
            // Update Data Profil (Public Table)
            const updatePayload = {
                sekolah_id: schoolId,
                role: role,
                kelas_assigned: (role === 'wali_kelas') ? kelas : null
                // Catatan: Email di tabel pengguna sebaiknya tidak diubah sembarangan jika tidak sinkron dengan Auth
            };

            const { error: dbError } = await supabase
                .from('pengguna')
                .update(updatePayload)
                .eq('id', AppStateAdmin.editingUserId);

            // Update Password jika diisi (Optional via Edge Function)
            if (password) {
                await supabase.functions.invoke('quick-task', { 
                    body: { action: 'updateUserPassword', payload: { userId: AppStateAdmin.editingUserId, password: password } } 
                });
            }

            showLoading(false);
            if (dbError) {
                showStatusMessage(`Gagal update: ${dbError.message}`, 'error');
            } else {
                showStatusMessage('Data pengguna diperbarui!', 'success');
                resetUserForm();
                await loadAdminData();
            }

        } 
        // B. MODE CREATE (BARU)
        else {
            if (!password) {
                showLoading(false);
                return showStatusMessage('Password wajib diisi untuk user baru.', 'error');
            }

            // Panggil Edge Function
            const { data, error } = await supabase.functions.invoke('quick-task', { 
                body: { 
                    action: 'createUser', 
                    payload: { 
                        email, password, schoolId, role, 
                        kelasAssigned: (role === 'wali_kelas') ? kelas : null
                    } 
                } 
            });
            
            showLoading(false);
            if (error || (data && data.error)) {
                showStatusMessage(`Gagal buat user: ${error?.message || data?.error}`, 'error');
            } else {
                showStatusMessage(`User ${email} berhasil dibuat!`, 'success');
                resetUserForm();
                await loadAdminData();
            }
        }
    });

    document.getElementById('logoutButton')?.addEventListener('click', async () => {
        if (confirm('Logout?')) {
            await supabase.auth.signOut();
            window.location.replace('index.html');
        }
    });
}

// Global Functions

// EDIT USER HANDLER
window.handleEditUser = function(userId) {
    const user = AppStateAdmin.users.find(u => u.id === userId);
    if (!user) return;

    AppStateAdmin.editingUserId = userId;

    // Isi Form
    document.getElementById('userEmail').value = user.email;
    document.getElementById('userEmail').disabled = true; // Email dikunci agar aman
    document.getElementById('userPassword').value = ''; // Kosongkan password (hanya isi jika ingin ubah)
    document.getElementById('userPassword').placeholder = "Kosongkan jika tidak ubah password";
    
    document.getElementById('userSchoolLink').value = user.sekolah_id;
    document.getElementById('userRole').value = user.role || 'admin_sekolah';
    
    // Trigger logika tampilan input kelas
    window.toggleKelasInput(); 
    if (user.role === 'wali_kelas') {
        document.getElementById('userKelas').value = user.kelas_assigned || '';
    }

    // Ubah tampilan tombol
    const submitBtn = document.querySelector('#formPengguna button[type="submit"]');
    submitBtn.textContent = 'Simpan Perubahan';
    submitBtn.classList.remove('btn-success');
    submitBtn.classList.add('btn-accent');

    // Tambahkan tombol Batal jika belum ada
    if (!document.getElementById('cancelEditUserBtn')) {
        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.id = 'cancelEditUserBtn';
        cancelBtn.className = 'btn btn-secondary';
        cancelBtn.textContent = 'Batal';
        cancelBtn.style.marginRight = '10px';
        cancelBtn.onclick = resetUserForm;
        submitBtn.parentNode.insertBefore(cancelBtn, submitBtn);
    }

    // Scroll ke form
    document.getElementById('formPengguna').scrollIntoView({ behavior: 'smooth' });
};

// Fungsi helper toggle input kelas (harus global agar bisa dipanggil onchange di HTML)
window.toggleKelasInput = function() {
    const role = document.getElementById('userRole').value;
    const div = document.getElementById('groupKelasInput');
    if(role === 'wali_kelas') {
        div.style.display = 'block';
        document.getElementById('userKelas').required = true;
    } else {
        div.style.display = 'none';
        document.getElementById('userKelas').required = false;
        document.getElementById('userKelas').value = '';
    }
};

window.handleEditSchool = function(id) {
    const s = AppStateAdmin.schools.find(x => x.id === id);
    if(!s) return;
    document.getElementById('schoolIdInput').value = s.id;
    document.getElementById('schoolNameInput').value = s.nama_sekolah;
    document.getElementById('schoolSlugInput').value = s.slug || '';
    document.getElementById('schoolLogoInput').value = s.logo_url || '';
    document.getElementById('submitSchoolButton').textContent = 'Update School';
    document.getElementById('cancelEditButton').style.display = 'inline-block';
    document.getElementById('formTambahSekolah').scrollIntoView({behavior:'smooth'});
};

window.handleDeleteSchool = async function(id, name) {
    if(prompt(`Ketik "${name}" untuk konfirmasi hapus:`) !== name) return;
    showLoading(true);
    const { error } = await supabase.from('sekolah').delete().eq('id', id);
    showLoading(false);
    if(error) showStatusMessage(error.message, 'error');
    else { showStatusMessage('Sekolah dihapus.', 'success'); await loadAdminData(); }
};

window.handleDeleteUser = async function(id, email) {
    if (!confirm(`Hapus user ${email}?`)) return;
    showLoading(true);
    const { data, error } = await supabase.functions.invoke('quick-task', {
        body: { action: 'deleteUser', payload: { userId: id } }
    });
    showLoading(false);
    if (error || (data && data.error)) showStatusMessage(`Gagal hapus: ${error?.message}`, 'error');
    else { showStatusMessage('User dihapus.', 'success'); await loadAdminData(); }
};
