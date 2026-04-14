import dayjs from "dayjs";
import { dbDMS, dbHris } from "../../config/db.js";
import { logger } from "../../helpers/logger.js";
import { decrypt, encrypt, getErrorResponse, generateToken } from "../../helpers/utils.js";
import path from "path";
import { fileURLToPath } from "url";
import jwt from "jsonwebtoken";
import { createUserResponse } from "../../helpers/master/login.js";
import { convertDateDMYtoYMD, buildDatetime, generateTicketNumber as generatePeminjamanTicket, insertPermintaan, insertPermintaanLog } from "../../model/DMS/peminjaman.model.js";
import { sendPeminjamanApprovalEmail } from "../../helpers/peminjaman.mail.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// List Peminjaman dengan filter
export const listPeminjaman = async (req, res) => {
  // #swagger.tags = ['Peminjaman']
  /* #swagger.security = [{
          "bearerAuth": []
  }] */
  // #swagger.description = 'Fungsi untuk show data peminjaman dokumen'
  try {
    const { rowsPerPage, page: pageNum, filter, sortBy, descending, bu_id, lokasi, from, to, user_nik } = req.query;
    
    if (!rowsPerPage) {
      return res.status(200).json('sukses');
    }

    const sorting = descending === "true" ? "desc" : "asc";
    const columnSort = sortBy === "asc" ? "pinjam_no_tiket asc" : `${sortBy} ${sorting}`;
    const page = Math.floor(pageNum);

    let query = dbDMS('trs_permintaan_arsip as a')
      .innerJoin('content as b', 'a.pinjam_nomor_doc', 'b.content_doc')
      .leftJoin(dbDMS.raw('v_mstr_employee_ext as d ON a.pinjam_user_approve = d.id COLLATE sql_latin1_general_cp1_ci_as'))
      .leftJoin('mst_lokasi_arsip as e', 'b.lokasi_arsip_id', 'e.lokasi_arsip_id')
      .select(
        'a.*',
        'b.content_security',
        'b.arsip_kat as kat_desc',
        'b.arsip_no',
        'd.nik as nik_approve',
        'e.lokasi_arsip_name'
      );

    // Filter berdasarkan user
    if (user_nik) {
      query.where(function() {
        this.where('a.pinjam_user_id', decrypt(user_nik))
          .orWhere('a.pinjam_user_approve', decrypt(user_nik));
      });
    }

    // Filter tambahan
    if (bu_id) query.where('b.content_bu', bu_id);
    if (lokasi) query.where('b.lokasi_arsip_id', lokasi);
    if (from) query.whereRaw("CONVERT(VARCHAR(10), a.pinjam_tgl_create, 120) >= ?", [from]);
    if (to) query.whereRaw("CONVERT(VARCHAR(10), a.pinjam_tgl_create, 120) <= ?", [to]);
    if (filter) {
      query.where((q) => {
        q.orWhere("a.pinjam_no_tiket", "like", `%${filter}%`)
          .orWhere("a.pinjam_nama_doc", "like", `%${filter}%`)
          .orWhere("a.pinjam_nomor_doc", "like", `%${filter}%`);
      });
    }

    // Tampilkan raw query
    // console.log('Raw SQL Query:', query.toSQL().sql);
    // console.log('Bindings:', query.toSQL().bindings);

    const response = await query
      .orderByRaw(columnSort)
      .paginate({
        perPage: Math.floor(rowsPerPage),
        currentPage: page,
        isLengthAware: true,
      });

    res.status(200).json(response);
  } catch (error) {
    console.log(error);
    logger(error, 'GET /listPeminjaman', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

// Get document by name and location
export const getDocumentByName = async (req, res) => {
  // #swagger.tags = ['Peminjaman']
  /* #swagger.security = [{
          "bearerAuth": []
  }] */
  // #swagger.description = 'Get document details by name and location'
  try {
    const { content_name, lokasi_arsip_name, user_nik } = req.query;

    if (!content_name || !lokasi_arsip_name) {
      return res.status(400).json({ message: 'content_name and lokasi_arsip_name are required' });
    }

    const query = `
      SELECT 
        c.*,
        mla.lokasi_arsip_name,
        c.arsip_kat as kat_desc,
        (
          SELECT count(id)
          FROM trs_permintaan_arsip t
          CROSS APPLY dbo.fn_GetWorkDays(t.pinjam_tgl_est_kembali_to, GETDATE()) wd
          WHERE wd.WorkDays > 13 
            AND pinjam_aktivitas <> 'Permintaan PDF / Elektronik' 
            AND pinjam_status = 'Peminjaman Berhasil'
        ) as jumlah_terlambat,
        (
          SELECT count(*) as jumlah
          FROM trs_permintaan_arsip
          WHERE pinjam_user_id = ?
            AND pinjam_status NOT IN ('Peminjaman Berakhir', 'Tolak', 'Sudah download', 'Melewati Waktu Download')
            AND pinjam_aktivitas = 'Pinjam Asli'
        ) as jumlah_pinjam,
        (
          SELECT count(*) as jumlah
          FROM trs_permintaan_arsip t
          CROSS APPLY dbo.fn_GetWorkDays(t.pinjam_tgl_est_kembali_to, GETDATE()) wd
          WHERE wd.WorkDays >= 12 
            AND pinjam_aktivitas <> 'Permintaan PDF / Elektronik' 
            AND pinjam_status = 'Peminjaman Berhasil'
            AND pinjam_user_id = ?
        ) as jumlah_belum_kembali
      FROM content c 
      INNER JOIN mst_lokasi_arsip mla ON c.lokasi_arsip_id = mla.lokasi_arsip_id 
      WHERE c.content_name = ? 
        AND mla.lokasi_arsip_name = ?
    `;

    const result = await dbDMS.raw(query, [user_nik, user_nik, content_name, lokasi_arsip_name]);
    
    if (result && result.length > 0) {
      res.status(200).json(result[0]);
    } else {
      res.status(404).json({ message: 'Document not found' });
    }
  } catch (error) {
    console.log(error);
    logger(error, 'GET /getDocumentByName', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

// Add permintaan dokumen
export const addPermintaanDokumen = async (req, res) => {
  const trx = await dbDMS.transaction();
  try {
    const { creator, aktivitas, nama_dokumen, nomor_dokumen, lokasi_penyimpanan, alasan, tgl_pengambilan, jam_pengambilan, jam_pengambilan_sd, tgl_pengembalian, jam_pengembalian, jam_pengembalian_sd, keterangan_user, account_nik, employee_spv_pk, employee_spv, pinjam_prioritas_approve, bu_id, kategori_dokumen, div_id } = req.body;

    const empid = decrypt(creator);
    const app_jns_trans = aktivitas === 'Pinjam Asli' ? 2 : 3;
    const tgl_pengambilan_db = convertDateDMYtoYMD(tgl_pengambilan);
    const tgl_pengembalian_db = convertDateDMYtoYMD(tgl_pengembalian);
    const tr_token = generateToken();

    const no_tiket = await generatePeminjamanTicket(trx, { app_jns_trans, kategori_dokumen, bu_id, div_id });
    if (!no_tiket) { await trx.rollback(); return res.status(406).json({ type: 'error', message: 'Gagal generate nomor tiket' }); }

    await insertPermintaan(trx, {
      no_tiket, empid, account_nik, employee_spv_pk, employee_spv, aktivitas, nama_dokumen, nomor_dokumen, lokasi_penyimpanan, alasan, keterangan_user, pinjam_prioritas_approve, bu_id, tr_token,
      pinjam_tgl_est_ambil_fr: buildDatetime(tgl_pengambilan_db, jam_pengambilan),
      pinjam_tgl_est_ambil_to: buildDatetime(tgl_pengambilan_db, jam_pengambilan_sd),
      pinjam_tgl_est_kembali_fr: buildDatetime(tgl_pengembalian_db, jam_pengembalian),
      pinjam_tgl_est_kembali_to: buildDatetime(tgl_pengembalian_db, jam_pengembalian_sd)
    });

    await insertPermintaanLog(trx, { no_tiket, empid, app_jns_trans, keterangan_user });
    await trx.commit();

    // Send email (same pattern as pemusnahan)
    try {
      const supervisor = await dbDMS('v_mstr_employee').where('employee_pk', employee_spv_pk).first();
      const user = await dbDMS.raw(`SELECT e.*, div.div_nama FROM v_mstr_employee_ext e LEFT JOIN v_mstr_div div ON e.id_div = div.div_pk COLLATE SQL_Latin1_General_CP1_CI_AS WHERE e.id = ?`, [empid]);
      const doc = await dbDMS.raw(`SELECT arsip_no, content_security, arsip_kat as kat_desc FROM content c INNER JOIN mst_lokasi_arsip mla ON c.lokasi_arsip_id = mla.lokasi_arsip_id WHERE c.content_name = ? AND mla.lokasi_arsip_name = ?`, [nama_dokumen, lokasi_penyimpanan]);

      const userData = user?.[0];
      const docData = doc?.[0] || {};

      if (supervisor?.employee_email) {
        await sendPeminjamanApprovalEmail({
          recipient_email: supervisor.employee_email,
          recipient_name: supervisor.employee_name,
          aktivitas,
          nama_dokumen,
          kode_arsip: docData.arsip_no || '',
          no_tiket,
          kategori_keamanan: docData.content_security || '',
          kategori_dokumen: docData.kat_desc || kategori_dokumen || '',
          tgl_pengambilan: tgl_pengambilan_db,
          tgl_pengembalian: tgl_pengembalian_db,
          keterangan: keterangan_user || alasan,
          requester_name: userData?.nama || empid,
          requester_nik: userData?.nik || '',
          division_name: userData?.div_nama || '',
          approval_link: `${process.env.FRONTEND_URL || 'http://localhost:7060'}/#/approval/peminjaman?token=${tr_token}`,
        });
        console.log('[Peminjaman] Email sent for ticket:', no_tiket, 'to:', supervisor.employee_email);
      } else {
        console.warn('[Peminjaman] No supervisor email found for:', employee_spv_pk);
      }
    } catch (mailErr) {
      console.error('[Peminjaman] Email error (non-fatal):', mailErr.message);
    }

    return res.json({ status: 1, no_tiket, message: 'Permintaan berhasil dibuat' });
  } catch (error) {
    await trx.rollback();
    console.log(error);
    logger(error, 'POST /addPermintaanDokumen', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

// Approve/Reject/Revisi permintaan
export const approvePermintaan = async (req, res) => {
  // #swagger.tags = ['Peminjaman']
  // #swagger.description = 'Approve/Reject/Revisi permintaan dokumen (from app login)'
  const trx = await dbDMS.transaction();
  try {
    const { creator: empidDecrypt, id, nomor_tiket, pinjam_status, notes, jabatan, app_jns_trans, revisi_reason } = req.body;
    const empid = decrypt(empidDecrypt);
    const now = dayjs().format("YYYY-MM-DD HH:mm:ss");

    const ticket = await trx('trs_permintaan_arsip').where('id', id).first();
    if (!ticket) { await trx.rollback(); return res.status(406).json({ type: 'error', message: 'Data tidak ditemukan' }); }

    const jnsTransValue = ticket.pinjam_aktivitas === 'Pinjam Asli' ? 2 : 3;

    // REJECT
    if (pinjam_status === 'Kirim Tolak') {
      const newToken = generateToken();
      await trx('trs_permintaan_arsip').where('id', id).update({ pinjam_status: 'Tolak', pinjam_user_approve: null, pinjam_approve_ke: 0, tr_token: newToken, updated_by: empid, updated_at: now });
      await trx('trs_log').insert({ trs_log_no_tiket: ticket.pinjam_no_tiket, trs_log_proses: 'Ditolak', trs_log_hasil: 'Ditolak', trs_log_pic: empid, trs_log_tgl: now, trs_log_status: 1, trs_log_catatan: notes || '', trs_log_jenis: jnsTransValue, trs_log_reason_revisi: revisi_reason || '', trs_log_keterangan: notes || '' });
      await trx.commit();
      return res.json({ status: 1, message: 'Permintaan berhasil ditolak' });
    }

    // REVISI
    if (pinjam_status === 'Kirim Revisi') {
      const newToken = generateToken();
      await trx('trs_permintaan_arsip').where('id', id).update({ pinjam_status: 'Revisi', pinjam_user_approve: null, pinjam_approve_ke: 0, tr_token: newToken, updated_by: empid, updated_at: now });
      await trx('trs_log').insert({ trs_log_no_tiket: ticket.pinjam_no_tiket, trs_log_proses: 'Permintaan Revisi', trs_log_hasil: 'Permintaan Revisi', trs_log_pic: empid, trs_log_tgl: now, trs_log_status: 1, trs_log_catatan: notes || '', trs_log_jenis: jnsTransValue, trs_log_reason_revisi: revisi_reason || '', trs_log_keterangan: notes || '' });
      await trx.commit();
      return res.json({ status: 1, message: 'Permintaan dikembalikan untuk revisi' });
    }

    // APPROVE — determine next approver from mst_approval
    const mstApproval = await trx('mst_approval').where({ app_bu_id: ticket.bu_id, app_jns_trans: jnsTransValue, app_prioritas: ticket.pinjam_prioritas_approve || 1 }).first();

    if (!mstApproval) { await trx.rollback(); return res.status(406).json({ type: 'error', message: 'Konfigurasi approval tidak ditemukan' }); }

    // Build ordered approver list from mst_approval (bag1-3, emp1-5)
    const approverList = [];
    for (let i = 1; i <= 3; i++) {
      for (let j = 1; j <= 5; j++) {
        const empKey = `app_bag${i}_emp_id${j}`;
        if (mstApproval[empKey]) approverList.push({ id: mstApproval[empKey], bag: i });
      }
    }

    const currentApproveKe = ticket.pinjam_approve_ke || 0;
    const nextApproveKe = currentApproveKe + 1;
    const nextApproverData = approverList[nextApproveKe] || null;

    let nextStatus, nextApprover, nextFlag;
    if (!nextApproverData) {
      // No more approvers — full approve, go to Proses BAST or Menunggu Download
      if (ticket.pinjam_aktivitas === 'Pinjam Asli') {
        nextStatus = 'Proses BAST';
      } else {
        nextStatus = 'Menunggu Download';
      }
      nextApprover = null;
      nextFlag = 4;
    } else {
      // Determine status based on bag
      if (nextApproverData.bag === 1) nextStatus = 'Kirim Atasan User';
      else if (nextApproverData.bag === 2) nextStatus = 'Kirim Legal';
      else nextStatus = 'Kirim Arsiparis';
      nextApprover = nextApproverData.id;
      nextFlag = nextApproverData.bag;
    }

    const newToken = generateToken();
    await trx('trs_permintaan_arsip').where('id', id).update({
      pinjam_status: nextStatus,
      pinjam_user_approve: nextApprover,
      pinjam_approve_ke: nextApproveKe,
      pinjam_flag: nextFlag,
      tr_token: newToken,
      updated_by: empid,
      updated_at: now,
    });

    await trx('trs_log').insert({
      trs_log_no_tiket: ticket.pinjam_no_tiket,
      trs_log_proses: 'Konfirmasi Tiket',
      trs_log_hasil: `Verifikasi ${jabatan || 'Approver'}`,
      trs_log_pic: empid,
      trs_log_tgl: now,
      trs_log_status: 1,
      trs_log_catatan: notes || 'Disetujui',
      trs_log_jenis: jnsTransValue,
      trs_log_keterangan: notes || 'Disetujui',
    });

    await trx.commit();

    // Send email to next approver (non-fatal)
    try {
      if (nextApprover) {
        const supervisor = await dbDMS('v_mstr_employee').where('employee_pk', nextApprover).first();
        const user = await dbDMS.raw(`SELECT e.*, div.div_nama FROM v_mstr_employee_ext e LEFT JOIN v_mstr_div div ON e.id_div = div.div_pk COLLATE SQL_Latin1_General_CP1_CI_AS WHERE e.id = ?`, [ticket.pinjam_user_id]);
        const doc = await dbDMS.raw(`SELECT arsip_no, content_security, arsip_kat as kat_desc FROM content c INNER JOIN mst_lokasi_arsip mla ON c.lokasi_arsip_id = mla.lokasi_arsip_id WHERE c.content_name = ? AND mla.lokasi_arsip_name = ?`, [ticket.pinjam_nama_doc, ticket.pinjam_lokasi_arsip]);
        const userData = user?.[0];
        const docData = doc?.[0] || {};

        if (supervisor?.employee_email) {
          await sendPeminjamanApprovalEmail({
            recipient_email: supervisor.employee_email,
            recipient_name: supervisor.employee_name,
            aktivitas: ticket.pinjam_aktivitas,
            nama_dokumen: ticket.pinjam_nama_doc,
            kode_arsip: docData.arsip_no || '',
            no_tiket: ticket.pinjam_no_tiket,
            kategori_keamanan: docData.content_security || '',
            kategori_dokumen: docData.kat_desc || '',
            tgl_pengambilan: ticket.pinjam_tgl_est_ambil_to,
            tgl_pengembalian: ticket.pinjam_tgl_est_kembali_to,
            keterangan: ticket.pinjam_ket_user || ticket.pinjam_alasan_pinjam,
            requester_name: userData?.nama || '',
            requester_nik: userData?.nik || '',
            division_name: userData?.div_nama || '',
            approval_link: `${process.env.FRONTEND_URL || 'http://localhost:7060'}/#/approval/peminjaman?token=${newToken}`,
          });
        }
      }
    } catch (mailErr) {
      console.error('[Peminjaman] Email error (non-fatal):', mailErr.message);
    }

    return res.json({ status: 1, message: 'Berhasil diproses', nextStatus });
  } catch (error) {
    await trx.rollback();
    console.log(error);
    logger(error, 'POST /approvePermintaan', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

// Delete permintaan
export const deletePermintaan = async (req, res) => {
  // #swagger.tags = ['Peminjaman']
  /* #swagger.security = [{
          "bearerAuth": []
  }] */
  // #swagger.description = 'Delete permintaan dokumen'
  try {
    const { id } = req.body;
    await dbDMS('trs_permintaan_arsip').where('id', id).delete();
    return res.json({ status: 1, message: 'Berhasil dihapus' });
  } catch (error) {
    console.log(error);
    logger(error, 'POST /deletePermintaan', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

// Get log tiket
export const getLogTiket = async (req, res) => {
  // #swagger.tags = ['Peminjaman']
  /* #swagger.security = [{
          "bearerAuth": []
  }] */
  // #swagger.description = 'Get log history tiket'
  try {
    const { no_tiket } = req.query;

    if (!no_tiket) {
      return res.status(400).json({ message: 'no_tiket is required' });
    }

    const query = `
      SELECT
        a.*,
        b.id as employee_id,
        b.nama as employee_name,
        b.jabatan as employee_jabatan,
        c.bu_name,
        d.div_nama,
        e.*
      FROM trs_log a
      INNER JOIN v_mstr_employee_ext b ON a.trs_log_pic COLLATE sql_latin1_general_cp1_ci_as = b.id
      INNER JOIN v_mstr_bu c ON b.id_bu = c.bu_id COLLATE sql_latin1_general_cp1_ci_as
      LEFT JOIN v_mstr_div d ON b.id_div = d.div_pk
      INNER JOIN trs_permintaan_arsip e ON a.trs_log_no_tiket = e.pinjam_no_tiket
      WHERE trs_log_no_tiket = ?
      ORDER BY trs_log_tgl ASC
    `;

    const result = await dbDMS.raw(query, [no_tiket]);
    res.status(200).json(result);
  } catch (error) {
    console.log(error);
    logger(error, 'GET /getLogTiket', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};
// Get Business Units
export const getBU = async (req, res) => {
  // #swagger.tags = ['Peminjaman']
  /* #swagger.security = [{
          "bearerAuth": []
  }] */
  // #swagger.description = 'Get business units'
  try {
    const { bu_id } = req.query;
    let query = dbDMS('v_mstr_bu').select('*');
    
    if (bu_id) {
      query = query.where('bu_id', bu_id);
    }
    
    const result = await query;
    res.status(200).json(result);
  } catch (error) {
    console.log(error);
    logger(error, 'GET /getBU', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

// Check user peminjaman status
export const checkUserPeminjaman = async (req, res) => {
  // #swagger.tags = ['Peminjaman']
  /* #swagger.security = [{
          "bearerAuth": []
  }] */
  // #swagger.description = 'Check user peminjaman status'
  try {
    const { nik } = req.query;

    // Check overdue documents
    const overdueQuery = `
      SELECT *
      FROM trs_permintaan_arsip t
      CROSS APPLY dbo.fn_GetWorkDays(t.pinjam_tgl_est_kembali_to, GETDATE()) wd
      WHERE wd.WorkDays >= 12 
        AND pinjam_aktivitas <> 'Permintaan PDF / Elektronik' 
        AND pinjam_status = 'Peminjaman Berhasil'
        AND pinjam_user_id = ?
    `;

    // Check total active loans
    const activeQuery = `
      SELECT COUNT(*) as jumlah
      FROM trs_permintaan_arsip
      WHERE pinjam_user_id = ? 
        AND pinjam_status NOT IN ('Peminjaman Berakhir', 'Tolak', 'Sudah download', 'Melewati Waktu Download')
    `;

    const overdueResult = await dbDMS.raw(overdueQuery, [nik]);
    const activeResult = await dbDMS.raw(activeQuery, [nik]);

    res.status(200).json({
      overdue: overdueResult,
      active_count: activeResult[0]?.jumlah || 0
    });
  } catch (error) {
    console.log(error);
    logger(error, 'GET /checkUserPeminjaman', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

// Get employee by ID
export const getEmployeeById = async (req, res) => {
  // #swagger.tags = ['Peminjaman']
  /* #swagger.security = [{
          "bearerAuth": []
  }] */
  // #swagger.description = 'Get employee by ID'
  try {
    const { id } = req.query;

    const query = `
      SELECT 
        a.*, 
        b.div_nama,
        b.nama_dept 
      FROM v_mstr_employee_ext a
      LEFT JOIN v_mstr_employee b ON a.id = b.employee_pk
      WHERE a.id = ? AND a.status = 'ACTIVE'
    `;

    const result = await dbDMS.raw(query, [id]);
    res.status(200).json(result);
  } catch (error) {
    console.log(error);
    logger(error, 'GET /getEmployeeById', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

// Get master approval
export const getMasterApproval = async (req, res) => {
  // #swagger.tags = ['Peminjaman']
  /* #swagger.security = [{
          "bearerAuth": []
  }] */
  // #swagger.description = 'Get master approval configuration'
  try {
    const { app_bu_id, app_jns_trans, app_prioritas } = req.query;
    
    let query = dbDMS('mst_approval').select('*');
    
    if (app_bu_id) query = query.where('app_bu_id', app_bu_id);
    if (app_jns_trans) query = query.where('app_jns_trans', app_jns_trans);
    if (app_prioritas) query = query.where('app_prioritas', app_prioritas);
    
    const result = await query;
    res.status(200).json(result);
  } catch (error) {
    console.log(error);
    logger(error, 'GET /getMasterApproval', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

// Export to Excel
export const exportPeminjamanExcel = async (req, res) => {
  // #swagger.tags = ['Peminjaman']
  /* #swagger.security = [{
          "bearerAuth": []
  }] */
  // #swagger.description = 'Export peminjaman data to Excel'
  try {
    const { bu_id, lokasi, from, to, user_nik } = req.query;

    console.log('Export Excel params:', { bu_id, lokasi, from, to, user_nik: user_nik ? 'encrypted' : 'empty' });

    let query = dbDMS('trs_permintaan_arsip as a')
      .innerJoin('content as b', 'a.pinjam_nomor_doc', 'b.content_doc')
      .leftJoin(dbDMS.raw('v_mstr_employee_ext as d ON a.pinjam_user_approve = d.id COLLATE sql_latin1_general_cp1_ci_as'))
      .leftJoin('mst_lokasi_arsip as e', 'b.lokasi_arsip_id', 'e.lokasi_arsip_id')
      .select(
        'a.pinjam_no_tiket',
        'a.pinjam_aktivitas',
        'a.pinjam_tgl_create',
        'a.pinjam_nama_doc',
        'b.arsip_no',
        'a.pinjam_nomor_doc',
        'e.lokasi_arsip_name',
        'b.arsip_kat as kat_desc',
        'b.content_security',
        'a.pinjam_tgl_est_ambil_to',
        'a.pinjam_tgl_est_kembali_to',
        'a.pinjam_status',
        'a.pinjam_flag'
      );

    // Apply filters
    if (user_nik) {
      try {
        const decryptedNik = user_nik.toString('utf8');
        console.log('Decrypted NIK:', decryptedNik);
        query.where(function() {
          this.where('a.pinjam_user_id', decryptedNik)
            .orWhere('a.pinjam_user_approve', decryptedNik);
        });
      } catch (decryptError) {
        console.error('Error decrypting user_nik:', decryptError);
        return res.status(400).json({ message: 'Invalid user_nik parameter' });
      }
    }
    
    if (bu_id && bu_id !== '') query.where('b.content_bu', bu_id);
    if (lokasi && lokasi !== '') query.where('b.lokasi_arsip_id', lokasi);
    if (from && from !== '') query.whereRaw("CONVERT(VARCHAR(10), a.pinjam_tgl_create, 120) >= ?", [from]);
    if (to && to !== '') query.whereRaw("CONVERT(VARCHAR(10), a.pinjam_tgl_create, 120) <= ?", [to]);

    console.log('Query SQL:', query.toSQL());

    const data = await query.limit(1000).orderBy('a.pinjam_tgl_create', 'desc');
    
    // console.log('Data count:', data.length);

    if (data.length === 0) {
      return res.status(404).json({ message: 'Tidak ada data untuk diekspor' });
    }

    // Set headers for Excel download
    res.setHeader('Content-Type', 'application/vnd.ms-excel; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="Peminjaman_Dokumen.xls"');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Expires', '0');

    // Generate Excel content with proper formatting
    let excelContent = `
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            table { border-collapse: collapse; width: 100%; }
            th, td { border: 1px solid #000; padding: 5px; text-align: left; }
            th { background-color: #f2f2f2; font-weight: bold; }
            .center { text-align: center; }
            .title { text-align: center; font-size: 16px; font-weight: bold; }
          </style>
        </head>
        <body>
          <table>
            <thead>
              <tr>
                <th colspan="12" class="title">LAPORAN PEMINJAMAN DOKUMEN</th>
              </tr>
              <tr>
                <th class="center">No</th>
                <th class="center">Nomor Tiket</th>
                <th class="center">Aktivitas</th>
                <th class="center">Tanggal Permintaan</th>
                <th class="center">Nama Arsip</th>
                <th class="center">Kode Arsip</th>
                <th class="center">Nomor Dokumen</th>
                <th class="center">Lokasi Arsip</th>
                <th class="center">Kategori Dokumen</th>
                <th class="center">Kategori Keamanan</th>
                <th class="center">Tgl Estimasi Pengambilan</th>
                <th class="center">Status</th>
              </tr>
            </thead>
            <tbody>
    `;

    data.forEach((row, index) => {
      const statusDok = row.pinjam_flag == "4" ? 'Full approve' : 
                       (row.pinjam_status == 'setuju' ? 'Proses approval' : row.pinjam_status);
      
      const formatDate = (date) => {
        if (!date) return '';
        try {
          return dayjs(date).format('DD-MM-YYYY');
        } catch (e) {
          console.error('Date format error:', e);
          return '';
        }
      };

      // Escape HTML characters to prevent issues
      const escapeHtml = (text) => {
        if (!text) return '';
        return String(text)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
      };

      excelContent += `
        <tr>
          <td class="center">${index + 1}</td>
          <td class="center">${escapeHtml(row.pinjam_no_tiket)}</td>
          <td>${escapeHtml(row.pinjam_aktivitas)}</td>
          <td class="center">${formatDate(row.pinjam_tgl_create)}</td>
          <td>${escapeHtml(row.pinjam_nama_doc)}</td>
          <td class="center">${escapeHtml(row.arsip_no)}</td>
          <td>${escapeHtml(row.pinjam_nomor_doc)}</td>
          <td>${escapeHtml(row.lokasi_arsip_name)}</td>
          <td>${escapeHtml(row.kat_desc)}</td>
          <td class="center">${escapeHtml(row.content_security)}</td>
          <td class="center">${formatDate(row.pinjam_tgl_est_ambil_to)}</td>
          <td>${escapeHtml(statusDok)}</td>
        </tr>
      `;
    });

    excelContent += `
            </tbody>
          </table>
        </body>
      </html>
    `;

    res.send(excelContent);
  } catch (error) {
    console.error('Export Excel Error:', error);
    logger(error, 'GET /exportPeminjamanExcel', req.query);
    return res.status(500).json(getErrorResponse(error));
  }
};
// Get Lokasi Arsip by BU
export const getLokasiArsipByBU = async (req, res) => {
  // #swagger.tags = ['Peminjaman']
  /* #swagger.security = [{
          "bearerAuth": []
  }] */
  // #swagger.description = 'Get lokasi arsip by business unit'
  try {
    const { lokasi_arsip_bu_id } = req.query;
    
    let query = dbDMS('mst_lokasi_arsip')
      .select('lokasi_arsip_id', 'lokasi_arsip_name', 'lokasi_arsip_bu_id')
      .where('lokasi_arsip_status', 1);
    
    if (lokasi_arsip_bu_id) {
      query = query.where('lokasi_arsip_bu_id', lokasi_arsip_bu_id);
    }
    
    const result = await query.orderBy('lokasi_arsip_name');
    res.status(200).json(result);
  } catch (error) {
    console.log(error);
    logger(error, 'GET /getLokasiArsipByBU', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

// Get User Data
export const getUserData = async (req, res) => {
  // #swagger.tags = ['Peminjaman']
  /* #swagger.security = [{
          "bearerAuth": []
  }] */
  // #swagger.description = 'Get user data by NIK'
  try {
    const { nik } = req.query;

    // Decrypt the NIK if it's encrypted
    let decryptedNik = nik;
    if (nik && nik.length > 20) { // Encrypted data is typically longer
      try {
        decryptedNik = decrypt(nik);
      } catch (decryptError) {
        console.log('NIK decryption failed, using as plain text:', decryptError.message);
        decryptedNik = nik; // Fallback to plain text
      }
    }

    const query = `
      SELECT 
        mu.*, 
        vme.*, 
        bu.bu_name, 
        div.div_nama, 
        emp.employee_name, 
        emp.employee_photo, 
        emp.map_bu_id, 
        mr.role_name, 
        dept.dept_name
      FROM master_user mu
      INNER JOIN v_mstr_employee vme ON mu.account_nik = vme.employee_id COLLATE SQL_Latin1_General_CP1_CI_AS
      INNER JOIN master_role mr ON mu.account_type = mr.role_id
      LEFT JOIN v_mstr_employee emp ON mu.account_nik = emp.employee_id COLLATE SQL_Latin1_General_CP1_CI_AS
      LEFT JOIN v_mstr_bu bu ON emp.map_bu_id = bu.bu_id COLLATE SQL_Latin1_General_CP1_CI_AS
      LEFT JOIN v_mstr_div div ON emp.map_div_id = div.div_id COLLATE SQL_Latin1_General_CP1_CI_AS
      LEFT JOIN v_mstr_dept dept ON emp.map_dept_id = dept.dept_id COLLATE SQL_Latin1_General_CP1_CI_AS
      WHERE mu.account_username = ?
    `;

    const result = await dbDMS.raw(query, [decryptedNik]);
    res.status(200).json(result);
  } catch (error) {
    console.log(error);
    logger(error, 'GET /getUserData', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

// Get Document Data (enhanced version from a.js)
export const getDocumentData = async (req, res) => {
  // #swagger.tags = ['Peminjaman']
  /* #swagger.security = [{
          "bearerAuth": []
  }] */
  // #swagger.description = 'Get document data with validation'
  try {
    const { nama_dokumen, lokasi_penyimpanan, user_nik } = req.query;

    if (!nama_dokumen || !lokasi_penyimpanan) {
      return res.status(400).json({ message: 'nama_dokumen and lokasi_penyimpanan are required' });
    }

    // Decrypt the user_nik if it's encrypted
    let decryptedNik = user_nik;
    if (user_nik && user_nik.length > 20) { // Encrypted data is typically longer
      try {
        decryptedNik = decrypt(user_nik);
      } catch (decryptError) {
        console.log('User NIK decryption failed, using as plain text:', decryptError.message);
        decryptedNik = user_nik; // Fallback to plain text
      }
    }

    const query = `
      SELECT 
        c.lokasi_arsip_id, 
        mla.lokasi_arsip_name, 
        c.content_kat, 
        c.content_security,
        c.content_path,
        c.arsip_kat as kat_desc,
        c.arsip_no,
        c.content_name,
        c.content_doc,
        c.content_status,
        c.content_kode_lemari,
        c.content_div,
        c.content_work_id,
        c.lemari_id,
        (
          SELECT count(*) as jumlah
          FROM trs_permintaan_arsip
          WHERE pinjam_user_id = ?
            AND pinjam_status NOT IN ('Peminjaman Berakhir', 'Tolak', 'Sudah download', 'Melewati Waktu Download')
            AND pinjam_aktivitas = 'Pinjam Asli'
        ) as jumlah_pinjam,
        (
          SELECT count(*) as jumlah
          FROM trs_permintaan_arsip t
          CROSS APPLY dbo.fn_GetWorkDays(t.pinjam_tgl_est_kembali_to, GETDATE()) wd
          WHERE wd.WorkDays >= 12 
            AND pinjam_aktivitas <> 'Permintaan PDF / Elektronik' 
            AND pinjam_status = 'Peminjaman Berhasil'
            AND pinjam_user_id = ?
        ) as jumlah_belum_kembali
      FROM content c 
      INNER JOIN mst_lokasi_arsip mla ON c.lokasi_arsip_id = mla.lokasi_arsip_id 
      WHERE c.content_name = ? 
        AND mla.lokasi_arsip_name = ?
    `;

    const result = await dbDMS.raw(query, [decryptedNik, decryptedNik, nama_dokumen, lokasi_penyimpanan]);
    res.status(200).json(result);
  } catch (error) {
    console.log(error);
    logger(error, 'GET /getDocumentData', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

// Validate file upload size (for future file upload feature)
export const validateFileUpload = async (req, res) => {
  // #swagger.tags = ['Peminjaman']
  /* #swagger.security = [{
          "bearerAuth": []
  }] */
  // #swagger.description = 'Validate file upload size'
  try {
    const maxSize = 15 * 1024 * 1024; // 15 MB
    
    if (req.file && req.file.size > maxSize) {
      return res.status(400).json({ 
        type: 'error', 
        message: 'Ukuran file terlalu besar! Maksimal 15 MB.' 
      });
    }
    
    res.status(200).json({ 
      type: 'success', 
      message: 'File valid',
      fileInfo: req.file 
    });
  } catch (error) {
    console.log(error);
    logger(error, 'POST /validateFileUpload', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

// User Document Confirmation Functions

/**
 * Get document request details for user confirmation
 */
const getDocumentConfirmation = async (req, res) => {
    try {
        const { ticket_no, user_nik } = req.query;

        if (!ticket_no || !user_nik) {
            return res.status(400).json({
                success: false,
                message: 'Ticket number and user NIK are required'
            });
        }

        // Decrypt user_nik
        const decryptedNik = decrypt(user_nik);

        // Get document request details
        const query = `
            SELECT
                p.*,
                e1.nama as pembuat_nama,
                e1.div_nama as pembuat_div_nama,
                e1.nama_dept as pembuat_dept_nama,
                e2.nama as arsiparis_nama,
                la.lokasi_arsip_name,
                bu.bu_name
            FROM trs_permintaan_arsip p
            LEFT JOIN employee e1 ON p.pinjam_user_nik = e1.nik
            LEFT JOIN employee e2 ON p.pinjam_user_approve = e2.id
            LEFT JOIN lokasi_arsip la ON p.lokasi_arsip_id = la.lokasi_arsip_id
            LEFT JOIN bu ON e1.id_bu = bu.bu_id
            WHERE p.pinjam_no_tiket = ? AND p.pinjam_user_nik = ?
        `;

        const [rows] = await db.execute(query, [ticket_no, decryptedNik]);

        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Document request not found or access denied'
            });
        }

        const permintaan = rows[0];

        // Check if user has permission to access this form
        if (permintaan.pinjam_user_nik !== decryptedNik) {
            return res.status(403).json({
                success: false,
                message: 'You are not authorized to access this form'
            });
        }

        res.json({
            success: true,
            data: permintaan
        });

    } catch (error) {
        console.error('Error getting document confirmation:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
};

/**
 * Confirm document receipt (saveApprove equivalent)
 */
const confirmDocumentReceipt = async (req, res) => {
    try {
        const {
            nomor_tiket,
            kondisi_dokumen,
            catatan_bast,
            tgl_ambil,
            user_nik
        } = req.body;

        if (!nomor_tiket || !user_nik) {
            return res.status(400).json({
                success: false,
                message: 'Ticket number and user NIK are required'
            });
        }

        // Decrypt user_nik
        const decryptedNik = decrypt(user_nik);

        // Get current document request
        const getPermintaanQuery = `
            SELECT * FROM trs_permintaan_arsip
            WHERE pinjam_no_tiket = ?
        `;
        const [permintaanRows] = await db.execute(getPermintaanQuery, [nomor_tiket]);

        if (permintaanRows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Document request not found'
            });
        }

        const permintaan = permintaanRows[0];

        // Check if already confirmed
        if (permintaan.pinjam_status === 'Peminjaman Berhasil') {
            return res.status(400).json({
                success: false,
                message: 'Cannot confirm, already confirmed previously'
            });
        }

        // Get employee data
        const getEmployeeQuery = `
            SELECT * FROM employee WHERE nik = ?
        `;
        const [employeeRows] = await db.execute(getEmployeeQuery, [permintaan.pinjam_user_nik]);
        const employee = employeeRows[0];

        // Get approver data
        const getApproverQuery = `
            SELECT * FROM employee WHERE id = ?
        `;
        const [approverRows] = await db.execute(getApproverQuery, [permintaan.pinjam_user_approve]);
        const approver = approverRows[0];

        // Update document request status
        const updateQuery = `
            UPDATE trs_permintaan_arsip
            SET
                pinjam_status = 'Peminjaman Berhasil',
                pinjam_kondisi_dokumen = ?,
                pinjam_notes = ?,
                pinjam_tgl_ambil = ?,
                updated_at = NOW()
            WHERE pinjam_no_tiket = ?
        `;

        await db.execute(updateQuery, [
            kondisi_dokumen,
            catatan_bast,
            tgl_ambil,
            nomor_tiket
        ]);

        // Log the approval
        const logQuery = `
            INSERT INTO log_tiket (
                nomor_tiket, nik, emp_id, app_jns_trans,
                kondisi_dokumen, catatan_bast, tgl_ambil,
                notes, pinjam_status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
        `;

        const appJnsTrans = permintaan.pinjam_aktivitas === 'Pinjam Asli' ? 2 : 3;

        await db.execute(logQuery, [
            nomor_tiket,
            permintaan.pinjam_user_approve,
            permintaan.pinjam_user_id,
            appJnsTrans,
            kondisi_dokumen,
            catatan_bast,
            tgl_ambil,
            req.body.notes || '',
            'Peminjaman Berhasil'
        ]);

        // TODO: Send email notification (implement email service)
        // const emailData = {
        //     to: approver.email,
        //     subject: 'NOTIFIKASI PERMINTAAN DOKUMEN (BERITA ACARA)',
        //     template: 'document-confirmation',
        //     data: { permintaan, employee, approver }
        // };

        res.json({
            success: true,
            message: 'Document receipt confirmed successfully'
        });

    } catch (error) {
        console.error('Error confirming document receipt:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
};

/**
 * Request revision (saveRevisi equivalent)
 */
const requestRevision = async (req, res) => {
    try {
        const {
            nomor_tiket,
            revisi_reason,
            user_nik
        } = req.body;

        if (!nomor_tiket || !revisi_reason || !user_nik) {
            return res.status(400).json({
                success: false,
                message: 'Ticket number, revision reason, and user NIK are required'
            });
        }

        // Decrypt user_nik
        const decryptedNik = decrypt(user_nik);

        // Get current document request
        const getPermintaanQuery = `
            SELECT * FROM trs_permintaan_arsip
            WHERE pinjam_no_tiket = ?
        `;
        const [permintaanRows] = await db.execute(getPermintaanQuery, [nomor_tiket]);

        if (permintaanRows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Document request not found'
            });
        }

        const permintaan = permintaanRows[0];

        // Update document request status
        const updateQuery = `
            UPDATE trs_permintaan_arsip
            SET
                pinjam_status = 'Kirim Revisi',
                pinjam_user_approve = '',
                pinjam_approve_ke = 0,
                revisi_reason = ?,
                updated_at = NOW()
            WHERE pinjam_no_tiket = ?
        `;

        await db.execute(updateQuery, [revisi_reason, nomor_tiket]);

        // Log the revision request
        const logQuery = `
            INSERT INTO log_tiket (
                nomor_tiket, nik, emp_id, app_jns_trans,
                notes, pinjam_status, revisi_reason, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
        `;

        const appJnsTrans = permintaan.pinjam_aktivitas === 'Pinjam Asli' ? 2 : 3;

        await db.execute(logQuery, [
            nomor_tiket,
            decryptedNik,
            permintaan.pinjam_user_id,
            appJnsTrans,
            req.body.notes || '',
            'Kirim Revisi',
            revisi_reason
        ]);

        // TODO: Send email notification
        // const emailData = {
        //     to: employee.email,
        //     subject: 'NOTIFIKASI PERMINTAAN DOKUMEN (REVISI)',
        //     template: 'document-revision',
        //     data: { permintaan, revisi_reason }
        // };

        res.json({
            success: true,
            message: 'Revision request sent successfully'
        });

    } catch (error) {
        console.error('Error requesting revision:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
};

/**
 * Reject document handover (saveTolak equivalent)
 */
const rejectDocumentHandover = async (req, res) => {
    try {
        const {
            nomor_tiket,
            revisi_reason,
            user_nik
        } = req.body;

        if (!nomor_tiket || !revisi_reason || !user_nik) {
            return res.status(400).json({
                success: false,
                message: 'Ticket number, rejection reason, and user NIK are required'
            });
        }

        // Decrypt user_nik
        const decryptedNik = decrypt(user_nik);

        // Get current document request
        const getPermintaanQuery = `
            SELECT * FROM trs_permintaan_arsip
            WHERE pinjam_no_tiket = ?
        `;
        const [permintaanRows] = await db.execute(getPermintaanQuery, [nomor_tiket]);

        if (permintaanRows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Document request not found'
            });
        }

        const permintaan = permintaanRows[0];

        // Update document request status
        const updateQuery = `
            UPDATE trs_permintaan_arsip
            SET
                pinjam_status = 'Kirim Tolak BAST',
                pinjam_user_approve = '',
                pinjam_approve_ke = 0,
                revisi_reason = ?,
                updated_at = NOW()
            WHERE pinjam_no_tiket = ?
        `;

        await db.execute(updateQuery, [revisi_reason, nomor_tiket]);

        // Log the rejection
        const logQuery = `
            INSERT INTO log_tiket (
                nomor_tiket, nik, emp_id, app_jns_trans,
                notes, pinjam_status, revisi_reason, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
        `;

        const appJnsTrans = permintaan.pinjam_aktivitas === 'Pinjam Asli' ? 2 : 3;

        await db.execute(logQuery, [
            nomor_tiket,
            decryptedNik,
            permintaan.pinjam_user_id,
            appJnsTrans,
            req.body.notes || '',
            'Kirim Tolak BAST',
            revisi_reason
        ]);

        // TODO: Send email notification
        // const emailData = {
        //     to: employee.email,
        //     subject: 'NOTIFIKASI PERMINTAAN DOKUMEN (TOLAK)',
        //     template: 'document-rejection',
        //     data: { permintaan, revisi_reason }
        // };

        res.json({
            success: true,
            message: 'Document handover rejected successfully'
        });

    } catch (error) {
        console.error('Error rejecting document handover:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
};

/**
 * Generate BAST (Berita Acara Serah Terima)
 */
const generateBAST = async (req, res) => {
    try {
        const { ticket_no, user_nik } = req.query;

        if (!ticket_no || !user_nik) {
            return res.status(400).json({
                success: false,
                message: 'Ticket number and user NIK are required'
            });
        }

        // Decrypt user_nik
        const decryptedNik = decrypt(user_nik);

        // Get document request details with related data
        const query = `
            SELECT
                p.*,
                e1.nama as pembuat_nama,
                e2.nama as arsiparis_nama,
                la.lokasi_arsip_name
            FROM trs_permintaan_arsip p
            LEFT JOIN employee e1 ON p.pinjam_user_nik = e1.nik
            LEFT JOIN employee e2 ON p.pinjam_user_approve = e2.id
            LEFT JOIN lokasi_arsip la ON p.lokasi_arsip_id = la.lokasi_arsip_id
            WHERE p.pinjam_no_tiket = ? AND p.pinjam_user_nik = ?
        `;

        const [rows] = await db.execute(query, [ticket_no, decryptedNik]);

        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Document request not found or access denied'
            });
        }

        const permintaan = rows[0];

        // Generate BAST data
        const bastData = {
            lokasi_arsip: permintaan.lokasi_arsip_name,
            pembuat_nama: permintaan.pembuat_nama,
            arsiparis_nama: permintaan.arsiparis_nama,
            nama_dokumen: permintaan.pinjam_nama_doc,
            nomor_dokumen: permintaan.pinjam_nomor_doc,
            alasan_pinjam: permintaan.pinjam_alasan_pinjam,
            tgl_est_kembali: permintaan.pinjam_tgl_est_kembali_to,
            kondisi_doc: permintaan.kondisi_doc,
            kondisi_doc_ket: permintaan.kondisi_doc_ket,
            ticket_no: ticket_no
        };

        res.json({
            success: true,
            data: bastData
        });

    } catch (error) {
        console.error('Error generating BAST:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
};
// Check user peminjaman eligibility (from PHP addpermintaandokumenfisik)
export const checkUserEligibility = async (req, res) => {
  // #swagger.tags = ['Peminjaman']
  /* #swagger.security = [{
          "bearerAuth": []
  }] */
  // #swagger.description = 'Check if user is eligible to make document request'
  try {
    const { user_nik } = req.query;

    if (!user_nik) {
      return res.status(400).json({
        success: false,
        message: 'User NIK is required'
      });
    }

    // Decrypt user_nik
    const decryptedNik = decrypt(user_nik);

    // Check for overdue documents (equivalent to cek_peminjaman_user in PHP)
    const overdueQuery = `
      SELECT *
      FROM trs_permintaan_arsip t
      CROSS APPLY dbo.fn_GetWorkDays(t.pinjam_tgl_est_kembali_to, GETDATE()) wd
      WHERE wd.WorkDays >= 12
        AND pinjam_aktivitas <> 'Permintaan PDF / Elektronik'
        AND pinjam_status = 'Peminjaman Berhasil'
        AND pinjam_user_nik = ?
    `;

    // Check total active loans (equivalent to cek_jumlah_peminjaman_user in PHP)
    const activeLoansQuery = `
      SELECT COUNT(*) as jumlah
      FROM trs_permintaan_arsip
      WHERE pinjam_user_nik = ?
        AND pinjam_status NOT IN ('Peminjaman Berakhir', 'Tolak', 'Sudah download', 'Melewati Waktu Download')
        AND pinjam_aktivitas = 'Pinjam Asli'
    `;

    const [overdueResult] = await dbDMS.raw(overdueQuery, [decryptedNik]);
    const [activeLoansResult] = await dbDMS.raw(activeLoansQuery, [decryptedNik]);

    const hasOverdue = overdueResult && overdueResult.length > 0;
    const activeLoanCount = activeLoansResult && activeLoansResult.length > 0 ? activeLoansResult[0].jumlah : 0;

    // Validation rules from PHP
    if (hasOverdue) {
      return res.status(400).json({
        success: false,
        message: 'Anda tidak dapat melakukan peminjaman karena ada dokumen yang belum dikembalikan melebihi due date H + 12 !',
        code: 'OVERDUE_DOCUMENTS'
      });
    }

    if (activeLoanCount > 5) {
      return res.status(400).json({
        success: false,
        message: 'Anda tidak dapat melakukan peminjaman dokumen lebih dari 5 (lima)!',
        code: 'TOO_MANY_LOANS'
      });
    }

    res.json({
      success: true,
      message: 'User is eligible for document request',
      data: {
        overdue_count: overdueResult ? overdueResult.length : 0,
        active_loan_count: activeLoanCount
      }
    });

  } catch (error) {
    console.error('Error checking user eligibility:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Get employee supervisor data (from PHP logic)
export const getEmployeeSupervisor = async (req, res) => {
  // #swagger.tags = ['Peminjaman']
  /* #swagger.security = [{
          "bearerAuth": []
  }] */
  // #swagger.description = 'Get employee supervisor information'
  try {
    const { employee_nik } = req.query;

    if (!employee_nik) {
      return res.status(400).json({
        success: false,
        message: 'Employee NIK is required'
      });
    }

    // Decrypt if needed
    let decryptedNik = employee_nik;
    if (employee_nik.length > 20) {
      try {
        decryptedNik = decrypt(employee_nik);
      } catch (decryptError) {
        console.log('NIK decryption failed, using as plain text');
        decryptedNik = employee_nik;
      }
    }

    // Get employee data
    const employeeQuery = `
      SELECT * FROM v_mstr_employee_ext
      WHERE id = ? AND status = 'ACTIVE'
    `;
    const employeeResult = await dbDMS.raw(employeeQuery, [decryptedNik]);

    if (!employeeResult || employeeResult.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }

    const employee = employeeResult[0];

    // Get supervisor data (equivalent to PHP logic for getting dataapprover)
    let supervisorQuery = `
      SELECT * FROM v_mstr_employee_ext
      WHERE id = ? AND status = 'ACTIVE'
    `;

    const supervisorResult = await dbDMS.raw(supervisorQuery, [employee.id_atasan]);
    let supervisor = supervisorResult && supervisorResult.length > 0 ? supervisorResult[0] : null;

    // Check if supervisor has a supervisor with grade 6 (from PHP logic)
    if (supervisor && supervisor.id_atasan) {
      const supervisor2Result = await dbDMS.raw(supervisorQuery, [supervisor.id_atasan]);
      const supervisor2 = supervisor2Result && supervisor2Result.length > 0 ? supervisor2Result[0] : null;

      if (supervisor2 && supervisor2.grade == 6) {
        supervisor = supervisor2;
      }
    }

    res.json({
      success: true,
      data: {
        employee: employee,
        supervisor: supervisor
      }
    });

  } catch (error) {
    console.error('Error getting employee supervisor:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Get approval data by token (standalone approval via email link — same pattern as pemusnahan/pengaduan)
export const validatePeminjamanToken = async (req, res) => {
  try {
    const { token, url } = req.query;

    if (!token) {
      return res.status(406).json({ type: 'error', message: 'Token tidak ditemukan sama sekali' });
    }

    // Find ticket by tr_token (same pattern as pemusnahan/pengaduan)
    const ticket = await dbDMS('trs_permintaan_arsip as p')
      .leftJoin('content as c', 'p.pinjam_nomor_doc', 'c.content_doc')
      .leftJoin('master_user as u', dbDMS.raw('p.pinjam_user_id = u.account_username COLLATE SQL_Latin1_General_CP1_CI_AS'))
      .select(
        'p.*',
        'u.account_name as nama_user',
        'u.account_div_name as div_nama',
        'u.account_dept_name as nama_dept',
        'u.account_bu as user_bu_id',
        'c.content_name as nama_dokumen',
        'c.content_doc as nomor_dokumen',
        'c.arsip_no as nomor_arsip',
        'c.content_security as kategori_keamanan',
        'c.arsip_kat',
        'c.content_entrydate as tgl_doc'
      )
      .where('p.tr_token', token)
      .first();

    if (!ticket) {
      return res.status(406).json({ type: 'error', message: 'Token tidak valid atau sudah tidak berlaku' });
    }

    // Get approver from pinjam_user_approve
    const approver = await dbDMS('master_user')
      .leftJoin('v_mstr_bu', dbDMS.raw('master_user.account_bu COLLATE SQL_Latin1_General_CP1_CI_AS = v_mstr_bu.bu_id'))
      .select('account_username', 'account_nik', 'account_name', 'account_bu', 'account_div_name', 'account_dept_name', 'bu_name')
      .where('account_username', ticket.pinjam_user_approve)
      .first();

    if (!approver) {
      return res.status(406).json({ type: 'error', message: 'Data approver tidak ditemukan' });
    }

    // Get BU name
    const buData = await dbDMS('v_mstr_bu').where('bu_id', ticket.bu_id).first();

    // Get idle_time from policy
    const resPortal = await dbHris('ptl_policy').where('id', 0).first();

    // Generate JWT token
    const jwtToken = jwt.sign(
      { user: approver.account_username },
      process.env.TOKEN,
      { expiresIn: resPortal?.idle_time || 3600000 }
    );

    // Log access
    await dbDMS('log_akses').insert({
      empid: approver.account_username,
      nik: approver.account_nik,
      status: 'login',
      keterangan: `approval_peminjaman_${ticket.pinjam_status}`,
      nama_url: `${url}/approval/peminjaman?token=${token}`,
    });

    return res.status(200).json(
      createUserResponse(
        approver,
        jwtToken,
        process.env.ENVIRONMENT === 'PRODUCTION' ? resPortal?.idle_time : 3600000,
        ticket.pinjam_no_tiket,
        ticket.pinjam_status,
        {
          ticket_id: ticket.id,
          ticket_no: ticket.pinjam_no_tiket,
          status: ticket.pinjam_status,
          pinjam_aktivitas: ticket.pinjam_aktivitas,
          pinjam_approve_ke: ticket.pinjam_approve_ke,
          bu_name: buData?.bu_name || null,
          ...ticket
        }
      )
    );
  } catch (error) {
    logger(error, 'GET /peminjaman/validate-token', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

export const getApprovalDirect = async (req, res) => {
  // #swagger.tags = ['Peminjaman']
  // #swagger.description = 'Get approval data by token for direct approval'
  try {
    const { token } = req.params;
    
    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Token approval tidak ditemukan'
      });
    }

    // Decode token (base64 encoded: nik;ticket_number)
    let decodedToken;
    try {
      decodedToken = Buffer.from(token, 'base64').toString('utf-8');
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: 'Token approval tidak valid'
      });
    }

    const [approverID, ticketNumber] = decodedToken.split(';');
    
    if (!approverID || !ticketNumber) {
      return res.status(400).json({
        success: false,
        message: 'Format token tidak valid'
      });
    }

    // Get request data
    const requestQuery = `
      SELECT 
        p.*,
        u.nama as nama_user,
        m.account_div_name div_nama,
        m.account_dept_name nama_dept,
        c.content_name as nama_dokumen,
        c.content_doc as nomor_dokumen,
        c.arsip_no as nomor_arsip,
        c.content_security as kategori_keamanan,
        c.arsip_kat,
        c.content_entrydate as tgl_doc
      FROM trs_permintaan_arsip p
      LEFT JOIN v_mstr_employee_ext u ON p.pinjam_user_nik = u.nik COLLATE SQL_Latin1_General_CP1_CI_AS
      LEFT JOIN content c ON p.pinjam_nomor_doc = c.content_doc
      LEFT JOIN master_user m ON u.id = m.account_username COLLATE SQL_Latin1_General_CP1_CI_AS
      WHERE p.pinjam_no_tiket = ?
    `;

    const requestResults = await dbDMS.raw(requestQuery, [ticketNumber]);
    
    if (!requestResults || requestResults.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Data permintaan tidak ditemukan'
      });
    }

    const requestData = requestResults[0];

    // Check if approver is authorized
    const approverQuery = `
      SELECT * FROM v_mstr_employee_ext 
      WHERE id = ? AND status = 'ACTIVE'
    `;
    const approverResults = await dbDMS.raw(approverQuery, [approverID]);
    
    if (!approverResults || approverResults.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'Approver tidak ditemukan'
      });
    }

    const approver = approverResults[0];

    // Check if this approver is authorized for this request
    // The request should have pinjam_user_approve matching the approver's ID
    if (requestData.pinjam_user_approve !== approver.id) {
      return res.status(403).json({
        success: false,
        message: 'Anda tidak berhak mengakses approval ini'
      });
    }

    // Check approval authorization based on business logic
    const canApprove = await checkApprovalAuthorization(requestData, approver);

    // Get business unit information
    const buQuery = `SELECT * FROM v_mstr_bu WHERE bu_id = ?`;
    const buResults = await dbDMS.raw(buQuery, [requestData.bu_id || requestData.id_bu]);
    const buData = buResults && buResults.length > 0 ? buResults[0] : null;

    // Check if approver is legal SH (matching PHP logic)
    const isLegalSH = approver.id_dir === 11680 && [4].includes(approver.grade);

    // Get approval history
    const historyQuery = `
      SELECT 
        h.*,
        e.nama as approver_name,
        e.jabatan,
        h.trs_log_hasil as status,
        h.trs_log_catatan as notes,
        h.trs_log_reason_revisi as revisi_reason,
        h.trs_log_tgl as created_at
      FROM trs_log h
      LEFT JOIN v_mstr_employee_ext e ON h.trs_log_pic = e.id COLLATE SQL_Latin1_General_CP1_CI_AS
      WHERE h.trs_log_no_tiket = ?
      ORDER BY h.trs_log_tgl ASC
    `;
    const historyResults = await dbDMS.raw(historyQuery, [ticketNumber]);

    res.json({
      success: true,
      data: {
        ...requestData,
        can_approve: canApprove,
        approver_nik: approverID,
        approver_id_dir: approver.id_dir,
        approver_grade: approver.grade,
        bu_name: buData ? buData.bu_name : null,
        is_legal_sh: isLegalSH
      },
      history: historyResults || []
    });

  } catch (error) {
    console.error('Get approval direct error:', error);
    res.status(500).json({
      success: false,
      message: 'Gagal memuat data approval',
      error: error.message
    });
  }
};

// Process approval action
export const processApprovalDirect = async (req, res) => {
  // #swagger.tags = ['Peminjaman']
  // #swagger.description = 'Process approval action (approve, revise, reject)'
  try {
    const { 
      token, 
      action, 
      tgl_pengambilan, 
      jam_pengambilan, 
      jam_pengambilan_sd,
      tgl_pengembalian, 
      jam_pengembalian, 
      jam_pengembalian_sd,
      notes, 
      revisi_reason 
    } = req.body;

    if (!token || !action) {
      return res.status(400).json({
        success: false,
        message: 'Token dan action harus diisi'
      });
    }

    // Decode token
    let decodedToken;
    try {
      decodedToken = Buffer.from(token, 'base64').toString('utf-8');
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: 'Token approval tidak valid'
      });
    }

    const [approverNik, ticketNumber] = decodedToken.split(';');

    // Get request data
    const requestQuery = `
      SELECT 
        p.*,
        u.account_name as nama_user,
        u.account_div_name div_nama,
        u.account_bu as account_bu,
        c.content_name as nama_dokumen,
        c.content_doc as nomor_dokumen,
        c.arsip_no as nomor_arsip,
        c.content_security as kategori_keamanan,
        c.arsip_kat,
        c.content_entrydate as tgl_doc
      FROM trs_permintaan_arsip p
      LEFT JOIN master_user u ON p.pinjam_user_id = u.account_username COLLATE SQL_Latin1_General_CP1_CI_AS
      LEFT JOIN content c ON p.pinjam_nomor_doc = c.content_doc
      WHERE p.pinjam_no_tiket = ?
    `;

    const requestResults = await dbDMS.raw(requestQuery, [ticketNumber]);
    const requestData = requestResults[0];

    // Get approver data
    const approverQuery = `SELECT * FROM v_mstr_employee_ext WHERE id = ? AND status = 'ACTIVE'`;
    const approverResults = await dbDMS.raw(approverQuery, [decrypt(approverNik)]);
    const approver = approverResults[0];

    // Process based on action
    let result;
    switch (action) {
      case 'approve':
        result = await processApprove(requestData, approver, {
          tgl_pengambilan,
          jam_pengambilan,
          jam_pengambilan_sd,
          tgl_pengembalian,
          jam_pengembalian,
          jam_pengembalian_sd,
          notes
        });
        break;
      case 'revise':
        result = await processRevision(requestData, approver, {
          notes,
          revisi_reason
        });
        break;
      case 'reject':
        result = await processReject(requestData, approver, {
          notes,
          revisi_reason
        });
        break;
      default:
        return res.status(400).json({
          success: false,
          message: 'Action tidak valid'
        });
    }

    res.json({
      success: true,
      message: result.message,
      data: result.data
    });

  } catch (error) {
    console.error('Process approval direct error:', error);
    res.status(500).json({
      success: false,
      message: 'Gagal memproses approval',
      error: error.message
    });
  }
};

// Helper function to check 3 working days back (matching PHP hitung3HariKerjaKebelakang)
const isWithinWorkingDayLimit = (startDate) => {
  if (!startDate) return false;
  
  const today = new Date();
  let workingDaysCount = 0;
  let checkDate = new Date(today);
  
  // Count 3 working days back
  while (workingDaysCount < 3) {
    checkDate.setDate(checkDate.getDate() - 1);
    
    // Check if it's not weekend (0 = Sunday, 6 = Saturday)
    const dayOfWeek = checkDate.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      workingDaysCount++;
    }
  }
  
  // Return true if start date is after the calculated date (within time limit)
  const startDateObj = new Date(startDate);
  return checkDate < startDateObj;
};

const checkApprovalAuthorization = async (requestData, approver) => {
  try {
    // Check 3 working days back validation (matching PHP hitung3HariKerjaKebelakang)
    if (!isWithinWorkingDayLimit(requestData.pinjam_tgl_est_ambil_fr)) {
      return false;
    }

    // Get master approval configuration
    const approvalQuery = `
      SELECT * FROM mst_approval 
      WHERE app_bu_id = ? 
      AND app_jns_trans = ?
      AND app_prioritas = ?
    `;
    
    const jnsTransValue = requestData.pinjam_aktivitas === 'Pinjam Asli' ? 2 : 3;
    const approvalResults = await dbDMS.raw(approvalQuery, [
      requestData.bu_id || requestData.id_bu,
      jnsTransValue,
      requestData.pinjam_prioritas_approve || 1
    ]);

    if (!approvalResults || approvalResults.length === 0) {
      return false;
    }

    const masterApproval = approvalResults[0];

    // Check if current approver is in the approval chain
    const approverFields = [
      'app_bag1_emp_id1', 'app_bag1_emp_id2', 'app_bag1_emp_id3',
      'app_bag2_emp_id1', 'app_bag2_emp_id2', 'app_bag2_emp_id3'
    ];

    for (const field of approverFields) {
      if (masterApproval[field] === approver.id) {
        return true;
      }
    }

    return false;

  } catch (error) {
    console.error('Check approval authorization error:', error);
    return false;
  }
};

// Helper function: Process approve action
const processApprove = async (requestData, approver, formData) => {
  try {
    // Get master approval to determine next step
    const approvalQuery = `
      SELECT * FROM mst_approval 
      WHERE app_bu_id = ? 
      AND app_jns_trans = ?
      AND app_prioritas = ?
    `;
    
    const jnsTransValue = requestData.pinjam_aktivitas === 'Pinjam Asli' ? 2 : 3;
    const approvalResults = await dbDMS.raw(approvalQuery, [
      requestData.bu_id || requestData.id_bu,
      jnsTransValue,
      requestData.pinjam_prioritas_approve || 1
    ]);

    const masterApproval = approvalResults[0];

    // Determine next status and approver
    let nextStatus = 'Kirim Legal';
    let nextApprover = null;
    let approveLevel = 1;

    // Logic to determine next step based on current approver and approval chain
    if (approver.id === masterApproval.app_bag1_emp_id1) {
      if (masterApproval.app_bag1_emp_id2) {
        nextApprover = masterApproval.app_bag1_emp_id2;
        nextStatus = 'Kirim Legal';
        approveLevel = 2;
      } else {
        nextStatus = 'Kirim Arsiparis';
      }
    } else if (approver.id === masterApproval.app_bag1_emp_id2) {
      nextStatus = 'Kirim Arsiparis';
    }

    // For electronic documents, different flow
    if (requestData.pinjam_aktivitas !== 'Pinjam Asli' && !nextApprover) {
      nextStatus = 'Proses BAST';
    }

    // Update request status
    const updateQuery = `
      UPDATE trs_permintaan_arsip 
      SET 
        pinjam_status = ?,
        pinjam_user_approve = ?,
        pinjam_approve_ke = ?,
        pinjam_tgl_est_ambil_fr = ?,
        pinjam_tgl_est_ambil_to = ?,
        pinjam_tgl_est_kembali_fr = ?,
        pinjam_tgl_est_kembali_to = ?
      WHERE id = ?
    `;

    const tglAmbilFr = formData.tgl_pengambilan && formData.jam_pengambilan ? 
      `${formData.tgl_pengambilan} ${formData.jam_pengambilan}` : null;
    const tglAmbilTo = formData.tgl_pengambilan && formData.jam_pengambilan_sd ? 
      `${formData.tgl_pengambilan} ${formData.jam_pengambilan_sd}` : null;
    const tglKembaliFr = formData.tgl_pengembalian && formData.jam_pengembalian ? 
      `${formData.tgl_pengembalian} ${formData.jam_pengembalian}` : null;
    const tglKembaliTo = formData.tgl_pengembalian && formData.jam_pengembalian_sd ? 
      `${formData.tgl_pengembalian} ${formData.jam_pengembalian_sd}` : null;

    await dbDMS.raw(updateQuery, [
      nextStatus,
      nextApprover,
      approveLevel,
      tglAmbilFr,
      tglAmbilTo,
      tglKembaliFr,
      tglKembaliTo,
      requestData.id
    ]);

    // Add to history
    const historyQuery = `
      INSERT INTO trs_log 
      (trs_log_no_tiket, trs_log_pic, trs_log_proses, trs_log_hasil, trs_log_catatan, trs_log_jenis, trs_log_tgl, trs_log_status)
      VALUES (?, ?, ?, ?, ?, ?, GETDATE(), 1)
    `;

    await dbDMS.raw(historyQuery, [
      requestData.pinjam_no_tiket,
      approver.id,
      'Konfirmasi Tiket',
      nextStatus,
      formData.notes || 'Disetujui',
      jnsTransValue
    ]);

    // Send email notification
    await sendApprovalEmail(requestData, approver, nextStatus, 'approve');

    return {
      message: 'Permintaan berhasil disetujui',
      data: { status: nextStatus }
    };

  } catch (error) {
    console.error('Process approve error:', error);
    throw error;
  }
};

// Helper function: Process revision action
const processRevision = async (requestData, approver, formData) => {
  try {
    const jnsTransValue = requestData.pinjam_aktivitas === 'Pinjam Asli' ? 2 : 3;

    // Determine revision target
    let revisionStatus = 'Kirim Revisi';
    let targetApprover = '';

    // Check if this is legal director revision
    const isLegalDirRevision = (approver.id_dir === 11680 && [5, 8].includes(approver.grade));
    
    if (isLegalDirRevision) {
      revisionStatus = 'Kirim Revisi Legal';
      // Get legal section head
      const legalSHQuery = `
        SELECT * FROM mst_approval 
        WHERE app_bu_id = ? AND app_jns_trans = ?
      `;
      const legalResults = await dbDMS.raw(legalSHQuery, [requestData.bu_id || requestData.id_bu, jnsTransValue]);
      if (legalResults && legalResults.length > 0) {
        targetApprover = legalResults[0].app_bag1_emp_id1;
      }
    }

    // Update request status
    const updateQuery = `
      UPDATE trs_permintaan_arsip 
      SET 
        pinjam_status = ?,
        pinjam_user_approve = ?,
        pinjam_approve_ke = ?
      WHERE id = ?
    `;

    await dbDMS.raw(updateQuery, [
      revisionStatus,
      targetApprover,
      isLegalDirRevision ? 1 : 0,
      requestData.id
    ]);

    // Add to history
    const historyQuery = `
      INSERT INTO trs_log 
      (trs_log_no_tiket, trs_log_pic, trs_log_proses, trs_log_hasil, trs_log_catatan, trs_log_jenis, trs_log_reason_revisi, trs_log_tgl, trs_log_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, GETDATE(), 1)
    `;

    await dbDMS.raw(historyQuery, [
      requestData.pinjam_no_tiket,
      approver.id,
      'Permintaan Revisi',
      revisionStatus,
      formData.notes || 'Permintaan revisi',
      jnsTransValue,
      formData.revisi_reason
    ]);

    // Send email notification
    await sendApprovalEmail(requestData, approver, revisionStatus, 'revise', formData.revisi_reason);

    return {
      message: 'Permintaan revisi berhasil dikirim',
      data: { status: revisionStatus }
    };

  } catch (error) {
    console.error('Process revision error:', error);
    throw error;
  }
};

// Helper function: Process reject action
const processReject = async (requestData, approver, formData) => {
  try {
    const jnsTransValue = requestData.pinjam_aktivitas === 'Pinjam Asli' ? 2 : 3;

    // Update request status
    const updateQuery = `
      UPDATE trs_permintaan_arsip 
      SET 
        pinjam_status = 'Kirim Tolak',
        pinjam_user_approve = '',
        pinjam_approve_ke = 0
      WHERE id = ?
    `;

    await dbDMS.raw(updateQuery, [requestData.id]);

    // Add to history
    const historyQuery = `
      INSERT INTO trs_log 
      (trs_log_no_tiket, trs_log_pic, trs_log_proses, trs_log_hasil, trs_log_catatan, trs_log_jenis, trs_log_reason_revisi, trs_log_tgl, trs_log_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, GETDATE(), 1)
    `;

    await dbDMS.raw(historyQuery, [
      requestData.pinjam_no_tiket,
      approver.id,
      'Ditolak',
      'Kirim Tolak',
      formData.notes || 'Permintaan ditolak',
      jnsTransValue,
      formData.revisi_reason
    ]);

    // Send email notification
    await sendApprovalEmail(requestData, approver, 'Kirim Tolak', 'reject', formData.revisi_reason);

    return {
      message: 'Permintaan berhasil ditolak',
      data: { status: 'Kirim Tolak' }
    };

  } catch (error) {
    console.error('Process reject error:', error);
    throw error;
  }
};

// Helper function: Send approval email notification
const sendApprovalEmail = async (requestData, approver, status, action, reason = null) => {
  try {
    // This would integrate with your email service
    // For now, just log the email that would be sent
    console.log('Email notification:', {
      to: requestData.nama_user,
      from: approver.nama,
      status: status,
      action: action,
      reason: reason,
      ticket: requestData.pinjam_no_tiket
    });

    // TODO: Implement actual email sending using the existing mail helper
    // const mailHelper = require('../../helpers/mail');
    // await mailHelper.sendApprovalNotification(...);

  } catch (error) {
    console.error('Send approval email error:', error);
    // Don't throw error for email failures
  }
};