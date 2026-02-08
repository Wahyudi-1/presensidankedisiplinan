// File: app-admin.js
// Purpose: Logic for the Super Admin Panel.
// Version: 3.1 (Added Support for Creating Admin Sekolah & Wali Kelas)

import { supabase } from './config.js';
import { showLoading, showStatusMessage } from './utils.js';

// Application's Internal State
const AppStateAdmin = {
    schools: [],
    users: [],
    isInitialized: false,
};

// ====================================================================
// 1. INITIALIZATION & AUTHENTICATION
// ====================================================================
async function initAdminPage(session) {
    if (AppStateAdmin.isInitialized) return;
    if (!session) {
        window.location.replace('index.html');
        return;
    }
    try {
        const { data: userProfile, error } = await supabase
            .from('pengguna').select('role').eq('id', session.user.id).single();
            
        const userRole = userProfile?.role?.trim().toLowerCase();
        
        if (error || userRole !== 'super_admin') {
            alert('ACCESS DENIED! This page is for Super Administrators only.');
            await supabase.auth.signOut();
            window.location.replace('index.html');
            return;
        }
        
        AppStateAdmin.isInitialized = true;
        const welcomeEl = document.getElementById('welcomeMessage');
        if (welcomeEl) welcomeEl.textContent = `Admin: ${session.user.email}`;
        
        setupEventListeners();
        await loadAdminData();
        
    } catch (err) {
        console.error("Initialization Error:", err);
        showStatusMessage("A system error occurred while loading the profile.", "error");
    }
}

supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') initAdminPage(session);
    else if (event === 'SIGNED_OUT') window.location.replace('index.html');
});

// ====================================================================
// 2. DATA MANAGEMENT (LOAD & RENDER)
// ====================================================================
async function loadAdminData() {
    showLoading(true);
    try {
        const [schoolsReq, usersReq] = await Promise.all([
            // 1. Get Schools
            supabase.from('sekolah').select('*').order('nama_sekolah', { ascending: true }),
            
            // 2. Get Users (Exclude Super Admin themselves)
            // Added: 'role' and 'kelas_assigned' columns
            supabase.from('pengguna')
                .select(`id, email, sekolah_id, role, kelas_assigned, sekolah(nama_sekolah)`)
                .neq('role', 'super_admin') 
                .order('email', { ascending: true })
        ]);

        if (schoolsReq.error) throw new Error(`Failed to load schools: ${schoolsReq.error.message}`);
        if (usersReq.error) throw new Error(`Failed to load users: ${usersReq.error.message}`);

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
        tableBody.innerHTML = `<tr><td colspan="4" style="text-align: center; padding: 20px;">No schools registered yet.</td></tr>`;
        return;
    }
    
    tableBody.innerHTML = AppStateAdmin.schools.map(school => `
        <tr>
            <td><strong>${school.nama_sekolah}</strong></td>
            <td><code>${school.slug || '-'}</code></td>
            <td><a href="${school.logo_url || '#'}" target="_blank" rel="noopener noreferrer">${school.logo_url ? 'View Logo' : '-'}</a></td>
            <td style="text-align: right; display: flex; gap: 5px; justify-content: flex-end;">
                <button class="btn btn-sm btn-secondary" onclick="window.handleEditSchool('${school.id}')">
                    Edit
                </button>
                <button class="btn btn-sm btn-danger" 
                    onclick="window.handleDeleteSchool('${school.id}', '${school.nama_sekolah.replace(/'/g, "\\'")}')">
                    Delete
                </button>
            </td>
        </tr>
    `).join('');
}

