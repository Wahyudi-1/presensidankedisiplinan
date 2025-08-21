// Contoh di file app-admin.js

async function handleCreateUser(email, password, schoolId) {
    showLoading(true);

    const { data, error } = await supabase.rpc('admin_create_user_for_school', {
        user_email: email,
        user_password: password,
        target_school_id: schoolId
    });

    showLoading(false);

    if (error) {
        return showStatusMessage(`Gagal membuat pengguna: ${error.message}`, 'error');
    }

    showStatusMessage(`Pengguna baru ${data.email} berhasil dibuat!`, 'success');
    // Muat ulang daftar pengguna
    loadAllUsers();
}
