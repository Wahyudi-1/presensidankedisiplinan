// File: dashboard.js
// Tujuan: Menangani semua logika dan interaksi khusus untuk halaman dashboard pengguna.
// Versi: FINAL - Diperbaiki, Dioptimalkan, dan Lengkap

// Impor dependensi dari modul lain
import { supabase } from './config.js';
import { showLoading, showStatusMessage, playSound } from './utils.js';
import { checkAuthenticationAndSetup, setupAuthListener, handleLogout } from './auth.js';

// State aplikasi khusus untuk halaman dashboard
const AppState = {
    siswa: [],
    pelanggaran: [],
    userSekolahId: null,
    namaSekolah: "Sekolah Kak Rose"
};

// Variabel global untuk menyimpan instance scanner
let qrScannerDatang = null;
let qrScannerPulang = null;

// ====================================================================
// FUNGSI INTI DASHBOARD
// ====================================================================

/**
 * Memulai dan menampilkan antarmuka pemindai QR code menggunakan Html5QrcodeScanner.
 * Menggunakan metode "Jeda Cerdas" untuk keseimbangan kecepatan dan keandalan.
 * @param {('datang'|'pulang')} type - Jenis pemindaian.
 */
function startQrScanner(type) {
    let scannerInstance = type === 'datang' ? qrScannerDatang : qrScannerPulang;
    if (scannerInstance) return; 

    const elementId = type === 'datang' ? 'qrScannerDatang' : 'qrScannerPulang';
    
    const onScanSuccess = async (decodedText, decodedResult) => {
        const currentScanner = type === 'datang' ? qrScannerDatang : qrScannerPulang;
        const resultEl = document.getElementById(type === 'datang' ? 'scanResultDatang' : 'scanResultPulang');

        if (currentScanner) {
            currentScanner.pause(true);
        }

        // Tunggu hingga semua proses verifikasi dan penyimpanan data selesai.
        await processQrScan(decodedText, type);

        // Lanjutkan pemindaian setelah jeda singkat untuk umpan balik.
        setTimeout(() => {
            if (currentScanner) {
                currentScanner.resume();
                if (resultEl) resultEl.innerHTML = "Arahkan kamera ke QR Code Siswa";
            }
        }, 500); // Jeda 500ms adalah keseimbangan yang baik.
    };
    
    const config = { fps: 15, qrbox: { width: 250, height: 250 } };
    scannerInstance = new Html5QrcodeScanner(elementId, config, false);
    scannerInstance.render(onScanSuccess, (error) => { /* Abaikan error minor */ });

    if (type === 'datang') {
        qrScannerDatang = scannerInstance;
    } else {
        qrScannerPulang = scannerInstance;
    }
}

/**
 * Menghentikan dan membersihkan pemindai QR code yang sedang berjalan.
 * @param {('datang'|'pulang')} type - Jenis pemindaian yang akan dihentikan.
 */
function stopQrScanner(type) {
    let scanner = type === 'datang' ? qrScannerDatang : qrScannerPulang;
    if (scanner) {
        scanner.clear().catch(error => {
            console.error(`Gagal membersihkan scanner ${type}:`, error);
        });
        if (type === 'datang') {
            qrScannerDatang = null;
        } else {
            qrScannerPulang = null;
        }
    }
}

/**
 * Memproses hasil pindaian QR code (NISN) untuk presensi.
 * @param {string} nisn - NISN siswa yang didapat dari QR code.
 * @param {('datang'|'pulang')} type - Jenis presensi.
 */
