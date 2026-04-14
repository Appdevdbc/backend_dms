import dayjs from "dayjs";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { dbDMS } from "../../config/db.js";
import { logger } from "../../helpers/logger.js";
import { decrypt, getErrorResponse } from "../../helpers/utils.js";
import { sendMail } from "../../helpers/mail.js";
import ejs from "ejs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Helper Functions ────────────────────────────────────────────────────────

const canKembalikan = (row, empid) =>
  row.pinjam_status === 'Peminjaman Berhasil' && row.pinjam_user_id === empid;

const canPerpanjang = (row, empid) =>
  row.pinjam_status === 'Peminjaman Berhasil' &&
  row.pinjam_user_id === empid &&
  (row.perpanjang_qty || 0) < 2;

const canArsiparis = (row, empid) =>
  row.pinjam_status === 'Kembali Arsiparis' && row.pinjam_arsiparis_id === empid;

const canApproveByStatus = (row, empid) =>
  row.pinjam_user_approve === empid;

const sendEmailSafe = async (templateName, data, mailOpts, context) => {
  try {
    const templatePath = path.join(__dirname, '../../view/email/', templateName);
    const html = await ejs.renderFile(templatePath, data);
    await sendMail({ ...mailOpts, html });
  } catch (emailError) {
    logger(emailError, `Email ${context}`, data);
  }
};

const getMasterApprovalLegal = async (bu_id, prioritas) => {
  return dbDMS('mst_approval')
    .where({ app_bu_id: bu_id, app_jns_trans: 4, app_prioritas: prioritas })
    .first();
};

const getEmployeeData = async (empid) => {
  const result = await dbDMS.raw(
    `SELECT * FROM v_mstr_employee_ext WHERE id = ?`, [empid]
  );
  return result && result.length > 0 ? result[0] : null;
};

const getEmployeeSuperior = async (empid) => {
  const result = await dbDMS.raw(
    `SELECT * FROM vw_map_employee_superior WHERE employee_pk = ?`, [empid]
  );
  return result && result.length > 0 ? result[0] : null;
};

// ─── listPengembalian ─────────────────────────────────────────────────────────

