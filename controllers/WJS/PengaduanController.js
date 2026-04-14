import { dbDMS } from "../../config/db.js";
import { logger } from "../../helpers/logger.js";
import { decrypt, encrypt, getErrorResponse, generateToken } from "../../helpers/utils.js";
import { generateTicketNumber } from "../../helpers/counter.js";
import { STATUS, checkUserPermissions, parseCurrentUser } from "../../helpers/pengaduan.helper.js";
import { sendPengaduanApprovalEmail, sendPengaduanRevisionEmail } from "../../helpers/pengaduan.mail.js";
import { uploadFile as ftpUpload, removeLocalFile } from "../../helpers/ftp.js";
import dayjs from "dayjs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FRONTEND_URL = process.env.FRONTEND_URL || process.env.FRONTEND || '';

/**
 * Helper: get content info by doc_id for email data
 */
const getContentInfo = async (docId) => {
  if (!docId) return {};
  const row = await dbDMS('content')
    .leftJoin('mst_lokasi_arsip', 'content.lokasi_arsip_id', 'mst_lokasi_arsip.lokasi_arsip_id')
    .select('content.*', 'mst_lokasi_arsip.lokasi_arsip_name')
    .where('content.content_doc', docId)
    .first();
  return row || {};
};

/**
 * Helper: get employee info
 */
const getEmployee = async (nik) => {
  if (!nik) return null;
  const row = await dbDMS('v_mstr_employee')
    .where('employee_pk', nik)
    .first();
  return row || null;
};

/**
 * Helper: find div head (grade 6) or fallback dept head (grade 5)
 */
const findAtasan = async (nik) => {
  // Try div head first (grade 6)
  let result = await dbDMS('v_mstr_employee')
    .where('employee_grade', '6')
    .whereRaw("map_div_id = (SELECT TOP 1 map_div_id FROM v_mstr_employee WHERE employee_pk = ?)", [nik])
    .where('employee_stat', 'ACTIVE')
    .first();
  // Fallback to dept head (grade 5)
  if (!result) {
    result = await dbDMS('v_mstr_employee')
      .where('employee_grade', '5')
      .whereRaw("map_div_id = (SELECT TOP 1 map_div_id FROM v_mstr_employee WHERE employee_pk = ?)", [nik])
      .where('employee_stat', 'ACTIVE')
      .first();
  }
  return result || null;
};

/**
 * Helper: find corp legal approver from mst_approval
 */
const findLegalApprover = async (nikCreate, prioritas, bagField) => {
  const query = dbDMS.raw(`
    SELECT a.${bagField}, c.employee_name, c.employee_email, c.employee_id, c.employee_pk, c.nama_dept
    FROM mst_approval a
    INNER JOIN mst_approval_jenis b ON a.app_jns_trans = b.app_jns_id
    INNER JOIN v_mstr_employee c ON a.${bagField} = c.employee_id COLLATE SQL_Latin1_General_CP1_CI_AS
    WHERE b.app_jns_desc = 'Pengaduan' 
      AND app_prioritas = ?
      AND app_bu_id = (SELECT TOP 1 account_bu FROM master_user WHERE account_username = ?)
  `, [prioritas, nikCreate]);
  console.log('findLegalApprover SQL:', query.toString());
  const result = await query;
  return result && result.length > 0 ? result[0] : null;
};

/**
 * Helper: build email data from ticket
 */
const buildEmailData = async (ticket, content) => {
  return {
    no_pengaduan: ticket.tr_no_adu,
    nama_arsip: content.content_name || ticket.content_name || '-',
    no_dokumen: ticket.tr_adu_no_doc,
    kode_arsip: content.arsip_no || '-',
    status_dokumen: content.content_security || '-',
    kategori_dokumen: content.arsip_kat || '-',
    jenis_dokumen: 'Asli Hard Copy',
    tanggal_dokumen: content.content_entrydate,
    deskripsi: ticket.tr_adu_judul
  };
};