async function processQrScan(nisn, type) {
    const resultEl = document.getElementById(type === 'datang' ? 'scanResultDatang' : 'scanResultPulang');
    const { data: siswa, error: siswaError } = await supabase
        .from('siswa')
        .select('nama')
        .eq('nisn', nisn)
        .eq('sekolah_id', AppState.userSekolahId) // Keamanan: Pastikan siswa dari sekolah ini
        .single();
        
    if (siswaError || !siswa) {
        const errorMessage = `Siswa dengan NISN ${nisn} tidak terdaftar di sekolah Anda.`;
        resultEl.className = 'scan-result error';
        resultEl.textContent = errorMessage;
        playSound('error');
        return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const { data: presensiHariIni, error: cekError } = await supabase
        .from('presensi')
        .select('waktu_datang, waktu_pulang')
        .eq('nisn_siswa', nisn)
        .gte('waktu_datang', today.toISOString())
        .lt('waktu_datang', tomorrow.toISOString())
        .maybeSingle(); 

    if (cekError) {
        const errorMessage = `Gagal memeriksa data presensi: ${cekError.message}`;
        resultEl.className = 'scan-result error';
        resultEl.textContent = errorMessage;
        playSound('error');
        return;
    }

    if (type === 'datang') {
        if (presensiHariIni) {
            const errorMessage = `DITOLAK: ${siswa.nama} sudah melakukan presensi datang hari ini.`;
            resultEl.className = 'scan-result error';
            resultEl.textContent = errorMessage;
            playSound('error');
            return;
        }

        const { error: insertError } = await supabase
            .from('presensi')
            .insert({ nisn_siswa: nisn, waktu_datang: new Date(), sekolah_id: AppState.userSekolahId });
        
        if (insertError) {
            resultEl.className = 'scan-result error';
            resultEl.textContent = `Gagal menyimpan: ${insertError.message}`;
            playSound('error');
        } else {
            const waktu = new Date().toLocaleTimeString('id-ID');
            playSound('success');
            resultEl.className = 'scan-result success';
            resultEl.innerHTML = `<strong>Presensi Datang Berhasil!</strong><br>${siswa.nama} (${nisn}) - ${waktu}`;
            loadAndRenderDailyLog('datang');
        }

    } else { // Presensi Pulang
        if (!presensiHariIni) {
            const errorMessage = `DITOLAK: ${siswa.nama} belum melakukan presensi datang hari ini.`;
            resultEl.className = 'scan-result error';
            resultEl.textContent = errorMessage;
            playSound('error');
            return;
        }

        if (presensiHariIni && presensiHariIni.waktu_pulang) {
            const errorMessage = `DITOLAK: ${siswa.nama} sudah melakukan presensi pulang hari ini.`;
            resultEl.className = 'scan-result error';
            resultEl.textContent = errorMessage;
            playSound('error');
            return;
        }

        const { error: updateError } = await supabase
            .from('presensi')
            .update({ waktu_pulang: new Date() })
            .eq('nisn_siswa', nisn)
            .gte('waktu_datang', today.toISOString());

        if (updateError) {
            resultEl.className = 'scan-result error';
            resultEl.textContent = `Gagal menyimpan: ${updateError.message}`;
            playSound('error');
        } else {
            const waktu = new Date().toLocaleTimeString('id-ID');
            playSound('success');
            resultEl.className = 'scan-result success';
            resultEl.innerHTML = `<strong>Presensi Pulang Berhasil!</strong><br>${siswa.nama} (${nisn}) - ${waktu}`;
            loadAndRenderDailyLog('pulang');
        }
    }
}

async function loadAndRenderDailyLog(type) {
    const tableBodyId = type === 'datang' ? 'logTableBodyDatang' : 'logTableBodyPulang';
    const tableBody = document.getElementById(tableBodyId);
    if (!tableBody) return;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const { data, error } = await supabase.from('presensi').select('waktu_datang, waktu_pulang, siswa (nisn, nama)').eq('sekolah_id', AppState.userSekolahId).gte('waktu_datang', today.toISOString()).lt('waktu_datang', tomorrow.toISOString()).order('waktu_datang', { ascending: false });
    if (error) { console.error(`Gagal memuat log ${type}:`, error); tableBody.innerHTML = `<tr><td colspan="3">Gagal memuat data.</td></tr>`; return; }
    tableBody.innerHTML = data.length === 0 ? `<tr><td colspan="3" style="text-align: center;">Belum ada data presensi hari ini.</td></tr>` : data.map(row => { if (!row.siswa) return ''; const waktuTampil = type === 'datang' ? row.waktu_datang : row.waktu_pulang; if (type === 'pulang' && !waktuTampil) return ''; return `<tr><td>${new Date(waktuTampil).toLocaleTimeString('id-ID')}</td><td>${row.siswa.nisn}</td><td>${row.siswa.nama}</td></tr>`; }).join('');
}
async function filterAndRenderRekap() {
    const startDateStr = document.getElementById('rekapFilterTanggalMulai').value;
    const endDateStr = document.getElementById('rekapFilterTanggalSelesai').value;
    if (!startDateStr || !endDateStr) return showStatusMessage('Harap pilih rentang tanggal.', 'error');
    showLoading(true);
    const { data, error } = await supabase.from('presensi').select(`waktu_datang, waktu_pulang, status, siswa ( nisn, nama, whatsapp_ortu )`).eq('sekolah_id', AppState.userSekolahId).gte('waktu_datang', startDateStr).lte('waktu_datang', `${endDateStr}T23:59:59`);
    showLoading(false);
    if (error) return showStatusMessage(`Gagal memuat rekap: ${error.message}`, 'error');
    renderRekapTable(data);
    document.getElementById('exportRekapButton').style.display = data.length > 0 ? 'inline-block' : 'none';
}
function renderRekapTable(data) {
    const tableBody = document.getElementById('rekapTableBody');
    if (!data || data.length === 0) { tableBody.innerHTML = '<tr><td colspan="7" style="text-align: center;">Tidak ada data rekap ditemukan.</td></tr>'; return; }
    tableBody.innerHTML = data.map(row => { const datangDate = new Date(row.waktu_datang); const pulangDate = row.waktu_pulang ? new Date(row.waktu_pulang) : null; const waButton = row.siswa?.whatsapp_ortu ? `<button class="btn btn-sm btn-success" style="display: flex; align-items: center; gap: 5px;" onclick="sendWhatsAppHandler('${row.siswa.nama.replace(/'/g, "\\'")}', '${row.siswa.whatsapp_ortu}', '${row.waktu_datang}', '${row.waktu_pulang || ''}')"><svg xmlns="http://www.w3.org/2000/svg" height="1em" viewBox="0 0 448 512" fill="white"><path d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 341.6c-33.8 0-67.6-9.5-97.8-26.7l-7.1-4.2-72.2 18.9L96 357.3l-4.5-7.3c-18.4-29.8-28.2-63.6-28.2-98.8 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7.9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z"/></svg> Kirim </button>` : '<span>-</span>'; return `<tr><td data-label="Tanggal">${datangDate.toLocaleDateString('id-ID', {day:'2-digit', month:'long', year:'numeric'})}</td><td data-label="NISN">${row.siswa?.nisn || '-'}</td><td data-label="Nama">${row.siswa?.nama || 'Siswa Dihapus'}</td><td data-label="Datang">${datangDate.toLocaleTimeString('id-ID')}</td><td data-label="Pulang">${pulangDate ? pulangDate.toLocaleTimeString('id-ID') : 'Belum'}</td><td data-label="Status">${row.status || '-'}</td><td data-label="Aksi">${waButton}</td></tr>`; }).join('');
}
function formatPhoneNumber(number) { let cleanNumber = ('' + number).replace(/\D/g, ''); if (cleanNumber.startsWith('0')) { cleanNumber = '62' + cleanNumber.substring(1); } else if (!cleanNumber.startsWith('62')) { cleanNumber = '62' + cleanNumber; } return cleanNumber; }
function sendWhatsAppHandler(namaSiswa, nomorWhatsapp, waktuDatangISO, waktuPulangISO) { if (!nomorWhatsapp) { alert('Nomor WhatsApp untuk wali murid ini tidak terdaftar.'); return; } const formattedNumber = formatPhoneNumber(nomorWhatsapp); const waktuDatang = new Date(waktuDatangISO).toLocaleString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }); const waktuPulang = waktuPulangISO ? new Date(waktuPulangISO).toLocaleString('id-ID', { hour: '2-digit', minute: '2-digit' }) : 'Belum melakukan presensi pulang'; const templatePesan = `\nAssalamualaikum Wr. Wb.\nYth. Bapak/Ibu Wali Murid dari ananda ${namaSiswa},\n\nDengan hormat, kami dari ${AppState.namaSekolah} memberitahukan rekap presensi ananda hari ini:\n- *Waktu Datang:* ${waktuDatang}\n- *Waktu Pulang:* ${waktuPulang}\n\nTerima kasih atas perhatiannya.\n\nWassalamualaikum Wr. Wb.\nHormat kami,\n*${AppState.namaSekolah}*\n    `; const encodedMessage = encodeURIComponent(templatePesan.trim()); const whatsappUrl = `https://api.whatsapp.com/send?phone=${formattedNumber}&text=${encodedMessage}`; window.open(whatsappUrl, '_blank'); }
function exportRekapToExcel() { const table = document.querySelector("#rekapSection table"); if (!table || table.rows.length <= 1) return showStatusMessage('Tidak ada data untuk diekspor.', 'info'); const wb = XLSX.utils.table_to_book(table, { sheet: "Rekap Presensi" }); XLSX.writeFile(wb, `Rekap_Presensi_${new Date().toISOString().slice(0, 10)}.xlsx`); }
async function loadSiswaAndRenderTable(force = false) { if (!force && AppState.siswa.length > 0) { renderSiswaTable(AppState.siswa); return; } showLoading(true); const { data, error } = await supabase.from('siswa').select('*').eq('sekolah_id', AppState.userSekolahId).order('nama', { ascending: true }); showLoading(false); if (error) return showStatusMessage(`Gagal memuat data siswa: ${error.message}`, 'error'); AppState.siswa = data.map(s => ({ NISN: s.nisn, Nama: s.nama, Kelas: s.kelas, WhatsappOrtu: s.whatsapp_ortu })); renderSiswaTable(AppState.siswa); }
function renderSiswaTable(siswaArray) { const tableBody = document.getElementById('siswaResultsTableBody'); tableBody.innerHTML = siswaArray.length === 0 ? '<tr><td colspan="5" style="text-align: center;">Data siswa tidak ditemukan.</td></tr>' : siswaArray.map(siswa => `<tr><td data-label="NISN">${siswa.NISN}</td><td data-label="Nama">${siswa.Nama}</td><td data-label="Kelas">${siswa.Kelas || '-'}</td><td data-label="Whatsapp Ortu">${siswa.WhatsappOrtu || '-'}</td><td data-label="Aksi"><button class="btn btn-sm btn-primary" onclick="generateQRHandler('${siswa.NISN}')">QR</button><button class="btn btn-sm btn-secondary" onclick="editSiswaHandler('${siswa.NISN}')">Ubah</button><button class="btn btn-sm btn-danger" onclick="deleteSiswaHandler('${siswa.NISN}')">Hapus</button></td></tr>`).join(''); }
async function saveSiswa() { const oldNisn = document.getElementById('formNisnOld').value; const siswaData = { nisn: document.getElementById('formNisn').value, nama: document.getElementById('formNama').value, kelas: document.getElementById('formKelas').value, whatsapp_ortu: document.getElementById('formWhatsappOrtu').value || null, sekolah_id: AppState.userSekolahId }; showLoading(true); const { error } = oldNisn ? await supabase.from('siswa').update(siswaData).eq('nisn', oldNisn) : await supabase.from('siswa').insert(siswaData); showLoading(false); if (error) return showStatusMessage(`Gagal menyimpan: ${error.message}`, 'error'); showStatusMessage(oldNisn ? 'Data siswa berhasil diperbarui.' : 'Siswa baru berhasil ditambahkan.', 'success'); resetFormSiswa(); await loadSiswaAndRenderTable(true); }
function editSiswaHandler(nisn) { const siswa = AppState.siswa.find(s => s.NISN == nisn); if (!siswa) return; document.getElementById('formNisn').value = siswa.NISN; document.getElementById('formNama').value = siswa.Nama; document.getElementById('formKelas').value = siswa.Kelas; document.getElementById('formWhatsappOrtu').value = siswa.WhatsappOrtu || ''; document.getElementById('formNisnOld').value = siswa.NISN; document.getElementById('saveSiswaButton').textContent = 'Update Data Siswa'; document.getElementById('formSiswa').scrollIntoView({ behavior: 'smooth' }); }
function resetFormSiswa() { document.getElementById('formSiswa').reset(); document.getElementById('formNisnOld').value = ''; document.getElementById('saveSiswaButton').textContent = 'Simpan Data Siswa'; }
async function deleteSiswaHandler(nisn) { if (confirm(`Yakin ingin menghapus siswa dengan NISN: ${nisn}?`)) { showLoading(true); const { error } = await supabase.from('siswa').delete().eq('nisn', nisn); showLoading(false); if (error) return showStatusMessage(`Gagal menghapus: ${error.message}`, 'error'); showStatusMessage('Siswa berhasil dihapus.', 'success'); await loadSiswaAndRenderTable(true); } }
function generateQRHandler(nisn) { const siswa = AppState.siswa.find(s => s.NISN == nisn); if (!siswa) return; document.getElementById('qrModalStudentName').textContent = `QR Code: ${siswa.Nama}`; document.getElementById('qrModalStudentNisn').textContent = `NISN: ${siswa.NISN}`; const canvas = document.getElementById('qrCodeCanvas'); canvas.innerHTML = ''; new QRCode(canvas, { text: siswa.NISN.toString(), width: 200, height: 200, correctLevel: QRCode.CorrectLevel.H }); document.getElementById('qrModal').style.display = 'flex'; }
function printQrCode() { const modalContent = document.querySelector("#qrModal .modal-content").cloneNode(true); modalContent.querySelector('.modal-close-button')?.remove(); modalContent.querySelector('#printQrButton')?.remove(); const printWindow = window.open('', '', 'height=600,width=800'); printWindow.document.write(`<html><head><title>Cetak QR</title><style>body{font-family:sans-serif;text-align:center}#qrCodeCanvas img{display:block;margin:20px auto}</style></head><body>${modalContent.innerHTML}</body></html>`); printWindow.document.close(); printWindow.focus(); setTimeout(() => { printWindow.print(); printWindow.close(); }, 500); }
function exportSiswaToExcel() { if (AppState.siswa.length === 0) return showStatusMessage('Tidak ada data siswa untuk diekspor.', 'info'); const ws = XLSX.utils.json_to_sheet(AppState.siswa.map(s => ({ NISN: s.NISN, Nama: s.Nama, Kelas: s.Kelas, 'Whatsapp Ortu': s.WhatsappOrtu }))); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Data Siswa"); XLSX.writeFile(wb, `Data_Siswa_${new Date().toISOString().slice(0, 10)}.xlsx`); }
function exportAllQrCodes() { if (AppState.siswa.length === 0) return showStatusMessage("Tidak ada data siswa untuk mencetak QR code.", "info"); showLoading(true); const printWindow = window.open('', '_blank'); printWindow.document.write('<html><head><title>Cetak Semua QR Code Siswa</title>'); printWindow.document.write(`<style>@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500&display=swap');body{font-family:'Poppins',sans-serif;margin:20px;}.page-container{display:flex;flex-wrap:wrap;justify-content:flex-start;gap:15px;}.qr-card{page-break-inside:avoid;display:flex;flex-direction:column;align-items:center;text-align:center;border:1px solid #ccc;border-radius:8px;padding:15px;width:220px;}.qr-canvas{margin:10px 0;}h4,p{margin:2px 0;}p{font-size:0.9em;color:#555;}@media print{body{margin:10px;-webkit-print-color-adjust:exact;}.qr-card{border:1px solid #eee;}}</style>`); printWindow.document.write('</head><body><h3>Daftar QR Code Siswa</h3><div class="page-container">'); AppState.siswa.forEach(siswa => { printWindow.document.write(`<div class="qr-card"><h4>${siswa.Nama}</h4><p>NISN: ${siswa.NISN}</p><div id="qr-canvas-${siswa.NISN}" class="qr-canvas"></div></div>`); }); printWindow.document.write('</div></body></html>'); setTimeout(() => { AppState.siswa.forEach(siswa => { const canvas = printWindow.document.getElementById(`qr-canvas-${siswa.NISN}`); if (canvas) new QRCode(canvas, { text: siswa.NISN.toString(), width: 180, height: 180, correctLevel: QRCode.CorrectLevel.H }); }); setTimeout(() => { showLoading(false); printWindow.document.close(); printWindow.focus(); printWindow.print(); }, 1000); }, 500); }
async function loadPelanggaranData() { const { data, error } = await supabase.from('pelanggaran').select('*'); if (error) return console.error("Gagal memuat data pelanggaran:", error); AppState.pelanggaran = data; populateDisciplineRecommendations(); }
function handleNisnDisiplinInput() { const nisn = document.getElementById('nisnDisiplinInput').value; const namaEl = document.getElementById('namaSiswaDisiplin'); const siswa = AppState.siswa.find(s => s.NISN == nisn); namaEl.value = siswa ? siswa.Nama : ''; }
function populateDisciplineRecommendations() { const tingkatList = document.getElementById('tingkatList'); const deskripsiList = document.getElementById('deskripsiList'); if (!tingkatList || !deskripsiList) return; const semuaTingkat = [...new Set(AppState.pelanggaran.map(p => p.tingkat))]; tingkatList.innerHTML = semuaTingkat.map(t => `<option value="${t}"></option>`).join(''); deskripsiList.innerHTML = AppState.pelanggaran.map(p => `<option value="${p.deskripsi}"></option>`).join(''); }
function handleTingkatChange() { const tingkatInput = document.getElementById('tingkatDisiplinInput').value; const deskripsiList = document.getElementById('deskripsiList'); if (!deskripsiList) return; let filteredPelanggaran = tingkatInput ? AppState.pelanggaran.filter(p => p.tingkat === tingkatInput) : AppState.pelanggaran; deskripsiList.innerHTML = filteredPelanggaran.map(p => `<option value="${p.deskripsi}"></option>`).join(''); }
async function handleSubmitDisiplin(event) { event.preventDefault(); const nisn = document.getElementById('nisnDisiplinInput').value; const tingkat = document.getElementById('tingkatDisiplinInput').value; const deskripsi = document.getElementById('deskripsiDisiplinInput').value; const pelanggaran = AppState.pelanggaran.find(p => p.deskripsi === deskripsi); const poin = pelanggaran ? pelanggaran.poin : 0; const { error } = await supabase.from('catatan_disiplin').insert({ nisn_siswa: nisn, tingkat, deskripsi, poin, sekolah_id: AppState.userSekolahId }); if (error) return showStatusMessage(`Gagal menyimpan catatan: ${error.message}`, 'error'); showStatusMessage('Catatan kedisiplinan berhasil disimpan.', 'success'); document.getElementById('formDisiplin').reset(); document.getElementById('namaSiswaDisiplin').value = ''; }
async function handleSearchRiwayatDisiplin() { const nisn = document.getElementById('searchNisnDisiplin').value; if (!nisn) return showStatusMessage("Harap masukkan NISN untuk mencari riwayat.", "info"); showLoading(true); const { data, error } = await supabase.from('catatan_disiplin').select('*').eq('nisn_siswa', nisn).eq('sekolah_id', AppState.userSekolahId).order('created_at', { ascending: false }); showLoading(false); if (error) return showStatusMessage(`Gagal mencari riwayat: ${error.message}`, 'error'); renderRiwayatDisiplinTable(data); }
function renderRiwayatDisiplinTable(riwayatArray) { const tableBody = document.getElementById('riwayatDisiplinTableBody'); if (riwayatArray.length === 0) { tableBody.innerHTML = '<tr><td colspan="4" style="text-align: center;">Tidak ada riwayat kedisiplinan ditemukan.</td></tr>'; return; } tableBody.innerHTML = riwayatArray.map(r => `<tr><td data-label="Tanggal">${new Date(r.created_at).toLocaleDateString('id-ID')}</td><td data-label="Tingkat">${r.tingkat}</td><td data-label="Deskripsi">${r.deskripsi}</td><td data-label="Poin">${r.poin}</td></tr>`).join(''); }
async function handleSiswaFileSelect(event) { const file = event.target.files[0]; if (!file) return; showLoading(true); Papa.parse(file, { header: true, skipEmptyLines: true, complete: async function(results) { if (!results.data || results.data.length === 0) { showLoading(false); return showStatusMessage('File CSV kosong atau formatnya salah.', 'error'); } const dataToInsert = results.data.filter(row => { const nisn = row.NISN || row.Nisn || row.nisn; return nisn && nisn.toString().trim() !== ''; }).map(row => ({ nisn: row.NISN || row.Nisn || row.nisn, nama: row.Nama || row.nama, kelas: row.Kelas || row.kelas, whatsapp_ortu: row['Whatsapp Ortu'] || row.WhatsappOrtu || row.whatsapp_ortu || null, sekolah_id: AppState.userSekolahId })); if (dataToInsert.length === 0) { showLoading(false); return showStatusMessage('Tidak ada data siswa yang valid untuk diimpor.', 'info'); } const { error } = await supabase.from('siswa').upsert(dataToInsert, { onConflict: 'nisn' }); showLoading(false); if (error) { return showStatusMessage(`Gagal Impor: ${error.message}`, 'error'); } showStatusMessage(`${dataToInsert.length} data siswa berhasil diimpor/diperbarui!`, 'success'); await loadSiswaAndRenderTable(true); }, error: (err) => { showLoading(false); showStatusMessage(`Gagal membaca file CSV: ${err.message}`, 'error'); } }); event.target.value = ''; }
async function handlePelanggaranFileSelect(event) { const file = event.target.files[0]; if (!file) return; showLoading(true); Papa.parse(file, { header: true, skipEmptyLines: true, complete: async function(results) { if (!results.data || results.data.length === 0) { showLoading(false); return showStatusMessage('File CSV kosong atau formatnya salah.', 'error'); } const { error: deleteError } = await supabase.from('pelanggaran').delete().neq('id', 0); if (deleteError) { showLoading(false); return showStatusMessage(`Gagal membersihkan master pelanggaran lama: ${deleteError.message}`, 'error'); } const dataToInsert = results.data.map(row => ({ tingkat: row.Tingkat, deskripsi: row.Deskripsi || row.DeskripsiPelanggaran, poin: row.Poin })); const { error: insertError } = await supabase.from('pelanggaran').insert(dataToInsert); showLoading(false); if (insertError) return showStatusMessage(`Gagal impor: ${insertError.message}`, 'error'); showStatusMessage(`${dataToInsert.length} data pelanggaran berhasil diimpor! Master lama telah diganti.`, 'success'); await loadPelanggaranData(); }, error: (err) => { showLoading(false); showStatusMessage(`Gagal membaca file CSV: ${err.message}`, 'error'); } }); event.target.value = ''; }
export async function initDashboardPage() { await checkAuthenticationAndSetup(); const { data: { session } } = await supabase.auth.getSession(); if (session) { const { data: userProfile, error } = await supabase.from('pengguna').select('sekolah_id, sekolah ( nama_sekolah )').eq('id', session.user.id).single(); if (userProfile && userProfile.sekolah_id) { AppState.userSekolahId = userProfile.sekolah_id; const schoolNameEl = document.getElementById('schoolNameDisplay'); if (schoolNameEl && userProfile.sekolah) { const namaSekolah = userProfile.sekolah.nama_sekolah; schoolNameEl.textContent = `[${namaSekolah}]`; AppState.namaSekolah = namaSekolah; } } else { console.error("Gagal mendapatkan profil atau profil tidak tertaut ke sekolah:", error); alert('Error: Akun Anda tidak terhubung ke sekolah manapun. Hubungi administrator.'); handleLogout(); return; } } setupAuthListener(); setupDashboardListeners(); await loadSiswaAndRenderTable(); await loadPelanggaranData(); document.querySelector('.section-nav button[data-section="datangSection"]')?.click(); }
function setupDashboardListeners() { document.getElementById('logoutButton')?.addEventListener('click', handleLogout); document.querySelectorAll('.section-nav button').forEach(button => { button.addEventListener('click', () => { document.querySelectorAll('.section-nav button').forEach(btn => btn.classList.remove('active')); button.classList.add('active'); stopQrScanner('datang'); stopQrScanner('pulang'); const sectionId = button.dataset.section; document.querySelectorAll('.content-section').forEach(section => { section.style.display = section.id === sectionId ? 'block' : 'none'; }); const actions = { datangSection: () => { startQrScanner('datang'); loadAndRenderDailyLog('datang'); }, pulangSection: () => { startQrScanner('pulang'); loadAndRenderDailyLog('pulang'); }, rekapSection: () => { const today = new Date().toISOString().slice(0, 10); document.getElementById('rekapFilterTanggalMulai').value = today; document.getElementById('rekapFilterTanggalSelesai').value = today; filterAndRenderRekap(); }, disiplinSection: () => {}, siswaSection: () => loadSiswaAndRenderTable(), }; actions[sectionId]?.(); }); }); document.getElementById('refreshSiswaButton')?.addEventListener('click', () => loadSiswaAndRenderTable(true)); document.getElementById('filterRekapButton')?.addEventListener('click', filterAndRenderRekap); document.getElementById('exportRekapButton')?.addEventListener('click', exportRekapToExcel); document.getElementById('formSiswa')?.addEventListener('submit', (e) => { e.preventDefault(); saveSiswa(); }); document.getElementById('resetSiswaButton')?.addEventListener('click', resetFormSiswa); document.querySelector('#qrModal .modal-close-button')?.addEventListener('click', () => document.getElementById('qrModal').style.display = 'none'); document.getElementById('printQrButton')?.addEventListener('click', printQrCode); document.getElementById('exportSiswaExcelButton')?.addEventListener('click', exportSiswaToExcel); document.getElementById('exportAllQrButton')?.addEventListener('click', exportAllQrCodes); document.getElementById('importSiswaButton')?.addEventListener('click', () => document.getElementById('importSiswaInput').click()); document.getElementById('importSiswaInput')?.addEventListener('change', handleSiswaFileSelect); document.getElementById('importPelanggaranButton')?.addEventListener('click', () => document.getElementById('importPelanggaranInput').click()); document.getElementById('importPelanggaranInput')?.addEventListener('change', handlePelanggaranFileSelect); document.getElementById('nisnDisiplinInput')?.addEventListener('blur', handleNisnDisiplinInput); document.getElementById('tingkatDisiplinInput')?.addEventListener('input', handleTingkatChange); document.getElementById('formDisiplin')?.addEventListener('submit', handleSubmitDisiplin); document.getElementById('searchDisiplinButton')?.addEventListener('click', handleSearchRiwayatDisiplin); }
window.generateQRHandler = generateQRHandler;
window.editSiswaHandler = editSiswaHandler;
window.deleteSiswaHandler = deleteSiswaHandler;
window.sendWhatsAppHandler = sendWhatsAppHandler;