export const listPengembalian = async (req, res) => {
  // #swagger.tags = ['PengembalianPerpanjangan']
  /* #swagger.security = [{ "bearerAuth": [] }] */
  // #swagger.description = 'List peminjaman aktif untuk pengembalian & perpanjangan'
  try {
    const { rowsPerPage, page: pageNum, sortBy, descending, filter, bu_id, from, to, empid: empidDecrypt } = req.query;
    const empid = decrypt(empidDecrypt);

    const sorting = descending === 'true' ? 'desc' : 'asc';
    const columnSort = sortBy ? `${sortBy} ${sorting}` : 'a.pinjam_tgl_create desc';

    let query = dbDMS('trs_permintaan_arsip as a')
      .innerJoin('content as b', 'a.pinjam_nomor_doc', 'b.content_doc')
      .leftJoin('mst_lokasi_arsip as e', 'b.lokasi_arsip_id', 'e.lokasi_arsip_id')
      .select('a.*', 'b.content_security', 'b.arsip_no', 'b.arsip_kat as kat_desc', 'e.lokasi_arsip_name')
      .whereNotIn('a.pinjam_status', ['Peminjaman Berakhir', 'Tolak', 'Sudah download', 'Melewati Waktu Download'])
      .where('a.pinjam_aktivitas', 'Pinjam Asli');

    if (bu_id) query.where('b.content_bu', bu_id);
    if (from) query.whereRaw("CONVERT(VARCHAR(10), a.pinjam_tgl_create, 120) >= ?", [from]);
    if (to) query.whereRaw("CONVERT(VARCHAR(10), a.pinjam_tgl_create, 120) <= ?", [to]);
    if (filter) {
      query.where(q => {
        q.orWhere('a.pinjam_no_tiket', 'like', `%${filter}%`)
          .orWhere('a.pinjam_nama_doc', 'like', `%${filter}%`)
          .orWhere('a.pinjam_nomor_doc', 'like', `%${filter}%`);
      });
    }

    if (!rowsPerPage) {
      const data = await query.orderByRaw(columnSort);
      return res.status(200).json(data.map(row => ({
        ...row,
        can_kembalikan: canKembalikan(row, empid),
        can_perpanjang: canPerpanjang(row, empid),
        can_approve_arsiparis: canArsiparis(row, empid),
        can_approve_perpanjangan: canApproveByStatus(row, empid),
      })));
    }

    const page = Math.floor(pageNum);
    const response = await query.orderByRaw(columnSort).paginate({
      perPage: Math.floor(rowsPerPage),
      currentPage: page,
      isLengthAware: true,
    });

    if (response.data) {
      response.data = response.data.map(row => ({
        ...row,
        can_kembalikan: canKembalikan(row, empid),
        can_perpanjang: canPerpanjang(row, empid),
        can_approve_arsiparis: canArsiparis(row, empid),
        can_approve_perpanjangan: canApproveByStatus(row, empid),
      }));
    }

    return res.status(200).json(response);
  } catch (error) {
    logger(error, 'GET /listPengembalian', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

// ─── getPengembalianByTiket ───────────────────────────────────────────────────

export const getPengembalianByTiket = async (req, res) => {
  // #swagger.tags = ['PengembalianPerpanjangan']
  /* #swagger.security = [{ "bearerAuth": [] }] */
  try {
    const { no_tiket } = req.query;
    if (!no_tiket) return res.status(400).json({ message: 'no_tiket wajib diisi' });

    const row = await dbDMS('trs_permintaan_arsip as a')
      .innerJoin('content as b', 'a.pinjam_nomor_doc', 'b.content_doc')
      .leftJoin('mst_lokasi_arsip as e', 'b.lokasi_arsip_id', 'e.lokasi_arsip_id')
      .leftJoin(dbDMS.raw('v_mstr_employee_ext as c ON a.pinjam_arsiparis_id = c.id COLLATE sql_latin1_general_cp1_ci_as'))
      .select('a.*', 'b.content_security', 'b.arsip_no', 'b.arsip_kat as kat_desc', 'e.lokasi_arsip_name', 'c.nama as nama_arsiparis')
      .where('a.pinjam_no_tiket', no_tiket)
      .first();

    if (!row) return res.status(404).json({ message: 'Data tidak ditemukan' });

    const logs = await dbDMS('trs_log as l')
      .leftJoin(dbDMS.raw('v_mstr_employee_ext as u ON l.trs_log_pic = u.id COLLATE sql_latin1_general_cp1_ci_as'))
      .select('l.*', 'u.nama as pic_nama')
      .where('l.trs_log_no_tiket', no_tiket)
      .orderBy('l.trs_log_tgl', 'asc');

    return res.status(200).json({ data: row, logs });
  } catch (error) {
    logger(error, 'GET /getPengembalianByTiket', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

// ─── getLogTiketPengembalian ──────────────────────────────────────────────────

export const getLogTiketPengembalian = async (req, res) => {
  // #swagger.tags = ['PengembalianPerpanjangan']
  /* #swagger.security = [{ "bearerAuth": [] }] */
  try {
    const { no_tiket } = req.query;
    if (!no_tiket) return res.status(400).json({ message: 'no_tiket wajib diisi' });

    const result = await dbDMS('trs_log as l')
      .leftJoin(dbDMS.raw('v_mstr_employee_ext as u ON l.trs_log_pic = u.id COLLATE sql_latin1_general_cp1_ci_as'))
      .select('l.*', 'u.nama as pic_nama', 'u.jabatan as pic_jabatan')
      .where('l.trs_log_no_tiket', no_tiket)
      .orderBy('l.trs_log_tgl', 'asc');

    return res.status(200).json(result);
  } catch (error) {
    logger(error, 'GET /getLogTiketPengembalian', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

// ─── submitPengembalian ───────────────────────────────────────────────────────

export const submitPengembalian = async (req, res) => {
  // #swagger.tags = ['PengembalianPerpanjangan']
  /* #swagger.security = [{ "bearerAuth": [] }] */
  // #swagger.description = 'User submit BAST pengembalian dokumen'
  const trx = await dbDMS.transaction();
  try {
    const { creator: empidDecrypt, no_tiket, id, kondisi_dokumen, notes, alasan_terlambat } = req.body;
    const empid = decrypt(empidDecrypt);

    const tiket = await trx('trs_permintaan_arsip').where('id', id).first();
    if (!tiket) { await trx.rollback(); return res.status(406).json({ type: 'error', message: 'Data tidak ditemukan' }); }
    if (tiket.pinjam_status !== 'Peminjaman Berhasil') { await trx.rollback(); return res.status(406).json({ type: 'error', message: 'Status tidak valid untuk pengembalian' }); }
    if (tiket.pinjam_user_id !== empid) { await trx.rollback(); return res.status(406).json({ type: 'error', message: 'Anda bukan peminjam dokumen ini' }); }

    const updateData = {
      pinjam_status: 'Kembali Arsiparis',
      kembali_tgl: dayjs().format('YYYY-MM-DD HH:mm:ss'),
      pinjam_kondisi_dokumen: kondisi_dokumen || 'baik',
      pinjam_notes: notes || '',
      pinjam_alasan_terlambat: alasan_terlambat || '',
    };

    // Handle file uploads (1-4)
    const uploadDir = path.join(process.cwd(), 'uploads', 'permintaan', 'kembali');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

    const files = req.files || {};
    for (let i = 1; i <= 4; i++) {
      const fieldName = `kembali_upload_file${i}`;
      const fileArr = files[fieldName];
      if (fileArr && fileArr[0]) {
        const file = fileArr[0];
        const ext = file.originalname.split('.').pop();
        const destName = `${id}-${i}.${ext}`;
        const destPath = path.join(uploadDir, destName);
        // Hapus file lama jika ada
        const oldFile = tiket[fieldName];
        if (oldFile) { const oldPath = path.join(uploadDir, oldFile); if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath); }
        fs.renameSync(file.path, destPath);
        updateData[fieldName] = destName;
      }
    }

    await trx('trs_permintaan_arsip').where('id', id).update(updateData);
    await trx('trs_log').insert({
      trs_log_no_tiket: no_tiket,
      trs_log_proses: 'Submit Pengembalian',
      trs_log_hasil: 'Konfirmasi Arsiparis',
      trs_log_pic: empid,
      trs_log_tgl: trx.fn.now(),
      trs_log_status: 1,
      trs_log_catatan: notes || '',
      trs_log_jenis: 5,
      trs_log_reason_revisi: '',
      trs_log_keterangan: notes || '',
    });

    await trx.commit();

    // Kirim email ke arsiparis
    if (tiket.arsiparis_id) {
      const arsiparis = await getEmployeeData(tiket.arsiparis_id);
      if (arsiparis && arsiparis.email) {
        await sendEmailSafe('pengembalian-arsiparis-request.ejs', {
          arsiparis_nama: arsiparis.nama,
          no_tiket,
          nama_doc: tiket.pinjam_nama_doc,
          kondisi_dokumen: kondisi_dokumen || 'baik',
          notes: notes || '-',
        }, { to: arsiparis.email, subject: 'NOTIFIKASI PENGEMBALIAN DOKUMEN' }, 'submitPengembalian');
      }
    }

    return res.json({ status: 1, message: 'Pengembalian berhasil disubmit' });
  } catch (error) {
    await trx.rollback();
    logger(error, 'POST /submitPengembalian', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

// ─── approvePengembalian ──────────────────────────────────────────────────────

export const approvePengembalian = async (req, res) => {
  // #swagger.tags = ['PengembalianPerpanjangan']
  /* #swagger.security = [{ "bearerAuth": [] }] */
  // #swagger.description = 'Arsiparis konfirmasi pengembalian dokumen'
  const trx = await dbDMS.transaction();
  try {
    const { creator: empidDecrypt, no_tiket, id, catatan } = req.body;
    const empid = decrypt(empidDecrypt);

    const tiket = await trx('trs_permintaan_arsip').where('id', id).first();
    if (!tiket) { await trx.rollback(); return res.status(406).json({ type: 'error', message: 'Data tidak ditemukan' }); }
    if (tiket.pinjam_status !== 'Kembali Arsiparis') { await trx.rollback(); return res.status(406).json({ type: 'error', message: 'Status tidak valid' }); }
    if (tiket.pinjam_arsiparis_id !== empid) { await trx.rollback(); return res.status(406).json({ type: 'error', message: 'Anda bukan arsiparis yang bertanggung jawab' }); }

    const updateData = { pinjam_status: 'Peminjaman Berakhir' };

    // Handle file upload arsiparis (file 5)
    const uploadDir = path.join(process.cwd(), 'uploads', 'permintaan', 'kembali');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

    const files = req.files || {};
    const file5Arr = files['kembali_upload_file5'];
    if (file5Arr && file5Arr[0]) {
      const file = file5Arr[0];
      const ext = file.originalname.split('.').pop();
      const destName = `${id}-5.${ext}`;
      const destPath = path.join(uploadDir, destName);
      const oldFile = tiket.kembali_upload_file5;
      if (oldFile) { const oldPath = path.join(uploadDir, oldFile); if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath); }
      fs.renameSync(file.path, destPath);
      updateData.kembali_upload_file5 = destName;
    }

    await trx('trs_permintaan_arsip').where('id', id).update(updateData);
    // Update status content menjadi Tersedia
    await trx('content').where('content_doc', tiket.pinjam_nomor_doc).update({ content_status: 'Tersedia' });
    await trx('trs_log').insert({
      trs_log_no_tiket: no_tiket,
      trs_log_proses: 'Konfirmasi Pengembalian',
      trs_log_hasil: 'Peminjaman Berakhir',
      trs_log_pic: empid,
      trs_log_tgl: trx.fn.now(),
      trs_log_status: 1,
      trs_log_catatan: catatan || 'Disetujui',
      trs_log_jenis: 5,
      trs_log_reason_revisi: '',
      trs_log_keterangan: catatan || '',
    });

    await trx.commit();

    // Kirim email ke peminjam
    const peminjam = await getEmployeeData(tiket.pinjam_user_id);
    if (peminjam && peminjam.email) {
      await sendEmailSafe('pengembalian-selesai.ejs', {
        peminjam_nama: peminjam.nama,
        no_tiket,
        nama_doc: tiket.pinjam_nama_doc,
        catatan: catatan || '-',
      }, { to: peminjam.email, subject: 'NOTIFIKASI PENGEMBALIAN DOKUMEN (APPROVE)' }, 'approvePengembalian');
    }

    return res.json({ status: 1, message: 'Pengembalian berhasil dikonfirmasi' });
  } catch (error) {
    await trx.rollback();
    logger(error, 'POST /approvePengembalian', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

// ─── tolakPengembalian ────────────────────────────────────────────────────────

export const tolakPengembalian = async (req, res) => {
  // #swagger.tags = ['PengembalianPerpanjangan']
  /* #swagger.security = [{ "bearerAuth": [] }] */
  // #swagger.description = 'Arsiparis tolak pengembalian dokumen'
  const trx = await dbDMS.transaction();
  try {
    const { creator: empidDecrypt, no_tiket, id, alasan_tolak } = req.body;
    const empid = decrypt(empidDecrypt);
    console.log('check: ' + empid);
    if (!alasan_tolak) return res.status(406).json({ type: 'error', message: 'Alasan tolak wajib diisi' });

    const tiket = await trx('trs_permintaan_arsip').where('id', id).first();
    if (!tiket) { await trx.rollback(); return res.status(406).json({ type: 'error', message: 'Data tidak ditemukan' }); }
    if (tiket.pinjam_status !== 'Kembali Arsiparis') { await trx.rollback(); return res.status(406).json({ type: 'error', message: 'Status tidak valid' }); }
    if (tiket.pinjam_arsiparis_id !== empid) { await trx.rollback(); return res.status(406).json({ type: 'error', message: 'Anda bukan arsiparis yang bertanggung jawab' }); }

    await trx('trs_permintaan_arsip').where('id', id).update({ pinjam_status: 'Peminjaman Berhasil' });
    await trx('trs_log').insert({
      trs_log_no_tiket: no_tiket,
      trs_log_proses: 'Tolak Pengembalian',
      trs_log_hasil: 'Peminjaman Berhasil',
      trs_log_pic: empid,
      trs_log_tgl: trx.fn.now(),
      trs_log_status: 1,
      trs_log_catatan: alasan_tolak,
      trs_log_jenis: 5,
      trs_log_reason_revisi: alasan_tolak,
      trs_log_keterangan: alasan_tolak,
    });

    await trx.commit();

    const peminjam = await getEmployeeData(tiket.pinjam_user_id);
    if (peminjam && peminjam.email) {
      await sendEmailSafe('pengembalian-ditolak.ejs', {
        peminjam_nama: peminjam.nama,
        no_tiket,
        nama_doc: tiket.pinjam_nama_doc,
        alasan: alasan_tolak,
      }, { to: peminjam.email, subject: 'NOTIFIKASI PENGEMBALIAN DOKUMEN (TOLAK)' }, 'tolakPengembalian');
    }

    return res.json({ status: 1, message: 'Pengembalian ditolak' });
  } catch (error) {
    await trx.rollback();
    logger(error, 'POST /tolakPengembalian', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

// ─── submitPerpanjangan ───────────────────────────────────────────────────────

export const submitPerpanjangan = async (req, res) => {
  // #swagger.tags = ['PengembalianPerpanjangan']
  /* #swagger.security = [{ "bearerAuth": [] }] */
  // #swagger.description = 'User ajukan perpanjangan masa pinjam'
  const trx = await dbDMS.transaction();
  try {
    const { creator: empidDecrypt, no_tiket, id, alasan_perpanjang, perpanjang_mulai_tgl, perpanjang_sampai_tgl, panjang1_ket_user } = req.body;
    const empid = decrypt(empidDecrypt);

    const tiket = await trx('trs_permintaan_arsip').where('id', id).first();
    if (!tiket) { await trx.rollback(); return res.status(406).json({ type: 'error', message: 'Data tidak ditemukan' }); }
    if (tiket.pinjam_status !== 'Peminjaman Berhasil') { await trx.rollback(); return res.status(406).json({ type: 'error', message: 'Status tidak valid untuk perpanjangan' }); }
    if (tiket.pinjam_user_id !== empid) { await trx.rollback(); return res.status(406).json({ type: 'error', message: 'Anda bukan peminjam dokumen ini' }); }
    if ((tiket.perpanjang_qty || 0) >= 2) { await trx.rollback(); return res.status(406).json({ type: 'error', message: 'Maksimal perpanjangan 2 kali sudah tercapai' }); }
    if (!alasan_perpanjang) { await trx.rollback(); return res.status(406).json({ type: 'error', message: 'Alasan perpanjangan wajib diisi' }); }

    // Tentukan atasan user
    const empData = await getEmployeeSuperior(empid);
    const atasanId = (empData && empData.approver_divhead && empData.approver_divhead !== '') ? empData.approver_divhead : (empData ? empData.approver_dh : null);
    if (!atasanId) { await trx.rollback(); return res.status(406).json({ type: 'error', message: 'Atasan user tidak ditemukan' }); }

    const updateData = {
      pinjam_status: 'Perpanjangan Approval Atasan User',
      pinjam_user_approve: atasanId,
      pinjam_alasan_perpanjang: alasan_perpanjang,
      perpanjang_mulai_tgl: perpanjang_mulai_tgl,
      perpanjang_sampai_tgl: perpanjang_sampai_tgl,
      panjang1_ket_user: panjang1_ket_user || '',
    };

    // Handle file upload lampiran perpanjangan
    const uploadDir = path.join(process.cwd(), 'uploads', 'permintaan', 'perpanjang');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

    const files = req.files || {};
    const fileArr = files['perpanjang_upload_file1'];
    if (fileArr && fileArr[0]) {
      const file = fileArr[0];
      const ext = file.originalname.split('.').pop();
      const destName = `${id}-1.${ext}`;
      const destPath = path.join(uploadDir, destName);
      const oldFile = tiket.perpanjang_upload_file1;
      if (oldFile) { const oldPath = path.join(uploadDir, oldFile); if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath); }
      fs.renameSync(file.path, destPath);
      updateData.perpanjang_upload_file1 = destName;
    }

    await trx('trs_permintaan_arsip').where('id', id).update(updateData);
    await trx('trs_log').insert({
      trs_log_no_tiket: no_tiket,
      trs_log_proses: 'Submit Perpanjangan',
      trs_log_hasil: 'Approval Atasan User',
      trs_log_pic: empid,
      trs_log_tgl: trx.fn.now(),
      trs_log_status: 1,
      trs_log_catatan: alasan_perpanjang,
      trs_log_jenis: 4,
      trs_log_reason_revisi: '',
      trs_log_keterangan: panjang1_ket_user || '',
    });

    await trx.commit();

    const atasan = await getEmployeeData(atasanId);
    if (atasan && atasan.email) {
      await sendEmailSafe('perpanjangan-atasan-user.ejs', {
        atasan_nama: atasan.nama,
        peminjam_nama: empData ? empData.nama : empid,
        no_tiket,
        nama_doc: tiket.pinjam_nama_doc,
        alasan: alasan_perpanjang,
        perpanjang_mulai_tgl,
        perpanjang_sampai_tgl,
      }, { to: atasan.email, subject: 'NOTIFIKASI PERPANJANGAN DOKUMEN (APPROVE)' }, 'submitPerpanjangan');
    }

    return res.json({ status: 1, message: 'Perpanjangan berhasil diajukan' });
  } catch (error) {
    await trx.rollback();
    logger(error, 'POST /submitPerpanjangan', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

// ─── approveAtasanUser ────────────────────────────────────────────────────────

export const approveAtasanUser = async (req, res) => {
  // #swagger.tags = ['PengembalianPerpanjangan']
  /* #swagger.security = [{ "bearerAuth": [] }] */
  const trx = await dbDMS.transaction();
  try {
    const { creator: empidDecrypt, no_tiket, id, panjang1_ket_atasan_user } = req.body;
    const empid = decrypt(empidDecrypt);

    const tiket = await trx('trs_permintaan_arsip').where('id', id).first();
    if (!tiket) { await trx.rollback(); return res.status(406).json({ type: 'error', message: 'Data tidak ditemukan' }); }
    if (tiket.pinjam_status !== 'Perpanjangan Approval Atasan User') { await trx.rollback(); return res.status(406).json({ type: 'error', message: 'Status tidak valid' }); }
    if (tiket.pinjam_user_approve !== empid) { await trx.rollback(); return res.status(406).json({ type: 'error', message: 'Anda tidak berhak melakukan approval ini' }); }

    const approval = await getMasterApprovalLegal(tiket.bu_id, tiket.pinjam_prioritas_approve);
    if (!approval) { await trx.rollback(); return res.status(406).json({ type: 'error', message: 'Konfigurasi approval legal tidak ditemukan' }); }

    await trx('trs_permintaan_arsip').where('id', id).update({
      pinjam_status: 'Perpanjangan Approval Legal',
      pinjam_user_approve: approval.app_bag1_emp_id1,
      pinjam_approve_ke: 1,
      panjang1_ket_atasan_user: panjang1_ket_atasan_user || '',
    });
    await trx('trs_log').insert({
      trs_log_no_tiket: no_tiket, trs_log_proses: 'Approve Atasan User', trs_log_hasil: 'Approval Legal',
      trs_log_pic: empid, trs_log_tgl: trx.fn.now(), trs_log_status: 1,
      trs_log_catatan: panjang1_ket_atasan_user || 'Disetujui', trs_log_jenis: 4, trs_log_reason_revisi: '',
    });
    await trx.commit();

    const legal = await getEmployeeData(approval.app_bag1_emp_id1);
    if (legal && legal.email) {
      await sendEmailSafe('perpanjangan-legal.ejs', {
        legal_nama: legal.nama, no_tiket, nama_doc: tiket.pinjam_nama_doc,
        catatan_atasan: panjang1_ket_atasan_user || '-',
        perpanjang_mulai_tgl: tiket.perpanjang_mulai_tgl, perpanjang_sampai_tgl: tiket.perpanjang_sampai_tgl,
      }, { to: legal.email, subject: 'NOTIFIKASI PERPANJANGAN DOKUMEN (APPROVE)' }, 'approveAtasanUser');
    }

    return res.json({ status: 1, message: 'Berhasil diapprove' });
  } catch (error) {
    await trx.rollback();
    logger(error, 'POST /approveAtasanUser', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

// ─── tolakAtasanUser ──────────────────────────────────────────────────────────

export const tolakAtasanUser = async (req, res) => {
  // #swagger.tags = ['PengembalianPerpanjangan']
  /* #swagger.security = [{ "bearerAuth": [] }] */
  const trx = await dbDMS.transaction();
  try {
    const { creator: empidDecrypt, no_tiket, id, panjang1_ket_atasan_user } = req.body;
    const empid = decrypt(empidDecrypt);
    if (!panjang1_ket_atasan_user) return res.status(406).json({ type: 'error', message: 'Catatan penolakan wajib diisi' });

    const tiket = await trx('trs_permintaan_arsip').where('id', id).first();
    if (!tiket) { await trx.rollback(); return res.status(406).json({ type: 'error', message: 'Data tidak ditemukan' }); }
    if (tiket.pinjam_status !== 'Perpanjangan Approval Atasan User') { await trx.rollback(); return res.status(406).json({ type: 'error', message: 'Status tidak valid' }); }
    if (tiket.pinjam_user_approve !== empid) { await trx.rollback(); return res.status(406).json({ type: 'error', message: 'Anda tidak berhak melakukan aksi ini' }); }

    await trx('trs_permintaan_arsip').where('id', id).update({
      pinjam_status: 'Peminjaman Berhasil', pinjam_user_approve: null,
      panjang1_ket_atasan_user: panjang1_ket_atasan_user,
    });
    await trx('trs_log').insert({
      trs_log_no_tiket: no_tiket, trs_log_proses: 'Tolak Atasan User', trs_log_hasil: 'Peminjaman Berhasil',
      trs_log_pic: empid, trs_log_tgl: trx.fn.now(), trs_log_status: 1,
      trs_log_catatan: panjang1_ket_atasan_user, trs_log_jenis: 4, trs_log_reason_revisi: panjang1_ket_atasan_user,
    });
    await trx.commit();

    const peminjam = await getEmployeeData(tiket.pinjam_user_id);
    if (peminjam && peminjam.email) {
      await sendEmailSafe('perpanjangan-atasan-user-tolak.ejs', {
        peminjam_nama: peminjam.nama, no_tiket, nama_doc: tiket.pinjam_nama_doc, alasan: panjang1_ket_atasan_user,
      }, { to: peminjam.email, subject: 'NOTIFIKASI PERPANJANGAN DOKUMEN (TOLAK)' }, 'tolakAtasanUser');
    }

    return res.json({ status: 1, message: 'Perpanjangan ditolak' });
  } catch (error) {
    await trx.rollback();
    logger(error, 'POST /tolakAtasanUser', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

// ─── approveLegal ─────────────────────────────────────────────────────────────

export const approveLegal = async (req, res) => {
  // #swagger.tags = ['PengembalianPerpanjangan']
  /* #swagger.security = [{ "bearerAuth": [] }] */
  const trx = await dbDMS.transaction();
  try {
    const { creator: empidDecrypt, no_tiket, id, panjang1_ket_corp_legal } = req.body;
    const empid = decrypt(empidDecrypt);

    const tiket = await trx('trs_permintaan_arsip').where('id', id).first();
    if (!tiket) { await trx.rollback(); return res.status(406).json({ type: 'error', message: 'Data tidak ditemukan' }); }
    if (tiket.pinjam_status !== 'Perpanjangan Approval Legal') { await trx.rollback(); return res.status(406).json({ type: 'error', message: 'Status tidak valid' }); }
    if (tiket.pinjam_user_approve !== empid) { await trx.rollback(); return res.status(406).json({ type: 'error', message: 'Anda tidak berhak melakukan approval ini' }); }

    const approval = await getMasterApprovalLegal(tiket.bu_id, tiket.pinjam_prioritas_approve);
    if (!approval) { await trx.rollback(); return res.status(406).json({ type: 'error', message: 'Konfigurasi approval tidak ditemukan' }); }

    await trx('trs_permintaan_arsip').where('id', id).update({
      pinjam_status: 'Perpanjangan Approval Atasan Legal',
      pinjam_user_approve: approval.app_bag1_emp_id2,
      pinjam_approve_ke: 2,
      panjang1_ket_corp_legal: panjang1_ket_corp_legal || '',
    });
    await trx('trs_log').insert({
      trs_log_no_tiket: no_tiket, trs_log_proses: 'Approve Corp Legal SH', trs_log_hasil: 'Approval Atasan Legal',
      trs_log_pic: empid, trs_log_tgl: trx.fn.now(), trs_log_status: 1,
      trs_log_catatan: panjang1_ket_corp_legal || 'Disetujui', trs_log_jenis: 4, trs_log_reason_revisi: '',
    });
    await trx.commit();

    const atasanLegal = await getEmployeeData(approval.app_bag1_emp_id2);
    if (atasanLegal && atasanLegal.email) {
      await sendEmailSafe('perpanjangan-atasan-legal.ejs', {
        atasan_legal_nama: atasanLegal.nama, no_tiket, nama_doc: tiket.pinjam_nama_doc,
        catatan_legal: panjang1_ket_corp_legal || '-',
        perpanjang_mulai_tgl: tiket.perpanjang_mulai_tgl, perpanjang_sampai_tgl: tiket.perpanjang_sampai_tgl,
      }, { to: atasanLegal.email, subject: 'NOTIFIKASI PERPANJANGAN DOKUMEN (APPROVE)' }, 'approveLegal');
    }

    return res.json({ status: 1, message: 'Berhasil diapprove' });
  } catch (error) {
    await trx.rollback();
    logger(error, 'POST /approveLegal', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

// ─── tolakLegal ───────────────────────────────────────────────────────────────

export const tolakLegal = async (req, res) => {
  // #swagger.tags = ['PengembalianPerpanjangan']
  /* #swagger.security = [{ "bearerAuth": [] }] */
  const trx = await dbDMS.transaction();
  try {
    const { creator: empidDecrypt, no_tiket, id, panjang1_ket_corp_legal } = req.body;
    const empid = decrypt(empidDecrypt);
    if (!panjang1_ket_corp_legal) return res.status(406).json({ type: 'error', message: 'Catatan penolakan wajib diisi' });

    const tiket = await trx('trs_permintaan_arsip').where('id', id).first();
    if (!tiket) { await trx.rollback(); return res.status(406).json({ type: 'error', message: 'Data tidak ditemukan' }); }
    if (tiket.pinjam_status !== 'Perpanjangan Approval Legal') { await trx.rollback(); return res.status(406).json({ type: 'error', message: 'Status tidak valid' }); }
    if (tiket.pinjam_user_approve !== empid) { await trx.rollback(); return res.status(406).json({ type: 'error', message: 'Anda tidak berhak melakukan aksi ini' }); }

    await trx('trs_permintaan_arsip').where('id', id).update({
      pinjam_status: 'Peminjaman Berhasil', pinjam_user_approve: null,
      panjang1_ket_corp_legal: panjang1_ket_corp_legal,
    });
    await trx('trs_log').insert({
      trs_log_no_tiket: no_tiket, trs_log_proses: 'Tolak Corp Legal SH', trs_log_hasil: 'Peminjaman Berhasil',
      trs_log_pic: empid, trs_log_tgl: trx.fn.now(), trs_log_status: 1,
      trs_log_catatan: panjang1_ket_corp_legal, trs_log_jenis: 4, trs_log_reason_revisi: panjang1_ket_corp_legal,
    });
    await trx.commit();

    const peminjam = await getEmployeeData(tiket.pinjam_user_id);
    if (peminjam && peminjam.email) {
      await sendEmailSafe('perpanjangan-legal-tolak.ejs', {
        peminjam_nama: peminjam.nama, no_tiket, nama_doc: tiket.pinjam_nama_doc, alasan: panjang1_ket_corp_legal,
      }, { to: peminjam.email, subject: 'NOTIFIKASI PERPANJANGAN DOKUMEN (TOLAK)' }, 'tolakLegal');
    }

    return res.json({ status: 1, message: 'Perpanjangan ditolak' });
  } catch (error) {
    await trx.rollback();
    logger(error, 'POST /tolakLegal', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

// ─── approveAtasanLegal ───────────────────────────────────────────────────────

export const approveAtasanLegal = async (req, res) => {
  // #swagger.tags = ['PengembalianPerpanjangan']
  /* #swagger.security = [{ "bearerAuth": [] }] */
  const trx = await dbDMS.transaction();
  try {
    const { creator: empidDecrypt, no_tiket, id, panjang1_ket_atasan_corp_legal } = req.body;
    const empid = decrypt(empidDecrypt);

    const tiket = await trx('trs_permintaan_arsip').where('id', id).first();
    if (!tiket) { await trx.rollback(); return res.status(406).json({ type: 'error', message: 'Data tidak ditemukan' }); }
    if (tiket.pinjam_status !== 'Perpanjangan Approval Atasan Legal') { await trx.rollback(); return res.status(406).json({ type: 'error', message: 'Status tidak valid' }); }
    if (tiket.pinjam_user_approve !== empid) { await trx.rollback(); return res.status(406).json({ type: 'error', message: 'Anda tidak berhak melakukan approval ini' }); }

    await trx('trs_permintaan_arsip').where('id', id).update({
      pinjam_status: 'Peminjaman Berhasil',
      pinjam_user_approve: null,
      pinjam_tgl_est_kembali_fr: tiket.perpanjang_mulai_tgl,
      pinjam_tgl_est_kembali_to: tiket.perpanjang_sampai_tgl,
      perpanjang_qty: (tiket.perpanjang_qty || 0) + 1,
      panjang1_ket_atasan_corp_legal: panjang1_ket_atasan_corp_legal || '',
    });
    await trx('trs_log').insert({
      trs_log_no_tiket: no_tiket, trs_log_proses: 'Approve Atasan Legal', trs_log_hasil: 'Perpanjangan Berhasil',
      trs_log_pic: empid, trs_log_tgl: trx.fn.now(), trs_log_status: 1,
      trs_log_catatan: panjang1_ket_atasan_corp_legal || 'Disetujui', trs_log_jenis: 4, trs_log_reason_revisi: '',
    });
    await trx.commit();

    const peminjam = await getEmployeeData(tiket.pinjam_user_id);
    if (peminjam && peminjam.email) {
      await sendEmailSafe('perpanjangan-selesai.ejs', {
        peminjam_nama: peminjam.nama, no_tiket, nama_doc: tiket.pinjam_nama_doc,
        perpanjang_mulai_tgl: tiket.perpanjang_mulai_tgl, perpanjang_sampai_tgl: tiket.perpanjang_sampai_tgl,
        catatan: panjang1_ket_atasan_corp_legal || '-',
      }, { to: peminjam.email, subject: 'NOTIFIKASI PERPANJANGAN DOKUMEN (APPROVE)' }, 'approveAtasanLegal');
    }

    return res.json({ status: 1, message: 'Perpanjangan berhasil disetujui' });
  } catch (error) {
    await trx.rollback();
    logger(error, 'POST /approveAtasanLegal', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

// ─── tolakAtasanLegal ─────────────────────────────────────────────────────────

export const tolakAtasanLegal = async (req, res) => {
  // #swagger.tags = ['PengembalianPerpanjangan']
  /* #swagger.security = [{ "bearerAuth": [] }] */
  const trx = await dbDMS.transaction();
  try {
    const { creator: empidDecrypt, no_tiket, id, panjang1_ket_atasan_corp_legal } = req.body;
    const empid = decrypt(empidDecrypt);
    if (!panjang1_ket_atasan_corp_legal) return res.status(406).json({ type: 'error', message: 'Catatan penolakan wajib diisi' });

    const tiket = await trx('trs_permintaan_arsip').where('id', id).first();
    if (!tiket) { await trx.rollback(); return res.status(406).json({ type: 'error', message: 'Data tidak ditemukan' }); }
    if (tiket.pinjam_status !== 'Perpanjangan Approval Atasan Legal') { await trx.rollback(); return res.status(406).json({ type: 'error', message: 'Status tidak valid' }); }
    if (tiket.pinjam_user_approve !== empid) { await trx.rollback(); return res.status(406).json({ type: 'error', message: 'Anda tidak berhak melakukan aksi ini' }); }

    await trx('trs_permintaan_arsip').where('id', id).update({
      pinjam_status: 'Peminjaman Berhasil', pinjam_user_approve: null,
      panjang1_ket_atasan_corp_legal: panjang1_ket_atasan_corp_legal,
    });
    await trx('trs_log').insert({
      trs_log_no_tiket: no_tiket, trs_log_proses: 'Tolak Atasan Legal', trs_log_hasil: 'Peminjaman Berhasil',
      trs_log_pic: empid, trs_log_tgl: trx.fn.now(), trs_log_status: 1,
      trs_log_catatan: panjang1_ket_atasan_corp_legal, trs_log_jenis: 4, trs_log_reason_revisi: panjang1_ket_atasan_corp_legal,
    });
    await trx.commit();

    const peminjam = await getEmployeeData(tiket.pinjam_user_id);
    if (peminjam && peminjam.email) {
      await sendEmailSafe('perpanjangan-atasan-legal-tolak.ejs', {
        peminjam_nama: peminjam.nama, no_tiket, nama_doc: tiket.pinjam_nama_doc, alasan: panjang1_ket_atasan_corp_legal,
      }, { to: peminjam.email, subject: 'NOTIFIKASI PERPANJANGAN DOKUMEN (TOLAK)' }, 'tolakAtasanLegal');
    }

    return res.json({ status: 1, message: 'Perpanjangan ditolak' });
  } catch (error) {
    await trx.rollback();
    logger(error, 'POST /tolakAtasanLegal', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

// ─── revisiAtasanLegal ────────────────────────────────────────────────────────

export const revisiAtasanLegal = async (req, res) => {
  // #swagger.tags = ['PengembalianPerpanjangan']
  /* #swagger.security = [{ "bearerAuth": [] }] */
  const trx = await dbDMS.transaction();
  try {
    const { creator: empidDecrypt, no_tiket, id, panjang1_ket_atasan_corp_legal, alasan_revisi } = req.body;
    const empid = decrypt(empidDecrypt);
    if (!alasan_revisi) return res.status(406).json({ type: 'error', message: 'Alasan revisi wajib diisi' });

    const tiket = await trx('trs_permintaan_arsip').where('id', id).first();
    if (!tiket) { await trx.rollback(); return res.status(406).json({ type: 'error', message: 'Data tidak ditemukan' }); }
    if (tiket.pinjam_status !== 'Perpanjangan Approval Atasan Legal') { await trx.rollback(); return res.status(406).json({ type: 'error', message: 'Status tidak valid' }); }
    if (tiket.pinjam_user_approve !== empid) { await trx.rollback(); return res.status(406).json({ type: 'error', message: 'Anda tidak berhak melakukan aksi ini' }); }

    const approval = await getMasterApprovalLegal(tiket.bu_id, tiket.pinjam_prioritas_approve);
    if (!approval) { await trx.rollback(); return res.status(406).json({ type: 'error', message: 'Konfigurasi approval tidak ditemukan' }); }

    await trx('trs_permintaan_arsip').where('id', id).update({
      pinjam_status: 'Perpanjangan Approval Legal',
      pinjam_user_approve: approval.app_bag1_emp_id1,
      pinjam_approve_ke: 1,
      panjang1_ket_atasan_corp_legal: panjang1_ket_atasan_corp_legal || '',
    });
    await trx('trs_log').insert({
      trs_log_no_tiket: no_tiket, trs_log_proses: 'Revisi Atasan Legal', trs_log_hasil: 'Approval Legal',
      trs_log_pic: empid, trs_log_tgl: trx.fn.now(), trs_log_status: 1,
      trs_log_catatan: alasan_revisi, trs_log_jenis: 4, trs_log_reason_revisi: alasan_revisi,
    });
    await trx.commit();

    const legal = await getEmployeeData(approval.app_bag1_emp_id1);
    if (legal && legal.email) {
      await sendEmailSafe('perpanjangan-atasan-legal-revisi.ejs', {
        legal_nama: legal.nama, no_tiket, nama_doc: tiket.pinjam_nama_doc, alasan_revisi,
        catatan_atasan: panjang1_ket_atasan_corp_legal || '-',
      }, { to: legal.email, subject: 'NOTIFIKASI PERPANJANGAN DOKUMEN (REVISI)' }, 'revisiAtasanLegal');
    }

    return res.json({ status: 1, message: 'Revisi berhasil dikirim ke Corp Legal SH' });
  } catch (error) {
    await trx.rollback();
    logger(error, 'POST /revisiAtasanLegal', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

// ─── getLaporanPeminjaman ─────────────────────────────────────────────────────

export const getLaporanPeminjaman = async (req, res) => {
  // #swagger.tags = ['PengembalianPerpanjangan']
  /* #swagger.security = [{ "bearerAuth": [] }] */
  // #swagger.description = 'Laporan peminjaman dengan filter + export Excel'
  try {
    const { bu_id, from, to, kategori, status, format } = req.query;

    let query = dbDMS('trs_permintaan_arsip as a')
      .innerJoin('content as b', 'a.pinjam_nomor_doc', 'b.content_doc')
      .leftJoin('mst_lokasi_arsip as e', 'b.lokasi_arsip_id', 'e.lokasi_arsip_id')
      .select(
        'a.*', 'b.content_security', 'b.arsip_no', 'b.arsip_kat as kat_desc', 'e.lokasi_arsip_name',
        dbDMS.raw(`(SELECT WorkDays FROM dbo.fn_GetWorkDays(a.pinjam_tgl_est_kembali_to, GETDATE())) as hari_terlambat`)
      )
      .where('a.pinjam_aktivitas', 'Pinjam Asli');

    if (bu_id) query.where('b.content_bu', bu_id);
    if (from) query.whereRaw("CONVERT(VARCHAR(10), a.pinjam_tgl_create, 120) >= ?", [from]);
    if (to) query.whereRaw("CONVERT(VARCHAR(10), a.pinjam_tgl_create, 120) <= ?", [to]);
    if (kategori) query.where('b.arsip_kat', kategori);
    if (status) query.where('a.pinjam_status', status);

    const data = await query.orderBy('a.pinjam_tgl_create', 'desc').limit(2000);

    if (format === 'excel') {
      res.setHeader('Content-Type', 'application/vnd.ms-excel; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="Laporan_Peminjaman.xls"');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Cache-Control', 'no-cache');

      const escHtml = (t) => t ? String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') : '';
      const fmtDate = (d) => d ? dayjs(d).format('DD-MM-YYYY') : '';

      let html = `<html><head><meta charset="utf-8"><style>table{border-collapse:collapse}th,td{border:1px solid #000;padding:4px;font-size:11px}th{background:#f2f2f2;font-weight:bold}</style></head><body>
      <table><thead><tr><th colspan="11" style="text-align:center;font-size:14px;font-weight:bold">LAPORAN PEMINJAMAN DOKUMEN</th></tr>
      <tr><th>No</th><th>Nomor Tiket</th><th>Nama Arsip</th><th>Kode Arsip</th><th>Lokasi Arsip</th><th>Tgl Pinjam</th><th>Tgl Est. Kembali</th><th>Tgl Kembali Aktual</th><th>Status</th><th>Perpanjangan ke-</th><th>Hari Terlambat</th></tr></thead><tbody>`;

      data.forEach((row, i) => {
        html += `<tr><td>${i+1}</td><td>${escHtml(row.pinjam_no_tiket)}</td><td>${escHtml(row.pinjam_nama_doc)}</td><td>${escHtml(row.arsip_no)}</td><td>${escHtml(row.lokasi_arsip_name)}</td><td>${fmtDate(row.pinjam_tgl_create)}</td><td>${fmtDate(row.pinjam_tgl_est_kembali_to)}</td><td>${fmtDate(row.kembali_tgl)}</td><td>${escHtml(row.pinjam_status)}</td><td>${row.perpanjang_qty || 0}</td><td>${row.hari_terlambat || 0}</td></tr>`;
      });

      html += `</tbody></table></body></html>`;
      return res.send(html);
    }

    return res.status(200).json(data);
  } catch (error) {
    logger(error, 'GET /getLaporanPeminjaman', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};