// ============================================
// LIST
// ============================================
export const list = async (req, res) => {
  try {
    const { creator } = req.query;
    const empid = decrypt(creator);

    const { bu_id, lokasi_arsip_id, from, to } = req.query;

    // Get user type
    const userInfo = await dbDMS('master_user')
      .where('account_username', empid)
      .first();
    const userType = userInfo ? userInfo.account_type : 1;

    let query = dbDMS('trs_pengaduan as a')
      .leftJoin(dbDMS.raw('trs_nmr_doc as b ON a.tr_adu_no_doc = b.doc_id'))
      .leftJoin(dbDMS.raw('content as c ON a.tr_adu_no_doc = c.content_doc'))
      .leftJoin(dbDMS.raw('v_mstr_bu as d ON b.doc_bu_id = d.bu_id COLLATE SQL_Latin1_General_CP1_CI_AS'))
      .leftJoin(dbDMS.raw('mst_lokasi_arsip as e ON c.lokasi_arsip_id = e.lokasi_arsip_id'))
      .leftJoin(dbDMS.raw('mst_kategori_doc as f ON f.kat_kode = c.content_kat'))
      .select(
        'a.tr_no_adu', 'a.tr_adu_id', 'a.tr_adu_no_doc', 'a.tr_adu_kategori',
        'a.tr_adu_judul', 'a.tr_tgl_adu', 'a.tr_adu_status', 'a.tr_current_user',
        'a.tr_adu_lampiran_selesai', 'a.tr_adu_keterangan_selesai',
        'c.arsip_no', 'c.content_name', 'c.arsip_kat',
        'e.lokasi_arsip_name', 'f.kat_desc', 'd.bu_name'
      );

    // Filter by user type (matching PHP logic)
    if (userType == 2) {
      // Admin divisi - see own tickets + tickets where they are current user + same division
      query.leftJoin(dbDMS.raw('v_mstr_employee as g ON a.tr_adu_user_nik = g.employee_pk COLLATE SQL_Latin1_General_CP1_CI_AS'))
        .whereRaw(`(a.tr_adu_user_nik = ? OR a.tr_current_user LIKE ? OR g.map_div_id = (SELECT map_div_id FROM v_mstr_employee WHERE employee_pk = ?) COLLATE SQL_Latin1_General_CP1_CI_AS)`,
          [empid, `%${empid}%`, empid]);
    } else if ([3, 7].includes(userType)) {
      // Admin BU
      query.leftJoin(dbDMS.raw('v_mstr_employee as g ON a.tr_adu_user_nik = g.employee_pk COLLATE SQL_Latin1_General_CP1_CI_AS'))
        .whereRaw(`g.map_bu_id = (SELECT account_bu FROM master_user WHERE account_username = ?) COLLATE SQL_Latin1_General_CP1_CI_AS`, [empid]);
    } else if ([4, 5, 6, 8].includes(userType)) {
      // Admin corp - see all
    } else {
      // Regular user - see own + where they are current approver
      query.whereRaw(`(a.tr_adu_user_nik = ? OR a.tr_current_user LIKE ?)`, [empid, `%${empid}%`]);
    }

    // Apply filters
    if (bu_id) query.whereRaw("c.content_bu = ?", [bu_id]);
    if (lokasi_arsip_id) query.whereRaw("c.lokasi_arsip_id = ?", [lokasi_arsip_id]);
    if (from) query.whereRaw("a.tr_tgl_adu >= ?", [from]);
    if (to) query.whereRaw("a.tr_tgl_adu <= ?", [to]);

    // Pagination
    if (req.query.rowsPerPage == null) {
      const results = await query;
      const encrypted = results.map(r => ({ ...r, tr_adu_id: encrypt(String(r.tr_adu_id)), ...checkUserPermissions(r, empid) }));
      return res.status(200).json(encrypted);
    }

    const sorting = req.query.descending === "true" ? "desc" : "asc";
    const columnSort = req.query.sortBy === "asc" ? "a.tr_adu_id asc" : `${req.query.sortBy} ${sorting}`;
    query.orderByRaw(columnSort);

    const response = await query.paginate({
      perPage: Math.floor(req.query.rowsPerPage),
      currentPage: Math.floor(req.query.page),
      isLengthAware: true
    });

    if (response.data) {
      response.data = response.data.map(r => ({ ...r, tr_adu_id: encrypt(String(r.tr_adu_id)), ...checkUserPermissions(r, empid) }));
    }

    return res.status(200).json(response);
  } catch (error) {
    logger(error, 'GET /pengaduan', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

// ============================================
// GET BY ID
// ============================================
export const getById = async (req, res) => {
  try {
    const { creator } = req.query;
    const empid = await decrypt(creator);
    const aduId = decrypt(req.params.id);

    const ticket = await dbDMS('trs_pengaduan as a')
      .leftJoin(dbDMS.raw('trs_nmr_doc as b ON a.tr_adu_no_doc = b.doc_id'))
      .leftJoin(dbDMS.raw('content as c ON a.tr_adu_no_doc = c.content_doc'))
      .leftJoin(dbDMS.raw('v_mstr_bu as d ON b.doc_bu_id = d.bu_id COLLATE SQL_Latin1_General_CP1_CI_AS'))
      .leftJoin(dbDMS.raw('mst_lokasi_arsip as e ON c.lokasi_arsip_id = e.lokasi_arsip_id'))
      .select(
        'a.*', 'c.arsip_no', 'c.content_name', 'c.content_entrydate', 'c.content_kode_lemari',
        'c.arsip_kat', 'c.content_security',
        'e.lokasi_arsip_name', 'd.bu_name'
      )
      .where('a.tr_adu_id', aduId)
      .first();

    if (!ticket) {
      return res.status(406).json({ type: 'error', message: 'Data tidak ditemukan' });
    }

    // Get user type for permission check
    const userInfo = await dbDMS('master_user').where('account_username', empid).first();
    const userType = userInfo ? userInfo.account_type : 1;

    // Add permission flags
    const permissions = checkUserPermissions(ticket, empid, userType);
    Object.assign(ticket, permissions);

    // Get logs
    const logs = await dbDMS.raw(`
      SELECT a.*, b.nama as account_name, FORMAT(a.trs_log_tgl, 'MM/dd/yyyy HH:mm:ss') AS tanggal
      FROM trs_log a
      LEFT JOIN v_mstr_employee_ext b ON a.trs_log_pic = b.id COLLATE SQL_Latin1_General_CP1_CI_AS
      WHERE trs_log_no_tiket = ? ORDER BY trs_log_tgl
    `, [ticket.tr_no_adu]);

    return res.status(200).json({ data: { ...ticket, logs } });
  } catch (error) {
    logger(error, 'GET /pengaduan/:id', req.params);
    return res.status(406).json(getErrorResponse(error));
  }
};

// ============================================
// CREATE
// ============================================
export const create = async (req, res) => {
  const trx = await dbDMS.transaction();
  try {
    const { creator } = req.body;
    const empid = await decrypt(creator);
    const now = dayjs().format("YYYY-MM-DD HH:mm:ss");

    const {
      judul_pengaduan, uraian_pengaduan, tanggal_pengaduan,
      kategori_pengaduan, no_dokumen, no_dokumen_manual,
      nama_dokumen, prioritas, filename
    } = req.body;

    if (!judul_pengaduan || !kategori_pengaduan) {
      await trx.rollback();
      return res.status(406).json({ type: 'error', message: 'Field wajib harus diisi lengkap' });
    }

    const nomor_dokumen = no_dokumen || no_dokumen_manual || '';

    // Get user info for counter params
    const userExt = await trx.raw(`
      SELECT a.*, b.div_nama, b.nama_dept
      FROM v_mstr_employee_ext a
      LEFT JOIN v_mstr_employee b ON a.id = b.employee_pk
      WHERE a.id = ? AND a.status = 'ACTIVE'
    `, [empid]);
    
    if (!userExt || userExt.length === 0) {
      await trx.rollback();
      return res.status(406).json({ type: 'error', message: 'Data user tidak ditemukan' });
    }
    const user = userExt[0];

    // Determine arsip_kat for counter
    // PHP: when no_dokumen is empty (manual), arsip_kat = 'Dokumen Legal'
    // PHP: when no_dokumen is selected, arsip_kat = content.arsip_kat
    let arsipKat = 'Dokumen Legal';
    if (no_dokumen) {
      const content = await trx('content').where('content_doc', no_dokumen).first();
      if (content) arsipKat = content.arsip_kat;
    }

    // Generate ticket number (jns_trans = 8 for pengaduan)
    let no_pengaduan;
    try {
      no_pengaduan = await generateTicketNumber(trx, {
        arsip_kat: arsipKat,
        bu: user.id_bu,
        div: user.id_div,
        jns_trans: '8'
      });
    } catch (counterErr) {
      await trx.rollback();
      return res.status(406).json({ type: 'error', message: 'Counter tidak ditemukan untuk jenis transaksi Pengaduan. Pastikan counter sudah di-setup.' });
    }

    if (!no_pengaduan || !no_pengaduan.trim()) {
      await trx.rollback();
      return res.status(406).json({ type: 'error', message: 'Gagal generate nomor pengaduan' });
    }

    // Find atasan (div head grade 6, fallback dept head grade 5)
    const atasan = await findAtasan(empid);
    if (!atasan) {
      await trx.rollback();
      return res.status(406).json({ type: 'error', message: 'Atasan tidak ditemukan untuk user ini' });
    }

    const currentUser = `${atasan.employee_pk} - Div Head`;

    // Insert pengaduan
    await trx('trs_pengaduan').insert({
      tr_no_adu: no_pengaduan,
      tr_adu_judul: judul_pengaduan,
      tr_adu_uraian_user: uraian_pengaduan,
      tr_tgl_adu: tanggal_pengaduan,
      tr_adu_kategori: kategori_pengaduan,
      tr_adu_user_nik: empid,
      tr_adu_no_doc: nomor_dokumen,
      tr_file_upload_user: filename || '',
      tr_adu_status: STATUS.PENDING_ATASAN,
      tr_adu_jns_transaksi_approve: 'Pengaduan',
      tr_adu_prioritas_approve: prioritas || 1,
      tr_current_user: currentUser,
      tr_token: generateToken(),
      updated_by: empid,
      updated_at: now
    });

    // Insert log
    await trx.raw(`
      INSERT INTO trs_log VALUES (?, 'Pembuatan Tiket', 'Verifikasi Atasan Pembuat Tiket', ?, GETDATE(), 0, '', 8, NULL, NULL)
    `, [no_pengaduan, empid]);

    await trx.commit();

    // Send email to atasan (after commit)
    try {
      const newTicket = await dbDMS('trs_pengaduan').where('tr_no_adu', no_pengaduan).select('tr_token').first();
      const content = await getContentInfo(no_dokumen);
      const pengadu = await getEmployee(empid);
      // For manual doc: use nama_dokumen from form; for selected doc: use content.content_name
      const emailNamaArsip = no_dokumen ? (content.content_name || '') : (nama_dokumen || '');
      const emailData = await buildEmailData(
        { tr_no_adu: no_pengaduan, tr_adu_no_doc: nomor_dokumen, tr_adu_judul: judul_pengaduan, content_name: emailNamaArsip },
        content
      );

      await sendPengaduanApprovalEmail({
        ...emailData,
        recipient_name: atasan.employee_name,
        recipient_email: atasan.employee_email,
        nama_pengadu: pengadu?.employee_name || empid,
        nik_pengadu: pengadu?.employee_id||'-',
        dept_pengadu: pengadu?.nama_dept || '-',
        approval_link: `${FRONTEND_URL}/#/approval/pengaduan?token=${newTicket.tr_token}`
      });
    } catch (mailErr) {
      console.error('Email error (non-fatal):', mailErr.message);
    }

    return res.json("sukses");
  } catch (error) {
    await trx.rollback();
    logger(error, 'POST /pengaduan', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

// ============================================
// APPROVE ATASAN
// ============================================
export const approveAtasan = async (req, res) => {
  const trx = await dbDMS.transaction();
  try {
    const { creator } = req.body;
    const empid = await decrypt(creator);

    const aduId = decrypt(req.params.id);
    const ticket = await trx('trs_pengaduan').where('tr_adu_id', aduId).first();
    if (!ticket) { await trx.rollback(); return res.status(406).json({ type: 'error', message: 'Data tidak ditemukan' }); }

    // Find corp legal SH (bag1_nik_id1)
    const legalSH = await findLegalApprover(ticket.tr_adu_user_nik, ticket.tr_adu_prioritas_approve, 'app_bag1_nik_id1');
    if (!legalSH) { await trx.rollback(); return res.status(406).json({ type: 'error', message: 'Approver Corporate Legal SH tidak ditemukan' }); }

    const currentUser = `${legalSH.employee_pk} - Legal SH`;

    await trx('trs_pengaduan').where('tr_adu_id', aduId).update({
      tr_adu_status: STATUS.PENDING_LEGAL_SH,
      tr_adu_atasan_user_nik: empid,
      tr_current_user: currentUser,
      tr_token: generateToken(),
      updated_by: empid,
      updated_at: dayjs().format("YYYY-MM-DD HH:mm:ss")
    });

    await trx.raw(`
      INSERT INTO trs_log VALUES (?, 'Atasan dokumen owner approve', 'Verifikasi atasan pembuat tiket', ?, GETDATE(), 1, 'Approved', 8, NULL, NULL)
    `, [ticket.tr_no_adu, empid]);

    await trx.commit();

    // Send email to legal SH
    try {
      const updatedTicket = await dbDMS('trs_pengaduan').where('tr_adu_id', aduId).select('tr_token').first();
      const content = await getContentInfo(ticket.tr_adu_no_doc);
      const pengadu = await getEmployee(ticket.tr_adu_user_nik);
      const emailData = await buildEmailData(ticket, content);

      await sendPengaduanApprovalEmail({
        ...emailData,
        recipient_name: legalSH.employee_name,
        recipient_email: legalSH.employee_email,
        nama_pengadu: pengadu?.employee_name || ticket.tr_adu_user_nik,
        nik_pengadu:  pengadu?.employee_id||'-',
        dept_pengadu: pengadu?.nama_dept || '-',
        approval_link: `${FRONTEND_URL}/#/approval/pengaduan?token=${updatedTicket.tr_token}`
      });
    } catch (mailErr) {
      console.error('Email error (non-fatal):', mailErr.message);
    }

    return res.json("sukses");
  } catch (error) {
    await trx.rollback();
    logger(error, 'POST /pengaduan/:id/approve-atasan', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

// ============================================
// REJECT ATASAN (send back to user for revision)
// ============================================
export const rejectAtasan = async (req, res) => {
  const trx = await dbDMS.transaction();
  try {
    const { creator, reason } = req.body;
    const empid = await decrypt(creator);
    const aduId = decrypt(req.params.id);

    const ticket = await trx('trs_pengaduan').where('tr_adu_id', aduId).first();
    if (!ticket) { await trx.rollback(); return res.status(406).json({ type: 'error', message: 'Data tidak ditemukan' }); }

    const currentUser = `${ticket.tr_adu_user_nik} - Tolak`;

    await trx('trs_pengaduan').where('tr_adu_id', aduId).update({
      tr_adu_status: STATUS.REJECTED,
      tr_adu_atasan_user_nik: empid,
      tr_current_user: currentUser,
      tr_token: generateToken(),
      updated_by: empid,
      updated_at: dayjs().format("YYYY-MM-DD HH:mm:ss")
    });

    await trx.raw(`
      INSERT INTO trs_log VALUES (?, 'Atasan dokumen owner revisi', 'Verifikasi atasan pembuat tiket', ?, GETDATE(), 1, ?, 8, NULL, NULL)
    `, [ticket.tr_no_adu, empid, reason || '']);

    await trx.commit();

    // Send revision email to user
    try {
      const updatedTicket = await dbDMS('trs_pengaduan').where('tr_adu_id', aduId).select('tr_token').first();
      const content = await getContentInfo(ticket.tr_adu_no_doc);
      const rejector = await getEmployee(empid);
      const user = await getEmployee(ticket.tr_adu_user_nik);
      const emailData = await buildEmailData(ticket, content);

      await sendPengaduanRevisionEmail({
        ...emailData,
        recipient_name: user?.employee_name || ticket.tr_adu_user_nik,
        recipient_email: user?.employee_email || '',
        rejector_name: rejector?.employee_name || empid,
        rejector_nik: empid,
        rejector_dept: rejector?.nama_dept || '-',
        reason: reason || '-',
        revision_link: `${FRONTEND_URL}/#/approval/pengaduan?token=${updatedTicket.tr_token}`,
        is_final_reject: false
      });
    } catch (mailErr) {
      console.error('Email error (non-fatal):', mailErr.message);
    }

    return res.json("sukses");
  } catch (error) {
    await trx.rollback();
    logger(error, 'POST /pengaduan/:id/reject-atasan', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

// ============================================
// REVISE (user re-submit after atasan rejection)
// ============================================
export const revise = async (req, res) => {
  const trx = await dbDMS.transaction();
  try {
    const { creator } = req.body;
    const empid = await decrypt(creator);
    const aduId = decrypt(req.params.id);

    const {
      judul_pengaduan, uraian_pengaduan, tanggal_pengaduan,
      kategori_pengaduan, no_dokumen, prioritas, filename
    } = req.body;

    const ticket = await trx('trs_pengaduan').where('tr_adu_id', aduId).first();
    if (!ticket) { await trx.rollback(); return res.status(406).json({ type: 'error', message: 'Data tidak ditemukan' }); }

    // Find atasan again
    const atasan = await findAtasan(empid);
    if (!atasan) { await trx.rollback(); return res.status(406).json({ type: 'error', message: 'Atasan tidak ditemukan' }); }

    const currentUser = `${atasan.employee_pk} - Div Head`;

    const updateData = {
      tr_adu_judul: judul_pengaduan || ticket.tr_adu_judul,
      tr_adu_uraian_user: uraian_pengaduan || ticket.tr_adu_uraian_user,
      tr_tgl_adu: tanggal_pengaduan || ticket.tr_tgl_adu,
      tr_adu_kategori: kategori_pengaduan || ticket.tr_adu_kategori,
      tr_adu_user_nik: empid,
      tr_adu_no_doc: no_dokumen || ticket.tr_adu_no_doc,
      tr_adu_status: STATUS.PENDING_ATASAN,
      tr_adu_prioritas_approve: prioritas || ticket.tr_adu_prioritas_approve,
      tr_current_user: currentUser,
      tr_token: generateToken(),
      updated_by: empid,
      updated_at: dayjs().format("YYYY-MM-DD HH:mm:ss")
    };
    if (filename) updateData.tr_file_upload_user = filename;

    await trx('trs_pengaduan').where('tr_adu_id', aduId).update(updateData);

    await trx.raw(`
      INSERT INTO trs_log VALUES (?, 'Pembuatan Tiket', 'Verifikasi Atasan Pembuat Tiket', ?, GETDATE(), 0, '', 8, NULL, NULL)
    `, [ticket.tr_no_adu, empid]);

    await trx.commit();

    // Send email to atasan
    try {
      const updatedTicket = await dbDMS('trs_pengaduan').where('tr_adu_id', aduId).select('tr_token').first();
      const content = await getContentInfo(no_dokumen || ticket.tr_adu_no_doc);
      const pengadu = await getEmployee(empid);
      const emailData = await buildEmailData({ ...ticket, tr_adu_judul: judul_pengaduan || ticket.tr_adu_judul }, content);

      await sendPengaduanApprovalEmail({
        ...emailData,
        recipient_name: atasan.employee_name,
        recipient_email: atasan.employee_email,
        nama_pengadu: pengadu?.employee_name || empid,
        nik_pengadu: pengadu?.employee_id||'-',
        dept_pengadu: pengadu?.nama_dept || '-',
        approval_link: `${FRONTEND_URL}/#/approval/pengaduan?token=${updatedTicket.tr_token}`
      });
    } catch (mailErr) {
      console.error('Email error (non-fatal):', mailErr.message);
    }

    return res.json("sukses");
  } catch (error) {
    await trx.rollback();
    logger(error, 'PUT /pengaduan/:id/revise', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

// ============================================
// APPROVE LEGAL SH
// ============================================
export const approveLegalSH = async (req, res) => {
  const trx = await dbDMS.transaction();
  try {
    const { creator } = req.body;
    const empid = await decrypt(creator);
    const aduId = decrypt(req.params.id);

    const ticket = await trx('trs_pengaduan').where('tr_adu_id', aduId).first();
    if (!ticket) { await trx.rollback(); return res.status(406).json({ type: 'error', message: 'Data tidak ditemukan' }); }

    // Find corp legal DH (bag1_nik_id2)
    const legalDH = await findLegalApprover(ticket.tr_adu_user_nik, ticket.tr_adu_prioritas_approve, 'app_bag1_nik_id2');
    if (!legalDH) { await trx.rollback(); return res.status(406).json({ type: 'error', message: 'Approver Corporate Legal DH tidak ditemukan' }); }

    const currentUser = `${legalDH.employee_pk} - Legal DH`;

    await trx('trs_pengaduan').where('tr_adu_id', aduId).update({
      tr_adu_status: STATUS.PENDING_LEGAL_DH,
      tr_adu_corp_lgl_nik: empid,
      tr_current_user: currentUser,
      tr_token: generateToken(),
      updated_by: empid,
      updated_at: dayjs().format("YYYY-MM-DD HH:mm:ss")
    });

    await trx.raw(`
      INSERT INTO trs_log VALUES (?, 'Corporate legal SH approve', 'Verifikasi corp legal SH', ?, GETDATE(), 1, 'Approved', 8, NULL, NULL)
    `, [ticket.tr_no_adu, empid]);

    await trx.commit();

    // Send email to legal DH
    try {
      const updatedTicket = await dbDMS('trs_pengaduan').where('tr_adu_id', aduId).select('tr_token').first();
      const content = await getContentInfo(ticket.tr_adu_no_doc);
      const pengadu = await getEmployee(ticket.tr_adu_user_nik);
      const emailData = await buildEmailData(ticket, content);

      await sendPengaduanApprovalEmail({
        ...emailData,
        recipient_name: legalDH.employee_name,
        recipient_email: legalDH.employee_email,
        nama_pengadu: pengadu?.employee_name || ticket.tr_adu_user_nik,
        nik_pengadu: pengadu?.employee_id||'-',
        dept_pengadu: pengadu?.nama_dept || '-',
        approval_link: `${FRONTEND_URL}/#/approval/pengaduan?token=${updatedTicket.tr_token}`
      });
    } catch (mailErr) {
      console.error('Email error (non-fatal):', mailErr.message);
    }

    return res.json("sukses");
  } catch (error) {
    await trx.rollback();
    logger(error, 'POST /pengaduan/:id/approve-legal-sh', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

// ============================================
// REJECT LEGAL SH (final reject - user can re-create)
// ============================================
export const rejectLegalSH = async (req, res) => {
  const trx = await dbDMS.transaction();
  try {
    const { creator, reason } = req.body;
    const empid = await decrypt(creator);
    const aduId = decrypt(req.params.id);

    const ticket = await trx('trs_pengaduan').where('tr_adu_id', aduId).first();
    if (!ticket) { await trx.rollback(); return res.status(406).json({ type: 'error', message: 'Data tidak ditemukan' }); }

    await trx('trs_pengaduan').where('tr_adu_id', aduId).update({
      tr_adu_status: STATUS.REJECTED,
      tr_adu_corp_lgl_nik: empid,
      tr_current_user: `${ticket.tr_adu_user_nik} - Tolak legal SH`,
      updated_by: empid,
      updated_at: dayjs().format("YYYY-MM-DD HH:mm:ss")
    });

    await trx.raw(`
      INSERT INTO trs_log VALUES (?, 'Corporate legal SH tolak', 'Verifikasi corp legal SH', ?, GETDATE(), 1, ?, 8, NULL, NULL)
    `, [ticket.tr_no_adu, empid, reason || '']);

    await trx.commit();

    // Send final rejection email to user
    try {
      const content = await getContentInfo(ticket.tr_adu_no_doc);
      const rejector = await getEmployee(empid);
      const user = await getEmployee(ticket.tr_adu_user_nik);
      const emailData = await buildEmailData(ticket, content);

      await sendPengaduanRevisionEmail({
        ...emailData,
        recipient_name: user?.employee_name || ticket.tr_adu_user_nik,
        recipient_email: user?.employee_email || '',
        rejector_name: rejector?.employee_name || empid,
        rejector_nik: empid,
        rejector_dept: rejector?.nama_dept || '-',
        reason: reason || '-',
        is_final_reject: true
      });
    } catch (mailErr) {
      console.error('Email error (non-fatal):', mailErr.message);
    }

    return res.json("sukses");
  } catch (error) {
    await trx.rollback();
    logger(error, 'POST /pengaduan/:id/reject-legal-sh', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

// ============================================
// APPROVE LEGAL DH
// ============================================
export const approveLegalDH = async (req, res) => {
  const trx = await dbDMS.transaction();
  try {
    const { creator } = req.body;
    const empid = await decrypt(creator);
    const aduId = decrypt(req.params.id);

    const ticket = await trx('trs_pengaduan').where('tr_adu_id', aduId).first();
    if (!ticket) { await trx.rollback(); return res.status(406).json({ type: 'error', message: 'Data tidak ditemukan' }); }

    // Update content status based on kategori
    if (ticket.tr_adu_no_doc && ticket.tr_adu_no_doc.trim()) {
      if (ticket.tr_adu_kategori === 'Hilang') {
        await trx('content').where('content_doc', ticket.tr_adu_no_doc).update({ content_status: 'Hilang' });
      } else if (ticket.tr_adu_kategori === 'Rusak') {
        await trx('content').where('content_doc', ticket.tr_adu_no_doc).update({ content_pengaduan_rusak: 1 });
      }
    }

    const currentUser = `${empid} - Selesai`;

    await trx('trs_pengaduan').where('tr_adu_id', aduId).update({
      tr_adu_status: STATUS.PROCESSING,
      tr_adu_atasan_corp_lgl_nik: empid,
      tr_current_user: currentUser,
      tr_token: generateToken(),
      updated_by: empid,
      updated_at: dayjs().format("YYYY-MM-DD HH:mm:ss")
    });

    await trx.raw(`
      INSERT INTO trs_log VALUES (?, 'Corporate legal DH approve', 'Pengaduan diterima dan sedang di proses', ?, GETDATE(), 1, 'Approved', 8, NULL, NULL)
    `, [ticket.tr_no_adu, empid]);

    await trx.commit();
    return res.json("sukses");
  } catch (error) {
    await trx.rollback();
    logger(error, 'POST /pengaduan/:id/approve-legal-dh', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

// ============================================
// REJECT LEGAL DH (final reject)
// ============================================
export const rejectLegalDH = async (req, res) => {
  const trx = await dbDMS.transaction();
  try {
    const { creator, reason } = req.body;
    const empid = await decrypt(creator);
    const aduId = decrypt(req.params.id);

    const ticket = await trx('trs_pengaduan').where('tr_adu_id', aduId).first();
    if (!ticket) { await trx.rollback(); return res.status(406).json({ type: 'error', message: 'Data tidak ditemukan' }); }

    await trx('trs_pengaduan').where('tr_adu_id', aduId).update({
      tr_adu_status: STATUS.REJECTED,
      tr_adu_atasan_corp_lgl_nik: empid,
      tr_current_user: `${ticket.tr_adu_user_nik} - Tolak Legal DH`,
      updated_by: empid,
      updated_at: dayjs().format("YYYY-MM-DD HH:mm:ss")
    });

    await trx.raw(`
      INSERT INTO trs_log VALUES (?, 'Corporate legal DH tolak', 'Verifikasi corp legal DH', ?, GETDATE(), 1, ?, 8, NULL, NULL)
    `, [ticket.tr_no_adu, empid, reason || '']);

    await trx.commit();

    // Send final rejection email
    try {
      const content = await getContentInfo(ticket.tr_adu_no_doc);
      const rejector = await getEmployee(empid);
      const user = await getEmployee(ticket.tr_adu_user_nik);
      const emailData = await buildEmailData(ticket, content);

      await sendPengaduanRevisionEmail({
        ...emailData,
        recipient_name: user?.employee_name || ticket.tr_adu_user_nik,
        recipient_email: user?.employee_email || '',
        rejector_name: rejector?.employee_name || empid,
        rejector_nik: empid,
        rejector_dept: rejector?.nama_dept || '-',
        reason: reason || '-',
        is_final_reject: true
      });
    } catch (mailErr) {
      console.error('Email error (non-fatal):', mailErr.message);
    }

    return res.json("sukses");
  } catch (error) {
    await trx.rollback();
    logger(error, 'POST /pengaduan/:id/reject-legal-dh', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

// ============================================
// SELESAI (Legal DH closes the ticket)
// ============================================
export const selesai = async (req, res) => {
  const trx = await dbDMS.transaction();
  try {
    const { creator, keterangan } = req.body;
    const empid = decrypt(creator);
    const aduId = decrypt(req.params.id);

    // Get filename from multer upload if present
    let filename = req.body.filename || '';
    if (req.file) {
      // Upload to FTP (temp in file/ → FTP dmslegal folder)
      await ftpUpload('file', 'dmslegal', req.file.filename);
      await removeLocalFile(req.file.path).catch(() => {});
      filename = req.file.filename;
    }

    const ticket = await trx('trs_pengaduan').where('tr_adu_id', aduId).first();
    if (!ticket) { await trx.rollback(); return res.status(406).json({ type: 'error', message: 'Data tidak ditemukan' }); }

    // Restore content status
    if (ticket.tr_adu_no_doc && ticket.tr_adu_no_doc.trim()) {
      if (ticket.tr_adu_kategori === 'Hilang') {
        await trx('content').where('content_doc', ticket.tr_adu_no_doc).update({ content_status: 'Tersedia' });
      } else if (ticket.tr_adu_kategori === 'Rusak') {
        await trx('content').where('content_doc', ticket.tr_adu_no_doc).update({ content_pengaduan_rusak: 0 });
      }
    }

    await trx('trs_pengaduan').where('tr_adu_id', aduId).update({
      tr_adu_status: STATUS.DONE,
      tr_adu_atasan_corp_lgl_nik: empid,
      tr_adu_lampiran_selesai: filename || '',
      tr_adu_keterangan_selesai: keterangan || '',
      tr_current_user: `${empid} - Done`,
      updated_by: empid,
      updated_at: dayjs().format("YYYY-MM-DD HH:mm:ss")
    });

    await trx.raw(`
      INSERT INTO trs_log VALUES (?, 'Corporate legal DH close', 'Verifikasi penyelesaian', ?, GETDATE(), 1, ?, 8, NULL, NULL)
    `, [ticket.tr_no_adu, empid, keterangan || '']);

    await trx.commit();
    return res.json("sukses");
  } catch (error) {
    await trx.rollback();
    logger(error, 'POST /pengaduan/:id/selesai', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

// ============================================
// GET DOCUMENT DETAIL (for auto-fill on create form)
// ============================================
export const getDocumentDetail = async (req, res) => {
  try {
    const { doc_id } = req.query;
    const result = await dbDMS.raw(`
      SELECT doc_judul, CAST(created_date AS DATE) AS created_date, 
             CAST(content_entrydate AS DATE) AS content_entrydate, 
             bu_name, lokasi_arsip_name, arsip_no, c.content_kode_lemari, c.content_status,
             c.content_security, c.arsip_kat, c.content_name
      FROM trs_nmr_doc a
      INNER JOIN content c ON a.doc_id = c.content_doc COLLATE SQL_Latin1_General_CP1_CI_AS
      LEFT JOIN v_mstr_bu b ON c.content_bu = b.bu_id COLLATE SQL_Latin1_General_CP1_CI_AS
      LEFT JOIN mst_lokasi_arsip e ON c.lokasi_arsip_id = e.lokasi_arsip_id
      WHERE doc_nmr_status != 'Cancel' AND doc_id = ?
    `, [doc_id]);

    return res.status(200).json({ data: result });
  } catch (error) {
    logger(error, 'GET /pengaduan/doc-detail', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

// ============================================
// GET DOCUMENT LIST (for dropdown on create form)
// ============================================
export const getDocumentList = async (req, res) => {
  try {
    const result = await dbDMS('trs_nmr_doc')
      .select('doc_id')
      .whereNot('doc_nmr_status', 'Cancel');
    return res.status(200).json(result);
  } catch (error) {
    logger(error, 'GET /pengaduan/doc-list', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

// ============================================
// UPLOAD FILE (to FTP)
// ============================================
export const uploadPengaduanFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(406).json({ type: 'error', message: 'File tidak ditemukan' });
    }
    // Upload to FTP server (temp in file/ → FTP dmslegal folder)
    await ftpUpload('file', 'dmslegal', req.file.filename);
    // Remove local temp file
    await removeLocalFile(req.file.path).catch(() => {});

    return res.status(200).json({ data: { filename: req.file.filename } });
  } catch (error) {
    logger(error, 'POST /pengaduan/upload', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

// ============================================
// RIWAYAT (History with extra filters)
// ============================================
export const riwayat = async (req, res) => {
  try {
    const { bu_id, lokasi_arsip_id, from, to, no_tiket, kategori, status } = req.query;

    let query = dbDMS('trs_pengaduan as a')
      .innerJoin('content as b', 'a.tr_adu_no_doc', 'b.content_doc')
      .select('a.*', dbDMS.raw("FORMAT(a.tr_tgl_adu, 'dd/MM/yyyy') as tr_tgl_adu_format"));

    if (bu_id) query.where('b.content_bu', bu_id);
    if (lokasi_arsip_id) query.where('b.lokasi_arsip_id', lokasi_arsip_id);
    if (from) query.where('a.tr_tgl_adu', '>=', from);
    if (to) query.where('a.tr_tgl_adu', '<=', to);
    if (no_tiket) query.where('a.tr_no_adu', no_tiket);
    if (kategori) query.where('a.tr_adu_kategori', kategori);
    if (status) query.where('a.tr_adu_status', status);

    // Pagination
    if (req.query.rowsPerPage == null) {
      const results = await query;
      return res.status(200).json(results);
    }

    const sorting = req.query.descending === "true" ? "desc" : "asc";
    const columnSort = req.query.sortBy === "asc" ? "a.tr_adu_id asc" : `${req.query.sortBy} ${sorting}`;
    query.orderByRaw(columnSort);

    const response = await query.paginate({
      perPage: Math.floor(req.query.rowsPerPage),
      currentPage: Math.floor(req.query.page),
      isLengthAware: true
    });

    return res.status(200).json(response);
  } catch (error) {
    logger(error, 'GET /pengaduan/riwayat', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};


// ============================================
// LOG TIKET (search log by ticket number)
// ============================================
export const logTiket = async (req, res) => {
  try {
    const { no_tiket } = req.query;
    if (!no_tiket) {
      return res.status(200).json({ data: [] });
    }

    const result = await dbDMS.raw(`
      SELECT a.*, b.nama AS account_name, FORMAT(a.trs_log_tgl, 'MM/dd/yyyy HH:mm:ss') AS tanggal
      FROM trs_log a
      LEFT JOIN v_mstr_employee_ext b ON a.trs_log_pic = b.id COLLATE SQL_Latin1_General_CP1_CI_AS
      WHERE trs_log_no_tiket = ? ORDER BY trs_log_tgl
    `, [no_tiket]);

    return res.status(200).json({ data: result });
  } catch (error) {
    logger(error, 'GET /pengaduan/log-tiket', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};


// ============================================
// VALIDATE TOKEN (standalone approval via email link)
// ============================================
export const validateToken = async (req, res) => {
  try {
    const { token, url } = req.query;
    if (!token) {
      return res.status(406).json({ type: 'error', message: 'Token tidak ditemukan' });
    }
    console.log(token)
    const ticket = await dbDMS('trs_pengaduan').where('tr_token', token).first();
    if (!ticket) {
      return res.status(406).json({ type: 'error', message: 'Token tidak valid atau sudah tidak berlaku' });
    }

    // Determine approver based on status via tr_current_user
    const { nik: approverNik, posisi } = parseCurrentUser(ticket.tr_current_user);
    if (!approverNik) {
      return res.status(406).json({ type: 'error', message: 'Tiket tidak dalam status yang memerlukan approval' });
    }

    let approver_role = '';
    switch (posisi) {
      case 'Div Head': approver_role = 'Atasan Dokumen Owner'; break;
      case 'Legal SH': approver_role = 'Corp. Legal SH'; break;
      case 'Legal DH': approver_role = 'Corp. Legal DH'; break;
      case 'Selesai': approver_role = 'Corp. Legal DH (Selesai)'; break;
      case 'Tolak': approver_role = 'User Pembuat (Revisi)'; break;
      default: return res.status(406).json({ type: 'error', message: 'Tiket tidak dalam status yang memerlukan approval' });
    }

    // Get approver user data
    const { dbHris } = await import("../../config/db.js");
    const users = await dbDMS("master_user")
      .leftJoin('v_mstr_bu', dbDMS.raw('master_user.account_bu COLLATE SQL_Latin1_General_CP1_CI_AS = v_mstr_bu.bu_id'))
      .select("account_username","account_nik","account_name","account_bu","account_div_name","account_dept_name","bu_name")
      .where('account_username', approverNik)
      .first();

    if (!users) {
      return res.status(406).json({ type: 'error', message: 'Data approver tidak ditemukan' });
    }

    // Get HRIS data
    const hris = await dbHris("portal.dbo.ptl_hris as a")
      .select("a.Emp_Id","a.user_pass","a.user_newid","a.grade","a.jabatan","a.employee_mgr_pk","a.map_dept_pk","a.map_div_pk","b.nama_div","d.nama_dept","c.map_dir_pk")
      .leftJoin('master_div as b', function() { this.on('b.id_div', '=', 'a.map_div_pk'); })
      .leftJoin('mapping_dir_div_dept as c', function() { this.on('c.map_dept_pk', '=', 'a.map_dept_pk').orOn('c.map_div_pk', '=', 'a.map_div_pk'); })
      .leftJoin('master_dept as d', function() { this.on('d.id_dept', '=', 'a.map_dept_pk'); })
      .where('user_active', 'Active')
      .where('Emp_Id', users.account_username)
      .first();

    if (!hris) {
      return res.status(406).json({ type: 'error', message: `User ${users.account_nik} sudah tidak aktif` });
    }

    const resPortal = await dbHris("ptl_policy").where("id", 0).first();
    const jwt = (await import("jsonwebtoken")).default;
    const jwtToken = jwt.sign({ user: users.account_username }, process.env.TOKEN, { expiresIn: resPortal.idle_time });

    // Log access
    await dbDMS("log_akses").insert({
      empid: users.account_username,
      nik: hris.user_newid,
      status: "login",
      keterangan: `approval_pengaduan_${approver_role}`,
      nama_url: `${url}/approval/pengaduan?token=${token}`,
    });

    const { createUserResponse } = await import("../../helpers/master/login.js");
    return res.status(200).json(
      createUserResponse(
        users, jwtToken,
        process.env.ENVIRONMENT === 'PRODUCTION' ? resPortal.idle_time : 3600000,
        ticket.tr_no_adu,
        approver_role,
        { ticket_id: encrypt(String(ticket.tr_adu_id)), status: ticket.tr_adu_status }
      )
    );
  } catch (error) {
    logger(error, 'GET /pengaduan/validate-token', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};


// ============================================
// EXPORT RIWAYAT TO EXCEL
// ============================================
export const exportRiwayatExcel = async (req, res) => {
  try {
    const { bu_id, lokasi_arsip_id, from, to, no_tiket, kategori, status } = req.query;

    let query = dbDMS('trs_pengaduan as a')
      .innerJoin('content as b', 'a.tr_adu_no_doc', 'b.content_doc')
      .leftJoin(dbDMS.raw('v_mstr_bu as d ON b.content_bu = d.bu_id COLLATE SQL_Latin1_General_CP1_CI_AS'))
      .leftJoin('mst_lokasi_arsip as e', 'b.lokasi_arsip_id', 'e.lokasi_arsip_id')
      .select('a.*', 'b.content_name', 'b.arsip_no', 'd.bu_name', 'e.lokasi_arsip_name',
        dbDMS.raw("FORMAT(a.tr_tgl_adu, 'dd/MM/yyyy') as tr_tgl_adu_format"));

    if (bu_id) query.where('b.content_bu', bu_id);
    if (lokasi_arsip_id) query.where('b.lokasi_arsip_id', lokasi_arsip_id);
    if (from) query.where('a.tr_tgl_adu', '>=', from);
    if (to) query.where('a.tr_tgl_adu', '<=', to);
    if (no_tiket) query.where('a.tr_no_adu', no_tiket);
    if (kategori) query.where('a.tr_adu_kategori', kategori);
    if (status) query.where('a.tr_adu_status', status);

    const results = await query.orderBy('a.tr_tgl_adu', 'desc');

    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.default.Workbook();
    const sheet = workbook.addWorksheet('Riwayat Pengaduan');

    // Column widths
    sheet.columns = [
      { width: 28 }, // Nomor Tiket
      { width: 18 }, // Tanggal
      { width: 40 }, // Judul
      { width: 18 }, // Kategori
      { width: 45 }  // Status
    ];

    // Row 1: Title
    sheet.mergeCells('A1:E1');
    const titleCell = sheet.getCell('A1');
    titleCell.value = 'Riwayat Pengaduan';
    titleCell.font = { size: 14, bold: true };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getRow(1).height = 30;

    // Row 2: Headers
    const headers = ['Nomor Tiket', 'Tanggal Pengaduan', 'Judul Pengaduan', 'Kategori Pengaduan', 'Status Pengaduan'];
    const headerRow = sheet.addRow(headers);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = {
        top: { style: 'thin' }, bottom: { style: 'thin' },
        left: { style: 'thin' }, right: { style: 'thin' }
      };
    });
    headerRow.height = 22;

    // Data rows
    results.forEach((r, i) => {
      const row = sheet.addRow([
        r.tr_no_adu || '',
        r.tr_tgl_adu_format || '',
        r.tr_adu_judul || '',
        r.tr_adu_kategori || '',
        r.tr_adu_status || ''
      ]);
      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin', color: { argb: 'FF888888' } },
          bottom: { style: 'thin', color: { argb: 'FF888888' } },
          left: { style: 'thin', color: { argb: 'FF888888' } },
          right: { style: 'thin', color: { argb: 'FF888888' } }
        };
        if (i % 2 === 0) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F4FF' } };
        }
      });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=Riwayat_Pengaduan_${dayjs().format('YYYYMMDD')}.xlsx`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    logger(error, 'GET /pengaduan/riwayat/export-excel', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};


// ============================================
// EXPORT RIWAYAT TO PDF (pdfmake, saved to file/pdf/)
// ============================================
export const exportRiwayatPdf = async (req, res) => {
  try {
    const { bu_id, lokasi_arsip_id, from, to, no_tiket, kategori, status } = req.query;

    let query = dbDMS('trs_pengaduan as a')
      .innerJoin('content as b', 'a.tr_adu_no_doc', 'b.content_doc')
      .leftJoin(dbDMS.raw('v_mstr_bu as d ON b.content_bu = d.bu_id COLLATE SQL_Latin1_General_CP1_CI_AS'))
      .leftJoin('mst_lokasi_arsip as e', 'b.lokasi_arsip_id', 'e.lokasi_arsip_id')
      .select('a.*', 'b.content_name', 'b.arsip_no', 'd.bu_name', 'e.lokasi_arsip_name',
        dbDMS.raw("FORMAT(a.tr_tgl_adu, 'dd/MM/yyyy') as tr_tgl_adu_format"));

    if (bu_id) query.where('b.content_bu', bu_id);
    if (lokasi_arsip_id) query.where('b.lokasi_arsip_id', lokasi_arsip_id);
    if (from) query.where('a.tr_tgl_adu', '>=', from);
    if (to) query.where('a.tr_tgl_adu', '<=', to);
    if (no_tiket) query.where('a.tr_no_adu', no_tiket);
    if (kategori) query.where('a.tr_adu_kategori', kategori);
    if (status) query.where('a.tr_adu_status', status);

    const results = await query.orderBy('a.tr_tgl_adu', 'desc');

    const PdfPrinter = (await import('pdfmake')).default;
    const fontPath = path.join(__dirname, '../../view/pdf');
    const fs = (await import('fs')).default;

    const fonts = {
      Roboto: {
        normal: path.join(fontPath, 'Roboto-Regular.ttf'),
        bold: path.join(fontPath, 'Roboto-Medium.ttf'),
        italics: path.join(fontPath, 'Roboto-Italic.ttf'),
        bolditalics: path.join(fontPath, 'Roboto-MediumItalic.ttf')
      }
    };

    const printer = new PdfPrinter(fonts);

    const tableBody = [
      [
        { text: 'No. Pengaduan', style: 'tableHeader' },
        { text: 'Tanggal', style: 'tableHeader' },
        { text: 'Judul Pengaduan', style: 'tableHeader' },
        { text: 'Kategori', style: 'tableHeader' },
        { text: 'Status', style: 'tableHeader' }
      ],
      ...results.map(r => [
        r.tr_no_adu || '',
        r.tr_tgl_adu_format || '',
        r.tr_adu_judul || '',
        r.tr_adu_kategori || '',
        r.tr_adu_status || ''
      ])
    ];

    const docDefinition = {
      pageOrientation: 'landscape',
      pageSize: 'A4',
      pageMargins: [30, 40, 30, 40],
      content: [
        { text: 'Riwayat Pengaduan', style: 'header', alignment: 'center', margin: [0, 0, 0, 15] },
        {
          table: {
            headerRows: 1,
            widths: ['auto', 'auto', '*', 'auto', '*'],
            body: tableBody
          },
          layout: {
            hLineWidth: () => 0.5,
            vLineWidth: () => 0.5,
            hLineColor: () => '#888',
            vLineColor: () => '#888',
            paddingLeft: () => 5,
            paddingRight: () => 5,
            paddingTop: () => 3,
            paddingBottom: () => 3
          }
        }
      ],
      styles: {
        header: { fontSize: 14, bold: true, decoration: 'underline' },
        tableHeader: { bold: true, fontSize: 9, fillColor: '#f0f0f0' }
      },
      defaultStyle: { fontSize: 8, font: 'Roboto' }
    };

    const pdfDoc = printer.createPdfKitDocument(docDefinition);
    const filename = `Riwayat_Pengaduan_${dayjs().format('YYYYMMDD_HHmmss')}.pdf`;
    const pdfDir = path.join(__dirname, '../../file/pdf');
    if (!fs.existsSync(pdfDir)) fs.mkdirSync(pdfDir, { recursive: true });
    const filepath = path.join(pdfDir, filename);

    const writeStream = fs.createWriteStream(filepath);
    pdfDoc.pipe(writeStream);
    pdfDoc.end();

    await new Promise((resolve, reject) => {
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });

    return res.status(200).json({ data: { filename } });
  } catch (error) {
    logger(error, 'GET /pengaduan/riwayat/export-pdf', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};