function renderUsersTable() {
    const tableBody = document.getElementById('usersTableBody');
    if (!tableBody) return;
    
    if (AppStateAdmin.users.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="3" style="text-align: center; padding: 20px;">No users registered yet.</td></tr>`;
        return;
    }
    
    tableBody.innerHTML = AppStateAdmin.users.map(user => {
        const schoolName = user.sekolah?.nama_sekolah 
            ? `<span style="color: var(--text-color); font-weight:600;">${user.sekolah.nama_sekolah}</span>` 
            : `<span style="color: var(--danger-color); font-style:italic;">Not Linked</span>`;

        // Logic tampilan Role
        let roleBadge = '';
        if (user.role === 'wali_kelas') {
            roleBadge = `<br><span class="badge" style="background:#e3f2fd; color:#0d47a1; padding:2px 6px; font-size:0.8em; border-radius:4px;">Wali Kelas: ${user.kelas_assigned || '?'}</span>`;
        } else {
            roleBadge = `<br><span class="badge" style="background:#e8f5e9; color:#2e7d32; padding:2px 6px; font-size:0.8em; border-radius:4px;">Admin Sekolah</span>`;
        }

        const actionButtons = `<button class="btn btn-sm btn-danger" onclick="window.handleDeleteUser('${user.id}', '${user.email}')">Delete</button>`;

        return `<tr>
            <td>${user.email}</td>
            <td>
                ${schoolName}
                ${roleBadge}
            </td>
            <td style="text-align: right; white-space: nowrap;">${actionButtons}</td>
        </tr>`;
    }).join('');
}

function populateSchoolDropdown() {
    const select = document.getElementById('userSchoolLink');
    if (!select) return;
    select.innerHTML = '<option value="">-- Select a School --</option>';
    AppStateAdmin.schools.forEach(school => {
        const option = document.createElement('option');
        option.value = school.id;
        option.textContent = school.nama_sekolah;
        select.appendChild(option);
    });
}

// ====================================================================
// 3. ACTION LOGIC (HANDLERS)
// ====================================================================

function resetSchoolForm() {
    document.getElementById('formTambahSekolah').reset();
    document.getElementById('schoolIdInput').value = '';
    document.getElementById('submitSchoolButton').textContent = '+ Add School';
    document.getElementById('submitSchoolButton').classList.remove('btn-accent');
    document.getElementById('submitSchoolButton').classList.add('btn-primary');
    document.getElementById('cancelEditButton').style.display = 'none';
}

function setupEventListeners() {
    // Add/Edit School Form
    document.getElementById('formTambahSekolah')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const schoolId = document.getElementById('schoolIdInput').value;
        const schoolName = document.getElementById('schoolNameInput').value.trim();
        const slug = document.getElementById('schoolSlugInput').value.trim().toLowerCase();
        const logoUrl = document.getElementById('schoolLogoInput').value.trim();

        if (!schoolName || !slug) {
            return showStatusMessage('School Name and Slug URL are required.', 'error');
        }

        const payload = {
            nama_sekolah: schoolName,
            slug: slug,
            logo_url: logoUrl || null
        };

        showLoading(true);
        let result;
        if (schoolId) {
            result = await supabase.from('sekolah').update(payload).eq('id', schoolId);
        } else {
            result = await supabase.from('sekolah').insert(payload);
        }
        showLoading(false);

        if (result.error) {
            showStatusMessage(`Failed: ${result.error.message}`, 'error');
        } else {
            showStatusMessage(`School data successfully ${schoolId ? 'updated' : 'added'}.`, 'success');
            resetSchoolForm();
            await loadAdminData();
        }
    });

    // Cancel Edit Button
    document.getElementById('cancelEditButton')?.addEventListener('click', resetSchoolForm);

    // Add User Form (Updated to support Roles & Class)
    document.getElementById('formPengguna')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const email = document.getElementById('userEmail').value.trim();
        const password = document.getElementById('userPassword').value;
        const schoolId = document.getElementById('userSchoolLink').value;
        const role = document.getElementById('userRole').value;
        const kelas = document.getElementById('userKelas').value.trim();

        // Validasi Dasar
        if (!email || !password || !schoolId) return showStatusMessage('All fields are required.', 'error');
        if (password.length < 6) return showStatusMessage('Password must be at least 6 characters.', 'error');
        
        // Validasi Khusus Wali Kelas
        if (role === 'wali_kelas' && !kelas) {
            return showStatusMessage('Nama Kelas wajib diisi untuk role Wali Kelas.', 'error');
        }

        showLoading(true);
        
        // Kirim data ke Edge Function
        // Payload mencakup role dan kelas_assigned
        const { data, error } = await supabase.functions.invoke('quick-task', { 
            body: { 
                action: 'createUser', 
                payload: { 
                    email, 
                    password, 
                    schoolId,
                    role: role, 
                    kelasAssigned: (role === 'wali_kelas') ? kelas : null
                } 
            } 
        });
        
        showLoading(false);
        
        if (error || (data && data.error)) {
            showStatusMessage(`Failed to create user: ${error?.message || data?.error}`, 'error');
        } else {
            showStatusMessage(`User ${email} created successfully as ${role}!`, 'success');
            document.getElementById('formPengguna').reset();
            // Sembunyikan input kelas
            document.getElementById('groupKelasInput').style.display = 'none';
            await loadAdminData();
        }
    });

    // Logout Button
    document.getElementById('logoutButton')?.addEventListener('click', async () => {
        if (confirm('Are you sure you want to log out from the Admin Panel?')) {
            showLoading(true);
            await supabase.auth.signOut();
            window.location.replace('index.html');
        }
    });
}

// Window Global Functions (callable from onclick in HTML)

window.handleEditSchool = function(schoolId) {
    const school = AppStateAdmin.schools.find(s => s.id === schoolId);
    if (!school) return;

    document.getElementById('schoolIdInput').value = school.id;
    document.getElementById('schoolNameInput').value = school.nama_sekolah;
    document.getElementById('schoolSlugInput').value = school.slug || '';
    document.getElementById('schoolLogoInput').value = school.logo_url || '';

    const submitBtn = document.getElementById('submitSchoolButton');
    submitBtn.textContent = 'Save Changes';
    submitBtn.classList.remove('btn-primary');
    submitBtn.classList.add('btn-accent');
    
    document.getElementById('cancelEditButton').style.display = 'inline-flex';
    document.getElementById('formTambahSekolah').scrollIntoView({ behavior: 'smooth' });
};

window.handleDeleteSchool = async function(schoolId, schoolName) {
    const verification = prompt(`WARNING:\nDeleting the school "${schoolName}" will permanently remove ALL related data.\n\nType the school name "${schoolName}" to confirm:`);
    if (verification !== schoolName) return;
    
    showLoading(true);
    const { error } = await supabase.from('sekolah').delete().eq('id', schoolId);
    showLoading(false);
    
    if (error) showStatusMessage(`Failed to delete: ${error.message}`, 'error');
    else {
        showStatusMessage(`School "${schoolName}" has been deleted.`, 'success');
        await loadAdminData();
    }
};

window.handleDeleteUser = async function(userId, userEmail) {
    if (!confirm(`Are you sure you want to delete the user ${userEmail}?`)) return;
    
    showLoading(true);
    const { data, error } = await supabase.functions.invoke('quick-task', {
        body: { action: 'deleteUser', payload: { userId: userId } }
    });
    showLoading(false);
    
    if (error || (data && data.error)) showStatusMessage(`Failed to delete: ${error?.message || data?.error}`, 'error');
    else {
        showStatusMessage(`User ${userEmail} has been deleted.`, 'success');
        await loadAdminData();
    }
};
