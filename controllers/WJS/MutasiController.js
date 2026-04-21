import dayjs from "dayjs";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import jwt from "jsonwebtoken";
import { dbDMS, dbHris, db } from "../../config/db.js";
import { logger } from "../../helpers/logger.js";
import { decrypt, getErrorResponse, generateToken } from "../../helpers/utils.js";
import { 
  sendMutasiApprovalEmail,
  sendMutasiExecutionEmail,
  sendMutasiRevisionEmail,
  sendMutasiRejectionEmail,
  sendMutasiCompletionEmail 
} from "../../helpers/pemusnahan.mail.js";
import { generateTicketNumber } from "../../helpers/counter.js";
import { createUserResponse } from "../../helpers/master/login.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * List mutasi tickets with filtering and pagination
 * GET /api/dms/mutasi
 */
export const list = async (req, res) => {
  try {
    const {page, rowsPerPage, sortBy, descending, filter, bu_id, lokasi_arsip_id, tgl_awal, tgl_akhir, empid:empidDecrypt,domain} = req.query;
    const empid = decrypt(empidDecrypt);
    const role = await dbDMS('user_grant_role as a').join('master_role as b','a.grant_urole_id','b.role_id').where({'a.grant_user_id': empid,'a.grant_bu_id': domain,'b.role_admin':1}).first();
    const user_type= role?1:0;
    
    let query = dbDMS('trs_arsip_header as h')
      .select('h.tr_arsip_id','h.tr_no_tiket','h.tr_tgl_pengajuan','h.tr_tgl_mutasi','h.tr_status','h.tr_user_id','h.tr_atasan_user_id','h.tr_arsiparis_lama_id','h.tr_atasan_arsiparis_lama_id','h.tr_arsiparis_baru_id','h.tr_atasan_arsiparis_baru_id','h.tr_keterangan_pemusnahan','h.tr_token','c.content_name','c.arsip_no','c.content_doc','la_old.lokasi_arsip_name as lokasi_lama_name','la.lokasi_arsip_name as lokasi_baru_name','bu.bu_name','arsip_lama.nama as nama_arsiparis_lama','arsip_baru.nama as nama_arsiparis_baru')
      .leftJoin('trs_arsip_detail as d', 'h.tr_arsip_id', 'd.trdet_arsip_id')
      .leftJoin('content as c', 'd.trdet_no_arsip', 'c.arsip_no')
      .leftJoin('mst_lokasi_arsip as la_old', 'c.lokasi_arsip_id', 'la_old.lokasi_arsip_id')
      .leftJoin('mst_lokasi_arsip as la', 'h.tr_lokasi_arsip_id', 'la.lokasi_arsip_id')
      .leftJoin(dbDMS.raw('v_mstr_bu as bu ON c.content_bu COLLATE SQL_Latin1_General_CP1_CI_AS = bu.bu_id COLLATE SQL_Latin1_General_CP1_CI_AS'))
      .leftJoin(dbDMS.raw('v_mstr_employee_ext as arsip_lama ON h.tr_arsiparis_lama_id = arsip_lama.id COLLATE SQL_Latin1_General_CP1_CI_AS'))
      .leftJoin(dbDMS.raw('v_mstr_employee_ext as arsip_baru ON h.tr_arsiparis_baru_id = arsip_baru.id COLLATE SQL_Latin1_General_CP1_CI_AS'))
      .where('h.tr_jenis_aktivitas', 7); // 7 = Mutasi

    if (bu_id) query = query.where('c.content_bu', bu_id);
    if (lokasi_arsip_id) query = query.where(function() {
      this.where('c.lokasi_arsip_id', lokasi_arsip_id).orWhere('h.tr_lokasi_arsip_id', lokasi_arsip_id);
    });
    
    const startDate = tgl_awal || dayjs().startOf('month').format('YYYY-MM-DD');
    const endDate = tgl_akhir || dayjs().endOf('month').format('YYYY-MM-DD');
    query = query.whereBetween('h.tr_tgl_pengajuan', [startDate, endDate]);

    if (filter) query = query.where((q) => { 
      q.orWhere('h.tr_no_tiket', 'like', `%${filter}%`)
       .orWhere('c.content_name', 'like', `%${filter}%`)
       .orWhere('c.arsip_no', 'like', `%${filter}%`)
       .orWhere('c.content_doc', 'like', `%${filter}%`); 
    });

    if (!rowsPerPage) return res.status(200).json(await query.orderBy('h.tr_tgl_pengajuan', 'desc'));

    const sorting = descending === "true" ? "desc" : "asc";
    const columnSort = sortBy === "asc" ? "h.tr_tgl_pengajuan asc" : `${sortBy} ${sorting}`;

    const response = await query.orderByRaw(columnSort).paginate({ 
      perPage: Math.floor(rowsPerPage), 
      currentPage: Math.floor(page), 
      isLengthAware: true 
    });

    if (response.data) {
      response.data = response.data.map(ticket => ({ 
        ...ticket, 
        status_text: getStatusText(ticket.tr_status),
        can_approve: canApprove(ticket, empid),
        can_reject: canApprove(ticket, empid),
        can_revise: canRevise(ticket, empid),
        can_execute: canExecute(ticket, empid),
        can_revisi_approval: canRevisiApproval(ticket, empid),
        can_view: canView(ticket, empid, user_type)
      }));
      if (user_type !== 1) response.data = response.data.filter(ticket => canView(ticket, empid, user_type));
    }

    return res.status(200).json(response);
  } catch (error) {
    console.log(error);
    logger(error, 'GET /mutasi', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

/**
 * Get mutasi ticket by ID
 * GET /api/dms/mutasi/:id
 */
export const getById = async (req, res) => {
  try {
    const { id } = req.params;
    const { empid:empidDecrypt, domain } = req.query;
    const empid = decrypt(empidDecrypt);
    const role = await dbDMS('user_grant_role as a').join('master_role as b','a.grant_urole_id','b.role_id').where({'a.grant_user_id': empid,'a.grant_bu_id': domain,'b.role_admin':1}).first();
    const user_type = role ? 1 : 0;

    const header = await dbDMS('trs_arsip_header as h')
      .select('h.*','la.lokasi_arsip_name as lokasi_baru_name','bu.bu_name','arsip_lama.nama as arsiparis_lama_name','arsip_baru.nama as arsiparis_baru_name','atasan_lama.nama as atasan_lama_name','atasan_baru.nama as atasan_baru_name')
      .leftJoin('mst_lokasi_arsip as la', 'h.tr_lokasi_arsip_id', 'la.lokasi_arsip_id')
      .leftJoin(dbDMS.raw('v_mstr_bu as bu ON la.lokasi_arsip_bu_id COLLATE SQL_Latin1_General_CP1_CI_AS = bu.bu_id COLLATE SQL_Latin1_General_CP1_CI_AS'))
      .leftJoin(dbDMS.raw('v_mstr_employee_ext as arsip_lama ON h.tr_arsiparis_lama_id = arsip_lama.id COLLATE SQL_Latin1_General_CP1_CI_AS'))
      .leftJoin(dbDMS.raw('v_mstr_employee_ext as arsip_baru ON h.tr_arsiparis_baru_id = arsip_baru.id COLLATE SQL_Latin1_General_CP1_CI_AS'))
      .leftJoin(dbDMS.raw('v_mstr_employee_ext as atasan_lama ON h.tr_atasan_arsiparis_lama_id = atasan_lama.id COLLATE SQL_Latin1_General_CP1_CI_AS'))
      .leftJoin(dbDMS.raw('v_mstr_employee_ext as atasan_baru ON h.tr_atasan_arsiparis_baru_id = atasan_baru.id COLLATE SQL_Latin1_General_CP1_CI_AS'))
      .where({'h.tr_arsip_id': id, 'h.tr_jenis_aktivitas': 7})
      .first();

    if (!header) return res.status(406).json({ type: 'error', message: 'Data tidak ditemukan' });
    if (!canView(header, empid, user_type)) return res.status(406).json({ type: 'error', message: 'Akses ditolak' });

    // Get old location from first document
    const firstDetail = await dbDMS('trs_arsip_detail as a')
      .select('b.lokasi_arsip_id','la_old.lokasi_arsip_name')
      .leftJoin('content as b', 'a.trdet_no_arsip', 'b.arsip_no')
      .leftJoin('mst_lokasi_arsip as la_old', 'b.lokasi_arsip_id', 'la_old.lokasi_arsip_id')
      .where('a.trdet_arsip_id', id)
      .first();
    
    if (firstDetail) {
      header.lokasi_lama_name = firstDetail.lokasi_arsip_name;
    }

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

    return res.status(200).json({ 
      data: { 
        header: { 
          ...header, 
          status_text: getStatusText(header.tr_status),
          can_approve: canApprove(header, empid),
          can_reject: canApprove(header, empid),
          can_revise: canRevise(header, empid),
          can_execute: canExecute(header, empid),
          can_revisi_approval: canRevisiApproval(header, empid)
        }, 
        details, 
        logs 
      } 
    });
  } catch (error) {
    console.log(error);
    logger(error, 'GET /mutasi/:id', req.params);
    return res.status(406).json(getErrorResponse(error));
  }
};

/**
 * Create new mutasi ticket
 * POST /api/dms/mutasi
 */
export const create = async (req, res) => {
  const trx = await dbDMS.transaction();
  try {
    const {
      creator: empidEncrypt,
      kategori_dokumen,
      kategori_keamanan,
      prioritas_approve,
      tgl_pengajuan, 
      tgl_mutasi, 
      lokasi_arsip_baru, 
      keterangan_pemusnahan,
      catatan_arsiparis_lama,
      arsiparis_lama,
      arsiparis_baru, 
      documents
    } = req.body;
    const empid = decrypt(empidEncrypt);
    const now = dayjs().format("YYYY-MM-DD HH:mm:ss");

    const queryAtasan = await dbHris('vw_map_employee_superior').where('employee_pk',empid).first();
    if (!queryAtasan) return res.status(406).json({ type: 'error', message: 'Atasan Anda tidak ditemukan' });
    const atasanID = queryAtasan.approver_divhead != '' 
    ? queryAtasan.approver_divhead 
    : (queryAtasan.approver_chief != '' ? queryAtasan.approver_chief : queryAtasan.approver_dir);
    
    const atasanUser = await dbDMS('master_user').where('account_username', atasanID).first();

    if (!kategori_dokumen || !kategori_keamanan || !tgl_pengajuan || !tgl_mutasi || !arsiparis_lama || !arsiparis_baru) {
      return res.status(406).json({ type: 'error', message: 'Field wajib harus diisi lengkap' });
    }
    if (!documents || documents.length === 0) {
      return res.status(406).json({ type: 'error', message: 'Minimal 1 arsip harus dipilih' });
    }

    const user = await trx('master_user').where('account_username', empid).first();
    if (!user) return res.status(406).json({ type: 'error', message: 'Data user tidak ditemukan' });

    // Get arsiparis lama data (from request, not from document)
    const arsiparisLamaData = await trx(dbDMS.raw('v_mstr_employee_ext')).where('id', arsiparis_lama).first();
    if (!arsiparisLamaData) return res.status(406).json({ type: 'error', message: 'Data arsiparis lama tidak ditemukan' });

    // Get arsiparis baru data
    const arsiparisBaruData = await trx(dbDMS.raw('v_mstr_employee_ext')).where('id', arsiparis_baru).first();
    if (!arsiparisBaruData) return res.status(406).json({ type: 'error', message: 'Data arsiparis baru tidak ditemukan' });

    // Get atasan for both arsiparis
    const atasanLama = await getArsiparisAtasanData(trx, arsiparis_lama);
    const atasanBaru = await getArsiparisAtasanData(trx, arsiparis_baru);

    // Generate ticket number
    const no_konter = await generateTicketNumber(trx, {
      arsip_kat: kategori_dokumen,
      bu: user.account_bu,
      div: user.account_div_id,
      jns_trans: '7' // 7 = Mutasi
    });
    if (!no_konter) return res.status(406).json({ type: 'error', message: 'Gagal generate nomor tiket' });

    const existingTicket = await trx('trs_arsip_header').where('tr_no_tiket', no_konter).first();
    if (existingTicket) return res.status(406).json({ type: 'error', message: 'Nomor tiket sudah digunakan' });

    // Generate random token for approval link (alphanumeric + @)
    const approvalToken = generateToken();

    // Insert header (matching PHP field order and values)
    await trx('trs_arsip_header').insert({
      tr_jenis_aktivitas: 7, // 7 = Mutasi
      tr_tgl_pengajuan: tgl_pengajuan,
      tr_no_tiket: no_konter,
      tr_tgl_mutasi: tgl_mutasi,
      tr_kategori_dokumen: kategori_dokumen,
      tr_kategori_keamanan: kategori_keamanan,
      tr_keterangan_pemusnahan: keterangan_pemusnahan,
      tr_status: 1,
      tr_user_id: empid,
      tr_user_nik: user.account_nik,
      tr_atasan_user_id: atasanID,
      tr_atasan_user_nik: atasanUser?.account_nik || null,
      tr_arsiparis_lama_id: arsiparis_lama,
      tr_arsiparis_lama_nik: arsiparisLamaData.nik,
      tr_atasan_arsiparis_lama_id: atasanLama?.id || null,
      tr_atasan_arsiparis_lama_nik: atasanLama?.nik || null,
      tr_arsiparis_baru_id: arsiparis_baru,
      tr_arsiparis_baru_nik: arsiparisBaruData.nik,
      tr_atasan_arsiparis_baru_id: atasanBaru?.id || null,
      tr_atasan_arsiparis_baru_nik: atasanBaru?.nik || null,
      tr_lokasi_arsip_id: lokasi_arsip_baru || null, // Optional: Set during BAST upload
      tr_mutasi_prioritas_approve: prioritas_approve || 1,
      tr_catatan_arsiparis_lama: catatan_arsiparis_lama || '',
      tr_token: approvalToken
    });

    const tr_arsip_id = await trx('trs_arsip_header').select('tr_arsip_id').where('tr_no_tiket', no_konter).first();

    // Insert details
    for (const doc of documents) {
      await trx('trs_arsip_detail').insert({
        trdet_arsip_id: tr_arsip_id.tr_arsip_id,
        trdet_no_arsip: doc.arsip_no,
        trdet_keterangan: doc.keterangan || ''
      });
    }

    // Insert log (matching PHP exactly)
    await trx('trs_log').insert({
      trs_log_no_tiket: no_konter,
      trs_log_proses: 'Pembuatan Tiket',
      trs_log_hasil: 'Verifikasi Atasan Pembuat Tiket',
      trs_log_pic: empid,
      trs_log_tgl: now,
      trs_log_status: 1,
      trs_log_catatan: keterangan_pemusnahan || '',
      trs_log_jenis: 7,
      trs_log_reason_revisi: ''
    });

    await trx.commit();
    
    // Send email notification to atasan user (don't fail if email fails)
    try {
      
      if (atasanUser && atasanUser.account_email) {
        // Get documents for email
        const emailDocuments = documents.map(doc => ({
          arsip_name: doc.content_name || doc.arsip_no
        }));
        
        // Generate approval link with random token
        const approvalLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/#/approval/mutasi?token=${approvalToken}`;
        
        await sendMutasiApprovalEmail({
          recipient_email: atasanUser.account_email,
          recipient_name: atasanUser.account_name,
          no_mutasi: no_konter,
          documents: emailDocuments,
          kategori_dokumen: kategori_dokumen,
          kategori_keamanan: kategori_keamanan,
          jumlah: documents.length,
          tgl_pengajuan: tgl_pengajuan,
          tgl_mutasi: tgl_mutasi,
          user_nama: user.account_name,
          user_direktorat: user.account_dir_name || '-',
          user_divisi: user.account_div_name || '-',
          approval_link: approvalLink
        });
      }
    } catch (emailError) {
      logger(emailError, 'POST /mutasi - Email', { no_konter });
      // Continue - don't fail creation if email fails
    }
    
    return res.json("sukses");
  } catch (error) {
    await trx.rollback();
    console.log(error);
    logger(error, 'POST /mutasi', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

/**
 * Helper function to get arsiparis atasan
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
 * Helper functions for status and permissions
 */
const getStatusText = (status) => {
  const statusMap = {
    1: 'Approval Atasan User Pembuat',
    2: 'Revisi User Pembuat',
    3: 'Ditolak',
    4: 'Approval Arsiparis Lama',
    5: 'Approval Atasan Arsiparis Lama',
    6: 'Approval Arsiparis Baru',
    7: 'Approval Atasan Arsiparis Baru',
    8: 'Pemindahan Arsip',
    9: 'Selesai'
  };
  return statusMap[status] || 'Unknown';
};

const canApprove = (ticket, empid) => {
  if (ticket.tr_status === 1 && ticket.tr_atasan_user_id === empid) return true;
  if (ticket.tr_status === 4 && ticket.tr_arsiparis_lama_id === empid) return true;
  if (ticket.tr_status === 5 && ticket.tr_atasan_arsiparis_lama_id === empid) return true;
  if (ticket.tr_status === 6 && ticket.tr_arsiparis_baru_id === empid) return true;
  if (ticket.tr_status === 7 && ticket.tr_atasan_arsiparis_baru_id === empid) return true;
  return false;
};

const canExecute = (ticket, empid) => {
  return ticket.tr_status === 8 && ticket.tr_arsiparis_baru_id === empid;
};

const canRevise = (ticket, empid) => {
  return ticket.tr_status === 2 && ticket.tr_user_id === empid;
};

const canRevisiApproval = (ticket, empid) => {
  // Atasan roles can send back for revision (revisi != tolak)
  if (ticket.tr_status === 1 && ticket.tr_atasan_user_id === empid) return true;
  if (ticket.tr_status === 5 && ticket.tr_atasan_arsiparis_lama_id === empid) return true;
  if (ticket.tr_status === 7 && ticket.tr_atasan_arsiparis_baru_id === empid) return true;
  return false;
};

const canView = (ticket, empid, user_type) => {
  if (user_type === 1) return true; // Admin can view all
  if (ticket.tr_user_id === empid) return true;
  if (ticket.tr_atasan_user_id === empid) return true;
  if (ticket.tr_arsiparis_lama_id === empid) return true;
  if (ticket.tr_atasan_arsiparis_lama_id === empid) return true;
  if (ticket.tr_arsiparis_baru_id === empid) return true;
  if (ticket.tr_atasan_arsiparis_baru_id === empid) return true;
  return false;
};

/**
 * Approve mutasi ticket
 * POST /api/dms/mutasi/:id/approve
 */
export const approve = async (req, res) => {
  const trx = await dbDMS.transaction();
  try {
    const { id } = req.params;
    const { 
      creator: empidEncrypt, 
      catatan,
      catatan_atasan_arsiparis,
      catatan_arsiparis_baru,
      catatan_atasan_arsiparis_baru
    } = req.body;
    const empid = decrypt(empidEncrypt);
    const now = dayjs().format("YYYY-MM-DD HH:mm:ss");

    const ticket = await trx('trs_arsip_header').where({'tr_arsip_id': id, 'tr_jenis_aktivitas': 7}).first();
    if (!ticket) return res.status(406).json({ type: 'error', message: 'Data tidak ditemukan' });

    if (!canApprove(ticket, empid)) return res.status(406).json({ type: 'error', message: 'Anda tidak memiliki akses untuk approve tiket ini' });

    let nextStatus = ticket.tr_status + 1;
    let logProses = '';
    let logHasil = '';
    const updateData = {
      tr_status: nextStatus,
      updated_by: empid,
      updated_at: now
    };

    switch (ticket.tr_status) {
      case 1:
        nextStatus = 4;
        logProses = 'Approval Atasan User Pembuat';
        logHasil = 'Approval Arsiparis Lama';
        break;
      case 4:
        nextStatus = 5;
        logProses = 'Approval Arsiparis Lama';
        logHasil = 'Approval Atasan Arsiparis Lama';
        // Save catatan from arsiparis lama
        if (catatan_atasan_arsiparis) {
          updateData.tr_catatan_atasan_arsiparis_lama = catatan_atasan_arsiparis;
        }
        break;
      case 5:
        nextStatus = 6;
        logProses = 'Approval Atasan Arsiparis Lama';
        logHasil = 'Approval Arsiparis Baru';
        break;
      case 6:
        nextStatus = 7;
        logProses = 'Approval Arsiparis Baru';
        logHasil = 'Approval Atasan Arsiparis Baru';
        // Save catatan from both atasan arsiparis lama and arsiparis baru
        if (catatan_atasan_arsiparis) {
          updateData.tr_catatan_atasan_arsiparis_lama = catatan_atasan_arsiparis;
        }
        if (catatan_arsiparis_baru) {
          updateData.tr_catatan_arsiparis_baru = catatan_arsiparis_baru;
        }
        break;
      case 7:
        nextStatus = 8;
        logProses = 'Approval Atasan Arsiparis Baru';
        logHasil = 'Pemindahan Arsip';
        // Save catatan from atasan arsiparis baru
        if (catatan_atasan_arsiparis_baru) {
          updateData.tr_catatan_atasan_arsiparis_baru = catatan_atasan_arsiparis_baru;
        }
        break;
      default:
        return res.status(406).json({ type: 'error', message: 'Status tidak valid untuk approval' });
    }

    updateData.tr_status = nextStatus;
    
    // Generate new token for next approver
    updateData.tr_token = generateToken();
    
    await trx('trs_arsip_header').where('tr_arsip_id', id).update(updateData);
    await trx('trs_log').insert({trs_log_no_tiket: ticket.tr_no_tiket, trs_log_proses: logProses, trs_log_hasil: logHasil, trs_log_pic: empid, trs_log_tgl: now, trs_log_status: nextStatus, trs_log_catatan: catatan || 'Disetujui', trs_log_jenis: 7});

    await trx.commit();
    
    // Send email notification (don't fail if email fails)
    try {
      // Get documents for email
      const documents = await dbDMS('trs_arsip_detail as d')
        .join('content as c', 'd.trdet_no_arsip', 'c.arsip_no')
        .where('d.trdet_arsip_id', id)
        .select('c.content_name as arsip_name');
      
      // Get requester info
      const requester = await dbDMS('master_user as u')
        .where('u.account_username', ticket.tr_user_id)
        .first();

      const approvalLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/#/approval/mutasi?token=${updateData.tr_token}`;

      if (nextStatus === 8) {
        // Special email to arsiparis baru with BAST execution instructions
        const arsiparisBaru = await dbDMS('master_user').where('account_username', ticket.tr_arsiparis_baru_id).first();
        
        // Get lokasi arsip baru name
        const lokasiBaru = await dbDMS('mst_lokasi_arsip').where('lokasi_arsip_id', ticket.tr_lokasi_arsip_baru).first();

        if (arsiparisBaru && arsiparisBaru.account_email) {
          await sendMutasiExecutionEmail({
            recipient_email: arsiparisBaru.account_email,
            recipient_name: arsiparisBaru.account_name,
            no_mutasi: ticket.tr_no_tiket,
            documents: documents,
            kategori_dokumen: ticket.tr_kategori_dokumen,
            kategori_keamanan: ticket.tr_kategori_keamanan,
            jumlah: documents.length,
            tgl_pengajuan: ticket.tr_tgl_pengajuan,
            tgl_mutasi: ticket.tr_tgl_mutasi,
            user_nama: requester?.account_name || '-',
            lokasi_arsip_name: lokasiBaru?.lokasi_arsip_name || '-',
            approval_link: approvalLink
          });
        }
      } else {
        // Standard approval email to next approver
        let nextApprover = null;
        if (nextStatus === 4) {
          nextApprover = await dbDMS('master_user').where('account_username', ticket.tr_arsiparis_lama_id).first();
        } else if (nextStatus === 5) {
          nextApprover = await dbDMS('master_user').where('account_username', ticket.tr_atasan_arsiparis_lama_id).first();
        } else if (nextStatus === 6) {
          nextApprover = await dbDMS('master_user').where('account_username', ticket.tr_arsiparis_baru_id).first();
        } else if (nextStatus === 7) {
          nextApprover = await dbDMS('master_user').where('account_username', ticket.tr_atasan_arsiparis_baru_id).first();
        }
        
        if (nextApprover && nextApprover.account_email) {
          await sendMutasiApprovalEmail({
            recipient_email: nextApprover.account_email,
            recipient_name: nextApprover.account_name,
            no_mutasi: ticket.tr_no_tiket,
            documents: documents,
            kategori_dokumen: ticket.tr_kategori_dokumen,
            kategori_keamanan: ticket.tr_kategori_keamanan,
            jumlah: documents.length,
            tgl_pengajuan: ticket.tr_tgl_pengajuan,
            tgl_mutasi: ticket.tr_tgl_mutasi,
            user_nama: requester?.account_name || '-',
            user_direktorat: requester?.account_dir_name || '-',
            user_divisi: requester?.account_div_name || '-',
            approval_link: approvalLink
          });
        }
      }
    } catch (emailError) {
      logger(emailError, 'POST /mutasi/:id/approve - Email', { id });
      // Continue - don't fail approval if email fails
    }
    
    return res.json("sukses");
  } catch (error) {
    await trx.rollback();
    console.log(error);
    logger(error, 'POST /mutasi/:id/approve', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

/**
 * Reject mutasi ticket
 * POST /api/dms/mutasi/:id/reject
 */
export const reject = async (req, res) => {
  const trx = await dbDMS.transaction();
  try {
    const { id } = req.params;
    const { creator: empidEncrypt, alasan } = req.body;
    const empid = decrypt(empidEncrypt);
    const now = dayjs().format("YYYY-MM-DD HH:mm:ss");

    if (!alasan) return res.status(406).json({ type: 'error', message: 'Alasan penolakan wajib diisi' });

    const ticket = await trx('trs_arsip_header').where({'tr_arsip_id': id, 'tr_jenis_aktivitas': 7}).first();
    if (!ticket) return res.status(406).json({ type: 'error', message: 'Data tidak ditemukan' });

    if (!canApprove(ticket, empid)) return res.status(406).json({ type: 'error', message: 'Anda tidak memiliki akses untuk reject tiket ini' });

    let logProses = '';
    switch (ticket.tr_status) {
      case 1:
        logProses = 'Penolakan Atasan User Pembuat';
        break;
      case 4:
        logProses = 'Penolakan Arsiparis Lama';
        break;
      case 5:
        logProses = 'Penolakan Atasan Arsiparis Lama';
        break;
      case 6:
        logProses = 'Penolakan Arsiparis Baru';
        break;
      case 7:
        logProses = 'Penolakan Atasan Arsiparis Baru';
        break;
      default:
        return res.status(406).json({ type: 'error', message: 'Status tidak valid untuk penolakan' });
    }

    await trx('trs_arsip_header').where('tr_arsip_id', id).update({tr_status: 3, updated_by: empid, updated_at: now});
    await trx('trs_log').insert({trs_log_no_tiket: ticket.tr_no_tiket, trs_log_proses: logProses, trs_log_hasil: 'Ditolak', trs_log_pic: empid, trs_log_tgl: now, trs_log_status: 3, trs_log_catatan: alasan, trs_log_reason_revisi: alasan, trs_log_jenis: 7});

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
        
        await sendMutasiRejectionEmail({
          recipient_email: requester.account_email,
          recipient_name: requester.account_name,
          no_mutasi: ticket.tr_no_tiket,
          documents: documents,
          kategori_dokumen: ticket.tr_kategori_dokumen,
          kategori_keamanan: ticket.tr_kategori_keamanan,
          jumlah: documents.length,
          tgl_pengajuan: ticket.tr_tgl_pengajuan,
          tgl_mutasi: ticket.tr_tgl_mutasi,
          user_nama: requester.account_name,
          revisi_reason: alasan
        });
      }
    } catch (emailError) {
      logger(emailError, 'POST /mutasi/:id/reject - Email', { id });
      // Continue - don't fail rejection if email fails
    }
    
    return res.json("sukses");
  } catch (error) {
    await trx.rollback();
    console.log(error);
    logger(error, 'POST /mutasi/:id/reject', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

/**
 * Revisi mutasi ticket (atasan sends back to previous approver)
 * In PHP: Atasan User (status 1) → revisi to status 2 (back to user)
 *         Atasan Arsiparis Lama (status 5) → revisi to status 4 (back to arsiparis lama)
 *         Atasan Arsiparis Baru (status 7) → revisi to status 6 (back to arsiparis baru)
 * POST /api/dms/mutasi/:id/revisi-approval
 */
export const revisiApproval = async (req, res) => {
  const trx = await dbDMS.transaction();
  try {
    const { id } = req.params;
    const { creator: empidEncrypt, alasan, catatan } = req.body;
    const empid = decrypt(empidEncrypt);
    const now = dayjs().format("YYYY-MM-DD HH:mm:ss");

    if (!alasan) return res.status(406).json({ type: 'error', message: 'Alasan revisi wajib diisi' });

    const ticket = await trx('trs_arsip_header').where({'tr_arsip_id': id, 'tr_jenis_aktivitas': 7}).first();
    if (!ticket) return res.status(406).json({ type: 'error', message: 'Data tidak ditemukan' });

    // Only atasan roles can revisi (send back to previous step)
    let prevStatus = null;
    let logProses = '';
    let logHasil = '';
    let revisiTarget = null; // Who receives the revisi email
    const updateData = { updated_by: empid, updated_at: now };

    switch (ticket.tr_status) {
      case 1: // Atasan User → back to User Pembuat
        if (ticket.tr_atasan_user_id !== empid) return res.status(406).json({ type: 'error', message: 'Akses ditolak' });
        prevStatus = 2;
        logProses = 'Revisi Atasan User Pembuat';
        logHasil = 'Revisi User Pembuat';
        revisiTarget = ticket.tr_user_id;
        if (catatan) updateData.tr_catatan_atasan_arsiparis_lama = catatan;
        break;
      case 5: // Atasan Arsiparis Lama → back to Arsiparis Lama
        if (ticket.tr_atasan_arsiparis_lama_id !== empid) return res.status(406).json({ type: 'error', message: 'Akses ditolak' });
        prevStatus = 4;
        logProses = 'Revisi Atasan Arsiparis Lama';
        logHasil = 'Revisi Arsiparis Lama';
        revisiTarget = ticket.tr_arsiparis_lama_id;
        if (catatan) updateData.tr_catatan_atasan_arsiparis_lama = catatan;
        break;
      case 7: // Atasan Arsiparis Baru → back to Arsiparis Baru
        if (ticket.tr_atasan_arsiparis_baru_id !== empid) return res.status(406).json({ type: 'error', message: 'Akses ditolak' });
        prevStatus = 6;
        logProses = 'Revisi Atasan Arsiparis Baru';
        logHasil = 'Revisi Arsiparis Baru';
        revisiTarget = ticket.tr_arsiparis_baru_id;
        if (catatan) updateData.tr_catatan_atasan_arsiparis_baru = catatan;
        break;
      default:
        return res.status(406).json({ type: 'error', message: 'Status tidak valid untuk revisi' });
    }

    updateData.tr_status = prevStatus;
    // Generate new token for the person who needs to revise
    updateData.tr_token = generateToken();

    await trx('trs_arsip_header').where('tr_arsip_id', id).update(updateData);
    await trx('trs_log').insert({
      trs_log_no_tiket: ticket.tr_no_tiket,
      trs_log_proses: logProses,
      trs_log_hasil: logHasil,
      trs_log_pic: empid,
      trs_log_tgl: now,
      trs_log_status: prevStatus,
      trs_log_catatan: alasan,
      trs_log_reason_revisi: alasan,
      trs_log_jenis: 7
    });

    await trx.commit();

    // Send revision email to target (don't fail if email fails)
    try {
      const targetUser = await dbDMS('master_user').where('account_username', revisiTarget).first();

      if (targetUser && targetUser.account_email) {
        const documents = await dbDMS('trs_arsip_detail as d')
          .join('content as c', 'd.trdet_no_arsip', 'c.arsip_no')
          .where('d.trdet_arsip_id', id)
          .select('c.content_name as arsip_name');

        await sendMutasiRevisionEmail({
          recipient_email: targetUser.account_email,
          recipient_name: targetUser.account_name,
          no_mutasi: ticket.tr_no_tiket,
          documents: documents,
          kategori_dokumen: ticket.tr_kategori_dokumen,
          kategori_keamanan: ticket.tr_kategori_keamanan,
          jumlah: documents.length,
          tgl_pengajuan: ticket.tr_tgl_pengajuan,
          tgl_mutasi: ticket.tr_tgl_mutasi,
          user_nama: targetUser.account_name,
          revisi_reason: alasan,
          revision_link: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/#/dms/mutasi/${id}/revise`
        });
      }
    } catch (emailError) {
      logger(emailError, 'POST /mutasi/:id/revisi-approval - Email', { id });
    }

    return res.json("sukses");
  } catch (error) {
    await trx.rollback();
    logger(error, 'POST /mutasi/:id/revisi-approval', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

/**
 * Revise rejected mutasi ticket
 * PUT /api/dms/mutasi/:id/revise
 */
export const revise = async (req, res) => {
  const trx = await dbDMS.transaction();
  try {
    const { id } = req.params;
    const {
      creator: empidEncrypt, 
      tgl_mutasi, 
      lokasi_arsip_baru, 
      keterangan_pemusnahan,
      keterangan_mutasi,
      catatan_arsiparis_lama, 
      arsiparis_lama,
      arsiparis_baru, 
      kategori_dokumen,
      kategori_keamanan,
      prioritas_approve,
      documents
    } = req.body;
    const empid = decrypt(empidEncrypt);
    const now = dayjs().format("YYYY-MM-DD HH:mm:ss");

    const ticket = await trx('trs_arsip_header').where({'tr_arsip_id': id, 'tr_jenis_aktivitas': 7}).first();
    if (!ticket) return res.status(406).json({ type: 'error', message: 'Data tidak ditemukan' });
    if (ticket.tr_user_id !== empid) return res.status(406).json({ type: 'error', message: 'Hanya pembuat tiket yang dapat melakukan revisi' });
    if (ticket.tr_status !== 2) return res.status(406).json({ type: 'error', message: 'Tiket hanya dapat direvisi jika statusnya Revisi' });

    // Build update object — only update fields that are provided
    const updateData = {
      tr_status: 1,
      updated_by: empid,
      updated_at: now
    };

    if (tgl_mutasi) updateData.tr_tgl_mutasi = tgl_mutasi;
    if (lokasi_arsip_baru) updateData.tr_lokasi_arsip_id = lokasi_arsip_baru;
    if (keterangan_pemusnahan || keterangan_mutasi) updateData.tr_keterangan_pemusnahan = keterangan_pemusnahan || keterangan_mutasi;
    if (catatan_arsiparis_lama) updateData.tr_catatan_arsiparis_lama = catatan_arsiparis_lama;
    if (kategori_dokumen) updateData.tr_kategori_dokumen = kategori_dokumen;
    if (kategori_keamanan) updateData.tr_kategori_keamanan = kategori_keamanan;
    if (prioritas_approve) updateData.tr_mutasi_prioritas_approve = prioritas_approve;

    // Update arsiparis lama if changed
    if (arsiparis_lama && arsiparis_lama !== ticket.tr_arsiparis_lama_id) {
      const arsiparisLamaData = await trx(dbDMS.raw('v_mstr_employee_ext')).where('id', arsiparis_lama).first();
      if (!arsiparisLamaData) return res.status(406).json({ type: 'error', message: 'Data arsiparis lama tidak ditemukan' });
      const atasanLama = await getArsiparisAtasanData(trx, arsiparis_lama);
      updateData.tr_arsiparis_lama_id = arsiparis_lama;
      updateData.tr_arsiparis_lama_nik = arsiparisLamaData.nik;
      updateData.tr_atasan_arsiparis_lama_id = atasanLama?.id || null;
      updateData.tr_atasan_arsiparis_lama_nik = atasanLama?.nik || null;
    }

    // Update arsiparis baru if changed
    if (arsiparis_baru && arsiparis_baru !== ticket.tr_arsiparis_baru_id) {
      const arsiparisBaruData = await trx(dbDMS.raw('v_mstr_employee_ext')).where('id', arsiparis_baru).first();
      if (!arsiparisBaruData) return res.status(406).json({ type: 'error', message: 'Data arsiparis baru tidak ditemukan' });
      const atasanBaru = await getArsiparisAtasanData(trx, arsiparis_baru);
      updateData.tr_arsiparis_baru_id = arsiparis_baru;
      updateData.tr_arsiparis_baru_nik = arsiparisBaruData.nik;
      updateData.tr_atasan_arsiparis_baru_id = atasanBaru?.id || null;
      updateData.tr_atasan_arsiparis_baru_nik = atasanBaru?.nik || null;
    }

    // Generate new token for approval
    updateData.tr_token = generateToken();

    await trx('trs_arsip_header').where('tr_arsip_id', id).update(updateData);

    // Update documents if provided
    if (documents && documents.length > 0) {
      await trx('trs_arsip_detail').where('trdet_arsip_id', id).delete();
      for (const doc of documents) {
        await trx('trs_arsip_detail').insert({trdet_arsip_id: id, trdet_no_arsip: doc.arsip_no, trdet_keterangan: doc.keterangan || '', created_by: empid, created_at: now});
      }
    }

    await trx('trs_log').insert({trs_log_no_tiket: ticket.tr_no_tiket, trs_log_proses: 'Revisi Tiket', trs_log_hasil: 'Verifikasi Atasan Pembuat Tiket', trs_log_pic: empid, trs_log_tgl: now, trs_log_status: 1, trs_log_catatan: 'Tiket telah direvisi dan diajukan kembali', trs_log_jenis: 7});

    await trx.commit();

    // Send email to atasan user (matching PHP mutasirevisi save)
    try {
      const atasanUser = await dbDMS('master_user').where('account_username', ticket.tr_atasan_user_id).first();
      if (atasanUser && atasanUser.account_email) {
        const detailDocs = await dbDMS('trs_arsip_detail as d')
          .join('content as c', 'd.trdet_no_arsip', 'c.arsip_no')
          .where('d.trdet_arsip_id', id)
          .select('c.content_name as arsip_name');

        const approvalLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/#/approval/mutasi?token=${updateData.tr_token}`;

        await sendMutasiApprovalEmail({
          recipient_email: atasanUser.account_email,
          recipient_name: atasanUser.account_name,
          no_mutasi: ticket.tr_no_tiket,
          documents: detailDocs,
          kategori_dokumen: updateData.tr_kategori_dokumen || ticket.tr_kategori_dokumen,
          kategori_keamanan: updateData.tr_kategori_keamanan || ticket.tr_kategori_keamanan,
          jumlah: detailDocs.length,
          tgl_pengajuan: ticket.tr_tgl_pengajuan,
          tgl_mutasi: updateData.tr_tgl_mutasi || ticket.tr_tgl_mutasi,
          user_nama: (await dbDMS('master_user').where('account_username', empid).first())?.account_name || '-',
          approval_link: approvalLink
        });
      }
    } catch (emailError) {
      logger(emailError, 'PUT /mutasi/:id/revise (email)', { id });
    }

    return res.json("sukses");
  } catch (error) {
    await trx.rollback();
    logger(error, 'PUT /mutasi/:id/revise', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

/**
 * Execute mutasi (relocate archives)
 * POST /api/dms/mutasi/:id/execute
 */
export const executeMutasi = async (req, res) => {
  const trx = await dbDMS.transaction();
  try {
    const { id } = req.params;
    const { 
      creator: empidEncrypt, 
      catatan,
      lemari_arsip,
      tingkat_lemari,
      box_ke,
      kode_lemari,
      kondisi_dokumen,
      catatan_bast
    } = req.body;
    const empid = decrypt(empidEncrypt);
    const now = dayjs().format("YYYY-MM-DD HH:mm:ss");

    const ticket = await trx('trs_arsip_header').where({'tr_arsip_id': id, 'tr_jenis_aktivitas': 7}).first();
    if (!ticket) return res.status(406).json({ type: 'error', message: 'Data tidak ditemukan' });
    if (ticket.tr_status !== 8) return res.status(406).json({ type: 'error', message: 'Tiket harus dalam status Pemindahan Arsip' });
    if (ticket.tr_arsiparis_baru_id !== empid) return res.status(406).json({ type: 'error', message: 'Hanya arsiparis baru yang dapat melakukan pemindahan' });

    // Validate cabinet if provided
    if (lemari_arsip) {
      const cabinet = await trx('mst_lemari_arsip').where('lemari_id', lemari_arsip).first();
      if (!cabinet) {
        return res.status(406).json({ type: 'error', message: 'Lemari arsip tidak ditemukan' });
      }
    }

    const details = await trx('trs_arsip_detail').where('trdet_arsip_id', id);

    // Update location, arsiparis, and cabinet for each archive
    for (const detail of details) {
      const updateData = {
        lokasi_arsip_id: ticket.tr_lokasi_arsip_id, 
        arsiparis_id: ticket.tr_arsiparis_baru_nik, 
        updated_by: empid, 
        updated_at: now
      };
      
      // Add cabinet info if provided
      if (lemari_arsip) {
        updateData.lemari_id = lemari_arsip;
        updateData.content_kode_lemari = kode_lemari;
      }
      
      await trx('content').where('arsip_no', detail.trdet_no_arsip).update(updateData);
    }

    // Update ticket with cabinet info + BAST fields + file uploads
    const ticketUpdate = {
      tr_status: 9, 
      tr_kondisi_dokumen_bast: kondisi_dokumen || null,
      tr_keterangan_bast: catatan_bast || null,
      tr_lokasi_arsip_id: ticket.tr_lokasi_arsip_id,
      updated_by: empid, 
      updated_at: now
    };
    
    if (lemari_arsip) {
      ticketUpdate.tr_lemari_id = lemari_arsip;
      ticketUpdate.tr_kode_lemari = kode_lemari;
    }

    // Handle file uploads (upload1-4)
    if (req.files) {
      if (req.files.upload1 && req.files.upload1[0]) ticketUpdate.tr_file_bast_1 = req.files.upload1[0].filename;
      if (req.files.upload2 && req.files.upload2[0]) ticketUpdate.tr_file_bast_2 = req.files.upload2[0].filename;
      if (req.files.upload3 && req.files.upload3[0]) ticketUpdate.tr_file_bast_3 = req.files.upload3[0].filename;
      if (req.files.upload4 && req.files.upload4[0]) ticketUpdate.tr_file_bast_4 = req.files.upload4[0].filename;
    }
    
    await trx('trs_arsip_header').where('tr_arsip_id', id).update(ticketUpdate);
    
    // Increment cabinet counter if cabinet assigned
    if (lemari_arsip) {
      await trx('mst_lemari_arsip')
        .where('lemari_id', lemari_arsip)
        .increment('lemari_urutan_doc', details.length);
    }
    
    await trx('trs_log').insert({
      trs_log_no_tiket: ticket.tr_no_tiket, 
      trs_log_proses: 'Pemindahan Arsip', 
      trs_log_hasil: 'Selesai', 
      trs_log_pic: empid, 
      trs_log_tgl: now, 
      trs_log_status: 9, 
      trs_log_catatan: catatan || 'Arsip telah dipindahkan', 
      trs_log_jenis: 7
    });

    await trx.commit();

    // Send completion notification email to all 4 parties (arsiparis lama, baru, atasan lama, atasan baru)
    try {
      const detailDocs = await dbDMS('trs_arsip_detail as a')
        .select('b.content_name')
        .leftJoin('content as b', 'a.trdet_no_arsip', 'b.arsip_no')
        .where('a.trdet_arsip_id', id);
      const docNames = detailDocs.map(d => d.content_name);

      const lokasiArsip = await dbDMS('mst_lokasi_arsip').where('lokasi_arsip_id', ticket.tr_lokasi_arsip_id).first();
      const lokasiName = lokasiArsip ? lokasiArsip.lokasi_arsip_name : '-';

      const user = await dbDMS('master_user').where('account_username', ticket.tr_user_id).first();

      // Gather all 4 parties
      const partyIds = [
        ticket.tr_arsiparis_lama_id,
        ticket.tr_arsiparis_baru_id,
        ticket.tr_atasan_arsiparis_lama_id,
        ticket.tr_atasan_arsiparis_baru_id
      ].filter(Boolean);

      const parties = await dbDMS('v_mstr_employee_ext')
        .select('id', 'nama', 'email')
        .whereIn('id', partyIds);

      const partyNames = parties.map(p => p.nama).join(', ');

      const baseUrl = process.env.FRONTEND_URL || req.headers.origin || '';
      const detailLink = `${baseUrl}/#/dms/mutasi/${id}`;

      for (const party of parties) {
        if (!party.email) continue;
        await sendMutasiCompletionEmail({
          recipient_name: partyNames,
          recipient_email: party.email,
          no_mutasi: ticket.tr_no_tiket,
          documents: docNames,
          kategori_dokumen: ticket.tr_kategori_dokumen,
          kategori_keamanan: ticket.tr_kategori_keamanan,
          jumlah: detailDocs.length,
          tgl_pengajuan: ticket.tr_tgl_pengajuan,
          tgl_mutasi: ticket.tr_tgl_mutasi,
          user_nama: user ? user.account_name : '-',
          lokasi_arsip_name: lokasiName,
          detail_link: detailLink
        });
      }
    } catch (emailError) {
      // Don't fail the whole operation if email fails
      logger(emailError, 'POST /mutasi/:id/execute (email)', { id });
    }

    return res.json("sukses");
  } catch (error) {
    await trx.rollback();
    console.log(error);
    logger(error, 'POST /mutasi/:id/execute', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

/**
 * Get lemari arsip by lokasi arsip ID (for execution form dropdown)
 * GET /api/dms/mutasi/lemari-by-lokasi
 */
export const getLemariByLokasi = async (req, res) => {
  try {
    const { lokasi_arsip_id } = req.query;
    if (!lokasi_arsip_id) {
      return res.status(406).json({ type: 'error', message: 'Lokasi arsip wajib diisi' });
    }

    const lemari = await dbDMS('mst_lemari_arsip as a')
      .select('a.lemari_id', 'a.lemari_name', 'a.lemari_tingkat_ke', 'a.lemari_box_ke', 'a.lemari_urutan_doc')
      .innerJoin('mst_lokasi_arsip as b', 'b.lokasi_arsip_id', 'a.lemari_lokasi_arsip_id')
      .where('a.lemari_lokasi_arsip_id', lokasi_arsip_id)
      .where('a.lemari_arsip_status', 1)
      .orderBy('a.lemari_name', 'asc');

    return res.status(200).json({ data: lemari });
  } catch (error) {
    logger(error, 'GET /mutasi/lemari-by-lokasi', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

/**
 * Get kode lemari (auto-generated from lemari + tingkat + box)
 * GET /api/dms/mutasi/kode-lemari
 */
export const getKodeLemari = async (req, res) => {
  try {
    const { lemari_id, tingkat, box } = req.query;
    if (!lemari_id || !tingkat || !box) {
      return res.status(200).json({ data: { kode_lemari: '' } });
    }

    const result = await dbDMS('mst_lemari_arsip')
      .where({ lemari_id, lemari_tingkat_ke: tingkat, lemari_box_ke: box })
      .first();

    if (result) {
      const nextUrutan = (parseInt(result.lemari_urutan_doc) + 1).toString().padStart(3, '0');
      const kode = `${nextUrutan}-${result.lemari_name}-${result.lemari_tingkat_ke}-${result.lemari_box_ke}`;
      return res.status(200).json({ data: { kode_lemari: kode } });
    }

    return res.status(200).json({ data: { kode_lemari: '' } });
  } catch (error) {
    logger(error, 'GET /mutasi/kode-lemari', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

/**
 * Get archives for selection (reuse from Pemusnahan logic)
 * GET /api/dms/mutasi/archives
 */
export const getArchives = async (req, res) => {
  try {
    const {content_owner, arsiparis, lokasi_arsip, search} = req.query;

    let query = dbDMS('content as a')
      .select('a.arsip_no','a.content_name','a.content_doc','a.content_bu','a.content_security','a.content_duedate','a.arsip_kat','a.content_div','a.content_owner','a.lokasi_arsip_id','bu.bu_name','div.div_nama','dir.direktorat_name','la.lokasi_arsip_name','e.id as arsiparis_do',dbDMS.raw(`CASE WHEN a.content_duedate IS NULL OR a.content_duedate = '1900-01-01' OR CONVERT(VARCHAR(10), GETDATE(), 120) <= a.content_duedate THEN 'Aktif' WHEN CONVERT(VARCHAR(10), GETDATE(), 120) > a.content_duedate THEN 'In-Aktif' ELSE 'In-Aktif' END as status_berlaku`))
      .leftJoin(dbDMS.raw('v_mstr_employee_ext as e ON e.nik = CONVERT(VARCHAR(100), a.arsiparis_id)'))
      .leftJoin(dbDMS.raw('v_mstr_bu as bu ON a.content_bu COLLATE SQL_Latin1_General_CP1_CI_AS = bu.bu_id COLLATE SQL_Latin1_General_CP1_CI_AS'))
      .leftJoin(dbDMS.raw('v_mstr_div as div ON a.content_div COLLATE SQL_Latin1_General_CP1_CI_AS = div.div_id COLLATE SQL_Latin1_General_CP1_CI_AS'))
      .leftJoin(dbDMS.raw('v_mstr_employee_ext as d ON a.content_owner = d.id COLLATE SQL_Latin1_General_CP1_CI_AS'))
      .leftJoin(dbDMS.raw('v_mstr_dir_newer as dir ON d.id_dir = dir.direktorat_pk'))
      .leftJoin('mst_lokasi_arsip as la', 'a.lokasi_arsip_id', 'la.lokasi_arsip_id')
      .whereRaw(`(a.content_duedate IS NULL OR a.content_duedate = '1900-01-01' OR CONVERT(VARCHAR(10), GETDATE(), 120) <= a.content_duedate)`);

    if (content_owner) query = query.where('a.content_owner', content_owner);
    if (arsiparis) query = query.where('e.id', arsiparis);
    if (lokasi_arsip) query = query.where('a.lokasi_arsip_id', lokasi_arsip);
    if (search) query = query.where((q) => { q.orWhere('a.arsip_no', 'like', `%${search}%`).orWhere('a.content_name', 'like', `%${search}%`).orWhere('a.content_doc', 'like', `%${search}%`); });

    return res.status(200).json({ data: await query.limit(100) });
  } catch (error) {
    console.log(error);
    logger(error, 'GET /mutasi/archives', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

/**
 * Validate archive for mutasi
 * POST /api/dms/mutasi/validate-archive
 */
export const validateArchive = async (req, res) => {
  try {
    const { nama_arsip, lokasi_arsip, nik_owner:empidDecrypt } = req.body;
    const empid = decrypt(empidDecrypt);
    if (!nama_arsip || !lokasi_arsip) return res.status(406).json({ type: 'error', message: 'Pilih lokasi arsip terlebih dahulu' });
  
    const archive = await dbDMS('content as a')
      .select('a.*','bu.bu_name','div.div_nama','dir.direktorat_name','la.lokasi_arsip_name',dbDMS.raw(`CASE WHEN a.content_duedate IS NULL OR a.content_duedate = '1900-01-01' OR CONVERT(VARCHAR(10), GETDATE(), 120) <= a.content_duedate THEN 'Aktif' WHEN CONVERT(VARCHAR(10), GETDATE(), 120) > a.content_duedate THEN 'In-Aktif' ELSE 'In-Aktif' END as status_berlaku`))
      .leftJoin(dbDMS.raw('v_mstr_bu as bu ON a.content_bu COLLATE SQL_Latin1_General_CP1_CI_AS = bu.bu_id COLLATE SQL_Latin1_General_CP1_CI_AS'))
      .leftJoin(dbDMS.raw('v_mstr_div as div ON a.content_div COLLATE SQL_Latin1_General_CP1_CI_AS = div.div_id COLLATE SQL_Latin1_General_CP1_CI_AS'))
      .leftJoin(dbDMS.raw('v_mstr_employee_ext as e ON a.content_owner = e.id COLLATE SQL_Latin1_General_CP1_CI_AS'))
      .leftJoin(dbDMS.raw('v_mstr_dir_newer as dir ON e.id_dir = dir.direktorat_pk'))
      .leftJoin('mst_lokasi_arsip as la', 'a.lokasi_arsip_id', 'la.lokasi_arsip_id')
      .where({'a.content_name': nama_arsip, 'a.content_owner': empid})
      .first();

    if (!archive) return res.status(406).json({ type: 'error', message: 'Data dokumen tidak ditemukan' });
    if (archive.lokasi_arsip_id != lokasi_arsip) return res.status(406).json({ type: 'error', message: 'Data lokasi arsip belum sesuai' });
    if (archive.content_status === 'Hilang') return res.status(406).json({ type: 'error', message: 'Dokumen ini sudah diadukan Hilang' });
    if (archive.content_status === 'Musnah') return res.status(406).json({ type: 'error', message: 'Dokumen ini sudah dimusnahkan, proses transaksi tidak bisa dilanjutkan' });

    return res.status(200).json({ data: archive });
  } catch (error) {
    console.log(error);
    logger(error, 'POST /mutasi/validate-archive', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

/**
 * Get arsiparis by location or BU
 * GET /api/dms/mutasi/arsiparis
 */
export const getArsiparis = async (req, res) => {
  try {
    const { lokasi_arsip, bu_id } = req.query;
    
    // Return empty if neither parameter provided
    if (!lokasi_arsip && !bu_id) return res.status(200).json([]);

    let query = dbDMS('mst_arsiparis as a')
      .select('a.*', 'b.nik', 'b.nama', 'b.email', 'b.id', 'c.lokasi_arsip_name', 'c.lokasi_arsip_id')
      .join(dbDMS.raw('v_mstr_employee_ext as b ON a.arsiparis_user_id = b.nik COLLATE SQL_Latin1_General_CP1_CI_AS'))
      .join('mst_lokasi_arsip as c', 'a.arsiparis_lokasi_arsip_id', 'c.lokasi_arsip_id')
      .where('a.lokasi_arsip_status', 1);

    if (lokasi_arsip) query = query.where('a.arsiparis_lokasi_arsip_id', lokasi_arsip);
    if (bu_id) query = query.where('c.lokasi_arsip_bu_id', bu_id);

    const results = await query;
    return res.status(200).json(results);
  } catch (error) {
    console.log(error);
    logger(error, 'GET /mutasi/arsiparis', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

/**
 * Get arsiparis atasan (reuse from Pemusnahan)
 * GET /api/dms/mutasi/arsiparis-atasan
 */
export const getArsiparisAtasan = async (req, res) => {
  try {
    const { arsiparis } = req.query;
    if (!arsiparis) return res.status(406).json({ type: 'error', message: 'Arsiparis ID wajib diisi' });

    const result = await dbDMS.raw(`SELECT CASE WHEN c.grade = 6 THEN c.id ELSE b.id END id, CASE WHEN c.grade = 6 THEN c.nama ELSE b.nama END nama, CASE WHEN c.grade = 6 THEN c.nik ELSE b.nik END nik FROM v_mstr_employee_ext a LEFT JOIN v_mstr_employee_ext b ON a.id_atasan = b.id LEFT JOIN v_mstr_employee_ext c ON b.id_atasan = c.id WHERE a.id = ?`, [arsiparis]);

    if (result && result.length > 0) return res.status(200).json({ data: result[0] });
    return res.status(406).json({ type: 'error', message: 'Data atasan tidak ditemukan' });
  } catch (error) {
    console.log(error);
    logger(error, 'GET /mutasi/arsiparis-atasan', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

/**
 * Upload Excel file with multiple archives
 * POST /api/dms/mutasi/upload-details
 */
export const uploadDetails = async (req, res) => {
  try {
    const { lokasi_arsip, content_owner } = req.body;

    if (!lokasi_arsip) {
      return res.status(406).json({
        type: 'error',
        message: 'Lokasi arsip harus dipilih terlebih dahulu'
      });
    }

    if (!req.file) {
      return res.status(406).json({
        type: 'error',
        message: 'File Excel wajib diupload'
      });
    }

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

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const rowNum = i + 2;

      if (!row.nama_arsip) {
        errors.push(`Baris ${rowNum}: Nama arsip wajib diisi`);
        continue;
      }

      try {
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

        if (archive.lokasi_arsip_id != lokasi_arsip) {
          errors.push(`Baris ${rowNum}: Lokasi arsip tidak sesuai untuk "${row.nama_arsip}"`);
          continue;
        }

        if (archive.content_status === 'Hilang') {
          errors.push(`Baris ${rowNum}: Dokumen "${row.nama_arsip}" sudah diadukan Hilang`);
          continue;
        }

        if (archive.content_status === 'Musnah') {
          errors.push(`Baris ${rowNum}: Dokumen "${row.nama_arsip}" sudah dimusnahkan`);
          continue;
        }

        const duplicate = validArchives.find(a => a.arsip_no === archive.arsip_no);
        if (duplicate) continue;

        validArchives.push({
          arsip_no: archive.arsip_no,
          content_name: archive.content_name,
          content_doc: archive.content_doc,
          status_berlaku: archive.status_berlaku,
          direktorat_name: archive.direktorat_name,
          bu_name: archive.bu_name,
          lokasi_arsip_name: archive.lokasi_arsip_name,
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
    logger(error, 'POST /mutasi/upload-details', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

/**
 * Download Excel template
 * GET /api/dms/mutasi/template
 */
export const downloadTemplate = async (req, res) => {
  try {
    const XLSX = await import('xlsx');

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

    const worksheet = XLSX.utils.json_to_sheet(templateData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Mutasi');

    worksheet['!cols'] = [
      { wch: 40 },
      { wch: 50 }
    ];

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=template_mutasi.xlsx');

    return res.send(buffer);
  } catch (error) {
    logger(error, 'GET /mutasi/template', {});
    return res.status(406).json(getErrorResponse(error));
  }
};


/**
 * Export mutasi list to Excel
 * GET /api/dms/mutasi/export
 */
export const exportToExcel = async (req, res) => {
  try {
    const {filter, bu_id, lokasi_arsip_id, tgl_awal, tgl_akhir, empid:empidDecrypt, domain} = req.query;
    const empid = decrypt(empidDecrypt);
    const role = await dbDMS('user_grant_role as a').join('master_role as b','a.grant_urole_id','b.role_id').where({'a.grant_user_id': empid,'a.grant_bu_id': domain,'b.role_admin':1}).first();
    const user_type = role ? 1 : 0;
    
    let query = dbDMS('trs_arsip_header as h')
      .select('h.tr_arsip_id','h.tr_no_tiket','h.tr_tgl_pengajuan','h.tr_tgl_mutasi','h.tr_status','c.content_name','c.arsip_no','c.content_doc','la_old.lokasi_arsip_name as lokasi_lama_name','la.lokasi_arsip_name as lokasi_baru_name','bu.bu_name','arsip_lama.nama as nama_arsiparis_lama','arsip_baru.nama as nama_arsiparis_baru')
      .leftJoin('trs_arsip_detail as d', 'h.tr_arsip_id', 'd.trdet_arsip_id')
      .leftJoin('content as c', 'd.trdet_no_arsip', 'c.arsip_no')
      .leftJoin('mst_lokasi_arsip as la_old', 'c.lokasi_arsip_id', 'la_old.lokasi_arsip_id')
      .leftJoin('mst_lokasi_arsip as la', 'h.tr_lokasi_arsip_id', 'la.lokasi_arsip_id')
      .leftJoin(dbDMS.raw('v_mstr_bu as bu ON c.content_bu COLLATE SQL_Latin1_General_CP1_CI_AS = bu.bu_id COLLATE SQL_Latin1_General_CP1_CI_AS'))
      .leftJoin(dbDMS.raw('v_mstr_employee_ext as arsip_lama ON h.tr_arsiparis_lama_id = arsip_lama.id COLLATE SQL_Latin1_General_CP1_CI_AS'))
      .leftJoin(dbDMS.raw('v_mstr_employee_ext as arsip_baru ON h.tr_arsiparis_baru_id = arsip_baru.id COLLATE SQL_Latin1_General_CP1_CI_AS'))
      .where('h.tr_jenis_aktivitas', 7);

    if (bu_id) query = query.where('c.content_bu', bu_id);
    if (lokasi_arsip_id) query = query.where(function() {
      this.where('c.lokasi_arsip_id', lokasi_arsip_id).orWhere('h.tr_lokasi_arsip_id', lokasi_arsip_id);
    });
    
    const startDate = tgl_awal || dayjs().startOf('month').format('YYYY-MM-DD');
    const endDate = tgl_akhir || dayjs().endOf('month').format('YYYY-MM-DD');
    query = query.whereBetween('h.tr_tgl_pengajuan', [startDate, endDate]);

    if (filter) query = query.where((q) => { 
      q.orWhere('h.tr_no_tiket', 'like', `%${filter}%`)
       .orWhere('c.content_name', 'like', `%${filter}%`)
       .orWhere('c.arsip_no', 'like', `%${filter}%`)
       .orWhere('c.content_doc', 'like', `%${filter}%`); 
    });

    const results = await query.orderBy('h.tr_tgl_pengajuan', 'desc');

    // Filter by access control
    const filteredResults = user_type === 1 
      ? results 
      : results.filter(ticket => canView(ticket, empid, user_type));

    // Add status text
    const dataWithStatus = filteredResults.map(ticket => ({
      ...ticket,
      status_text: getStatusText(ticket.tr_status)
    }));

    const XLSX = await import('xlsx');

    // Prepare data for Excel
    const excelData = dataWithStatus.map(row => ({
      'ID': row.tr_arsip_id,
      'Nomor Tiket': row.tr_no_tiket,
      'Tanggal Pengajuan': row.tr_tgl_pengajuan ? dayjs(row.tr_tgl_pengajuan).format('DD-MM-YYYY') : '',
      'Tanggal Mutasi': row.tr_tgl_mutasi ? dayjs(row.tr_tgl_mutasi).format('DD-MM-YYYY') : '',
      'Nama Arsip': row.content_name,
      'Kode Arsip': row.arsip_no,
      'Nomor Dokumen': row.content_doc,
      'Bisnis Unit': row.bu_name,
      'Lokasi Lama': row.lokasi_lama_name,
      'Lokasi Baru': row.lokasi_baru_name,
      'Arsiparis Lama': row.nama_arsiparis_lama,
      'Arsiparis Baru': row.nama_arsiparis_baru,
      'Status': row.status_text
    }));

    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Mutasi Arsip');

    // Set column widths
    worksheet['!cols'] = [
      { wch: 8 },  // ID
      { wch: 20 }, // Nomor Tiket
      { wch: 18 }, // Tanggal Pengajuan
      { wch: 18 }, // Tanggal Mutasi
      { wch: 40 }, // Nama Arsip
      { wch: 20 }, // Kode Arsip
      { wch: 25 }, // Nomor Dokumen
      { wch: 25 }, // Bisnis Unit
      { wch: 25 }, // Lokasi Lama
      { wch: 25 }, // Lokasi Baru
      { wch: 30 }, // Arsiparis Lama
      { wch: 30 }, // Arsiparis Baru
      { wch: 35 }  // Status
    ];

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=Mutasi_Arsip_${dayjs().format('YYYYMMDD')}.xlsx`);

    return res.send(buffer);
  } catch (error) {
    logger(error, 'GET /mutasi/export', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

/**
 * Get Mutasi BAST data for HTML preview
 * GET /api/dms/mutasi/:id/bast
 */
export const generateBAST = async (req, res) => {
  try {
    const { id } = req.params;
    const { saksi1_nik, saksi2_nik, tgl_mutasi } = req.query;

    if (!saksi1_nik || !saksi2_nik || !tgl_mutasi) {
      return res.status(406).json({ type: 'error', message: 'Saksi 1, Saksi 2, dan Tanggal Mutasi wajib diisi' });
    }

    const ticket = await dbDMS('trs_arsip_header as h')
      .leftJoin('mst_lokasi_arsip as la', 'h.tr_lokasi_arsip_id', 'la.lokasi_arsip_id')
      .where({ 'h.tr_arsip_id': id, 'h.tr_jenis_aktivitas': 7 })
      .select('h.*', 'la.lokasi_arsip_name as lokasi_arsip_baru_name')
      .first();

    if (!ticket) return res.status(406).json({ type: 'error', message: 'Data tidak ditemukan' });

    const details = await dbDMS('trs_arsip_detail as d')
      .leftJoin('content as c', 'd.trdet_no_arsip', 'c.arsip_no')
      .leftJoin('v_mstr_bu as bu', 'c.content_bu', 'bu.bu_id')
      .leftJoin('v_mstr_employee_ext as owner', 'c.content_owner', 'owner.id')
      .leftJoin('mst_lokasi_arsip as la_old', 'c.lokasi_arsip_id', 'la_old.lokasi_arsip_id')
      .where('d.trdet_arsip_id', id)
      .select(
        'd.trdet_no_arsip', 'd.trdet_keterangan',
        'c.content_name', 'c.content_doc', 'c.tgl_doc', 'c.content_security',
        'bu.bu_name', 'owner.nama as owner_nama',
        'la_old.lokasi_arsip_name as lokasi_lama_name',
        dbDMS.raw(`CASE WHEN c.content_duedate IS NULL OR c.content_duedate = '1900-01-01' OR CONVERT(VARCHAR(10), GETDATE(), 120) <= c.content_duedate THEN 'Aktif' ELSE 'In-Aktif' END as status_berlaku`)
      );

    const lokasi_lama_name = details[0]?.lokasi_lama_name || '-';
    const arsiparis_lama = await dbDMS('v_mstr_employee_ext').where('id', ticket.tr_arsiparis_lama_id).first();
    const arsiparis_baru = await dbDMS('v_mstr_employee_ext').where('id', ticket.tr_arsiparis_baru_id).first();
    const atasan_lama = await dbDMS('v_mstr_employee_ext').where('id', ticket.tr_atasan_arsiparis_lama_id).first();
    const atasan_baru = await dbDMS('v_mstr_employee_ext').where('id', ticket.tr_atasan_arsiparis_baru_id).first();
    const saksi1 = await dbDMS('v_mstr_employee_ext').where('nik', saksi1_nik).first();
    const saksi2 = await dbDMS('v_mstr_employee_ext').where('nik', saksi2_nik).first();

    if (!saksi1) return res.status(406).json({ type: 'error', message: 'Saksi 1 tidak ditemukan' });
    if (!saksi2) return res.status(406).json({ type: 'error', message: 'Saksi 2 tidak ditemukan' });

    return res.status(200).json({
      data: {
        ticket: {
          tr_no_tiket: ticket.tr_no_tiket,
          lokasi_arsip_lama: lokasi_lama_name,
          lokasi_arsip_baru: ticket.lokasi_arsip_baru_name
        },
        tgl_mutasi,
        arsiparis_lama: { nama: arsiparis_lama?.nama, nik: arsiparis_lama?.nik },
        arsiparis_baru: { nama: arsiparis_baru?.nama, nik: arsiparis_baru?.nik },
        atasan_lama: { nama: atasan_lama?.nama, nik: atasan_lama?.nik },
        atasan_baru: { nama: atasan_baru?.nama, nik: atasan_baru?.nik },
        saksi1: { nama: saksi1.nama, nik: saksi1.nik, nm_grade: saksi1.nm_grade },
        saksi2: { nama: saksi2.nama, nik: saksi2.nik, nm_grade: saksi2.nm_grade },
        details
      }
    });
  } catch (error) {
    logger(error, 'GET /mutasi/:id/bast', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

/**
 * Generate and download Mutasi BAST PDF
 * GET /api/dms/mutasi/:id/generate-bast-pdf
 */
export const generateBASTpdf = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get ticket header
    const ticket = await dbDMS('trs_arsip_header as h')
      .leftJoin('mst_lokasi_arsip as la', 'h.tr_lokasi_arsip_id', 'la.lokasi_arsip_id')
      .where({ 'h.tr_arsip_id': id, 'h.tr_jenis_aktivitas': 7 })
      .select('h.*', 'la.lokasi_arsip_name as lokasi_arsip_baru_name')
      .first();
    
    if (!ticket) {
      return res.status(406).json({ type: 'error', message: 'Data tidak ditemukan' });
    }
    
    // Get documents with columns matching PHP bastmutasi query exactly
    // PHP: a.* (trs_arsip_detail), b.* (content), c.div_nama, f.direktorat_name, d.bu_name, e.nama as owner
    const documents = await dbDMS('trs_arsip_detail as d')
      .leftJoin('content as c', 'd.trdet_no_arsip', 'c.arsip_no')
      .leftJoin(dbDMS.raw('v_mstr_div as dv ON c.content_div = dv.div_id COLLATE SQL_Latin1_General_CP1_CI_AS'))
      .leftJoin(dbDMS.raw('v_mstr_bu as bu ON bu.bu_id = c.content_bu COLLATE SQL_Latin1_General_CP1_CI_AS'))
      .leftJoin(dbDMS.raw('v_mstr_employee_ext as owner ON c.content_owner = owner.id COLLATE SQL_Latin1_General_CP1_CI_AS'))
      .leftJoin(dbDMS.raw('v_mstr_dir_newer as dir ON owner.id_dir = dir.direktorat_pk'))
      .leftJoin('mst_lokasi_arsip as la_old', 'c.lokasi_arsip_id', 'la_old.lokasi_arsip_id')
      .where('d.trdet_arsip_id', id)
      .select(
        'd.trdet_no_arsip',
        'd.trdet_keterangan',
        'c.content_name',
        'c.content_doc',
        'c.content_security',
        'c.content_duedate',
        'c.jenis_asli_qty',
        'c.jenis_copy_qty',
        'c.jenis_elektronik_qty',
        'c.kondisi_doc_ket',
        'dv.div_nama',
        'dir.direktorat_name',
        'bu.bu_name',
        'owner.nama as owner_nama',
        'la_old.lokasi_arsip_name as lokasi_lama_name',
        dbDMS.raw(`convert(varchar(10), c.content_entrydate, 103) as content_entrydate`),
        dbDMS.raw(`
          CASE 
            WHEN c.content_duedate IS NULL OR c.content_duedate = '1900-01-01' 
              OR CONVERT(VARCHAR(10), GETDATE(), 120) >= c.content_duedate 
            THEN 'Aktif'
            ELSE 'In-Aktif'
          END as status_berlaku
        `)
      );
    
    const lokasi_arsip_lama_name = documents[0]?.lokasi_lama_name || '-';
    
    const arsiparis_lama = await dbDMS('v_mstr_employee_ext').where('id', ticket.tr_arsiparis_lama_id).first();
    if (!arsiparis_lama) {
      return res.status(406).json({ type: 'error', message: 'Data arsiparis lama tidak ditemukan' });
    }
    
    const arsiparis_baru = await dbDMS('v_mstr_employee_ext').where('id', ticket.tr_arsiparis_baru_id).first();
    if (!arsiparis_baru) {
      return res.status(406).json({ type: 'error', message: 'Data arsiparis baru tidak ditemukan' });
    }
    
    const arsiparis_atasan_lama = await dbDMS('v_mstr_employee_ext').where('id', ticket.tr_atasan_arsiparis_lama_id).first();
    const arsiparis_atasan_baru = await dbDMS('v_mstr_employee_ext').where('id', ticket.tr_atasan_arsiparis_baru_id).first();
    
    // Prepare data for PDF (no saksi — matches PHP bastmutasi)
    const bastData = {
      tr_no_tiket: ticket.tr_no_tiket,
      tgl_mutasi: ticket.tr_tgl_mutasi || new Date(),
      lokasi_arsip_lama_name,
      lokasi_arsip_baru_name: ticket.lokasi_arsip_baru_name,
      arsiparis_lama: { nama: arsiparis_lama.nama, nik: arsiparis_lama.nik },
      arsiparis_baru: { nama: arsiparis_baru.nama, nik: arsiparis_baru.nik },
      arsiparis_atasan_lama: { nama: arsiparis_atasan_lama?.nama || '-', nik: arsiparis_atasan_lama?.nik || '-' },
      arsiparis_atasan_baru: { nama: arsiparis_atasan_baru?.nama || '-', nik: arsiparis_atasan_baru?.nik || '-' },
      documents
    };
    
    // Generate PDF using pdfmake — saves to file/pdf/
    const { generateMutasiBAST } = await import('../../helpers/pemusnahan.pdf.js');
    const filename = await generateMutasiBAST(bastData);
    
    return res.status(200).json({ 
      data: { 
        filename,
        download_url: `/api/dms/mutasi/download-bast/${filename}`
      } 
    });
  } catch (error) {
    logger(error, 'GET /mutasi/:id/generate-bast-pdf', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

/**
 * Download BAST PDF file
 * GET /api/dms/mutasi/download-bast/:filename
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
        logger(err, 'GET /mutasi/download-bast/:filename', { filename });
        return res.status(406).json(getErrorResponse(err));
      }
    });
  } catch (error) {
    logger(error, 'GET /mutasi/download-bast/:filename', req.params);
    return res.status(406).json(getErrorResponse(error));
  }
};

/**
 * Upload BAST files for mutasi (Status 10)
 * POST /api/dms/mutasi/:id/upload-bast
 */
export const uploadBASTFiles = async (req, res) => {
  const trx = await dbDMS.transaction();
  try {
    const { id } = req.params;
    const { 
      creator: empidEncrypt,
      upload1, 
      upload2, 
      upload3, 
      upload4,
      kondisi_dokumen, 
      catatan_bast
    } = req.body;
    
    const empid = decrypt(empidEncrypt);
    const now = dayjs().format("YYYY-MM-DD HH:mm:ss");
    
    // Get ticket
    const ticket = await trx('trs_arsip_header')
      .where({'tr_arsip_id': id, 'tr_jenis_aktivitas': 7})
      .first();
    
    if (!ticket) {
      return res.status(406).json({ type: 'error', message: 'Data tidak ditemukan' });
    }
    
    if (ticket.tr_status !== 9) {
      return res.status(406).json({ 
        type: 'error', 
        message: 'Tiket harus dalam status Selesai untuk upload BAST' 
      });
    }
    
    // Update ticket with BAST files
    await trx('trs_arsip_header')
      .where('tr_arsip_id', id)
      .update({
        tr_file_bast_1: upload1 || null,
        tr_file_bast_2: upload2 || null,
        tr_file_bast_3: upload3 || null,
        tr_file_bast_4: upload4 || null,
        tr_kondisi_dokumen_bast: kondisi_dokumen,
        tr_keterangan_bast: catatan_bast,
        tr_status: 10,
        updated_by: empid,
        updated_at: now
      });
    
    // Insert log
    await trx('trs_log').insert({
      trs_log_no_tiket: ticket.tr_no_tiket,
      trs_log_proses: 'BAST',
      trs_log_hasil: 'BAST Selesai',
      trs_log_pic: empid,
      trs_log_tgl: now,
      trs_log_status: 10,
      trs_log_catatan: catatan_bast || 'BAST telah dilengkapi',
      trs_log_jenis: 7
    });
    
    await trx.commit();
    return res.json("sukses");
  } catch (error) {
    await trx.rollback();
    logger(error, 'POST /mutasi/:id/upload-bast', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};


/**
 * Validate token and auto-login approver (like login but without password)
 * GET /api/dms/mutasi/validate-token
 */
export const validateToken = async (req, res) => {
  try {
    const { token,url } = req.query;
    
    if (!token) {
      return res.status(406).json({ 
        type: 'error', 
        message: 'Token tidak ditemukan' 
      });
    }

    // Find ticket by token
    const ticket = await dbDMS('trs_arsip_header as h')
      .select('h.*', 'la.lokasi_arsip_name as lokasi_baru_name')
      .leftJoin('mst_lokasi_arsip as la', 'h.tr_lokasi_arsip_id', 'la.lokasi_arsip_id')
      .where({ 'h.tr_token': token, 'h.tr_jenis_aktivitas': 7 })
      .first();
  
    if (!ticket) {
      return res.status(406).json({ 
        type: 'error', 
        message: 'Token tidak valid atau sudah tidak berlaku' 
      });
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
        approver_id = ticket.tr_arsiparis_lama_id;
        approver_role = 'Arsiparis Lama';
        break;
      case 5:
        approver_id = ticket.tr_atasan_arsiparis_lama_id;
        approver_role = 'Atasan Arsiparis Lama';
        break;
      case 6:
        approver_id = ticket.tr_arsiparis_baru_id;
        approver_role = 'Arsiparis Baru';
        break;
      case 7:
        approver_id = ticket.tr_atasan_arsiparis_baru_id;
        approver_role = 'Atasan Arsiparis Baru';
        break;
      case 8:
        approver_id = ticket.tr_arsiparis_baru_id;
        approver_role = 'Arsiparis Baru (Eksekusi)';
        break;
      default:
        return res.status(406).json({ 
          type: 'error', 
          message: 'Tiket tidak dalam status yang memerlukan approval' 
        });
    }

    // Get approver user data with BU info (like login does)
    const users = await dbDMS("master_user")
      .leftJoin('v_mstr_bu', dbDMS.raw('master_user.account_bu COLLATE SQL_Latin1_General_CP1_CI_AS = v_mstr_bu.bu_id'))
      .select("account_username","account_nik","account_name","account_bu","account_div_name","account_dept_name","bu_name")
      .where('account_username', approver_id)
      .first();
    
    if (!users) {
      return res.status(406).json({ 
        type: 'error', 
        message: 'Data approver tidak ditemukan' 
      });
    }

    // Get HRIS data to verify user is still active
    const hris = await dbHris("portal.dbo.ptl_hris as a")
      .select("a.Emp_Id","a.user_pass","a.user_newid","a.grade","a.jabatan","a.employee_mgr_pk","a.map_dept_pk","a.map_div_pk","b.nama_div","d.nama_dept","c.map_dir_pk")
      .leftJoin('master_div as b', function() {
                  this.on('b.id_div', '=', 'a.map_div_pk')
      })
      .leftJoin('mapping_dir_div_dept as c', function() {
          this.on('c.map_dept_pk', '=', 'a.map_dept_pk')
          .orOn('c.map_div_pk', '=', 'a.map_div_pk')
      })
      .leftJoin('master_dept as d', function() {
          this.on('d.id_dept', '=', 'a.map_dept_pk')
      })
      .where('user_active','Active')
      .where('Emp_Id', users.account_username)
      .first();

    const direktorat = await dbHris("master_dir")
            .where ('direktorat_pk', hris.map_dir_pk)
            .first();
    
    if (!hris) {
      await dbDMS("master_user").where('account_username', approver_id).update({account_active:0,account_nik:hris.user_newid,account_grade:hris.grade,account_jabatan:hris.jabatan,account_dept_id:hris.map_dept_pk,account_dept_name:hris.nama_dept,account_div_id:hris.map_div_pk,account_div_name:hris.nama_div,account_dir_id:direktorat?.direktorat_pk,account_dir_name:direktorat?.direktorat_name});
      return res.status(406).json({
        type:'error',
        message:`User ${users.account_nik} sudah tidak aktif`
      });
    }

    // Get idle_time from policy table (like login does)
    const resPortal = await dbHris("ptl_policy").where("id", 0).first();
    
    // Generate JWT token for authenticated API calls (like login does)
    const jwtToken = jwt.sign(
      { user: users.account_username }, 
      process.env.TOKEN, 
      { expiresIn: resPortal.idle_time }
    );

    // Log access (like login does)
    await dbDMS("log_akses").insert({
      empid: users.account_username,
      nik: hris.user_newid,
      status: "login",
      keterangan: `approval_mutasi_${approver_role}`,
      nama_url: `${url}/approval/mutasi?token=${token}`,
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
    logger(error, 'GET /mutasi/validate-token', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};
