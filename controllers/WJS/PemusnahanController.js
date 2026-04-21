import dayjs from "dayjs";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { dbDMS, dbHris } from "../../config/db.js";
import { logger } from "../../helpers/logger.js";
import { decrypt, getErrorResponse, generateToken } from "../../helpers/utils.js";
import { getStatusText, checkUserPermissions, canView, canApprove, canRevise, canExecute, canRevisiApproval } from "../../helpers/pemusnahan.helper.js";
import jwt from "jsonwebtoken";
import { generateTicketNumber } from "../../helpers/counter.js";
import { 
  sendPemusnahanApprovalEmail,
  sendPemusnahanRevisionEmail,
  sendPemusnahanRejectionEmail 
} from "../../helpers/pemusnahan.mail.js";
import { createUserResponse } from "../../helpers/master/login.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Helper function to get arsiparis atasan from v_mstr_employee_ext hierarchy
 */
const getArsiparisAtasanData = async (trx, arsiparis_id) => {
  const result = await trx.raw(`
    SELECT 
      CASE WHEN c.grade = 6 THEN c.id ELSE b.id END id,
      CASE WHEN c.grade = 6 THEN c.nama ELSE b.nama END nama,
      CASE WHEN c.grade = 6 THEN c.nik ELSE b.nik END nik
    FROM v_mstr_employee_ext a
    LEFT JOIN v_mstr_employee_ext b ON a.id_atasan = b.id
    LEFT JOIN v_mstr_employee_ext c ON b.id_atasan = c.id
    WHERE a.id = ?
  `, [arsiparis_id]);
  
  return result && result.length > 0 ? result[0] : null;
};

/**
 * List pemusnahan tickets with filtering and pagination
 * GET /api/dms/pemusnahan
 */
