import { dbDMS } from "../../config/db.js";
import { sendMail } from "../../helpers/mail.js";
import ejs from "ejs";
import path from "path";
import { fileURLToPath } from "url";
import dayjs from "dayjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const convertDateDMYtoYMD = (dateStr) => {
  if (!dateStr) return null;
  const parts = dateStr.split('-');
  return parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : dateStr;
};

export const buildDatetime = (date, time) => `${date} ${time}`;

export const generateTicketNumber = async (trx, { app_jns_trans, kategori_dokumen, bu_id, div_id }) => {
  const result = await trx.raw(`
    SET NOCOUNT ON;
    DECLARE @year INT;
    SELECT @year = YEAR(cnt_date) FROM mst_counter WHERE cnt_jns_trans = ? AND cnt_cat_doc = ? AND cnt_bu_id = ?;
    IF @year <> YEAR(GETDATE()) 
      UPDATE mst_counter SET cnt_nilai_counter = 0, cnt_date = GETDATE() WHERE cnt_jns_trans = ? AND cnt_cat_doc = ? AND cnt_bu_id = ? AND cnt_reset = 'yes';
    ELSE 
      UPDATE mst_counter SET cnt_nilai_counter = cnt_nilai_counter + 1, cnt_date = GETDATE() WHERE cnt_jns_trans = ? AND cnt_cat_doc = ? AND cnt_bu_id = ?;
    SELECT
      cnt_prefix 
      + RIGHT(REPLICATE('0', 4) + CONVERT(VARCHAR(10), cnt_nilai_counter), 3)
      + CASE WHEN (SELECT COUNT(div_id) total FROM v_mstr_div WHERE div_pk = ?) > 0 
        THEN '/' + (SELECT REPLACE(dbo.fn_extractupper(div_nama), ' ', '') FROM v_mstr_div WHERE div_pk = ?) 
        ELSE '' END
      + '/' + (SELECT TOP 1 map_bu_singkat FROM mst_map_kode_bu WHERE map_mstr_bu_id = ?)
      + '/' + SUBSTRING(CONVERT(VARCHAR(10), YEAR(GETDATE())), 3, 2) 
      + RIGHT(REPLICATE('0', 2) + CONVERT(VARCHAR(10), MONTH(GETDATE())), 2)
      AS no_konter
    FROM mst_counter WHERE cnt_jns_trans = ? AND cnt_cat_doc = ? AND cnt_bu_id = ?
  `, [
    app_jns_trans, kategori_dokumen, bu_id,
    app_jns_trans, kategori_dokumen, bu_id,
    app_jns_trans, kategori_dokumen, bu_id,
    div_id, div_id, bu_id,
    app_jns_trans, kategori_dokumen, bu_id
  ]);
  return result?.[0]?.no_konter || null;
};

export const insertPermintaan = async (trx, data) => {
  await trx('trs_permintaan_arsip').insert({
    pinjam_no_tiket: data.no_tiket,
    pinjam_tgl_create: trx.fn.now(),
    pinjam_user_id: data.empid,
    pinjam_user_nik: data.account_nik,
    pinjam_atasan_user_id: data.employee_spv_pk,
    pinjam_atasan_user_nik: data.employee_spv,
    pinjam_arsiparis_id: null,
    pinjam_arsiparis_nik: null,
    pinjam_aktivitas: data.aktivitas,
    pinjam_nama_doc: data.nama_dokumen,
    pinjam_nomor_doc: data.nomor_dokumen,
    pinjam_lokasi_arsip: data.lokasi_penyimpanan,
    pinjam_alasan_pinjam: data.alasan,
    pinjam_tgl_est_ambil_fr: data.pinjam_tgl_est_ambil_fr,
    pinjam_tgl_est_ambil_to: data.pinjam_tgl_est_ambil_to,
    pinjam_tgl_est_kembali_fr: data.pinjam_tgl_est_kembali_fr,
    pinjam_tgl_est_kembali_to: data.pinjam_tgl_est_kembali_to,
    pinjam_ket_user: data.keterangan_user,
    pinjam_status: 'Kirim Atasan User',
    pinjam_prioritas_approve: data.pinjam_prioritas_approve,
    bu_id: data.bu_id,
    pinjam_user_approve: data.employee_spv_pk,
    pinjam_flag: 0,
    pinjam_approve_ke: 0,
    tr_token: data.tr_token,
    updated_by: data.empid,
    updated_at: trx.fn.now()
  });
};

export const insertPermintaanLog = async (trx, { no_tiket, empid, app_jns_trans, keterangan_user }) => {
  await trx('trs_log').insert({
    trs_log_no_tiket: no_tiket,
    trs_log_proses: 'Pembuatan Tiket',
    trs_log_hasil: 'Verifikasi Atasan Pembuat Tiket',
    trs_log_pic: empid,
    trs_log_tgl: trx.fn.now(),
    trs_log_status: 1,
    trs_log_catatan: '',
    trs_log_jenis: app_jns_trans,
    trs_log_reason_revisi: '',
    trs_log_keterangan: keterangan_user
  });
};

export const sendPermintaanEmail = async ({ empid, nama_dokumen, lokasi_penyimpanan, no_tiket, aktivitas, kategori_dokumen, keterangan_user, alasan, tgl_pengambilan_db, tgl_pengembalian_db, employee_spv_pk, employee_spv }) => {
  const ucwords = (str) => str ? str.toLowerCase().replace(/\b\w/g, l => l.toUpperCase()) : '';
  const formatDate = (d) => d ? dayjs(d).format('DD-MM-YYYY') : '';

  const [documentResult, userResult, supervisorResult] = await Promise.all([
    dbDMS.raw(`SELECT arsip_no, content_security, arsip_kat as kat_desc FROM content c INNER JOIN mst_lokasi_arsip mla ON c.lokasi_arsip_id = mla.lokasi_arsip_id WHERE c.content_name = ? AND mla.lokasi_arsip_name = ?`, [nama_dokumen, lokasi_penyimpanan]),
    dbDMS.raw(`SELECT e.*, bu.bu_name, div.div_nama FROM v_mstr_employee_ext e LEFT JOIN v_mstr_bu bu ON e.id_bu = bu.bu_id COLLATE SQL_Latin1_General_CP1_CI_AS LEFT JOIN v_mstr_div div ON e.id_div = div.div_pk COLLATE SQL_Latin1_General_CP1_CI_AS WHERE e.id = ?`, [empid]),
    dbDMS('v_mstr_employee').where('employee_pk', employee_spv_pk).first()
  ]);

  const doc = documentResult?.[0] || {};
  const user = userResult?.[0];
  const supervisor = supervisorResult;
  if (!user || !supervisor) return;

  const token = Buffer.from(`${employee_spv}:${no_tiket}`).toString('base64');
  const templateName = aktivitas === 'Pinjam Asli' ? 'document-request-pinjam-asli.ejs' : 'document-request-elektronik.ejs';
  const templatePath = path.join(__dirname, '../../view/email/', templateName);

  const emailHtml = await ejs.renderFile(templatePath, {
    approverName: supervisor.employee_name || 'Atasan',
    documentName: nama_dokumen,
    archiveCode: doc.arsip_no || '',
    ticketNumber: no_tiket,
    securityCategory: ucwords(doc.content_security || ''),
    documentCategory: ucwords(doc.kat_desc || kategori_dokumen || ''),
    pickupDate: formatDate(tgl_pengambilan_db),
    returnDate: aktivitas === 'Pinjam Asli' ? formatDate(tgl_pengembalian_db) : '',
    notes: keterangan_user || alasan,
    requesterName: user.nama || '',
    requesterNik: user.nik || '',
    divisionName: user.div_nama || '',
    approvalLink: `${process.env.FRONTEND_URL || 'http://localhost:7060'}/#/approval/peminjaman?token=${token}`
  });

  await sendMail({ to: supervisor.employee_email, cc: '', bcc: '', subject: 'NOTIFIKASI PERMINTAAN DOKUMEN', html: emailHtml });
};