export const list = async (req, res) => {
  try {
    const {page, rowsPerPage, sortBy, descending, filter, bu_id, lokasi_arsip_id, tgl_awal, tgl_akhir, empid:empidDecrypt,domain} = req.query;
    const empid = decrypt(empidDecrypt);
    const role = await dbDMS('user_grant_role as a').join('master_role as b','a.grant_urole_id','b.role_id').where({'a.grant_user_id': empid,'a.grant_bu_id': domain,'b.role_admin':1}).first( );
    const user_type= role?1:0;
    let query = dbDMS('trs_arsip_header as h')
      .select('h.tr_arsip_id','h.tr_no_tiket','h.tr_tgl_pengajuan','h.tr_tgl_pemusnahan','h.tr_status','h.tr_user_id','h.tr_atasan_user_id','h.tr_corp_lgl_id','h.tr_atasan_corp_lgl_id','h.tr_dir_corp_lgl_id','h.tr_arsiparis_id','h.tr_kategori_keamanan','h.tr_kategori_dokumen as arsip_kat','h.tr_keterangan_pemusnahan','c.content_name','c.arsip_no','c.content_doc','la.lokasi_arsip_name','bu.bu_name')
      .leftJoin('trs_arsip_detail as d', 'h.tr_arsip_id', 'd.trdet_arsip_id')
      .leftJoin('content as c', 'd.trdet_no_arsip', 'c.arsip_no')
      .leftJoin('mst_lokasi_arsip as la', 'h.tr_lokasi_arsip', 'la.lokasi_arsip_id')
      .leftJoin(dbDMS.raw('v_mstr_bu as bu ON c.content_bu COLLATE SQL_Latin1_General_CP1_CI_AS = bu.bu_id COLLATE SQL_Latin1_General_CP1_CI_AS'))
      .where('h.tr_jenis_aktivitas', 6);

    if (bu_id) query = query.where('c.content_bu', bu_id);
    if (lokasi_arsip_id) query = query.where('h.tr_lokasi_arsip', lokasi_arsip_id);
    
    const startDate = tgl_awal || dayjs().startOf('month').format('YYYY-MM-DD');
    const endDate = tgl_akhir || dayjs().endOf('month').format('YYYY-MM-DD');
    query = query.whereBetween('h.tr_tgl_pengajuan', [startDate, endDate]);

    if (filter) query = query.where((q) => { q.orWhere('h.tr_no_tiket', 'like', `%${filter}%`).orWhere('c.content_name', 'like', `%${filter}%`).orWhere('c.arsip_no', 'like', `%${filter}%`).orWhere('c.content_doc', 'like', `%${filter}%`).orWhere('la.lokasi_arsip_name', 'like', `%${filter}%`).orWhere('bu.bu_name', 'like', `%${filter}%`); });

    if (!rowsPerPage) return res.status(200).json(await query.orderBy('h.tr_tgl_pengajuan', 'desc'));

    const sorting = descending === "true" ? "desc" : "asc";
    const columnSort = sortBy === "asc" ? "h.tr_tgl_pengajuan asc" : `${sortBy} ${sorting}`;

    const response = await query.orderByRaw(columnSort).paginate({ perPage: Math.floor(rowsPerPage), currentPage: Math.floor(page), isLengthAware: true });

    if (response.data) {
      response.data = response.data.map(ticket => ({ ...ticket, status_text: getStatusText(ticket.tr_status), ...checkUserPermissions(ticket, empid, user_type) }));
      if (user_type !== 1) response.data = response.data.filter(ticket => canView(ticket, empid, user_type));
    }

    return res.status(200).json(response);
  } catch (error) {
    console.log(error);
    logger(error, 'GET /pemusnahan', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};


export const getById = async (req, res) => {
  try {
    const { id } = req.params;
    const { empid:empidDecrypt, domain } = req.query;
    const empid = decrypt(empidDecrypt);
    console.log(empid)
    const role = await dbDMS('user_grant_role as a').join('master_role as b','a.grant_urole_id','b.role_id').where({'a.grant_user_id': empid,'a.grant_bu_id': domain,'b.role_admin':1}).first();
    const user_type = role ? 1 : 0;

    const header = await dbDMS('trs_arsip_header as h')
      .select('h.*','la.lokasi_arsip_name','bu.bu_name','arsip.account_name as arsiparis_name','atasan_arsip.account_name as arsiparis_atasan_name')
      .leftJoin('mst_lokasi_arsip as la', 'h.tr_lokasi_arsip', 'la.lokasi_arsip_id')
      .leftJoin(dbDMS.raw('v_mstr_bu as bu ON la.lokasi_arsip_bu_id COLLATE SQL_Latin1_General_CP1_CI_AS = bu.bu_id COLLATE SQL_Latin1_General_CP1_CI_AS'))
      .leftJoin('master_user as arsip', 'h.tr_arsiparis_id', 'arsip.account_username')
      .leftJoin('master_user as atasan_arsip', 'h.tr_atasan_arsiparis_id', 'atasan_arsip.account_username')
      .where({'h.tr_arsip_id': id, 'h.tr_jenis_aktivitas': 6})
      .first();

    if (!header) return res.status(406).json({ type: 'error', message: 'Data tidak ditemukan' });
    if (!canView(header, empid, user_type)) return res.status(406).json({ type: 'error', message: 'Akses ditolak' });

    const details = await dbDMS('trs_arsip_detail as a')
      .select('a.*','b.content_name','b.content_doc','b.arsip_no','b.content_duedate','b.content_div','b.content_bu','b.content_owner','c.div_nama','d.bu_name','f.direktorat_name','g.lokasi_arsip_name',dbDMS.raw(`CASE WHEN b.content_duedate IS NULL OR b.content_duedate = '1900-01-01' OR CONVERT(VARCHAR(10), GETDATE(), 120) <= b.content_duedate THEN 'Aktif' WHEN CONVERT(VARCHAR(10), GETDATE(), 120) > b.content_duedate THEN 'In-Aktif' ELSE 'In-Aktif' END as status_berlaku`))
      .leftJoin('content as b', 'a.trdet_no_arsip', 'b.arsip_no')
      .leftJoin(dbDMS.raw('v_mstr_div as c ON b.content_div COLLATE SQL_Latin1_General_CP1_CI_AS = c.div_id COLLATE SQL_Latin1_General_CP1_CI_AS'))
      .leftJoin(dbDMS.raw('v_mstr_bu as d ON d.bu_id = b.content_bu COLLATE SQL_Latin1_General_CP1_CI_AS'))
      .leftJoin(dbDMS.raw('v_mstr_employee_ext as e ON b.content_owner = e.id COLLATE SQL_Latin1_General_CP1_CI_AS'))
      .leftJoin(dbDMS.raw('v_mstr_dir_newer as f ON e.id_dir = f.direktorat_pk'))
      .leftJoin('mst_lokasi_arsip as g', 'b.lokasi_arsip_id', 'g.lokasi_arsip_id')
      .where('a.trdet_arsip_id', id);

    const logs = await dbDMS('trs_log as l')
      .select('l.*','u.account_name')
      .leftJoin('master_user as u', 'l.trs_log_pic', 'u.account_username')
      .where('l.trs_log_no_tiket', header.tr_no_tiket)
      .orderBy('l.trs_log_tgl', 'asc');

    const permissions = checkUserPermissions(header, empid, user_type);
    return res.status(200).json({ data: { header: { ...header, status_text: getStatusText(header.tr_status), ...permissions }, details, logs } });
  } catch (error) {
    console.log(error);
    logger(error, 'GET /pemusnahan/:id', req.params);
    return res.status(406).json(getErrorResponse(error));
  }
};

export const getArchives = async (req, res) => {
  try {
    const {content_owner, arsiparis, kategori_dokumen, lokasi_arsip, kategori_keamanan, search} = req.query;

    let query = dbDMS('content as a')
      .select('a.arsip_no','a.content_name','a.content_doc','a.content_bu','a.content_security','a.content_duedate','a.arsip_kat','a.content_div','a.content_owner','bu.bu_name','div.div_nama','dir.direktorat_name','la.lokasi_arsip_name','e.id as arsiparis_do',dbDMS.raw(`CASE WHEN a.content_duedate IS NULL OR a.content_duedate = '1900-01-01' OR CONVERT(VARCHAR(10), GETDATE(), 120) <= a.content_duedate THEN 'Aktif' WHEN CONVERT(VARCHAR(10), GETDATE(), 120) > a.content_duedate THEN 'In-Aktif' ELSE 'In-Aktif' END as status_berlaku`))
      .leftJoin(dbDMS.raw('v_mstr_employee_ext as e ON e.nik = CONVERT(VARCHAR(100), a.arsiparis_id)'))
      .leftJoin(dbDMS.raw('v_mstr_bu as bu ON a.content_bu COLLATE SQL_Latin1_General_CP1_CI_AS = bu.bu_id COLLATE SQL_Latin1_General_CP1_CI_AS'))
      .leftJoin(dbDMS.raw('v_mstr_div as div ON a.content_div COLLATE SQL_Latin1_General_CP1_CI_AS = div.div_id COLLATE SQL_Latin1_General_CP1_CI_AS'))
      .leftJoin(dbDMS.raw('v_mstr_employee_ext as d ON a.content_owner = d.id COLLATE SQL_Latin1_General_CP1_CI_AS'))
      .leftJoin(dbDMS.raw('v_mstr_dir_newer as dir ON d.id_dir = dir.direktorat_pk'))
      .leftJoin('mst_lokasi_arsip as la', 'a.lokasi_arsip_id', 'la.lokasi_arsip_id')
      .whereRaw(`(a.content_duedate IS NULL OR a.content_duedate = '1900-01-01' OR CONVERT(VARCHAR(10), GETDATE(), 120) <= a.content_duedate)`);

    if (content_owner) query = query.where('a.content_owner', content_owner);
    if (arsiparis) query = query.where('e.id', arsiparis);
    if (kategori_dokumen) query = query.where('a.arsip_kat', kategori_dokumen);
    if (lokasi_arsip) query = query.where('a.lokasi_arsip_id', lokasi_arsip);
    if (kategori_keamanan) query = query.where('a.content_security', kategori_keamanan);
    if (search) query = query.where((q) => { q.orWhere('a.arsip_no', 'like', `%${search}%`).orWhere('a.content_name', 'like', `%${search}%`).orWhere('a.content_doc', 'like', `%${search}%`); });

    return res.status(200).json({ data: await query.limit(100) });
  } catch (error) {
    console.log(error);
    logger(error, 'GET /pemusnahan/archives', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

export const validateArchive = async (req, res) => {
  try {
    const { nama_arsip, kategori_dokumen, kategori_keamanan, lokasi_arsip, nik_owner:empidDecrypt } = req.body;
    const empid = decrypt(empidDecrypt);
    if (!nama_arsip || !kategori_dokumen || !kategori_keamanan || !lokasi_arsip) return res.status(406).json({ type: 'error', message: 'Pilih kategori dokumen, keamanan, dan lokasi arsip terlebih dahulu' });
    console.log(empid);
    const archive = await dbDMS('content as a')
      .select('a.*','bu.bu_name','div.div_nama','dir.direktorat_name','la.lokasi_arsip_name',dbDMS.raw(`CASE WHEN a.content_duedate IS NULL OR a.content_duedate = '1900-01-01' OR CONVERT(VARCHAR(10), GETDATE(), 120) <= a.content_duedate THEN 'Aktif' WHEN CONVERT(VARCHAR(10), GETDATE(), 120) > a.content_duedate THEN 'In-Aktif' ELSE 'In-Aktif' END as status_berlaku`))
      .leftJoin(dbDMS.raw('v_mstr_bu as bu ON a.content_bu COLLATE SQL_Latin1_General_CP1_CI_AS = bu.bu_id COLLATE SQL_Latin1_General_CP1_CI_AS'))
      .leftJoin(dbDMS.raw('v_mstr_div as div ON a.content_div COLLATE SQL_Latin1_General_CP1_CI_AS = div.div_id COLLATE SQL_Latin1_General_CP1_CI_AS'))
      .leftJoin(dbDMS.raw('v_mstr_employee_ext as e ON a.content_owner = e.id COLLATE SQL_Latin1_General_CP1_CI_AS'))
      .leftJoin(dbDMS.raw('v_mstr_dir_newer as dir ON e.id_dir = dir.direktorat_pk'))
      .leftJoin('mst_lokasi_arsip as la', 'a.lokasi_arsip_id', 'la.lokasi_arsip_id')
      .where({'a.content_name': nama_arsip, 'a.content_owner': empid})
      .first();
    console.log(archive.content_security,kategori_keamanan)
    if (!archive) return res.status(406).json({ type: 'error', message: 'Data dokumen tidak ditemukan' });
    if (archive.arsip_kat.toLowerCase() !== kategori_dokumen.toLowerCase()) return res.status(406).json({ type: 'error', message: 'Data kategori dokumen belum sesuai' });
    if (archive.content_security.toLowerCase() !== kategori_keamanan.toLowerCase()) return res.status(406).json({ type: 'error', message: 'Data kategori keamanan belum sesuai' });
    if (archive.lokasi_arsip_id != lokasi_arsip) return res.status(406).json({ type: 'error', message: 'Data lokasi arsip belum sesuai' });
    if (archive.content_status?.toLowerCase() === 'hilang') return res.status(406).json({ type: 'error', message: 'Dokumen ini sudah diadukan Hilang' });
    if (archive.content_status?.toLowerCase() === 'musnah') return res.status(406).json({ type: 'error', message: 'Dokumen ini sudah dimusnahkan, proses transaksi tidak bisa dilanjutkan' });

    return res.status(200).json({ data: archive });
  } catch (error) {
    console.log(error);
    logger(error, 'POST /pemusnahan/validate-archive', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

export const getArsiparis = async (req, res) => {
  try {
    const { lokasi_arsip, bu_id } = req.query;
    
    // Return empty if neither parameter provided
    if (!lokasi_arsip && !bu_id) return res.status(200).json([]);

    let query = dbDMS('mst_arsiparis as a')
      .select('a.*', 'b.nik', 'b.nama', 'b.email', 'b.id')
      .join(dbDMS.raw('v_mstr_employee_ext as b ON a.arsiparis_user_id = b.nik COLLATE SQL_Latin1_General_CP1_CI_AS'))
      .join('mst_lokasi_arsip as c', 'a.arsiparis_lokasi_arsip_id', 'c.lokasi_arsip_id')
      .where('a.lokasi_arsip_status', 1);

    if (lokasi_arsip) query = query.where('a.arsiparis_lokasi_arsip_id', lokasi_arsip);
    if (bu_id) query = query.where('c.lokasi_arsip_bu_id', bu_id);

    const results = await query;
    return res.status(200).json(results);
  } catch (error) {
    console.log(error);
    logger(error, 'GET /arsiparis', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

export const getArsiparisAtasan = async (req, res) => {
  try {
    const { arsiparis } = req.query;
    if (!arsiparis) return res.status(406).json({ type: 'error', message: 'Arsiparis ID wajib diisi' });

    const result = await dbDMS.raw(`SELECT CASE WHEN c.grade = 6 THEN c.id ELSE b.id END id, CASE WHEN c.grade = 6 THEN c.nama ELSE b.nama END nama, CASE WHEN c.grade = 6 THEN c.nik ELSE b.nik END nik FROM v_mstr_employee_ext a LEFT JOIN v_mstr_employee_ext b ON a.id_atasan = b.id LEFT JOIN v_mstr_employee_ext c ON b.id_atasan = c.id WHERE a.id = ?`, [arsiparis]);

    if (result && result.length > 0) return res.status(200).json({ data: result[0] });
    return res.status(406).json({ type: 'error', message: 'Data atasan tidak ditemukan' });
  } catch (error) {
    console.log(error);
    logger(error, 'GET /arsiparis-atasan', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

export const create = async (req, res) => {
  const trx = await dbDMS.transaction();
  try {
    const {creator: empidEncrypt, tgl_pengajuan, target_pemusnahan, tgl_pemusnahan, kategori_keamanan, kategori_dokumen, lokasi_arsip, keterangan_pemusnahan, pinjam_prioritas_approve, arsiparis, documents} = req.body;
    const empid = decrypt(empidEncrypt);
    const now = dayjs().format("YYYY-MM-DD HH:mm:ss");

    const queryAtasan = await dbHris('vw_map_employee_superior').where('employee_pk',empid).first();
    if (!queryAtasan) return res.status(406).json({ type: 'error', message: 'Atasan Anda tidak ditemukan' });
    const atasanID = queryAtasan.approver_divhead != '' 
    ? queryAtasan.approver_divhead 
    : (queryAtasan.approver_chief != '' ? queryAtasan.approver_chief : queryAtasan.approver_dir);
        
    const atasanUser = await dbDMS('master_user').where('account_username', atasanID).first();
    
    if (!tgl_pengajuan || !tgl_pemusnahan || !kategori_keamanan || !kategori_dokumen || !lokasi_arsip || !arsiparis) return res.status(406).json({ type: 'error', message: 'Field wajib harus diisi lengkap' });
    if (!documents || documents.length === 0) return res.status(406).json({ type: 'error', message: 'Minimal 1 arsip harus dipilih' });

    const user = await trx('master_user').where('account_username', empid).first();
    if (!user) return res.status(406).json({ type: 'error', message: 'Data user tidak ditemukan' });

    const arsiparisData = await trx(dbDMS.raw('v_mstr_employee_ext')).where('id', arsiparis).first();
    if (!arsiparisData) return res.status(406).json({ type: 'error', message: 'Data arsiparis tidak ditemukan' });

    // Get arsiparis atasan from hierarchy
    const atasanArsiparis = await getArsiparisAtasanData(trx, arsiparis);

    const no_konter = await generateTicketNumber(trx, {
      arsip_kat: kategori_dokumen,
      bu: user.account_bu,
      div: user.account_div_id,
      jns_trans: '6' // 6 = Pemusnahan
    });
    if (!no_konter) return res.status(406).json({ type: 'error', message: 'Gagal generate nomor tiket' });

    const existingTicket = await trx('trs_arsip_header').where('tr_no_tiket', no_konter).first();
    if (existingTicket) return res.status(406).json({ type: 'error', message: 'Nomor tiket sudah digunakan' });

    await trx('trs_arsip_header').insert({tr_no_tiket: no_konter, tr_jenis_aktivitas: 6, tr_tgl_pengajuan: tgl_pengajuan, tr_target_pemusnahan: target_pemusnahan, tr_tgl_pemusnahan: tgl_pemusnahan, tr_lokasi_arsip: lokasi_arsip, tr_status: 1, tr_user_id: empid, tr_user_nik: user.account_nik, tr_atasan_user_id: atasanID, tr_atasan_user_nik: atasanUser?.account_nik || null, tr_arsiparis_id: arsiparis, tr_arsiparis_nik: arsiparisData.nik, tr_atasan_arsiparis_id: atasanArsiparis?.id || null, tr_atasan_arsiparis_nik: atasanArsiparis?.nik || null, tr_kategori_keamanan: kategori_keamanan, tr_kategori_dokumen: kategori_dokumen, tr_keterangan_pemusnahan: keterangan_pemusnahan, tr_prioritas_approval: pinjam_prioritas_approve, updated_by: empid, updated_at: now, tr_token: generateToken()});

    const tr_arsip_id = await trx('trs_arsip_header').select('tr_arsip_id', 'tr_token').where('tr_no_tiket', no_konter).first();

    for (const doc of documents) {
      await trx('trs_arsip_detail').insert({trdet_arsip_id: tr_arsip_id.tr_arsip_id, trdet_no_arsip: doc.arsip_no, trdet_keterangan: doc.keterangan || '', created_by: empid, created_at: now});
    }

    await trx('trs_log').insert({trs_log_no_tiket: no_konter, trs_log_proses: 'Pembuatan Tiket', trs_log_hasil: 'Verifikasi Atasan', trs_log_pic: empid, trs_log_tgl: now, trs_log_status: 1, trs_log_catatan: keterangan_pemusnahan || 'Pengajuan pemusnahan arsip', trs_log_jenis: 6});

    await trx.commit();

    // Send email notification to atasan user (don't fail if email fails)
    try {
      
      if (atasanUser && atasanUser.account_email) {
        const emailDocuments = documents.map(doc => ({
          arsip_name: doc.content_name || doc.arsip_no
        }));

        await sendPemusnahanApprovalEmail({
          recipient_email: atasanUser.account_email,
          recipient_name: atasanUser.account_name,
          no_pemusnahan: no_konter,
          documents: emailDocuments,
          kategori_dokumen: kategori_dokumen,
          kategori_keamanan: kategori_keamanan,
          jumlah: documents.length,
          tgl_pengajuan: tgl_pengajuan,
          tgl_pemusnahan: tgl_pemusnahan,
          user_nama: user.account_name,
          user_direktorat: user.account_dir_name || '-',
          user_divisi: user.account_div_name || '-',
          keterangan_pemusnahan: keterangan_pemusnahan || '-',
          approval_link: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/#/approval/pemusnahan?token=${tr_arsip_id.tr_token}`,
          is_non_legal: false
        });
      }
    } catch (emailError) {
      logger(emailError, 'POST /pemusnahan - Email', { no_konter });
    }

    return res.json("sukses");
  } catch (error) {
    await trx.rollback();
    console.log(error);
    logger(error, 'POST /pemusnahan', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};


export const approve = async (req, res) => {
  const trx = await dbDMS.transaction();
  try {
    const { id } = req.params;
    const { creator: empidEncrypt, catatan } = req.body;
    const empid = decrypt(empidEncrypt);
    const now = dayjs().format("YYYY-MM-DD HH:mm:ss");

    const ticket = await trx('trs_arsip_header').where({'tr_arsip_id': id, 'tr_jenis_aktivitas': 6}).first();
    if (!ticket) return res.status(406).json({ type: 'error', message: 'Data tidak ditemukan' });

    const { canApprove } = await import('../../helpers/pemusnahan.helper.js');
    if (!canApprove(ticket, empid)) return res.status(406).json({ type: 'error', message: 'Anda tidak memiliki akses untuk approve tiket ini' });

    let nextStatus = ticket.tr_status + 1;
    let logProses = '';
    let logHasil = '';
    let additionalUpdate = {};

    switch (ticket.tr_status) {
      case 1: {
        logProses = 'Approval Atasan User Pembuat';

        if (ticket.tr_kategori_dokumen === 'Dokumen Legal') {
          // Dokumen Legal: validate legal approver from mst_approval, then go to status 4
          const creatorUser = await trx('master_user').where('account_username', ticket.tr_user_id).first();
          const buId = creatorUser?.account_bu;

          const mstApproval = await trx('mst_approval')
            .where({ app_bu_id: buId, app_jns_trans: 6, app_prioritas: ticket.tr_prioritas_approval || 1 })
            .first();

          if (!mstApproval || !mstApproval.app_bag1_emp_id1) {
            await trx.rollback();
            return res.status(406).json({ type: 'error', message: 'Approver selanjutnya harus Legal dan Setingkat Section Head dan harus ada setting approval level 1' });
          }

          const legalSH = await trx(dbDMS.raw('v_mstr_employee_ext')).where('id', mstApproval.app_bag1_emp_id1).first();
          if (!legalSH || legalSH.id_dir != 11680 || legalSH.grade != 4) {
            await trx.rollback();
            return res.status(406).json({ type: 'error', message: 'Approver selanjutnya harus Legal dan Setingkat Section Head dan harus ada setting approval level 1' });
          }

          nextStatus = 4;
          logHasil = 'Approval Corp. Legal SH';
          additionalUpdate = { tr_corp_lgl_id: legalSH.id, tr_corp_lgl_nik: legalSH.nik };
        } else {
          // Dokumen Non Legal: skip legal chain, go directly to status 9 (Selesai)
          nextStatus = 9;
          logHasil = 'Selesai';
        }
        break;
      }
      case 4: {
        // Legal SH approves → find atasan for next step (Corp Legal Div/Dept Head)
        // PHP logic: get legal SH's id_atasan, then check if that person's id_atasan has grade 6
        // If yes, use the grade-6 person. Otherwise use direct atasan.
        logProses = 'Approval Corp. Legal SH';

        const legalSH = await trx('v_mstr_employee_ext').where('id', empid).first();
        if (!legalSH || !legalSH.id_atasan) {
          await trx.rollback();
          return res.status(406).json({ type: 'error', message: 'Data atasan Legal SH tidak ditemukan di HRIS' });
        }

        let legalAtasan = await trx('v_mstr_employee_ext').where('id', legalSH.id_atasan).first();
        if (!legalAtasan) {
          await trx.rollback();
          return res.status(406).json({ type: 'error', message: 'Data atasan Legal SH tidak ditemukan di HRIS' });
        }

        // Check if atasan's atasan has grade 6 (director level) — if yes, skip to that person
        if (legalAtasan.id_atasan) {
          const legalAtasan2 = await trx('v_mstr_employee_ext').where('id', legalAtasan.id_atasan).first();
          if (legalAtasan2 && legalAtasan2.grade == 6) {
            legalAtasan = legalAtasan2;
          }
        }

        nextStatus = 5;
        logHasil = 'Approval Corp. Legal Div. Head / Dept. Head';
        additionalUpdate = { tr_atasan_corp_lgl_id: legalAtasan.id, tr_atasan_corp_lgl_nik: legalAtasan.nik };
        break;
      }
      case 5: {
        // Atasan Legal approves → find director for next step
        // PHP logic: get current approver's atasan, check if grade 8 (director)
        // If non-restricted: skip to status 7 (arsiparis)
        // If restricted/confidential: status 6 (director)
        logProses = 'Approval Corp. Legal Div. Head / Dept. Head';

        if (ticket.tr_kategori_keamanan?.toLowerCase() === 'non-restricted') {
          // Non-restricted: skip director, go straight to arsiparis (status 7)
          nextStatus = 7;
          logHasil = 'Approval Arsiparis Lokasi';
        } else {
          // Restricted/Confidential: find director from hierarchy
          const atasanLegal = await trx('v_mstr_employee_ext').where('id', empid).first();
          if (!atasanLegal || !atasanLegal.id_atasan) {
            await trx.rollback();
            return res.status(406).json({ type: 'error', message: 'Data atasan Corp. Legal Div. Head tidak ditemukan di HRIS' });
          }

          const legalDir = await trx('v_mstr_employee_ext').where('id', atasanLegal.id_atasan).first();
          if (!legalDir || legalDir.grade != 8) {
            await trx.rollback();
            return res.status(406).json({ type: 'error', message: 'Data Corp. Legal Director tidak ditemukan di HRIS' });
          }

          nextStatus = 6;
          logHasil = 'Approval Corp. Legal Director';
          additionalUpdate = { tr_dir_corp_lgl_id: legalDir.id, tr_dir_corp_lgl_nik: legalDir.nik };
        }
        break;
      }
      case 6:
        // Director approves → go to arsiparis (status 7)
        nextStatus = 7;
        logProses = 'Approval Corp. Legal Director';
        logHasil = 'Approval Arsiparis Lokasi';
        break;
      case 7:
        nextStatus = 8;
        logProses = 'Approval Arsiparis Lokasi';
        logHasil = 'Penghapusan Arsip';
        break;
      default:
        return res.status(406).json({ type: 'error', message: 'Status tidak valid untuk approval' });
    }

    const newToken = generateToken();
    await trx('trs_arsip_header').where('tr_arsip_id', id).update({tr_status: nextStatus, tr_token: newToken, updated_by: empid, updated_at: now, ...additionalUpdate});
    await trx('trs_log').insert({trs_log_no_tiket: ticket.tr_no_tiket, trs_log_proses: logProses, trs_log_hasil: logHasil, trs_log_pic: empid, trs_log_tgl: now, trs_log_status: nextStatus, trs_log_catatan: catatan || 'Disetujui', trs_log_jenis: 6});

    await trx.commit();
    
    // Send email notification to next approver (don't fail if email fails)
    try {
      let nextApprover = null;
      let isArsiparis = false;
      let lokasiArsipName = '';

      if (nextStatus === 4) {
        // Legal SH — lookup from v_mstr_employee_ext (not master_user)
        const updatedTicket = await dbDMS('trs_arsip_header').where('tr_arsip_id', id).first();
        const legalEmployee = await dbDMS('v_mstr_employee_ext').where('id', updatedTicket.tr_corp_lgl_id).first();
        if (legalEmployee) {
          nextApprover = { account_email: legalEmployee.email, account_name: legalEmployee.nama };
        }
      } else if (nextStatus === 5) {
        // Atasan Legal — lookup from v_mstr_employee_ext
        const updatedTicket5 = await dbDMS('trs_arsip_header').where('tr_arsip_id', id).first();
        const atasanLegalEmp = await dbDMS('v_mstr_employee_ext').where('id', updatedTicket5.tr_atasan_corp_lgl_id).first();
        if (atasanLegalEmp) {
          nextApprover = { account_email: atasanLegalEmp.email, account_name: atasanLegalEmp.nama };
        }
      } else if (nextStatus === 6) {
        // Director Legal — lookup from v_mstr_employee_ext
        const updatedTicket6 = await dbDMS('trs_arsip_header').where('tr_arsip_id', id).first();
        const dirLegalEmp = await dbDMS('v_mstr_employee_ext').where('id', updatedTicket6.tr_dir_corp_lgl_id).first();
        if (dirLegalEmp) {
          nextApprover = { account_email: dirLegalEmp.email, account_name: dirLegalEmp.nama };
        }
      } else if (nextStatus === 7) {
        // Arsiparis — email with BAST instructions
        nextApprover = await dbDMS('master_user').where('account_username', ticket.tr_arsiparis_id).first();
        isArsiparis = true;
        if (ticket.tr_lokasi_arsip) {
          const lokasiArsip = await dbDMS('mst_lokasi_arsip').where('lokasi_arsip_id', ticket.tr_lokasi_arsip).first();
          lokasiArsipName = lokasiArsip?.lokasi_arsip_name || '';
        }
      } else if (nextStatus === 9) {
        // Non Legal shortcut — email goes to arsiparis with BAST instructions
        nextApprover = await dbDMS('master_user').where('account_username', ticket.tr_arsiparis_id).first();
        isArsiparis = true;
        if (ticket.tr_lokasi_arsip) {
          const lokasiArsip = await dbDMS('mst_lokasi_arsip').where('lokasi_arsip_id', ticket.tr_lokasi_arsip).first();
          lokasiArsipName = lokasiArsip?.lokasi_arsip_name || '';
        }
      }

      if (nextApprover && nextApprover.account_email) {
        const requester = await dbDMS('master_user').where('account_username', ticket.tr_user_id).first();
        const documents = await dbDMS('trs_arsip_detail as d')
          .join('content as c', 'd.trdet_no_arsip', 'c.arsip_no')
          .where('d.trdet_arsip_id', id)
          .select('c.content_name as arsip_name');

        await sendPemusnahanApprovalEmail({
          recipient_email: nextApprover.account_email,
          recipient_name: nextApprover.account_name,
          no_pemusnahan: ticket.tr_no_tiket,
          documents: documents,
          kategori_dokumen: ticket.tr_kategori_dokumen,
          kategori_keamanan: ticket.tr_kategori_keamanan,
          jumlah: documents.length,
          tgl_pengajuan: ticket.tr_tgl_pengajuan,
          tgl_pemusnahan: ticket.tr_tgl_pemusnahan,
          user_nama: requester?.account_name || '-',
          user_direktorat: requester?.account_dir_name || '-',
          user_divisi: requester?.account_div_name || '-',
          keterangan_pemusnahan: ticket.tr_keterangan_pemusnahan || '-',
          approval_link: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/#/approval/pemusnahan?token=${newToken}`,
          is_arsiparis: isArsiparis,
          lokasi_arsip_name: lokasiArsipName
        });
      }
    } catch (emailError) {
      logger(emailError, 'POST /pemusnahan/:id/approve - Email', { id });
    }

    return res.json("sukses");
  } catch (error) {
    await trx.rollback();
    logger(error, 'POST /pemusnahan/:id/approve', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

export const reject = async (req, res) => {
  const trx = await dbDMS.transaction();
  try {
    const { id } = req.params;
    const { creator: empidEncrypt, alasan } = req.body;
    const empid = decrypt(empidEncrypt);
    const now = dayjs().format("YYYY-MM-DD HH:mm:ss");

    if (!alasan) return res.status(406).json({ type: 'error', message: 'Alasan penolakan wajib diisi' });

    const ticket = await trx('trs_arsip_header').where({'tr_arsip_id': id, 'tr_jenis_aktivitas': 6}).first();
    if (!ticket) return res.status(406).json({ type: 'error', message: 'Data tidak ditemukan' });

    const { canApprove } = await import('../../helpers/pemusnahan.helper.js');
    if (!canApprove(ticket, empid)) return res.status(406).json({ type: 'error', message: 'Anda tidak memiliki akses untuk reject tiket ini' });

    let logProses = '';
    switch (ticket.tr_status) {
      case 1:
        logProses = 'Penolakan Atasan User Pembuat';
        break;
      case 4:
        logProses = 'Penolakan Corp. Legal SH';
        break;
      case 5:
        logProses = 'Penolakan Corp. Legal Div. Head / Dept. Head';
        break;
      case 6:
        logProses = 'Penolakan Corp. Legal Director';
        break;
      case 7:
        logProses = 'Penolakan Arsiparis Lokasi';
        break;
      default:
        return res.status(406).json({ type: 'error', message: 'Status tidak valid untuk penolakan' });
    }

    await trx('trs_arsip_header').where('tr_arsip_id', id).update({tr_status: 3, updated_by: empid, updated_at: now});
    await trx('trs_log').insert({trs_log_no_tiket: ticket.tr_no_tiket, trs_log_proses: logProses, trs_log_hasil: 'Ditolak', trs_log_pic: empid, trs_log_tgl: now, trs_log_status: 3, trs_log_catatan: alasan, trs_log_reason_revisi: alasan, trs_log_jenis: 6});

    await trx.commit();
    
    // Send rejection email to document owner (don't fail if email fails)
    try {
      const requester = await dbDMS('master_user').where('account_username', ticket.tr_user_id).first();
      
      if (requester && requester.account_email) {
        // Get documents
        const documents = await dbDMS('trs_arsip_detail as d')
          .join('content as c', 'd.trdet_no_arsip', 'c.arsip_no')
          .where('d.trdet_arsip_id', id)
          .select('c.content_name as arsip_name');
        
        await sendPemusnahanRejectionEmail({
          recipient_email: requester.account_email,
          recipient_name: requester.account_name,
          no_pemusnahan: ticket.tr_no_tiket,
          documents: documents,
          kategori_dokumen: ticket.tr_kategori_dokumen,
          kategori_keamanan: ticket.tr_kategori_keamanan,
          jumlah: documents.length,
          tgl_pengajuan: ticket.tr_tgl_pengajuan,
          tgl_pemusnahan: ticket.tr_tgl_pemusnahan,
          user_nama: requester.account_name,
          keterangan_pemusnahan: ticket.tr_keterangan_pemusnahan || '-',
          revisi_reason: alasan
        });
      }
    } catch (emailError) {
      logger(emailError, 'POST /pemusnahan/:id/reject - Email', { id });
      // Continue - don't fail rejection if email fails
    }
    
    return res.json("sukses");
  } catch (error) {
    await trx.rollback();
    console.log(error);
    logger(error, 'POST /pemusnahan/:id/reject', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

/**
 * Revisi approval - Atasan User sends ticket back to User Pembuat for revision
 * Only available when status = 1 (Atasan User), matching PHP behavior
 * POST /api/dms/pemusnahan/:id/revisi-approval
 */
export const revisiApproval = async (req, res) => {
  const trx = await dbDMS.transaction();
  try {
    const { id } = req.params;
    const { creator: empidEncrypt, alasan, catatan } = req.body;
    const empid = decrypt(empidEncrypt);
    const now = dayjs().format("YYYY-MM-DD HH:mm:ss");

    if (!alasan) return res.status(406).json({ type: 'error', message: 'Alasan revisi wajib diisi' });

    const ticket = await trx('trs_arsip_header').where({'tr_arsip_id': id, 'tr_jenis_aktivitas': 6}).first();
    if (!ticket) return res.status(406).json({ type: 'error', message: 'Data tidak ditemukan' });

    // Only Atasan User (status 1) can revisi - matches PHP behavior
    if (ticket.tr_status !== 1) return res.status(406).json({ type: 'error', message: 'Status tidak valid untuk revisi' });
    if (ticket.tr_atasan_user_id !== empid) return res.status(406).json({ type: 'error', message: 'Akses ditolak' });

    const newToken = generateToken();
    await trx('trs_arsip_header').where('tr_arsip_id', id).update({
      tr_status: 2,
      tr_token: newToken,
      updated_by: empid,
      updated_at: now
    });

    await trx('trs_log').insert({
      trs_log_no_tiket: ticket.tr_no_tiket,
      trs_log_proses: 'Revisi Atasan User Pembuat',
      trs_log_hasil: 'Revisi User Pembuat',
      trs_log_pic: empid,
      trs_log_tgl: now,
      trs_log_status: 2,
      trs_log_catatan: alasan,
      trs_log_reason_revisi: alasan,
      trs_log_jenis: 6
    });

    await trx.commit();

    // Send revision email to document owner (don't fail if email fails)
    try {
      const requester = await dbDMS('master_user').where('account_username', ticket.tr_user_id).first();

      if (requester && requester.account_email) {
        const documents = await dbDMS('trs_arsip_detail as d')
          .join('content as c', 'd.trdet_no_arsip', 'c.arsip_no')
          .where('d.trdet_arsip_id', id)
          .select('c.content_name as arsip_name');

        await sendPemusnahanRevisionEmail({
          recipient_email: requester.account_email,
          recipient_name: requester.account_name,
          no_pemusnahan: ticket.tr_no_tiket,
          documents: documents,
          kategori_dokumen: ticket.tr_kategori_dokumen,
          kategori_keamanan: ticket.tr_kategori_keamanan,
          jumlah: documents.length,
          tgl_pengajuan: ticket.tr_tgl_pengajuan,
          tgl_pemusnahan: ticket.tr_tgl_pemusnahan,
          user_nama: requester.account_name,
          keterangan_pemusnahan: ticket.tr_keterangan_pemusnahan || '-',
          revisi_reason: alasan,
          revision_link: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/#/dms/pemusnahan/${id}/revise`
        });
      }
    } catch (emailError) {
      logger(emailError, 'POST /pemusnahan/:id/revisi-approval - Email', { id });
    }

    return res.json("sukses");
  } catch (error) {
    await trx.rollback();
    logger(error, 'POST /pemusnahan/:id/revisi-approval', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

export const revise = async (req, res) => {
  const trx = await dbDMS.transaction();
  try {
    const { id } = req.params;
    const {creator: empidEncrypt, target_pemusnahan, tgl_pemusnahan, kategori_keamanan, kategori_dokumen, lokasi_arsip, keterangan_pemusnahan, pinjam_prioritas_approve, arsiparis, documents} = req.body;
    const empid = decrypt(empidEncrypt);
    const now = dayjs().format("YYYY-MM-DD HH:mm:ss");

    if (!tgl_pemusnahan || !kategori_keamanan || !kategori_dokumen || !lokasi_arsip || !arsiparis) return res.status(406).json({ type: 'error', message: 'Field wajib harus diisi lengkap' });
    if (!documents || documents.length === 0) return res.status(406).json({ type: 'error', message: 'Minimal 1 arsip harus dipilih' });

    const ticket = await trx('trs_arsip_header').where({'tr_arsip_id': id, 'tr_jenis_aktivitas': 6}).first();
    if (!ticket) return res.status(406).json({ type: 'error', message: 'Data tidak ditemukan' });
    if (ticket.tr_user_id !== empid) return res.status(406).json({ type: 'error', message: 'Hanya pembuat tiket yang dapat melakukan revisi' });
    if (ticket.tr_status !== 2 && ticket.tr_status !== 3) return res.status(406).json({ type: 'error', message: 'Tiket hanya dapat direvisi jika statusnya Revisi atau Ditolak' });

    const arsiparisData = await trx(dbDMS.raw('v_mstr_employee_ext')).where('id', arsiparis).first();
    if (!arsiparisData) return res.status(406).json({ type: 'error', message: 'Data arsiparis tidak ditemukan' });

    // Get arsiparis atasan from hierarchy
    const atasanArsiparis = await getArsiparisAtasanData(trx, arsiparis);

    await trx('trs_arsip_header').where('tr_arsip_id', id).update({tr_target_pemusnahan: target_pemusnahan || ticket.tr_target_pemusnahan, tr_tgl_pemusnahan: tgl_pemusnahan, tr_kategori_keamanan: kategori_keamanan, tr_kategori_dokumen: kategori_dokumen, tr_lokasi_arsip: lokasi_arsip, tr_keterangan_pemusnahan: keterangan_pemusnahan || ticket.tr_keterangan_pemusnahan, tr_prioritas_approval: pinjam_prioritas_approve || ticket.tr_prioritas_approval, tr_arsiparis_id: arsiparis, tr_arsiparis_nik: arsiparisData.nik, tr_atasan_arsiparis_id: atasanArsiparis?.id || null, tr_atasan_arsiparis_nik: atasanArsiparis?.nik || null, tr_status: 1, tr_token: generateToken(), updated_by: empid, updated_at: now});

    await trx('trs_arsip_detail').where('trdet_arsip_id', id).delete();
    for (const doc of documents) {
      await trx('trs_arsip_detail').insert({trdet_arsip_id: id, trdet_no_arsip: doc.arsip_no, trdet_keterangan: doc.keterangan || '', created_by: empid, created_at: now});
    }

    await trx('trs_log').insert({trs_log_no_tiket: ticket.tr_no_tiket, trs_log_proses: 'Revisi Tiket', trs_log_hasil: 'Verifikasi Atasan', trs_log_pic: empid, trs_log_tgl: now, trs_log_status: 1, trs_log_catatan: 'Tiket telah direvisi dan diajukan kembali', trs_log_jenis: 6});

    await trx.commit();

    // Send email notification to atasan user (don't fail if email fails)
    try {
      const user = await dbDMS('master_user').where('account_username', empid).first();
      const atasanUser = await dbDMS('master_user').where('account_username', ticket.tr_atasan_user_id).first();
      const updatedTicket = await dbDMS('trs_arsip_header').select('tr_token').where('tr_arsip_id', id).first();

      if (atasanUser && atasanUser.account_email) {
        const emailDocuments = documents.map(doc => ({
          arsip_name: doc.content_name || doc.arsip_no
        }));

        await sendPemusnahanApprovalEmail({
          recipient_email: atasanUser.account_email,
          recipient_name: atasanUser.account_name,
          no_pemusnahan: ticket.tr_no_tiket,
          documents: emailDocuments,
          kategori_dokumen: kategori_dokumen,
          kategori_keamanan: kategori_keamanan,
          jumlah: documents.length,
          tgl_pengajuan: ticket.tr_tgl_pengajuan,
          tgl_pemusnahan: tgl_pemusnahan,
          user_nama: user?.account_name || '-',
          user_direktorat: user?.account_dir_name || '-',
          user_divisi: user?.account_div_name || '-',
          keterangan_pemusnahan: keterangan_pemusnahan || '-',
          approval_link: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/#/approval/pemusnahan?token=${updatedTicket.tr_token}`,
          is_non_legal: false
        });
      }
    } catch (emailError) {
      logger(emailError, 'PUT /pemusnahan/:id/revise - Email', { id });
    }

    return res.json("sukses");
  } catch (error) {
    await trx.rollback();
    console.log(error);
    logger(error, 'PUT /pemusnahan/:id/revise', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

export const executeDelete = async (req, res) => {
  const trx = await dbDMS.transaction();
  try {
    const { id } = req.params;
    const { creator: empidEncrypt, catatan } = req.body;
    const empid = decrypt(empidEncrypt);
    const now = dayjs().format("YYYY-MM-DD HH:mm:ss");

    const ticket = await trx('trs_arsip_header').where({'tr_arsip_id': id, 'tr_jenis_aktivitas': 6}).first();
    if (!ticket) return res.status(406).json({ type: 'error', message: 'Data tidak ditemukan' });
    if (ticket.tr_status !== 8) return res.status(406).json({ type: 'error', message: 'Tiket harus dalam status Penghapusan Arsip' });
    if (ticket.tr_arsiparis_id !== empid) return res.status(406).json({ type: 'error', message: 'Hanya arsiparis yang dapat melakukan penghapusan' });

    const details = await trx('trs_arsip_detail').where('trdet_arsip_id', id);

    for (const detail of details) {
      await trx('content').where('arsip_no', detail.trdet_no_arsip).update({status_berlaku: 'Dihapus', updated_by: empid, updated_at: now});
    }

    await trx('trs_arsip_header').where('tr_arsip_id', id).update({tr_status: 9, updated_by: empid, updated_at: now});
    await trx('trs_log').insert({trs_log_no_tiket: ticket.tr_no_tiket, trs_log_proses: 'Penghapusan Arsip', trs_log_hasil: 'Selesai', trs_log_pic: empid, trs_log_tgl: now, trs_log_status: 9, trs_log_catatan: catatan || 'Arsip telah dihapus', trs_log_jenis: 6});

    await trx.commit();
    return res.json("sukses");
  } catch (error) {
    await trx.rollback();
    logger(error, 'POST /pemusnahan/:id/execute', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};


/**
 * Validate token and auto-login approver for standalone approval page
 * GET /api/dms/pemusnahan/validate-token
 */
export const validateToken = async (req, res) => {
  try {
    const { token, url } = req.query;
    
    if (!token) {
      return res.status(406).json({ type: 'error', message: 'Token tidak ditemukan' });
    }

    // Find ticket by token
    const ticket = await dbDMS('trs_arsip_header as h')
      .select('h.*', 'la.lokasi_arsip_name')
      .leftJoin('mst_lokasi_arsip as la', 'h.tr_lokasi_arsip', 'la.lokasi_arsip_id')
      .where({ 'h.tr_token': token, 'h.tr_jenis_aktivitas': 6 })
      .first();

    if (!ticket) {
      return res.status(406).json({ type: 'error', message: 'Token tidak valid atau sudah tidak berlaku' });
    }

    // Determine who should approve based on status
    let approver_id = null;
    let approver_role = '';
    
    switch (ticket.tr_status) {
      case 1:
        approver_id = ticket.tr_atasan_user_id;
        approver_role = 'Atasan User Pembuat';
        break;
      case 4:
        approver_id = ticket.tr_corp_lgl_id;
        approver_role = 'Corp. Legal SH';
        break;
      case 5:
        approver_id = ticket.tr_atasan_corp_lgl_id;
        approver_role = 'Corp. Legal Div. Head / Dept. Head';
        break;
      case 6:
        approver_id = ticket.tr_dir_corp_lgl_id;
        approver_role = 'Corp. Legal Director';
        break;
      case 7:
        approver_id = ticket.tr_arsiparis_id;
        approver_role = 'Arsiparis Lokasi';
        break;
      case 8:
        approver_id = ticket.tr_arsiparis_id;
        approver_role = 'Arsiparis (Eksekusi)';
        break;
      default:
        return res.status(406).json({ type: 'error', message: 'Tiket tidak dalam status yang memerlukan approval' });
    }

    // Get approver user data with BU info
    const users = await dbDMS("master_user")
      .leftJoin('v_mstr_bu', dbDMS.raw('master_user.account_bu COLLATE SQL_Latin1_General_CP1_CI_AS = v_mstr_bu.bu_id'))
      .select("account_username","account_nik","account_name","account_bu","account_div_name","account_dept_name","bu_name")
      .where('account_username', approver_id)
      .first();
    
    if (!users) {
      return res.status(406).json({ type: 'error', message: 'Data approver tidak ditemukan' });
    }

    // Get HRIS data to verify user is still active
    const hris = await dbHris("portal.dbo.ptl_hris as a")
      .select("a.Emp_Id","a.user_pass","a.user_newid","a.grade","a.jabatan","a.employee_mgr_pk","a.map_dept_pk","a.map_div_pk","b.nama_div","d.nama_dept","c.map_dir_pk")
      .leftJoin('master_div as b', function() {
        this.on('b.id_div', '=', 'a.map_div_pk');
      })
      .leftJoin('mapping_dir_div_dept as c', function() {
        this.on('c.map_dept_pk', '=', 'a.map_dept_pk')
          .orOn('c.map_div_pk', '=', 'a.map_div_pk');
      })
      .leftJoin('master_dept as d', function() {
        this.on('d.id_dept', '=', 'a.map_dept_pk');
      })
      .where('user_active', 'Active')
      .where('Emp_Id', users.account_username)
      .first();

    const direktorat = await dbHris("master_dir")
      .where('direktorat_pk', hris.map_dir_pk)
      .first();
    
    if (!hris) {
      await dbDMS("master_user").where('account_username', approver_id).update({account_active:0,account_nik:hris.user_newid,account_grade:hris.grade,account_jabatan:hris.jabatan,account_dept_id:hris.map_dept_pk,account_dept_name:hris.nama_dept,account_div_id:hris.map_div_pk,account_div_name:hris.nama_div,account_dir_id:direktorat?.direktorat_pk,account_dir_name:direktorat?.direktorat_name});
      return res.status(406).json({ type: 'error', message: `User ${users.account_nik} sudah tidak aktif` });
    }

    // Get idle_time from policy table
    const resPortal = await dbHris("ptl_policy").where("id", 0).first();
    
    // Generate JWT token for authenticated API calls
    const jwtToken = jwt.sign(
      { user: users.account_username }, 
      process.env.TOKEN, 
      { expiresIn: resPortal.idle_time }
    );

    // Log access
    await dbDMS("log_akses").insert({
      empid: users.account_username,
      nik: hris.user_newid,
      status: "login",
      keterangan: `approval_pemusnahan_${approver_role}`,
      nama_url: `${url}/approval/pemusnahan?token=${token}`,
    });

    // Return same format as login, with additional ticket info
    return res.status(200).json(
      createUserResponse(
        users, 
        jwtToken, 
        process.env.ENVIRONMENT === 'PRODUCTION' ? resPortal.idle_time : 3600000,
        ticket.tr_no_tiket,
        approver_role,
        {
          ticket_id: ticket.tr_arsip_id,
          status: ticket.tr_status,
          status_text: getStatusText(ticket.tr_status)
        }
      )
    );
  } catch (error) {
    logger(error, 'GET /pemusnahan/validate-token', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};


/**
 * Get employee by NIK
 * GET /api/dms/employee/:nik
 */
export const getEmployeeByNik = async (req, res) => {
  try {
    const { nik } = req.params;
    
    const employee = await dbDMS('v_mstr_employee_ext')
      .where('nik', nik)
      .first();
    
    if (!employee) {
      return res.status(406).json({ type: 'error', message: 'Karyawan tidak ditemukan' });
    }
    
    return res.status(200).json({ 
      data: {
        id: employee.id,
        nama: employee.nama,
        nik: employee.nik,
        nm_grade: employee.nm_grade,
        grade: employee.grade
      }
    });
  } catch (error) {
    logger(error, 'GET /employee/:nik', { nik: req.params.nik });
    return res.status(406).json(getErrorResponse(error));
  }
};

/**
 * Get Chief/DIC from arsiparis hierarchy
 * Helper function to find grade 8 in organizational hierarchy
 */
const getChiefDIC = async (arsiparis_id) => {
  try {
    // Get arsiparis
    const arsiparis = await dbDMS('v_mstr_employee_ext').where('id', arsiparis_id).first();
    if (!arsiparis) return null;
    
    // Get dept head (atasan)
    const deptHead = await dbDMS('v_mstr_employee_ext').where('id', arsiparis.id_atasan).first();
    if (deptHead && deptHead.grade == 8) return deptHead;
    
    // Get div head (atasan's atasan)
    if (deptHead) {
      const divHead = await dbDMS('v_mstr_employee_ext').where('id', deptHead.id_atasan).first();
      if (divHead && divHead.grade == 8) return divHead;
      
      // Get chief (div head's atasan)
      if (divHead) {
        const chief = await dbDMS('v_mstr_employee_ext').where('id', divHead.id_atasan).first();
        if (chief && chief.grade == 8) return chief;
        
        // Get direksi (chief's atasan)
        if (chief) {
          const direksi = await dbDMS('v_mstr_employee_ext').where('id', chief.id_atasan).first();
          if (direksi && direksi.grade == 8) return direksi;
        }
        
        // Return chief as fallback
        return chief;
      }
    }
    
    return deptHead; // Fallback
  } catch (error) {
    console.error('Error getting Chief/DIC:', error);
    return null;
  }
};

/**
 * Generate BAST data
 * GET /api/dms/pemusnahan/:id/bast
 */
export const generateBAST = async (req, res) => {
  try {
    const { id } = req.params;
    const { saksi1_nik, saksi2_nik, tgl_pemusnahan } = req.query;
    
    // Validate required parameters
    if (!saksi1_nik || !saksi2_nik || !tgl_pemusnahan) {
      return res.status(406).json({ 
        type: 'error', 
        message: 'Saksi 1, Saksi 2, dan Tanggal Pemusnahan wajib diisi' 
      });
    }
    
    // Get ticket header
    const ticket = await dbDMS('trs_arsip_header as h')
      .leftJoin('mst_lokasi_arsip as la', 'h.tr_lokasi_arsip', 'la.lokasi_arsip_id')
      .where({ 'h.tr_arsip_id': id, 'h.tr_jenis_aktivitas': 6 })
      .select(
        'h.*',
        'la.lokasi_arsip_name'
      )
      .first();
    
    if (!ticket) {
      return res.status(406).json({ type: 'error', message: 'Data tidak ditemukan' });
    }
    
    // Get ticket details with all necessary joins
    const details = await dbDMS('trs_arsip_detail as d')
      .leftJoin('content as c', 'd.trdet_no_arsip', 'c.arsip_no')
      .leftJoin(dbDMS.raw('v_mstr_bu as bu ON c.content_bu COLLATE SQL_Latin1_General_CP1_CI_AS = bu.bu_id COLLATE SQL_Latin1_General_CP1_CI_AS'))
      .leftJoin(dbDMS.raw('v_mstr_employee_ext as owner ON c.content_owner = owner.id COLLATE SQL_Latin1_General_CP1_CI_AS'))
      .where('d.trdet_arsip_id', id)
      .select(
        'd.trdet_no_arsip',
        'd.trdet_keterangan',
        'c.content_name',
        'c.content_doc',
        'c.tgl_doc',
        'c.content_security',
        'c.content_duedate',
        'bu.bu_name',
        'owner.nama as owner_nama',
        dbDMS.raw(`
          CASE 
            WHEN c.content_duedate IS NULL OR c.content_duedate = '1900-01-01' 
              OR CONVERT(VARCHAR(10), GETDATE(), 120) <= c.content_duedate 
            THEN 'Aktif'
            WHEN CONVERT(VARCHAR(10), GETDATE(), 120) > c.content_duedate 
            THEN 'In-Aktif'
            ELSE 'In-Aktif'
          END as status_berlaku
        `)
      );
    
    // Get arsiparis
    const arsiparis = await dbDMS('v_mstr_employee_ext').where('id', ticket.tr_arsiparis_id).first();
    
    // Get arsiparis atasan (matching PHP getarsiparisatasandiv logic)
    // PHP: a=arsiparis, b=a.id_atasan, c=b.id_atasan → if c.grade==6 return c, else return b
    let arsiparis_atasan = null;
    if (arsiparis) {
      const atasanDirect = await dbDMS('v_mstr_employee_ext').where('id', arsiparis.id_atasan).first();
      if (atasanDirect) {
        const atasanAtasan = await dbDMS('v_mstr_employee_ext').where('id', atasanDirect.id_atasan).first();
        if (atasanAtasan && atasanAtasan.grade == 6) {
          arsiparis_atasan = atasanAtasan;
        } else {
          arsiparis_atasan = atasanDirect;
        }
      }
    }
    
    // Get Chief/DIC
    const chiefDIC = await getChiefDIC(ticket.tr_arsiparis_id);
    
    // Get witnesses
    const saksi1 = await dbDMS('v_mstr_employee_ext').where('nik', saksi1_nik).first();
    const saksi2 = await dbDMS('v_mstr_employee_ext').where('nik', saksi2_nik).first();
    
    if (!saksi1) {
      return res.status(406).json({ type: 'error', message: 'Saksi 1 tidak ditemukan' });
    }
    if (!saksi2) {
      return res.status(406).json({ type: 'error', message: 'Saksi 2 tidak ditemukan' });
    }
    
    // Return all data for BAST template
    return res.status(200).json({
      data: {
        ticket: {
          tr_no_tiket: ticket.tr_no_tiket,
          tr_lokasi_arsip: ticket.lokasi_arsip_name
        },
        tgl_pemusnahan,
        arsiparis: {
          id: arsiparis?.id,
          nama: arsiparis?.nama,
          nik: arsiparis?.nik
        },
        arsiparis_atasan: {
          id: arsiparis_atasan?.id,
          nama: arsiparis_atasan?.nama,
          nik: arsiparis_atasan?.nik
        },
        chief_dic: {
          id: chiefDIC?.id,
          nama: chiefDIC?.nama,
          nik: chiefDIC?.nik
        },
        saksi1: {
          id: saksi1.id,
          nama: saksi1.nama,
          nik: saksi1.nik,
          nm_grade: saksi1.nm_grade
        },
        saksi2: {
          id: saksi2.id,
          nama: saksi2.nama,
          nik: saksi2.nik,
          nm_grade: saksi2.nm_grade
        },
        details
      }
    });
  } catch (error) {
    logger(error, 'GET /pemusnahan/:id/bast', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

/**
 * Execute deletion with BAST data
 * PUT /api/dms/pemusnahan/:id/execute-bast
 */
export const executeDeleteWithBAST = async (req, res) => {
  const trx = await dbDMS.transaction();
  try {
    const { id } = req.params;
    const { 
      creator: empidEncrypt, 
      catatan, 
      saksi1_nik, 
      saksi2_nik, 
      tgl_pemusnahan,
      tr_file_bast_1,
      tr_file_bast_2,
      tr_file_bast_3,
      tr_file_bast_4
    } = req.body;
    
    const empid = decrypt(empidEncrypt);
    const now = dayjs().format("YYYY-MM-DD HH:mm:ss");
    
    // Validate required fields
    if (!saksi1_nik || !saksi2_nik || !tgl_pemusnahan) {
      return res.status(406).json({ 
        type: 'error', 
        message: 'Saksi 1, Saksi 2, dan Tanggal Pemusnahan wajib diisi' 
      });
    }
    
    // Get ticket
    const ticket = await trx('trs_arsip_header')
      .where({'tr_arsip_id': id, 'tr_jenis_aktivitas': 6})
      .first();
    
    if (!ticket) {
      return res.status(406).json({ type: 'error', message: 'Data tidak ditemukan' });
    }
    
    if (ticket.tr_status !== 8) {
      return res.status(406).json({ 
        type: 'error', 
        message: 'Tiket harus dalam status Penghapusan Arsip' 
      });
    }
    
    if (ticket.tr_arsiparis_id !== empid) {
      return res.status(406).json({ 
        type: 'error', 
        message: 'Hanya arsiparis yang dapat melakukan penghapusan' 
      });
    }
    
    // Get saksi IDs
    const saksi1 = await trx('v_mstr_employee_ext').where('nik', saksi1_nik).first();
    const saksi2 = await trx('v_mstr_employee_ext').where('nik', saksi2_nik).first();
    
    if (!saksi1 || !saksi2) {
      return res.status(406).json({ 
        type: 'error', 
        message: 'Data saksi tidak ditemukan' 
      });
    }
    
    // Get details
    const details = await trx('trs_arsip_detail').where('trdet_arsip_id', id);
    
    // Update content status to 'Musnah'
    for (const detail of details) {
      await trx('content')
        .where('arsip_no', detail.trdet_no_arsip)
        .update({
          content_status: 'Musnah',
          updated_by: empid,
          updated_at: now
        });
    }
    
    // Update ticket with BAST data
    await trx('trs_arsip_header')
      .where('tr_arsip_id', id)
      .update({
        tr_status: 9,
        tr_saksi_bast_1: saksi1.id,
        tr_saksi_bast_2: saksi2.id,
        trs_tgl_pemusnahan_arsiparis: tgl_pemusnahan,
        tr_file_bast_1: tr_file_bast_1 || null,
        tr_file_bast_2: tr_file_bast_2 || null,
        tr_file_bast_3: tr_file_bast_3 || null,
        tr_file_bast_4: tr_file_bast_4 || null,
        tr_tgl_bast: tgl_pemusnahan,
        tr_doc_owner_id: ticket.tr_user_id,
        updated_by: empid,
        updated_at: now
      });
    
    // Insert log
    await trx('trs_log').insert({
      trs_log_no_tiket: ticket.tr_no_tiket,
      trs_log_proses: 'Penghapusan Arsip dengan BAST',
      trs_log_hasil: 'Selesai',
      trs_log_pic: empid,
      trs_log_tgl: now,
      trs_log_status: 9,
      trs_log_catatan: catatan || 'Arsip telah dimusnahkan dengan BAST',
      trs_log_jenis: 6
    });
    
    await trx.commit();
    return res.json("sukses");
  } catch (error) {
    await trx.rollback();
    logger(error, 'PUT /pemusnahan/:id/execute-bast', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

/**
 * Upload Excel file with multiple archives
 * POST /api/dms/pemusnahan/upload-details
 */
export const uploadDetails = async (req, res) => {
  try {
    const { kategori_dokumen, kategori_keamanan, lokasi_arsip, content_owner } = req.body;

    if (!kategori_dokumen || !kategori_keamanan || !lokasi_arsip) {
      return res.status(406).json({
        type: 'error',
        message: 'Kategori dokumen, keamanan, dan lokasi arsip harus dipilih terlebih dahulu'
      });
    }

    if (!req.file) {
      return res.status(406).json({
        type: 'error',
        message: 'File Excel wajib diupload'
      });
    }

    // Parse Excel file
    const XLSX = await import('xlsx');
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);

    if (!data || data.length === 0) {
      return res.status(406).json({
        type: 'error',
        message: 'File Excel kosong atau format tidak sesuai'
      });
    }

    const validArchives = [];
    const errors = [];

    // Validate each row
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const rowNum = i + 2; // Excel row number (header is row 1)

      if (!row.nama_arsip) {
        errors.push(`Baris ${rowNum}: Nama arsip wajib diisi`);
        continue;
      }

      try {
        // Validate archive
        const archive = await dbDMS('content as a')
          .select('a.*','bu.bu_name','div.div_nama','dir.direktorat_name','la.lokasi_arsip_name',dbDMS.raw(`CASE WHEN a.content_duedate IS NULL OR a.content_duedate = '1900-01-01' OR CONVERT(VARCHAR(10), GETDATE(), 120) <= a.content_duedate THEN 'Aktif' WHEN CONVERT(VARCHAR(10), GETDATE(), 120) > a.content_duedate THEN 'In-Aktif' ELSE 'In-Aktif' END as status_berlaku`))
          .leftJoin(dbDMS.raw('v_mstr_bu as bu ON a.content_bu COLLATE SQL_Latin1_General_CP1_CI_AS = bu.bu_id COLLATE SQL_Latin1_General_CP1_CI_AS'))
          .leftJoin(dbDMS.raw('v_mstr_div as div ON a.content_div COLLATE SQL_Latin1_General_CP1_CI_AS = div.div_id COLLATE SQL_Latin1_General_CP1_CI_AS'))
          .leftJoin(dbDMS.raw('v_mstr_employee_ext as e ON a.content_owner = e.id COLLATE SQL_Latin1_General_CP1_CI_AS'))
          .leftJoin(dbDMS.raw('v_mstr_dir_newer as dir ON e.id_dir = dir.direktorat_pk'))
          .leftJoin('mst_lokasi_arsip as la', 'a.lokasi_arsip_id', 'la.lokasi_arsip_id')
          .where({'a.content_name': row.nama_arsip, 'a.content_owner': content_owner})
          .first();

        if (!archive) {
          errors.push(`Baris ${rowNum}: Arsip "${row.nama_arsip}" tidak ditemukan`);
          continue;
        }

        // Validate filters
        if (archive.arsip_kat.toLowerCase() !== kategori_dokumen.toLowerCase()) {
          errors.push(`Baris ${rowNum}: Kategori dokumen tidak sesuai untuk "${row.nama_arsip}"`);
          continue;
        }

        if (archive.content_security.toLowerCase() !== kategori_keamanan.toLowerCase()) {
          errors.push(`Baris ${rowNum}: Kategori keamanan tidak sesuai untuk "${row.nama_arsip}"`);
          continue;
        }

        if (archive.lokasi_arsip_id != lokasi_arsip) {
          errors.push(`Baris ${rowNum}: Lokasi arsip tidak sesuai untuk "${row.nama_arsip}"`);
          continue;
        }

        if (archive.content_status?.toLowerCase() === 'hilang') {
          errors.push(`Baris ${rowNum}: Dokumen "${row.nama_arsip}" sudah diadukan Hilang`);
          continue;
        }

        if (archive.content_status?.toLowerCase() === 'musnah') {
          errors.push(`Baris ${rowNum}: Dokumen "${row.nama_arsip}" sudah dimusnahkan`);
          continue;
        }

        // Check duplicate in result
        const duplicate = validArchives.find(a => a.arsip_no === archive.arsip_no);
        if (duplicate) {
          continue; // Skip duplicate
        }

        validArchives.push({
          arsip_no: archive.arsip_no,
          content_name: archive.content_name,
          content_doc: archive.content_doc,
          status_berlaku: archive.status_berlaku,
          direktorat_name: archive.direktorat_name,
          bu_name: archive.bu_name,
          keterangan: row.keterangan || ''
        });
      } catch (error) {
        errors.push(`Baris ${rowNum}: Error validasi - ${error.message}`);
      }
    }

    return res.status(200).json({
      data: validArchives,
      errors: errors.length > 0 ? errors : null,
      summary: {
        total: data.length,
        valid: validArchives.length,
        invalid: errors.length
      }
    });
  } catch (error) {
    logger(error, 'POST /pemusnahan/upload-details', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

/**
 * Download Excel template
 * GET /api/dms/pemusnahan/template
 */
export const downloadTemplate = async (req, res) => {
  try {
    const XLSX = await import('xlsx');

    // Create template data
    const templateData = [
      {
        nama_arsip: 'Contoh Nama Arsip 1',
        keterangan: 'Keterangan opsional'
      },
      {
        nama_arsip: 'Contoh Nama Arsip 2',
        keterangan: ''
      }
    ];

    // Create workbook
    const worksheet = XLSX.utils.json_to_sheet(templateData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Pemusnahan');

    // Set column widths
    worksheet['!cols'] = [
      { wch: 40 }, // nama_arsip
      { wch: 50 }  // keterangan
    ];

    // Generate buffer
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    // Set headers
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=template_pemusnahan.xlsx');

    return res.send(buffer);
  } catch (error) {
    logger(error, 'GET /pemusnahan/template', {});
    return res.status(406).json(getErrorResponse(error));
  }
};


/**
 * Generate and download Pemusnahan BAST PDF
 * GET /api/dms/pemusnahan/:id/generate-bast-pdf
 */
export const generateBASTpdf = async (req, res) => {
  try {
    const { id } = req.params;
    const { saksi1_nik, saksi2_nik, tgl_pemusnahan } = req.query;
    
    if (!saksi1_nik || !saksi2_nik) {
      return res.status(406).json({ 
        type: 'error', 
        message: 'Saksi 1 dan Saksi 2 wajib diisi' 
      });
    }
    
    // Get ticket header
    const ticket = await dbDMS('trs_arsip_header as h')
      .leftJoin('mst_lokasi_arsip as la', 'h.tr_lokasi_arsip', 'la.lokasi_arsip_id')
      .where({ 'h.tr_arsip_id': id, 'h.tr_jenis_aktivitas': 6 })
      .select('h.*', 'la.lokasi_arsip_name')
      .first();
    
    if (!ticket) {
      return res.status(406).json({ type: 'error', message: 'Data tidak ditemukan' });
    }
    
    // Get documents
    const documents = await dbDMS('trs_arsip_detail as d')
      .leftJoin('content as c', 'd.trdet_no_arsip', 'c.arsip_no')
      .leftJoin(dbDMS.raw('v_mstr_bu as bu ON c.content_bu COLLATE SQL_Latin1_General_CP1_CI_AS = bu.bu_id COLLATE SQL_Latin1_General_CP1_CI_AS'))
      .leftJoin(dbDMS.raw('v_mstr_employee_ext as owner ON c.content_owner = owner.id COLLATE SQL_Latin1_General_CP1_CI_AS'))
      .where('d.trdet_arsip_id', id)
      .select(
        'd.trdet_no_arsip',
        'd.trdet_keterangan',
        'c.content_name',
        'c.content_doc',
        'c.tgl_doc',
        'c.content_security',
        'bu.bu_name',
        'owner.nama as owner_nama',
        dbDMS.raw(`
          CASE 
            WHEN c.content_duedate IS NULL OR c.content_duedate = '1900-01-01' 
              OR CONVERT(VARCHAR(10), GETDATE(), 120) <= c.content_duedate 
            THEN 'Aktif'
            ELSE 'In-Aktif'
          END as status_berlaku
        `)
      );
    
    // Get arsiparis
    const arsiparis = await dbDMS('v_mstr_employee_ext').where('id', ticket.tr_arsiparis_id).first();
    if (!arsiparis) {
      return res.status(406).json({ type: 'error', message: 'Data arsiparis tidak ditemukan' });
    }
    
    // Get arsiparis atasan (matching PHP getarsiparisatasandiv logic)
    // PHP: a=arsiparis, b=a.id_atasan, c=b.id_atasan → if c.grade==6 return c, else return b
    let arsiparis_atasan = null;
    const atasanDirect = await dbDMS('v_mstr_employee_ext').where('id', arsiparis.id_atasan).first();
    if (atasanDirect) {
      const atasanAtasan = await dbDMS('v_mstr_employee_ext').where('id', atasanDirect.id_atasan).first();
      if (atasanAtasan && atasanAtasan.grade == 6) {
        arsiparis_atasan = atasanAtasan;
      } else {
        arsiparis_atasan = atasanDirect;
      }
    }
    
    // Get Chief/DIC
    const chiefDIC = await getChiefDIC(ticket.tr_arsiparis_id);
    
    // Get witnesses
    const saksi1 = await dbDMS('v_mstr_employee_ext').where('nik', saksi1_nik).first();
    const saksi2 = await dbDMS('v_mstr_employee_ext').where('nik', saksi2_nik).first();
    
    if (!saksi1 || !saksi2) {
      return res.status(406).json({ type: 'error', message: 'Data saksi tidak ditemukan' });
    }
    
    // Prepare data for PDF — use arsiparis-entered date (matching PHP behavior)
    const bastData = {
      tr_no_tiket: ticket.tr_no_tiket,
      tgl_pemusnahan: tgl_pemusnahan || ticket.tr_tgl_pemusnahan || new Date(),
      lokasi_arsip_name: ticket.lokasi_arsip_name,
      arsiparis: {
        nama: arsiparis.nama,
        nik: arsiparis.nik
      },
      arsiparis_atasan: {
        nama: arsiparis_atasan?.nama || '-',
        nik: arsiparis_atasan?.nik || '-'
      },
      chief_dic: {
        nama: chiefDIC?.nama || '-',
        nik: chiefDIC?.nik || '-'
      },
      saksi1: {
        nama: saksi1.nama,
        nik: saksi1.nik,
        nm_grade: saksi1.nm_grade
      },
      saksi2: {
        nama: saksi2.nama,
        nik: saksi2.nik,
        nm_grade: saksi2.nm_grade
      },
      documents: documents
    };
    
    // Generate PDF
    const { generatePemusnahanBAST } = await import('../../helpers/pemusnahan.pdf.js');
    const filename = await generatePemusnahanBAST(bastData);
    
    return res.status(200).json({ 
      data: { 
        filename,
        download_url: `/api/dms/pemusnahan/download-bast/${filename}`
      } 
    });
  } catch (error) {
    logger(error, 'GET /pemusnahan/:id/generate-bast-pdf', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

/**
 * Download BAST PDF file
 * GET /api/dms/pemusnahan/download-bast/:filename
 */
export const downloadBASTpdf = async (req, res) => {
  try {
    const { filename } = req.params;
    const filepath = path.join(__dirname, '../../file/pdf', filename);
    
    if (!fs.existsSync(filepath)) {
      return res.status(406).json({ type: 'error', message: 'File tidak ditemukan' });
    }
    
    res.download(filepath, filename, (err) => {
      if (err) {
        logger(err, 'GET /pemusnahan/download-bast/:filename', { filename });
        return res.status(406).json(getErrorResponse(err));
      }
    });
  } catch (error) {
    logger(error, 'GET /pemusnahan/download-bast/:filename', req.params);
    return res.status(406).json(getErrorResponse(error));
  }
};

/**
 * Export pemusnahan list to Excel
 * GET /api/dms/pemusnahan/export
 */
export const exportToExcel = async (req, res) => {
  try {
    const {filter, bu_id, lokasi_arsip_id, tgl_awal, tgl_akhir, empid:empidDecrypt, domain} = req.query;
    const empid = decrypt(empidDecrypt);
    
    // Check if user is admin
    const role = await dbDMS('user_grant_role as a')
      .join('master_role as b','a.grant_urole_id','b.role_id')
      .where({'a.grant_user_id': empid,'a.grant_bu_id': domain,'b.role_admin':1})
      .first();
    const user_type = role ? 1 : 0;
    
    let query = dbDMS('trs_arsip_header as h')
      .select(
        'h.tr_arsip_id',
        'h.tr_no_tiket',
        'h.tr_tgl_pengajuan',
        'h.tr_tgl_pemusnahan',
        'h.tr_status',
        'h.tr_kategori_dokumen',
        'h.tr_kategori_keamanan',
        'c.content_name',
        'c.arsip_no',
        'c.content_doc',
        'la.lokasi_arsip_name',
        'bu.bu_name',
        'emp.nama as nama_arsiparis'
      )
      .leftJoin('trs_arsip_detail as d', 'h.tr_arsip_id', 'd.trdet_arsip_id')
      .leftJoin('content as c', 'd.trdet_no_arsip', 'c.arsip_no')
      .leftJoin('mst_lokasi_arsip as la', 'h.tr_lokasi_arsip', 'la.lokasi_arsip_id')
      .leftJoin(dbDMS.raw('v_mstr_bu as bu ON c.content_bu COLLATE SQL_Latin1_General_CP1_CI_AS = bu.bu_id COLLATE SQL_Latin1_General_CP1_CI_AS'))
      .leftJoin(dbDMS.raw('v_mstr_employee_ext as emp ON h.tr_arsiparis_id = emp.id COLLATE SQL_Latin1_General_CP1_CI_AS'))
      .where('h.tr_jenis_aktivitas', 6);

    // Apply filters
    if (bu_id) query = query.where('c.content_bu', bu_id);
    if (lokasi_arsip_id) query = query.where('h.tr_lokasi_arsip', lokasi_arsip_id);
    
    const startDate = tgl_awal || dayjs().startOf('month').format('YYYY-MM-DD');
    const endDate = tgl_akhir || dayjs().endOf('month').format('YYYY-MM-DD');
    query = query.whereBetween('h.tr_tgl_pengajuan', [startDate, endDate]);

    if (filter) {
      query = query.where((q) => { 
        q.orWhere('h.tr_no_tiket', 'like', `%${filter}%`)
         .orWhere('c.content_name', 'like', `%${filter}%`)
         .orWhere('c.arsip_no', 'like', `%${filter}%`)
         .orWhere('c.content_doc', 'like', `%${filter}%`); 
      });
    }

    const results = await query.orderBy('h.tr_tgl_pengajuan', 'desc');

    // Filter by access control (only if not admin)
    const filteredResults = user_type === 1 
      ? results 
      : results.filter(ticket => {
          // User can view if they are involved in the ticket
          return ticket.tr_user_id === empid || 
                 ticket.tr_atasan_user_id === empid ||
                 ticket.tr_arsiparis_id === empid ||
                 ticket.tr_atasan_arsiparis_id === empid ||
                 ticket.tr_corp_lgl_id === empid ||
                 ticket.tr_atasan_corp_lgl_id === empid ||
                 ticket.tr_dir_corp_lgl_id === empid;
        });

    // Helper function to get status text
    const getStatusText = (status) => {
      const statusMap = {
        1: 'Menunggu Approval Atasan User',
        2: 'Revisi',
        3: 'Ditolak',
        4: 'Menunggu Approval Corp. Legal SH',
        5: 'Menunggu Approval Corp. Legal Div/Dept Head',
        6: 'Menunggu Approval Corp. Legal Director',
        7: 'Menunggu Approval Arsiparis Lokasi',
        8: 'Penghapusan Arsip',
        9: 'Selesai'
      };
      return statusMap[status] || 'Unknown';
    };

    const XLSX = await import('xlsx');

    // Prepare data for Excel
    const excelData = filteredResults.map(row => ({
      'ID': row.tr_arsip_id,
      'Nomor Tiket': row.tr_no_tiket,
      'Tanggal Pengajuan': row.tr_tgl_pengajuan ? dayjs(row.tr_tgl_pengajuan).format('DD-MM-YYYY') : '',
      'Tanggal Pemusnahan': row.tr_tgl_pemusnahan ? dayjs(row.tr_tgl_pemusnahan).format('DD-MM-YYYY') : '',
      'Nama Arsip': row.content_name,
      'Kode Arsip': row.arsip_no,
      'Nomor Dokumen': row.content_doc,
      'Bisnis Unit': row.bu_name,
      'Lokasi Arsip': row.lokasi_arsip_name,
      'Arsiparis': row.nama_arsiparis,
      'Kategori Dokumen': row.tr_kategori_dokumen,
      'Kategori Keamanan': row.tr_kategori_keamanan,
      'Status': getStatusText(row.tr_status)
    }));

    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Pemusnahan Arsip');

    // Set column widths
    worksheet['!cols'] = [
      { wch: 8 },  // ID
      { wch: 20 }, // Nomor Tiket
      { wch: 18 }, // Tanggal Pengajuan
      { wch: 18 }, // Tanggal Pemusnahan
      { wch: 40 }, // Nama Arsip
      { wch: 20 }, // Kode Arsip
      { wch: 25 }, // Nomor Dokumen
      { wch: 25 }, // Bisnis Unit
      { wch: 25 }, // Lokasi Arsip
      { wch: 30 }, // Arsiparis
      { wch: 20 }, // Kategori Dokumen
      { wch: 20 }, // Kategori Keamanan
      { wch: 35 }  // Status
    ];

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=Pemusnahan_Arsip_${dayjs().format('YYYYMMDD')}.xlsx`);

    return res.send(buffer);
  } catch (error) {
    logger(error, 'GET /pemusnahan/export', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

/**
 * POST /api/dms/pemusnahan/:id/submit-arsiparis
 * Arsiparis submits BAST data with file uploads (status 7 → 8)
 * Matches PHP pemusnahanapprarsiparis save() function
 */
export const submitArsiparis = async (req, res) => {
  const trx = await dbDMS.transaction();
  try {
    const { id } = req.params;
    const { 
      creator: empidEncrypt, 
      saksi1_nik, 
      saksi2_nik, 
      tgl_pemusnahan 
    } = req.body;
    
    const empid = decrypt(empidEncrypt);
    const now = dayjs().format("YYYY-MM-DD HH:mm:ss");
    
    // Validate required fields
    if (!saksi1_nik || !saksi2_nik || !tgl_pemusnahan) {
      return res.status(406).json({ 
        type: 'error', 
        message: 'Saksi 1, Saksi 2, dan Tanggal Pemusnahan wajib diisi' 
      });
    }
    
    // Get ticket
    const ticket = await trx('trs_arsip_header')
      .where({'tr_arsip_id': id, 'tr_jenis_aktivitas': 6})
      .first();
    
    if (!ticket) {
      return res.status(406).json({ type: 'error', message: 'Data tidak ditemukan' });
    }
    
    if (ticket.tr_status !== 7) {
      return res.status(406).json({ 
        type: 'error', 
        message: 'Tiket harus dalam status Arsiparis Lokasi' 
      });
    }
    
    if (ticket.tr_arsiparis_id !== empid) {
      return res.status(406).json({ 
        type: 'error', 
        message: 'Hanya arsiparis lokasi yang dapat memproses tiket ini' 
      });
    }
    
    // Get saksi data
    const saksi1 = await trx('v_mstr_employee_ext').where('nik', saksi1_nik).first();
    const saksi2 = await trx('v_mstr_employee_ext').where('nik', saksi2_nik).first();
    
    if (!saksi1 || !saksi2) {
      return res.status(406).json({ 
        type: 'error', 
        message: 'Data saksi tidak ditemukan' 
      });
    }
    
    // Build update object
    const newToken = generateToken();
    const ticketUpdate = {
      tr_status: 8,
      tr_token: newToken,
      tr_saksi_bast_1: saksi1.id,
      tr_saksi_bast_2: saksi2.id,
      tr_doc_owner_id: ticket.tr_user_id,
      tr_doc_owner_nik: ticket.tr_user_nik,
      tr_tgl_bast: ticket.tr_tgl_pemusnahan,
      trs_tgl_pemusnahan_arsiparis: tgl_pemusnahan,
      updated_by: empid,
      updated_at: now
    };
    
    // Handle file uploads (upload1-4 via multer)
    if (req.files) {
      if (req.files.upload1 && req.files.upload1[0]) ticketUpdate.tr_file_bast_1 = req.files.upload1[0].filename;
      if (req.files.upload2 && req.files.upload2[0]) ticketUpdate.tr_file_bast_2 = req.files.upload2[0].filename;
      if (req.files.upload3 && req.files.upload3[0]) ticketUpdate.tr_file_bast_3 = req.files.upload3[0].filename;
      if (req.files.upload4 && req.files.upload4[0]) ticketUpdate.tr_file_bast_4 = req.files.upload4[0].filename;
    }
    
    await trx('trs_arsip_header').where('tr_arsip_id', id).update(ticketUpdate);
    
    // Update content status to 'Musnah' for all documents (matching PHP)
    await trx('content')
      .whereIn('arsip_no', function() {
        this.select('trdet_no_arsip').from('trs_arsip_detail').where('trdet_arsip_id', id);
      })
      .update({ content_status: 'Musnah' });
    
    // Insert log (matching PHP: proses='Pembuatan BA Pemusnahan', hasil='Persetujuan Arsiparis Lokasi')
    // PHP: trs_log_status = 1 (hardcoded), trs_log_catatan = keterangan_pemusnahan
    await trx('trs_log').insert({
      trs_log_no_tiket: ticket.tr_no_tiket,
      trs_log_proses: 'Pembuatan BA Pemusnahan',
      trs_log_hasil: 'Persetujuan Arsiparis Lokasi',
      trs_log_pic: empid,
      trs_log_tgl: now,
      trs_log_status: 1,
      trs_log_catatan: ticket.tr_keterangan_pemusnahan || '',
      trs_log_jenis: 6
    });
    
    await trx.commit();
    
    // Send email notification to document owner (matching PHP behavior)
    // PHP: TO = document owner, CC = atasan_user + atasan_arsiparis (if different)
    try {
      const user = await dbDMS('master_user').where('account_username', ticket.tr_user_id).first();
      const documents = await dbDMS('trs_arsip_detail as d')
        .join('content as c', 'd.trdet_no_arsip', 'c.arsip_no')
        .where('d.trdet_arsip_id', id)
        .select('c.content_name as arsip_name');
      
      let lokasiArsipName = '';
      if (ticket.tr_lokasi_arsip) {
        const lokasiArsip = await dbDMS('mst_lokasi_arsip').where('lokasi_arsip_id', ticket.tr_lokasi_arsip).first();
        lokasiArsipName = lokasiArsip?.lokasi_arsip_name || '';
      }

      // Build CC list: atasan user + atasan arsiparis (matching PHP)
      let ccEmails = [];
      // Atasan user (using getarsiparisatasandiv logic → then getemployeebyid)
      const userAtasanDiv = await dbDMS.raw(`
        SELECT CASE WHEN c.grade = 6 THEN c.id ELSE b.id END as id
        FROM v_mstr_employee_ext a
        LEFT JOIN v_mstr_employee_ext b ON a.id_atasan = b.id
        LEFT JOIN v_mstr_employee_ext c ON b.id_atasan = c.id
        WHERE a.id = ?
      `, [ticket.tr_user_id]);
      const atasanUserId = userAtasanDiv?.[0]?.id;
      if (atasanUserId) {
        const atasanUser = await dbDMS('v_mstr_employee_ext').where('id', atasanUserId).first();
        if (atasanUser?.email) ccEmails.push(atasanUser.email);
      }
      // Atasan arsiparis (from ticket field)
      if (ticket.tr_atasan_arsiparis_id) {
        const atasanArsiparis = await dbDMS('v_mstr_employee_ext').where('id', ticket.tr_atasan_arsiparis_id).first();
        if (atasanArsiparis?.email && !ccEmails.includes(atasanArsiparis.email)) {
          ccEmails.push(atasanArsiparis.email);
        }
      }

      if (user && user.account_email) {
        await sendPemusnahanApprovalEmail({
          recipient_email: user.account_email,
          recipient_name: user.account_name,
          no_pemusnahan: ticket.tr_no_tiket,
          documents: documents,
          kategori_dokumen: ticket.tr_kategori_dokumen,
          kategori_keamanan: ticket.tr_kategori_keamanan,
          jumlah: documents.length,
          tgl_pengajuan: ticket.tr_tgl_pengajuan,
          tgl_pemusnahan: tgl_pemusnahan,
          user_nama: user?.account_name || '-',
          user_direktorat: user?.account_dir_name || '-',
          user_divisi: user?.account_div_name || '-',
          keterangan_pemusnahan: ticket.tr_keterangan_pemusnahan || '-',
          approval_link: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/#/approval/pemusnahan?token=${newToken}`,
          is_arsiparis: false,
          is_arsiparis_complete: true,
          lokasi_arsip_name: lokasiArsipName,
          cc: ccEmails.length > 0 ? ccEmails.join(',') : undefined
        });
      }
    } catch (emailError) {
      logger(emailError, 'POST /pemusnahan/:id/submit-arsiparis - Email', { id });
    }
    
    return res.json("sukses");
  } catch (error) {
    await trx.rollback();
    logger(error, 'POST /pemusnahan/:id/submit-arsiparis', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};
