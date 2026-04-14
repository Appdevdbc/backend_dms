import dayjs from "dayjs";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { dbDMS } from "../../config/db.js";
import { logger } from "../../helpers/logger.js";
import { decrypt, encrypt, getErrorResponse } from "../../helpers/utils.js";
import { sendMail } from "../../helpers/mail.js";
import { uploadFile, removeLocalFile } from "../../helpers/ftp.js";
import ejs from "ejs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Helpers ─────────────────────────────────────────────────────────────────

const sendEmailSafe = async (templateName, data, mailOpts, context) => {
  try {
    const templatePath = path.join(__dirname, '../../view/email/', templateName);
    const html = await ejs.renderFile(templatePath, data);
    await sendMail({ ...mailOpts, html });
  } catch (emailError) {
    logger(emailError, `Email ${context}`, data);
  }
};

const generateFileName = (originalname) => {
  const ext = originalname.split('.').pop();
  return `FILE${dayjs().format('YYYYMMDDHHmmss')}${Math.floor(Math.random() * 999)}.${ext}`;
};

const getFtpDir = () => process.env.ENVIRONMENT === 'LOCAL' ? 'dmslegal/dev/content' : 'dmslegal';

// Rename file lokal ke nama baru, lalu upload ke FTP, kembalikan nama baru
const renameAndUpload = async (file) => {
  const ext = file.originalname.split('.').pop();
  const newName = `FILE${dayjs().format('YYYYMMDDHHmmss')}${Math.floor(Math.random() * 999)}.${ext}`;
  const newPath = path.join(path.dirname(file.path), newName);
  fs.renameSync(file.path, newPath);
  await uploadFile('file', getFtpDir(), newName);
  await removeLocalFile(newPath).catch(() => {});
  return newName;
};

const decodeToken = (token) => {
  // Coba decrypt dengan AES (format baru)
  try {
    const decoded = decrypt(token);
    const parts = decoded.split(';');
    if (parts.length >= 2) return { nik: parts[0], content_id: parts[1] };
  } catch {}
  // Fallback ke base64 biasa (format lama)
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf8');
    const parts = decoded.split(';');
    if (parts.length >= 2) return { nik: parts[0], content_id: parts[1] };
  } catch {}
  throw new Error('Token tidak valid');
};

const getAdminsByDiv = async (div_id) => {
  if (!div_id) return [];
  return dbDMS('master_user as mu')
    .join(dbDMS.raw('v_mstr_employee emp ON mu.account_nik = emp.employee_id COLLATE SQL_Latin1_General_CP1_CI_AS'))
    .where({ 'mu.account_type': 2, 'emp.map_div_id': div_id })
    .select('mu.account_email', 'mu.account_name');
};

const getAdminsCorp = async () => {
  return dbDMS('master_user').where('account_type', 4).select('account_email', 'account_name');
};

// ─── FOLDER ──────────────────────────────────────────────────────────────────

export const getFolderTree = async (req, res) => {
  // #swagger.tags = ['Document']
  /* #swagger.security = [{ "bearerAuth": [] }] */
  try {
    const { empid: empidDecrypt, domain: bu_id, type, div } = req.query;
    const empid = empidDecrypt ? decrypt(empidDecrypt) : null;
    const div_id = div || '';
    const scope = (type || 'restricted').toLowerCase();

    const baseCols = ['f.folder_id', 'f.folder_name', 'f.folder_parent', 'f.folder_security', 'f.folder_tingkat', 'f.folder_bu', 'f.folder_div'];

    let query;
    if (scope === 'full access') {
      // Full Access — semua folder aktif
      query = dbDMS('folder as f')
        .select(...baseCols)
        .where('f.folder_active', 1)
        .orderBy('f.folder_name');
    } else if (scope === 'multi bu') {
      // Multi BU — folder yang BU-nya match atau corporate
      query = dbDMS('folder as f')
        .where('f.folder_active', 1)
        .where(q => q.where('f.folder_bu', 'like', `%${bu_id}%`).orWhere('f.folder_parent', '#').orWhere('f.folder_bu', 'like', '%corporate%'))
        .select(...baseCols)
        .distinct();
    } else if (scope === 'single bu') {
      // Single BU — folder berdasarkan akses BU
      query = dbDMS('folder as f')
        .leftJoin('mapping_aksesfolder as mf', 'f.folder_id', 'mf.aksesfolder_folderid')
        .where({ 'f.folder_active': 1 })
        .where(q => q.where('mf.aksesfolder_nik', empid).orWhere('f.folder_parent', '#').orWhere('mf.aksesfolder_bu', bu_id).orWhere('mf.aksesfolder_bu', 'all'))
        .select(...baseCols)
        .distinct();
    } else {
      // Restricted — akses berdasarkan NIK, BU, divisi
      query = dbDMS('folder as f')
        .leftJoin('mapping_aksesfolder as mf', 'f.folder_id', 'mf.aksesfolder_folderid')
        .where('f.folder_active', 1)
        .where(q => {
          q.where('mf.aksesfolder_nik', empid)
            .orWhere('mf.aksesfolder_bu', bu_id)
            .orWhere('mf.aksesfolder_bu', 'all')
            .orWhere('mf.aksesfolder_bu', 'corporate')
            .orWhere('f.folder_parent', '#');
        })
        .select(...baseCols)
        .distinct()
        .orderByRaw('f.folder_security DESC, f.folder_name ASC');
    }

    const folders = await query;
    return res.status(200).json(folders);
  } catch (error) {
    logger(error, 'GET /document/folders', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

export const createFolder = async (req, res) => {
  // #swagger.tags = ['Document']
  /* #swagger.security = [{ "bearerAuth": [] }] */
  const trx = await dbDMS.transaction();
  try {
    const { creator: empidDecrypt, folder_name, folder_parent, folder_bu, folder_div, folder_security } = req.body;
    const empid = decrypt(empidDecrypt);
    if (!folder_name) return res.status(406).json({ type: 'error', message: 'Nama folder wajib diisi' });

    let folder_tingkat = 0;
    if (folder_parent && folder_parent != 0) {
      const parent = await trx('folder').where('folder_id', folder_parent).first();
      folder_tingkat = parent ? (parent.folder_tingkat + 1) : 0;
    }

    const [folder_id] = await trx('folder').insert({
      folder_name, folder_parent: folder_parent || 0,
      folder_bu: folder_bu || 'all', folder_div: folder_div || 'all',
      folder_security: folder_security || 'private',
      folder_tingkat, folder_active: 1,
    });

    await trx('mapping_aksesfolder').insert({
      aksesfolder_folderid: folder_id, aksesfolder_nik: empid,
      aksesfolder_bu: folder_bu || 'all', aksesfolder_div: folder_div || 'all',
      aksesfolder_view: 1, aksesfolder_upload: 1, aksesfolder_manage: 1,
    });

    await trx.commit();
    return res.json({ status: 1, folder_id, message: 'Folder berhasil dibuat' });
  } catch (error) {
    await trx.rollback();
    logger(error, 'POST /document/folders', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

export const renameFolder = async (req, res) => {
  // #swagger.tags = ['Document']
  /* #swagger.security = [{ "bearerAuth": [] }] */
  try {
    const { folder_id, folder_name } = req.body;
    if (!folder_name) return res.status(406).json({ type: 'error', message: 'Nama folder wajib diisi' });
    await dbDMS('folder').where('folder_id', folder_id).update({ folder_name });
    return res.json({ status: 1, message: 'Folder berhasil direname' });
  } catch (error) {
    logger(error, 'POST /document/folders/rename', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

export const deleteFolder = async (req, res) => {
  // #swagger.tags = ['Document']
  /* #swagger.security = [{ "bearerAuth": [] }] */
  try {
    const { folder_id } = req.body;
    const isiFolder = await dbDMS('mapping_filefolder').where('mapping_folderid', folder_id).count('* as total').first();
    if (isiFolder && isiFolder.total > 0) return res.status(406).json({ type: 'error', message: 'Folder tidak bisa dihapus karena masih berisi file' });
    await dbDMS('folder').where('folder_id', folder_id).update({ folder_active: 0 });
    return res.json({ status: 1, message: 'Folder berhasil dihapus' });
  } catch (error) {
    logger(error, 'POST /document/folders/delete', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

// ─── FILE / DOKUMEN ───────────────────────────────────────────────────────────

export const getFilesByFolder = async (req, res) => {
  // #swagger.tags = ['Document']
  /* #swagger.security = [{ "bearerAuth": [] }] */
  try {
    const { folder_id, empid: empidDecrypt, domain: bu_id, type } = req.query;
    if (!folder_id) return res.status(400).json({ message: 'folder_id wajib diisi' });
    const empid = decrypt(empidDecrypt);
    const userType = parseInt(type) || 7;
    const div_id = req.query.div || '';

    let query;
    const baseSelect = `c.content_id, c.content_name, c.content_doc, c.content_file, c.content_type,
      c.content_security, c.content_status, c.content_show, c.content_owner, c.content_keeper,
      c.content_statuskeeper, c.content_bu, c.content_div, c.content_duedate, c.content_entrydate,
      c.content_reminder, c.arsip_no, c.arsip_kat, c.content_sub_arsip_id, c.lokasi_arsip_id,
      c.arsiparis_id, c.content_kode_lemari, c.tgl_doc, c.kondisi_doc, c.jenis_asli, c.jenis_asli_qty,
      c.jenis_copy, c.jenis_copy_qty, c.jenis_elektronik, c.jenis_elektronik_qty, c.content_replacedby,
      c.content_ver, c.content_pengaduan_rusak,
      (SELECT TOP 1 pinjam_status FROM trs_permintaan_arsip WHERE pinjam_nomor_doc = c.content_doc ORDER BY id DESC) as pinjam_status,
      (SELECT TOP 1 CASE WHEN CONVERT(VARCHAR(10), pinjam_tgl_est_ambil_to, 120) < CONVERT(VARCHAR(10), GETDATE(), 120) THEN 1 ELSE 0 END FROM trs_permintaan_arsip WHERE pinjam_nomor_doc = c.content_doc ORDER BY id DESC) as melewati_waktu_download`;

    if ([4, 5, 7, 8].includes(userType)) {
      query = dbDMS.raw(`SELECT ${baseSelect} FROM content c
        INNER JOIN mapping_filefolder ff ON c.content_id = ff.mapping_contentid
        WHERE ff.mapping_folderid = ? AND c.content_show = 1`, [folder_id]);
    } else if (userType === 6) {
      query = dbDMS.raw(`SELECT ${baseSelect} FROM content c
        INNER JOIN mapping_filefolder ff ON c.content_id = ff.mapping_contentid
        WHERE ff.mapping_folderid = ? AND c.content_show = 1 AND c.content_bu LIKE ?`, [folder_id, `%${bu_id}%`]);
    } else {
      // Type 1, 2, 3 — filter by mapping_aksesfile
      query = dbDMS.raw(`SELECT ${baseSelect}, af.aksesfile_view, af.aksesfile_download, af.aksesfile_delete, af.aksesfile_upload
        FROM content c
        INNER JOIN mapping_filefolder ff ON c.content_id = ff.mapping_contentid
        INNER JOIN mapping_aksesfile af ON c.content_id = af.aksesfile_contentid
        WHERE ff.mapping_folderid = ? AND c.content_show = 1
          AND (af.aksesfile_nik = ? OR (af.aksesfile_div = ? AND af.aksesfile_bu = ?) OR af.aksesfile_bu = ? OR af.aksesfile_bu = 'all')`,
        [folder_id, empid, div_id, bu_id, bu_id]);
    }

    const result = await query;
    const files = Array.isArray(result) ? result : result;
    return res.status(200).json(files);
  } catch (error) {
    logger(error, 'GET /document/files', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

export const getDocumentById = async (req, res) => {
  // #swagger.tags = ['Document']
  /* #swagger.security = [{ "bearerAuth": [] }] */
  try {
    const { id } = req.params;
    const doc = await dbDMS.raw(`
      SELECT c.*, f.folder_name, f.folder_security, la.lokasi_arsip_name,
             mu.account_name as owner_name, mk.account_name as keeper_name
      FROM content c
      INNER JOIN mapping_filefolder mff ON c.content_id = mff.mapping_contentid
      INNER JOIN folder f ON mff.mapping_folderid = f.folder_id
      LEFT JOIN mst_lokasi_arsip la ON c.lokasi_arsip_id = la.lokasi_arsip_id
      LEFT JOIN master_user mu ON c.content_owner = mu.account_username
      LEFT JOIN master_user mk ON c.content_keeper = mk.account_username
      WHERE c.content_id = ?`, [id]);

    if (!doc || doc.length === 0) return res.status(404).json({ message: 'Dokumen tidak ditemukan' });

    const pendukung = await dbDMS('content_det').where('cdet_content_id', id).select('*');
    return res.status(200).json({ data: doc[0], pendukung });
  } catch (error) {
    logger(error, 'GET /document/files/:id', req.params);
    return res.status(406).json(getErrorResponse(error));
  }
};

export const uploadDocument = async (req, res) => {
  // #swagger.tags = ['Document']
  /* #swagger.security = [{ "bearerAuth": [] }] */
  const trx = await dbDMS.transaction();
  try {
    const {
      creator: empidDecrypt, folder_id, namafile, content_doc, description,
      content_kat, content_kat_sub, worklocation, jenisfile, content_reminder,
      kondisi_dok, keterangan, lokasiarsip, arsiparis_id, docdate, duedate,
      handdate, handtime, security, buid, divid, no_arsip,
      chk_jenis_1, txt_jenis_1, chk_jenis_2, txt_jenis_2, chk_jenis_3, txt_jenis_3
    } = req.body;
    const empid = decrypt(empidDecrypt);

    if (!namafile || !folder_id) return res.status(406).json({ type: 'error', message: 'Nama dokumen dan folder wajib diisi' });

    // Validasi content_doc jika diisi — harus ada di trs_nmr_doc dan tidak Cancel
    if (content_doc && content_doc.trim()) {
      try {
        const docExist = await trx('trs_nmr_doc')
          .where('doc_id', content_doc.trim())
          .whereNot('doc_nmr_status', 'Cancel')
          .first();
        if (!docExist) {
          await trx.rollback();
          return res.status(406).json({ type: 'warning', message: `Nomor dokumen "${content_doc}" tidak ditemukan di sistem. Pastikan nomor dokumen sudah terdaftar dan statusnya bukan Batal.` });
        }
      } catch (dbErr) {
        // Jika tabel tidak ada atau query gagal, lewati validasi agar upload tetap bisa dilanjutkan
        logger(dbErr, 'Validasi content_doc (non-fatal)', { content_doc });
      }
    }

    const files = req.files || {};
    const filedoc = files['filedoc'] ? files['filedoc'][0] : null;
    if (!filedoc) { await trx.rollback(); return res.status(406).json({ type: 'error', message: 'File PDF wajib diupload' }); }

    const ext = filedoc.originalname.split('.').pop().toLowerCase();
    if (ext !== 'pdf') { await trx.rollback(); return res.status(406).json({ type: 'error', message: 'File harus berformat PDF' }); }

    const filename = await renameAndUpload(filedoc);

    // Ambil atasan owner
    const empData = await trx.raw(`SELECT * FROM v_mstr_employee_ext WHERE id = ?`, [empid]);
    const emp = empData && empData.length > 0 ? empData[0] : null;
    const atasanNik = emp ? (emp.id_atasan || null) : null;

    // Insert content dan ambil ID yang di-generate (SQL Server: OUTPUT INSERTED)
    const insertResult = await trx.raw(`
      INSERT INTO content (
        content_name, content_doc, content_desc, content_file, content_path,
        content_status, content_type, content_security, content_owner,
        content_bu, content_div, content_duedate, content_entrydate,
        content_show, content_active, content_flag_review, content_reminder,
        arsip_kat, arsip_no, content_sub_arsip_id, content_work_id,
        lokasi_arsip_id, content_arsiparis_lokasi_id, tgl_doc, tgl_doc_serah,
        content_waktu_doc_serah, kondisi_doc, kondisi_doc_ket,
        jenis_asli, jenis_asli_qty, jenis_copy, jenis_copy_qty,
        jenis_elektronik, jenis_elektronik_qty, content_ver
      )
      OUTPUT INSERTED.content_id
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, GETDATE(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      namafile, content_doc || '', description || '', filename, `/${folder_id}`,
      'Masih menunggu persetujuan atasan dokumen owner',
      jenisfile || 'non-renewable', security || 'non-restricted', empid,
      buid || '', divid || '',
      (jenisfile === 'renewable' && duedate) ? duedate : '1900-01-01',
      1, 1, 1,
      content_reminder || 'no',
      content_kat || '', no_arsip || '',
      content_kat_sub ? content_kat_sub.split(';')[0] : null,
      worklocation || null,
      lokasiarsip || null, arsiparis_id || null,
      docdate || null, handdate || null, handtime || null,
      kondisi_dok || 'baik', keterangan || '',
      chk_jenis_1 ? 1 : 0, parseInt(txt_jenis_1) || 0,
      chk_jenis_2 ? 1 : 0, parseInt(txt_jenis_2) || 0,
      chk_jenis_3 ? 1 : 0, parseInt(txt_jenis_3) || 0,
      1,
    ]);
    const content_id = insertResult[0]?.content_id;

    await trx('mapping_filefolder').insert({ mapping_contentid: content_id, mapping_folderid: folder_id });
    await trx('mapping_aksesfile').insert({
      aksesfile_contentid: content_id, aksesfile_nik: empid,
      aksesfile_bu: buid || 'all', aksesfile_div: divid || 'all',
      aksesfile_view: 1, aksesfile_download: 1, aksesfile_delete: 1, aksesfile_upload: 1,
    });

    // Insert log upload
    await trx('log').insert({
      log_contentid: content_id,
      log_action: 'Upload File',
      log_nik: empid,
      log_date: trx.fn.now(),
    });

    // Jika security non-restricted, tambah akses view untuk semua BU
    if ((security || 'non-restricted') === 'non-restricted') {
      await trx('mapping_aksesfile').insert({
        aksesfile_contentid: content_id,
        aksesfile_bu: buid || 'all',
        aksesfile_view: 1, aksesfile_download: 0, aksesfile_delete: 0, aksesfile_upload: 0,
      });
    }

    // Upload dokumen pendukung
    const kelengkapan = files['kelengkapan_doc'] || [];
    for (const kFile of kelengkapan) {
      const kExt = kFile.originalname.split('.').pop().toLowerCase();
      if (kExt === 'pdf') {
        const kFilename = await renameAndUpload(kFile);
        await trx('content_det').insert({ cdet_content_id: content_id, cdet_file: kFilename, cdet_doc_no: kelengkapan.no_dok, cdet_doc_name: kelengkapan.nama, cdet_doc_date: kelengkapan.tgl_dok, cdet_doc_type: kelengkapan.status, cdet_reminder: kelengkapan.reminder });
      }
    }

    await trx.commit();

    // Kirim email ke atasan
    if (atasanNik) {
      const atasanUser = await dbDMS('master_user').where('account_username', atasanNik).first();
      if (atasanUser && atasanUser.account_email) {
        const token = encrypt(`${atasanNik};${content_id}`);
        const approvalLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/#/dms/document/approval?token=${token}`;

        // Susun jenis dokumen seperti PHP templateAppr
        const chkJenis = [];
        if (chk_jenis_1) chkJenis.push('Asli');
        if (chk_jenis_2) chkJenis.push('Copy / Pdf');
        if (chk_jenis_3) chkJenis.push('Elektronik');

        // Ambil nama divisi owner
        const divData = emp ? await dbDMS('v_mstr_div').where('div_pk', emp.id_div).select('div_nama').first() : null;

        await sendEmailSafe('document-upload-atasan.ejs', {
          atasan_nama: atasanUser.account_name,
          nama_dokumen: namafile,
          content_doc: content_doc || '-',
          no_arsip: no_arsip || '-',
          security: security || '-',
          chk_jenis: chkJenis.join(', ') || '-',
          content_kat: content_kat || '-',
          docdate: docdate || '-',
          owner_nama: emp ? emp.nama : empid,
          owner_nik: emp ? emp.id : empid,
          div_nama: divData ? divData.div_nama : '',
          approval_link: approvalLink,
        }, { to: atasanUser.account_email, subject: 'NOTIFIKASI UPLOAD DOKUMEN BARU' }, 'uploadDocument');
      }
    }

    return res.json({ status: 1, content_id, message: 'Dokumen berhasil diupload' });
  } catch (error) {
    await trx.rollback();
    logger(error, 'POST /document/files', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

export const updateDocument = async (req, res) => {
  // #swagger.tags = ['Document']
  /* #swagger.security = [{ "bearerAuth": [] }] */
  const trx = await dbDMS.transaction();
  try {
    const { creator: empidDecrypt, content_id, namafile, description, keywords, jenisfile, duedate, content_kat, content_reminder } = req.body;
    const empid = decrypt(empidDecrypt);
    const doc = await trx('content').where('content_id', content_id).first();
    if (!doc) { await trx.rollback(); return res.status(404).json({ message: 'Dokumen tidak ditemukan' }); }

    const updateData = {};
    if (namafile) updateData.content_name = namafile;
    if (description !== undefined) updateData.content_desc = description;
    if (keywords !== undefined) updateData.content_keywords = keywords;
    if (jenisfile) updateData.content_type = jenisfile;
    if (duedate) updateData.content_duedate = duedate;
    if (content_kat) updateData.arsip_kat = content_kat;
    if (content_reminder) updateData.content_reminder = content_reminder;

    const files = req.files || {};
    const filedoc = files['filedoc'] ? files['filedoc'][0] : (req.file || null);
    if (filedoc) {
      const ext = filedoc.originalname.split('.').pop().toLowerCase();
      if (ext !== 'pdf') { await trx.rollback(); return res.status(406).json({ type: 'error', message: 'File harus berformat PDF' }); }
      const filename = await renameAndUpload(filedoc);
      updateData.content_file = filename;
    }

    await trx('content').where('content_id', content_id).update(updateData);
    await trx.commit();

    // Kirim email notifikasi update
    const ownerUser = await dbDMS('master_user').where('account_username', doc.content_owner).first();
    if (ownerUser && ownerUser.account_email) {
      await sendEmailSafe('document-update.ejs', {
        owner_nama: ownerUser.account_name, nama_dokumen: namafile || doc.content_name,
      }, { to: ownerUser.account_email, subject: 'NOTIFIKASI UPDATE DOKUMEN' }, 'updateDocument');
    }

    return res.json({ status: 1, message: 'Dokumen berhasil diupdate' });
  } catch (error) {
    await trx.rollback();
    logger(error, 'POST /document/files/:id/update', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

export const renewDocument = async (req, res) => {
  // #swagger.tags = ['Document']
  /* #swagger.security = [{ "bearerAuth": [] }] */
  const trx = await dbDMS.transaction();
  try {
    const { creator: empidDecrypt, content_id: old_id, namafile, duedate } = req.body;
    const empid = decrypt(empidDecrypt);
    const oldDoc = await trx('content').where('content_id', old_id).first();
    if (!oldDoc) { await trx.rollback(); return res.status(404).json({ message: 'Dokumen tidak ditemukan' }); }
    if (oldDoc.content_replacedby) { await trx.rollback(); return res.status(406).json({ type: 'error', message: 'Dokumen sudah pernah di-renew' }); }

    const filedoc = req.file;
    if (!filedoc) { await trx.rollback(); return res.status(406).json({ type: 'error', message: 'File PDF baru wajib diupload' }); }
    const filename = await renameAndUpload(filedoc);

    const [new_id] = await trx('content').insert({
      ...oldDoc, content_id: undefined, content_name: namafile || oldDoc.content_name,
      content_file: filename, content_duedate: duedate || oldDoc.content_duedate,
      content_entrydate: trx.fn.now(), content_ver: (oldDoc.content_ver || 1) + 1,
      content_replacedby: null, content_show: 0,
      content_status: 'Masih menunggu persetujuan atasan dokumen owner',
    });

    await trx('content').where('content_id', old_id).update({ content_replacedby: new_id });
    await trx('mapping_filefolder').where('mapping_contentid', old_id).select('mapping_folderid').then(async (rows) => {
      for (const row of rows) {
        await trx('mapping_filefolder').insert({ mapping_contentid: new_id, mapping_folderid: row.mapping_folderid });
      }
    });
    await trx.commit();

    await sendEmailSafe('document-renew.ejs', {
      owner_nama: oldDoc.content_owner, nama_dokumen: namafile || oldDoc.content_name,
    }, { to: '', subject: 'NOTIFIKASI RENEW DOKUMEN' }, 'renewDocument');

    return res.json({ status: 1, new_id, message: 'Dokumen berhasil di-renew' });
  } catch (error) {
    await trx.rollback();
    logger(error, 'POST /document/files/:id/renew', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

export const deleteDocument = async (req, res) => {
  // #swagger.tags = ['Document']
  /* #swagger.security = [{ "bearerAuth": [] }] */
  try {
    const { content_id } = req.body;
    await dbDMS('content').where('content_id', content_id).update({ content_show: 0 });
    return res.json({ status: 1, message: 'Dokumen berhasil dihapus' });
  } catch (error) {
    logger(error, 'POST /document/files/:id/delete', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

export const restoreDocument = async (req, res) => {
  // #swagger.tags = ['Document']
  /* #swagger.security = [{ "bearerAuth": [] }] */
  try {
    const { content_id } = req.body;
    await dbDMS('content').where('content_id', content_id).update({ content_show: 1 });
    return res.json({ status: 1, message: 'Dokumen berhasil di-restore' });
  } catch (error) {
    logger(error, 'POST /document/files/:id/restore', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

/**
 * List deleted documents (content_show = 0)
 * GET /api/dms/document/deleted-files
 */
export const getDeletedDocuments = async (req, res) => {
  try {
    const { empid: empidEnc, domain: bu } = req.query;
    const nik = decrypt(empidEnc);
    const role = await dbDMS('user_grant_role as a').join('master_role as b','a.grant_urole_id','b.role_id')
      .where({'a.grant_user_id': nik, 'a.grant_bu_id': bu, 'b.role_admin': 1}).first();
    const isAdmin = !!role;

    let query = dbDMS('content as c')
      .join('mapping_filefolder as ff', 'c.content_id', 'ff.mapping_contentid')
      .join('folder as f', 'ff.mapping_folderid', 'f.folder_id')
      .leftJoin('master_user as mua', 'c.content_keywords', 'mua.account_username')
      .leftJoin('master_user as mub', 'c.content_owner', 'mub.account_username')
      .leftJoin('master_user as muc', 'c.content_keeper', 'muc.account_username')
      .select('c.content_id', 'c.content_name', 'c.content_keywords', 'c.content_type',
        'c.content_owner', 'c.content_keeper', 'c.content_lastmodified', 'c.content_file',
        'c.content_bu', 'c.content_path', 'f.folder_name', 'f.folder_pathid','mua.account_name as keywords_name',
        'mub.account_name as owner_name','muc.account_name as keeper_name')
      .where('c.content_show', 0)
      .orderBy('c.content_lastmodified', 'desc');

    if (!isAdmin && bu) query = query.where('c.content_bu', bu);

    const result = await query;
    return res.status(200).json({ data: result });
  } catch (error) {
    logger(error, 'GET /document/deleted-files', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

/**
 * List deleted folders (folder_active = 0)
 * GET /api/dms/document/deleted-folders
 */
export const getDeletedFolders = async (req, res) => {
  try {
    const { empid: empidEnc, domain: bu } = req.query;
    const nik = decrypt(empidEnc);
    const role = await dbDMS('user_grant_role as a').join('master_role as b','a.grant_urole_id','b.role_id')
      .where({'a.grant_user_id': nik, 'a.grant_bu_id': bu, 'b.role_admin': 1}).first();
    const isAdmin = !!role;

    let query = dbDMS('folder as f')
      .select('f.folder_id', 'f.folder_name', 'f.folder_pathid', 'f.folder_tingkat',
        'f.folder_security', 'f.folder_lastmodified', 'f.folder_bu')
      .where('f.folder_active', 0)
      .orderBy('f.folder_lastmodified', 'desc');

    if (!isAdmin && bu) query = query.where('f.folder_bu', bu);

    const result = await query;
    return res.status(200).json({ data: result });
  } catch (error) {
    logger(error, 'GET /document/deleted-folders', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

/**
 * Restore a deleted folder (set folder_active = 1)
 * POST /api/dms/document/folders/:id/restore
 */
export const restoreFolder = async (req, res) => {
  try {
    const { id } = req.params;
    await dbDMS('folder').where('folder_id', id).update({ folder_active: 1 });
    return res.json("sukses");
  } catch (error) {
    logger(error, 'POST /document/folders/:id/restore', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

/**
 * Get document history log
 * GET /api/dms/document/files/:id/log
 */
export const getDocumentLog = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await dbDMS.raw(`
      SELECT l.*, emp.employee_name, mu.account_name, emp.employee_photo, emp.map_bu_id
      FROM log l
      LEFT JOIN v_mstr_employee emp ON l.log_nik = emp.employee_id COLLATE SQL_Latin1_General_CP1_CI_AS
      LEFT JOIN master_user mu ON l.log_nik = mu.account_username
      WHERE l.log_contentid = ?
      ORDER BY l.log_date DESC
    `, [id]);
    return res.status(200).json({ data: result });
  } catch (error) {
    logger(error, 'GET /document/files/:id/log', req.params);
    return res.status(406).json(getErrorResponse(error));
  }
};

/**
 * Get document update/feedback history
 * GET /api/dms/document/files/:id/updates
 */
export const getDocumentUpdates = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await dbDMS.raw(`
      SELECT f.*, mu.account_name, emp.employee_name, emp.employee_photo, emp.map_bu_id
      FROM feedback f
      LEFT JOIN master_user mu ON f.update_createdby = mu.account_username
      LEFT JOIN v_mstr_employee emp ON f.update_createdby = emp.employee_id COLLATE SQL_Latin1_General_CP1_CI_AS
      WHERE f.update_contentid = ?
      ORDER BY f.update_date DESC
    `, [id]);
    return res.status(200).json({ data: result });
  } catch (error) {
    logger(error, 'GET /document/files/:id/updates', req.params);
    return res.status(406).json(getErrorResponse(error));
  }
};

/**
 * Post a document update/feedback
 * POST /api/dms/document/files/:id/updates
 */
export const postDocumentUpdate = async (req, res) => {
  try {
    const { id } = req.params;
    const { update: updateText, empid: empidEnc } = req.body;
    if (!updateText || !updateText.trim()) return res.status(406).json({ type: 'error', message: 'Update wajib diisi' });
    const nik = decrypt(empidEnc);
    let attachFilename = '';
    if (req.file) {
      attachFilename = req.file.filename;
    }
    await dbDMS('feedback').insert({
      update_contentid: id,
      update_isi: updateText,
      update_createdby: nik,
      update_date: dbDMS.fn.now(),
      update_attach: attachFilename || null,
    });
    return res.json("sukses");
  } catch (error) {
    logger(error, 'POST /document/files/:id/updates', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

// ─── APPROVAL FLOW ────────────────────────────────────────────────────────────

export const validateApprovalToken = async (req, res) => {
  // #swagger.tags = ['Document']
  try {
    const { token } = req.query;
    if (!token) return res.status(400).json({ message: 'Token wajib diisi' });
    const { nik, content_id } = decodeToken(token);
    const doc = await dbDMS.raw(`
      SELECT c.*, f.folder_name, la.lokasi_arsip_name, mu.account_name as owner_name, mu.account_div_name, mu.account_dir_name, mua.account_name account_name_arsiparis, mua.account_email account_email_arsiparis
      FROM content c
      INNER JOIN mapping_filefolder mff ON c.content_id = mff.mapping_contentid
      INNER JOIN folder f ON mff.mapping_folderid = f.folder_id
      LEFT JOIN mst_lokasi_arsip la ON c.lokasi_arsip_id = la.lokasi_arsip_id
      LEFT JOIN master_user mu ON c.content_owner = mu.account_username
      LEFT JOIN master_user mua ON c.content_arsiparis_lokasi_id = mua.account_username
      WHERE c.content_id = ?`, [content_id]);
    if (!doc || doc.length === 0) return res.status(404).json({ message: 'Dokumen tidak ditemukan' });
    const pendukung = await dbDMS('content_det').where('cdet_content_id', content_id).select('*');
    return res.status(200).json({ data: doc[0], pendukung, nik, content_id });
  } catch (error) {
    logger(error, 'GET /document/approval/validate', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

export const approveByAtasan = async (req, res) => {
  // #swagger.tags = ['Document']
  /* #swagger.security = [{ "bearerAuth": [] }] */
  const trx = await dbDMS.transaction();
  try {
    const { token, action, catatan } = req.body;
    const { nik, content_id } = decodeToken(token);

    const doc = await trx('content').where('content_id', content_id).first();
    if (!doc) { await trx.rollback(); return res.status(404).json({ message: 'Dokumen tidak ditemukan' }); }
    if (doc.content_status !== 'Masih menunggu persetujuan atasan dokumen owner') {
      await trx.rollback(); return res.status(406).json({ type: 'error', message: 'Status dokumen tidak valid' });
    }

    if (action === 'approve') {
      await trx('content').where('content_id', content_id).update({ content_status: 'Menunggu persetujuan arsiparis lokasi' });
      await trx.commit();
      // Kirim email ke arsiparis
      const arsiparis = await dbDMS('master_user').where('account_username', doc.arsiparis_id).first();
      if (arsiparis && arsiparis.account_email) {
        const arsiparisToken = encrypt(`${doc.arsiparis_id};${content_id}`);
        const approvalLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/#/dms/document/approve?token=${arsiparisToken}`;
        await sendEmailSafe('document-approval-arsiparis.ejs', {
          arsiparis_nama: arsiparis.account_name, nama_dokumen: doc.content_name,
          catatan: catatan || '-', approval_link: approvalLink,
        }, { to: arsiparis.account_email, subject: 'NOTIFIKASI UPLOAD DOKUMEN (APPROVE)' }, 'approveByAtasan');
      }
    } else {
      await trx('content').where('content_id', content_id).update({ content_status: 'revisi' });
      await trx.commit();
      const ownerUser = await dbDMS('master_user').where('account_username', doc.content_owner).first();
      if (ownerUser && ownerUser.account_email) {
        const revisiToken = encrypt(`${doc.content_owner};${content_id}`);
        const revisiLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/#/dms/document/revisi?token=${revisiToken}`;

        // Ambil data owner untuk email — cari via account_nik di master_user, lalu lookup ke v_mstr_employee_ext
        let emp = null;
        let divData = null;
        try {
          const empData = await dbDMS.raw(
            `SELECT e.* FROM v_mstr_employee_ext e
             INNER JOIN master_user mu ON e.id = mu.account_nik COLLATE SQL_Latin1_General_CP1_CI_AS
             WHERE mu.account_username = ?`, [doc.content_owner]
          );
          emp = empData && empData.length > 0 ? empData[0] : null;
          if (emp) {
            divData = await dbDMS('v_mstr_div').where('div_pk', emp.id_div).select('div_nama').first();
          }
        } catch (empErr) {
          logger(empErr, 'approveByAtasan-revisi lookup emp', { content_owner: doc.content_owner });
        }

        // Susun jenis dokumen
        const chkJenis = [];
        if (doc.jenis_asli) chkJenis.push('Asli');
        if (doc.jenis_copy) chkJenis.push('Copy / Pdf');
        if (doc.jenis_elektronik) chkJenis.push('Elektronik');

        await sendEmailSafe('document-revisi-owner.ejs', {
          owner_nama: ownerUser.account_name,
          owner_nik: ownerUser.account_nik || doc.content_owner,
          nama_dokumen: doc.content_name,
          content_doc: doc.content_doc || '-',
          no_arsip: doc.arsip_no || '-',
          security: doc.content_security || '-',
          chk_jenis: chkJenis.join(', ') || '-',
          arsip_kat: doc.arsip_kat || '-',
          tgl_doc: doc.tgl_doc ? dayjs(doc.tgl_doc).format('DD/MM/YYYY') : '-',
          div_nama: divData ? divData.div_nama : (emp ? emp.id_div : ''),
          catatan: catatan || '-',
          revisi_link: revisiLink,
        }, { to: ownerUser.account_email, subject: 'NOTIFIKASI UPLOAD DOKUMEN BARU (REVISI)' }, 'approveByAtasan-revisi');
      } else {
        logger({ message: 'Owner email tidak ditemukan' }, 'approveByAtasan-revisi', { content_owner: doc.content_owner });
      }
    }

    return res.json({ status: 1, message: action === 'approve' ? 'Dokumen diapprove' : 'Dokumen dikembalikan untuk revisi' });
  } catch (error) {
    await trx.rollback();
    logger(error, 'POST /document/approval/atasan', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

export const approveByArsiparis = async (req, res) => {
  // #swagger.tags = ['Document']
  /* #swagger.security = [{ "bearerAuth": [] }] */
  const trx = await dbDMS.transaction();
  try {
    const { token, action, catatan, lokasiarsip, lemari_id, handdate, handtime } = req.body;
    const { nik, content_id } = decodeToken(token);

    const doc = await trx('content').where('content_id', content_id).first();
    if (!doc) { await trx.rollback(); return res.status(404).json({ message: 'Dokumen tidak ditemukan' }); }
    if (doc.content_status !== 'Menunggu persetujuan arsiparis lokasi') {
      await trx.rollback(); return res.status(406).json({ type: 'error', message: 'Status dokumen tidak valid' });
    }

    if (action === 'approve') {
      await trx('content').where('content_id', content_id).update({
        content_status: 'Tersedia', content_show: 1,
        lokasi_arsip_id: lokasiarsip || doc.lokasi_arsip_id,
        content_kode_lemari: lemari_id || doc.content_kode_lemari,
        tgl_doc_serah: handdate || doc.tgl_doc_serah,
        content_waktu_doc_serah: handtime || doc.content_waktu_doc_serah,
      });
      await trx.commit();
      // Kirim email ke owner + admin
      const ownerUser = await dbDMS('master_user').where('account_username', doc.content_owner).first();
      if (ownerUser && ownerUser.account_email) {
        await sendEmailSafe('document-approved.ejs', {
          owner_nama: ownerUser.account_name, nama_dokumen: doc.content_name, catatan: catatan || '-',
        }, { to: ownerUser.account_email, subject: 'NOTIFIKASI UPLOAD DOKUMEN (APPROVE)' }, 'approveByArsiparis');
      }
    } else {
      await trx('content').where('content_id', content_id).update({ content_status: 'revisi' });
      await trx.commit();
      const ownerUser = await dbDMS('master_user').where('account_username', doc.content_owner).first();
      if (ownerUser && ownerUser.account_email) {
        const revisiToken = encrypt(`${doc.content_owner};${content_id}`);
        const revisiLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/#/dms/document/revisi?token=${revisiToken}`;

        const empData = await dbDMS.raw(`SELECT * FROM v_mstr_employee_ext WHERE id = ?`, [doc.content_owner]);
        const emp = empData && empData.length > 0 ? empData[0] : null;
        const divData = emp ? await dbDMS('v_mstr_div').where('div_pk', emp.id_div).select('div_nama').first() : null;

        const chkJenis = [];
        if (doc.jenis_asli) chkJenis.push('Asli');
        if (doc.jenis_copy) chkJenis.push('Copy / Pdf');
        if (doc.jenis_elektronik) chkJenis.push('Elektronik');

        await sendEmailSafe('document-revisi-owner.ejs', {
          owner_nama: ownerUser.account_name,
          owner_nik: doc.content_owner,
          nama_dokumen: doc.content_name,
          content_doc: doc.content_doc || '-',
          no_arsip: doc.arsip_no || '-',
          security: doc.content_security || '-',
          chk_jenis: chkJenis.join(', ') || '-',
          arsip_kat: doc.arsip_kat || '-',
          tgl_doc: doc.tgl_doc ? dayjs(doc.tgl_doc).format('DD/MM/YYYY') : '-',
          div_nama: divData ? divData.div_nama : '',
          catatan: catatan || '-',
          revisi_link: revisiLink,
        }, { to: ownerUser.account_email, subject: 'NOTIFIKASI UPLOAD DOKUMEN BARU (REVISI)' }, 'approveByArsiparis-revisi');
      }
    }

    return res.json({ status: 1, message: action === 'approve' ? 'Dokumen diapprove' : 'Dokumen dikembalikan untuk revisi' });
  } catch (error) {
    await trx.rollback();
    logger(error, 'POST /document/approval/arsiparis', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

export const submitRevisi = async (req, res) => {
  // #swagger.tags = ['Document']
  /* #swagger.security = [{ "bearerAuth": [] }] */
  const trx = await dbDMS.transaction();
  try {
    const { token, namafile, description, content_kat, jenisfile, duedate, kondisi_dok, keterangan, lokasiarsip, arsiparis_id, docdate, handdate, handtime, security, content_doc, no_arsip, chk_jenis_1, txt_jenis_1, chk_jenis_2, txt_jenis_2, chk_jenis_3, txt_jenis_3 } = req.body;
    const { nik, content_id } = decodeToken(token);

    const doc = await trx('content').where('content_id', content_id).first();
    if (!doc) { await trx.rollback(); return res.status(404).json({ message: 'Dokumen tidak ditemukan' }); }
    if (doc.content_status.toLowerCase() !== 'revisi') {
      await trx.rollback(); return res.status(406).json({ type: 'error', message: 'Status dokumen tidak valid untuk revisi' });
    }

    const updateData = {
      content_name: namafile || doc.content_name, content_desc: description || doc.content_desc,
      content_doc: content_doc !== undefined ? content_doc : doc.content_doc,
      arsip_no: no_arsip || doc.arsip_no,
      arsip_kat: content_kat || doc.arsip_kat, content_type: jenisfile || doc.content_type,
      content_duedate: duedate || doc.content_duedate, kondisi_doc: kondisi_dok || doc.kondisi_doc,
      kondisi_doc_ket: keterangan || doc.kondisi_doc_ket, lokasi_arsip_id: lokasiarsip || doc.lokasi_arsip_id,
      content_arsiparis_lokasi_id: arsiparis_id || doc.content_arsiparis_lokasi_id, tgl_doc: docdate || doc.tgl_doc,
      tgl_doc_serah: handdate || doc.tgl_doc_serah, content_waktu_doc_serah: handtime || doc.content_waktu_doc_serah,
      content_security: security || doc.content_security,
      jenis_asli: chk_jenis_1 ? 1 : 0, jenis_asli_qty: parseInt(txt_jenis_1) || 0,
      jenis_copy: chk_jenis_2 ? 1 : 0, jenis_copy_qty: parseInt(txt_jenis_2) || 0,
      jenis_elektronik: chk_jenis_3 ? 1 : 0, jenis_elektronik_qty: parseInt(txt_jenis_3) || 0,
      content_status: 'Masih menunggu persetujuan atasan dokumen owner',
    };

    const filedoc = req.file;
    if (filedoc) {
      const ext = filedoc.originalname.split('.').pop().toLowerCase();
      if (ext !== 'pdf') { await trx.rollback(); return res.status(406).json({ type: 'error', message: 'File harus berformat PDF' }); }
      const filename = await renameAndUpload(filedoc);
      updateData.content_file = filename;
    }

    await trx('content').where('content_id', content_id).update(updateData);
    await trx.commit();

    // Kirim email ke atasan (format sesuai PHP templateRevisi — ke atasan untuk approval ulang)
    let emp = null;
    let atasanNik = null;
    try {
      const empData = await dbDMS.raw(
        `SELECT e.* FROM v_mstr_employee_ext e
         INNER JOIN master_user mu ON e.id = mu.account_nik COLLATE SQL_Latin1_General_CP1_CI_AS
         WHERE mu.account_username = ?`, [nik]
      );
      emp = empData && empData.length > 0 ? empData[0] : null;
      atasanNik = emp ? emp.id_atasan : null;
    } catch (empErr) {
      logger(empErr, 'submitRevisi lookup emp', { nik });
    }

    if (atasanNik) {
      const atasanUser = await dbDMS('master_user').where('account_username', atasanNik).first();
      if (atasanUser && atasanUser.account_email) {
        const approvalToken = encrypt(`${atasanNik};${content_id}`);
        const approvalLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/#/dms/document/approval?token=${approvalToken}`;

        // Susun jenis dokumen
        const updatedDoc = await dbDMS('content').where('content_id', content_id).first();
        const chkJenis = [];
        if (updatedDoc?.jenis_asli) chkJenis.push('Asli');
        if (updatedDoc?.jenis_copy) chkJenis.push('Copy / Pdf');
        if (updatedDoc?.jenis_elektronik) chkJenis.push('Elektronik');

        const divData = emp ? await dbDMS('v_mstr_div').where('div_pk', emp.id_div).select('div_nama').first() : null;

        await sendEmailSafe('document-upload-atasan.ejs', {
          atasan_nama: atasanUser.account_name,
          nama_dokumen: namafile || doc.content_name,
          content_doc: (content_doc !== undefined ? content_doc : doc.content_doc) || '-',
          no_arsip: no_arsip || doc.arsip_no || '-',
          security: security || doc.content_security || '-',
          chk_jenis: chkJenis.join(', ') || '-',
          content_kat: content_kat || doc.arsip_kat || '-',
          docdate: docdate || (doc.tgl_doc ? dayjs(doc.tgl_doc).format('DD/MM/YYYY') : '-'),
          owner_nama: emp ? emp.nama : nik,
          owner_nik: emp ? emp.id : nik,
          div_nama: divData ? divData.div_nama : '',
          approval_link: approvalLink,
        }, { to: atasanUser.account_email, subject: 'NOTIFIKASI UPLOAD DOKUMEN BARU (REVISI)' }, 'submitRevisi');
      } else {
        logger({ message: 'Atasan email tidak ditemukan' }, 'submitRevisi', { atasanNik });
      }
    } else {
      logger({ message: 'Atasan tidak ditemukan' }, 'submitRevisi', { nik });
    }

    return res.json({ status: 1, message: 'Revisi berhasil disubmit' });
  } catch (error) {
    await trx.rollback();
    logger(error, 'POST /document/approval/revisi', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

// ─── KEEPER ───────────────────────────────────────────────────────────────────

export const confirmKeeper = async (req, res) => {
  // #swagger.tags = ['Document']
  try {
    const { content_id, keeper_nik } = req.body;
    await dbDMS('content').where('content_id', content_id).update({ content_statuskeeper: 1 });
    const doc = await dbDMS('content').where('content_id', content_id).first();
    const ownerUser = await dbDMS('master_user').where('account_username', doc?.content_owner).first();
    if (ownerUser && ownerUser.account_email) {
      await sendEmailSafe('document-keeper-confirm.ejs', {
        owner_nama: ownerUser.account_name, keeper_nik, nama_dokumen: doc?.content_name,
      }, { to: ownerUser.account_email, subject: 'NOTIFIKASI KONFIRMASI KEEPER' }, 'confirmKeeper');
    }
    return res.json({ status: 1, message: 'Keeper berhasil dikonfirmasi' });
  } catch (error) {
    logger(error, 'POST /document/keeper/confirm', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

export const rejectKeeper = async (req, res) => {
  // #swagger.tags = ['Document']
  try {
    const { content_id, keeper_nik, reason } = req.body;
    if (!reason) return res.status(406).json({ type: 'error', message: 'Alasan penolakan wajib diisi' });
    await dbDMS('content').where('content_id', content_id).update({ content_statuskeeper: 2, content_ket: reason });
    const doc = await dbDMS('content').where('content_id', content_id).first();
    const ownerUser = await dbDMS('master_user').where('account_username', doc?.content_owner).first();
    if (ownerUser && ownerUser.account_email) {
      await sendEmailSafe('document-keeper-reject.ejs', {
        owner_nama: ownerUser.account_name, keeper_nik, nama_dokumen: doc?.content_name, reason,
      }, { to: ownerUser.account_email, subject: 'NOTIFIKASI PENOLAKAN KEEPER' }, 'rejectKeeper');
    }
    return res.json({ status: 1, message: 'Keeper berhasil ditolak' });
  } catch (error) {
    logger(error, 'POST /document/keeper/reject', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

// ─── PERMISSION ───────────────────────────────────────────────────────────────

export const getFolderPermissions = async (req, res) => {
  // #swagger.tags = ['Document']
  /* #swagger.security = [{ "bearerAuth": [] }] */
  try {
    const { id } = req.params;
    const result = await dbDMS('mapping_aksesfolder').where('aksesfolder_folderid', id).select('*');
    return res.status(200).json(result);
  } catch (error) {
    logger(error, 'GET /document/folders/:id/permissions', req.params);
    return res.status(406).json(getErrorResponse(error));
  }
};

export const addFolderPermission = async (req, res) => {
  // #swagger.tags = ['Document']
  /* #swagger.security = [{ "bearerAuth": [] }] */
  try {
    const { id } = req.params;
    const { aksesfolder_nik, aksesfolder_div, aksesfolder_bu, aksesfolder_view, aksesfolder_upload, aksesfolder_manage } = req.body;
    await dbDMS('mapping_aksesfolder').insert({
      aksesfolder_folderid: id, aksesfolder_nik: aksesfolder_nik || null,
      aksesfolder_div: aksesfolder_div || null, aksesfolder_bu: aksesfolder_bu || null,
      aksesfolder_view: aksesfolder_view ? 1 : 0, aksesfolder_upload: aksesfolder_upload ? 1 : 0,
      aksesfolder_manage: aksesfolder_manage ? 1 : 0,
    });
    return res.json({ status: 1, message: 'Permission folder berhasil ditambahkan' });
  } catch (error) {
    logger(error, 'POST /document/folders/:id/permissions', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

export const updateFolderPermission = async (req, res) => {
  // #swagger.tags = ['Document']
  /* #swagger.security = [{ "bearerAuth": [] }] */
  try {
    const { permId } = req.params;
    const { aksesfolder_view, aksesfolder_upload, aksesfolder_manage } = req.body;
    await dbDMS('mapping_aksesfolder').where('aksesfolder_id', permId).update({
      aksesfolder_view: aksesfolder_view ? 1 : 0,
      aksesfolder_upload: aksesfolder_upload ? 1 : 0,
      aksesfolder_manage: aksesfolder_manage ? 1 : 0,
    });
    return res.json({ status: 1, message: 'Permission folder berhasil diupdate' });
  } catch (error) {
    logger(error, 'PUT /document/folders/permissions/:permId', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

export const deleteFolderPermission = async (req, res) => {
  // #swagger.tags = ['Document']
  /* #swagger.security = [{ "bearerAuth": [] }] */
  try {
    const { permId } = req.params;
    await dbDMS('mapping_aksesfolder').where('aksesfolder_id', permId).delete();
    return res.json({ status: 1, message: 'Permission folder berhasil dihapus' });
  } catch (error) {
    logger(error, 'DELETE /document/folders/permissions/:permId', req.params);
    return res.status(406).json(getErrorResponse(error));
  }
};

export const getFilePermissions = async (req, res) => {
  // #swagger.tags = ['Document']
  /* #swagger.security = [{ "bearerAuth": [] }] */
  try {
    const { id } = req.params;
    const result = await dbDMS('mapping_aksesfile').where('aksesfile_contentid', id).select('*');
    return res.status(200).json(result);
  } catch (error) {
    logger(error, 'GET /document/files/:id/permissions', req.params);
    return res.status(406).json(getErrorResponse(error));
  }
};

export const addFilePermission = async (req, res) => {
  // #swagger.tags = ['Document']
  /* #swagger.security = [{ "bearerAuth": [] }] */
  try {
    const { id } = req.params;
    const { aksesfile_nik, aksesfile_div, aksesfile_bu, aksesfile_view, aksesfile_download, aksesfile_delete, aksesfile_upload } = req.body;
    await dbDMS('mapping_aksesfile').insert({
      aksesfile_contentid: id, aksesfile_nik: aksesfile_nik || null,
      aksesfile_div: aksesfile_div || null, aksesfile_bu: aksesfile_bu || null,
      aksesfile_view: aksesfile_view ? 1 : 0, aksesfile_download: aksesfile_download ? 1 : 0,
      aksesfile_delete: aksesfile_delete ? 1 : 0, aksesfile_upload: aksesfile_upload ? 1 : 0,
    });
    return res.json({ status: 1, message: 'Permission file berhasil ditambahkan' });
  } catch (error) {
    logger(error, 'POST /document/files/:id/permissions', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

export const updateFilePermission = async (req, res) => {
  // #swagger.tags = ['Document']
  /* #swagger.security = [{ "bearerAuth": [] }] */
  try {
    const { permId } = req.params;
    const { aksesfile_view, aksesfile_download, aksesfile_delete, aksesfile_upload } = req.body;
    await dbDMS('mapping_aksesfile').where('aksesfile_id', permId).update({
      aksesfile_view: aksesfile_view ? 1 : 0, aksesfile_download: aksesfile_download ? 1 : 0,
      aksesfile_delete: aksesfile_delete ? 1 : 0, aksesfile_upload: aksesfile_upload ? 1 : 0,
    });
    return res.json({ status: 1, message: 'Permission file berhasil diupdate' });
  } catch (error) {
    logger(error, 'PUT /document/files/permissions/:permId', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

export const deleteFilePermission = async (req, res) => {
  // #swagger.tags = ['Document']
  /* #swagger.security = [{ "bearerAuth": [] }] */
  try {
    const { permId } = req.params;
    await dbDMS('mapping_aksesfile').where('aksesfile_id', permId).delete();
    return res.json({ status: 1, message: 'Permission file berhasil dihapus' });
  } catch (error) {
    logger(error, 'DELETE /document/files/permissions/:permId', req.params);
    return res.status(406).json(getErrorResponse(error));
  }
};

// ─── DOWNLOAD LOG ─────────────────────────────────────────────────────────────

export const saveDownloadLog = async (req, res) => {
  // #swagger.tags = ['Document']
  /* #swagger.security = [{ "bearerAuth": [] }] */
  try {
    const { content_id, empid: empidDecrypt } = req.body;
    const empid = decrypt(empidDecrypt);
    await dbDMS('log_download').insert({ log_content_id: content_id, log_user_id: empid, log_tgl: dbDMS.fn.now() });
    return res.json({ status: 1, message: 'Log download tersimpan' });
  } catch (error) {
    logger(error, 'POST /document/download-log', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

export const checkDownloadLog = async (req, res) => {
  // #swagger.tags = ['Document']
  /* #swagger.security = [{ "bearerAuth": [] }] */
  try {
    const { content_id, empid: empidDecrypt } = req.query;
    const empid = decrypt(empidDecrypt);
    const log = await dbDMS('log_download').where({ log_content_id: content_id, log_user_id: empid }).first();
    return res.status(200).json({ sudah_download: !!log, log });
  } catch (error) {
    logger(error, 'GET /document/download-log/check', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

export const saveDownloadLogPinjam = async (req, res) => {
  // #swagger.tags = ['Document']
  /* #swagger.security = [{ "bearerAuth": [] }] */
  try {
    const { content_id, empid: empidDecrypt, no_tiket } = req.body;
    const empid = decrypt(empidDecrypt);
    if (!no_tiket) return res.status(406).json({ type: 'error', message: 'Nomor tiket wajib diisi' });

    const tiket = await dbDMS.raw(`
      SELECT * FROM trs_permintaan_arsip
      WHERE pinjam_no_tiket = ? AND pinjam_user_id = ?
        AND pinjam_status NOT IN ('Melewati Waktu Download', 'Sudah download')
        AND CONVERT(VARCHAR(10), pinjam_tgl_est_ambil_to, 120) >= CONVERT(VARCHAR(10), GETDATE(), 120)
    `, [no_tiket, empid]);

    if (!tiket || tiket.length === 0) return res.status(406).json({ type: 'error', message: 'Tiket tidak valid atau sudah melewati waktu download' });

    await dbDMS('log_download').insert({ log_content_id: content_id, log_user_id: empid, log_no_tiket: no_tiket, log_tgl: dbDMS.fn.now() });
    return res.json({ status: 1, message: 'Log download tersimpan', valid: true });
  } catch (error) {
    logger(error, 'POST /document/download-log/pinjam', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

// ─── SEARCH & REPORT ─────────────────────────────────────────────────────────

export const searchDocuments = async (req, res) => {
  // #swagger.tags = ['Document']
  /* #swagger.security = [{ "bearerAuth": [] }] */
  try {
    const { nama_arsip, nomor_dok_arsip, pilihbu, lokasi_penyimpanan_arsip, masa_berlaku_arsip, periode_from, periode_to, empid: empidDecrypt } = req.query;
    const empid = decrypt(empidDecrypt);

    let query = dbDMS('content as c')
      .leftJoin('mapping_filefolder as mff', 'c.content_id', 'mff.mapping_contentid')
      .leftJoin('folder as f', 'mff.mapping_folderid', 'f.folder_id')
      .leftJoin('mst_lokasi_arsip as la', 'c.lokasi_arsip_id', 'la.lokasi_arsip_id')
      .leftJoin(dbDMS.raw('v_mstr_employee as emp ON cast(c.content_arsiparis_lokasi_id as varchar(100)) = emp.employee_pk COLLATE SQL_Latin1_General_CP1_CI_AS'))
      .leftJoin(dbDMS.raw('v_mstr_bu as bu ON c.content_bu = bu.bu_id COLLATE SQL_Latin1_General_CP1_CI_AS'))
      .leftJoin(dbDMS.raw('v_mstr_div as div ON c.content_div = div.div_id COLLATE SQL_Latin1_General_CP1_CI_AS'))
      .leftJoin('mst_sub_categ_arsip as sa', 'c.content_sub_arsip_id', 'sa.sub_arsip_id')
      .leftJoin(dbDMS.raw('master_user as mu ON c.content_owner = mu.account_username'))
      .select(
        'c.content_id', 'c.content_name', 'c.content_doc', 'c.arsip_no', 'c.arsip_kat',
        'c.content_security', 'c.content_status', 'c.content_type', 'c.content_duedate',
        'c.tgl_doc', 'c.jenis_asli_qty', 'c.jenis_copy_qty', 'c.jenis_elektronik_qty',
        'c.content_pengaduan_rusak', 'c.content_file',
        'la.lokasi_arsip_name', 'emp.employee_name as arsiparis_name',
        'bu.bu_name', 'div.div_nama', 'sa.sub_arsip_jenis as sub_arsip_categ',
        'mu.account_name as owner_name', 'c.content_kode_lemari',
        dbDMS.raw(`(SELECT COUNT(*) FROM content_det WHERE cdet_content_id = c.content_id) as dok_pendukung_qty`)
      )
      .where('c.content_show', 1);

    if (nama_arsip) query.where('c.content_name', 'like', `%${nama_arsip}%`);
    if (nomor_dok_arsip) query.where('c.content_doc', 'like', `%${nomor_dok_arsip}%`);
    if (pilihbu) query.where('c.content_bu', pilihbu);
    if (lokasi_penyimpanan_arsip) query.where('c.lokasi_arsip_id', lokasi_penyimpanan_arsip);
    if (masa_berlaku_arsip === 'Active') query.where(q => q.whereNull('c.content_duedate').orWhere('c.content_duedate', '1900-01-01').orWhereRaw("c.content_duedate >= CONVERT(VARCHAR(10), GETDATE(), 120)"));
    if (masa_berlaku_arsip === 'In Active') query.whereRaw("c.content_duedate < CONVERT(VARCHAR(10), GETDATE(), 120)").whereNotIn('c.content_duedate', ['', '1900-01-01']);
    if (periode_from) query.whereRaw("CONVERT(VARCHAR(10), c.tgl_doc, 120) >= ?", [periode_from]);
    if (periode_to) query.whereRaw("CONVERT(VARCHAR(10), c.tgl_doc, 120) <= ?", [periode_to]);

    const result = await query.orderBy('c.content_name');
    return res.status(200).json(result);
  } catch (error) {
    logger(error, 'GET /document/search', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

export const getDMSReport = async (req, res) => {
  // #swagger.tags = ['Document']
  /* #swagger.security = [{ "bearerAuth": [] }] */
  try {
    const result = await dbDMS('dms_report_target as t')
      .leftJoin(dbDMS.raw('v_mstr_bu as bu ON t.bu_id = bu.bu_id COLLATE SQL_Latin1_General_CP1_CI_AS'))
      .select('t.*', 'bu.bu_name')
      .orderBy('bu.bu_name');
    return res.status(200).json(result);
  } catch (error) {
    logger(error, 'GET /document/report', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

export const updateDMSTarget = async (req, res) => {
  // #swagger.tags = ['Document']
  /* #swagger.security = [{ "bearerAuth": [] }] */
  try {
    const { targets } = req.body;
    for (const [bu_id, nilai] of Object.entries(targets)) {
      await dbDMS('dms_report_target').where('bu_id', bu_id).update({ target: nilai });
    }
    return res.json({ status: 1, message: 'Target berhasil diupdate' });
  } catch (error) {
    logger(error, 'POST /document/report/target', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

export const getRenewableReport = async (req, res) => {
  // #swagger.tags = ['Document']
  /* #swagger.security = [{ "bearerAuth": [] }] */
  try {
    const { bu_id, periode_from, periode_to } = req.query;
    let query = dbDMS('content as c')
      .leftJoin('mst_lokasi_arsip as la', 'c.lokasi_arsip_id', 'la.lokasi_arsip_id')
      .leftJoin(dbDMS.raw('master_user as mu ON c.content_owner = mu.account_username'))
      .select('c.*', 'la.lokasi_arsip_name', 'mu.account_name as owner_name')
      .where({ 'c.content_type': 'renewable', 'c.content_show': 1 });
    if (bu_id) query.where('c.content_bu', bu_id);
    if (periode_from && periode_to) query.whereBetween('c.content_duedate', [periode_from, periode_to]);
    const result = await query.orderBy('c.content_duedate');
    return res.status(200).json(result);
  } catch (error) {
    logger(error, 'GET /document/report/renewable', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

/**
 * Renewable report — full version matching PHP getdatareport
 * GET /api/dms/document/report-renewable
 */
export const getReportRenewableFull = async (req, res) => {
  try {
    const { bu_id, empid: empidEnc, domain: bu } = req.query;
    const nik = decrypt(empidEnc);
    const role = await dbDMS('user_grant_role as a').join('master_role as b','a.grant_urole_id','b.role_id')
      .where({'a.grant_user_id': nik, 'a.grant_bu_id': bu, 'b.role_admin': 1}).first();
    const isAdmin = !!role;

    const buFilter = bu_id ? "AND c.content_bu = '" + bu_id.replace(/'/g, "''") + "'"
      : !isAdmin && bu ? "AND f.folder_bu = '" + bu.replace(/'/g, "''") + "'" : '';

    const result = await dbDMS.raw(`
      SELECT c.content_id, c.content_name, c.content_desc, c.content_owner, c.content_keeper,
        c.content_bu, c.content_div, c.content_type, c.content_duedate,
        c.content_entrydate, c.content_lastmodified, c.content_file,
        f.folder_name, f.folder_pathid, f.folder_tingkat,
        bu.bu_name, dv.div_nama,
        mu_o.account_name as owner_name, mu_k.account_name as keeper_name,
        (SELECT TOP 1 update_date FROM feedback WHERE update_contentid = c.content_id ORDER BY update_date DESC) as last_update
      FROM content c
        INNER JOIN mapping_filefolder ff ON c.content_id = ff.mapping_contentid
        INNER JOIN folder f ON ff.mapping_folderid = f.folder_id
        LEFT JOIN v_mstr_bu bu ON c.content_bu = bu.bu_id COLLATE SQL_Latin1_General_CP1_CI_AS
        LEFT JOIN v_mstr_div dv ON c.content_div = dv.div_id COLLATE SQL_Latin1_General_CP1_CI_AS
        LEFT JOIN master_user mu_o ON c.content_owner = mu_o.account_username
        LEFT JOIN master_user mu_k ON c.content_keeper = mu_k.account_username
      WHERE c.content_type = 'renewable' AND c.content_show = 1 AND c.content_active = 1
        ${buFilter}
      ORDER BY f.folder_tingkat
    `);
    return res.status(200).json({ data: result });
  } catch (error) {
    logger(error, 'GET /document/report-renewable', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

/**
 * Export renewable report to Excel
 * GET /api/dms/document/report-renewable/export-excel
 */
export const exportRenewableExcel = async (req, res) => {
  try {
    const { bu_id, empid: empidEnc, domain: bu } = req.query;
    const nik = decrypt(empidEnc);
    const role = await dbDMS('user_grant_role as a').join('master_role as b','a.grant_urole_id','b.role_id')
      .where({'a.grant_user_id': nik, 'a.grant_bu_id': bu, 'b.role_admin': 1}).first();
    const isAdmin = !!role;

    const buFilter = bu_id ? "AND c.content_bu = '" + bu_id.replace(/'/g, "''") + "'"
      : !isAdmin && bu ? "AND f.folder_bu = '" + bu.replace(/'/g, "''") + "'" : '';

    const result = await dbDMS.raw(`
      SELECT c.content_id, c.content_name, c.content_desc, c.content_owner, c.content_keeper,
        c.content_bu, c.content_div, c.content_duedate, c.content_entrydate, c.content_lastmodified,
        f.folder_name, bu.bu_name, dv.div_nama,
        mu_o.account_name as owner_name, mu_k.account_name as keeper_name,
        (SELECT TOP 1 update_date FROM feedback WHERE update_contentid = c.content_id ORDER BY update_date DESC) as last_update
      FROM content c
        INNER JOIN mapping_filefolder ff ON c.content_id = ff.mapping_contentid
        INNER JOIN folder f ON ff.mapping_folderid = f.folder_id
        LEFT JOIN v_mstr_bu bu ON c.content_bu = bu.bu_id COLLATE SQL_Latin1_General_CP1_CI_AS
        LEFT JOIN v_mstr_div dv ON c.content_div = dv.div_id COLLATE SQL_Latin1_General_CP1_CI_AS
        LEFT JOIN master_user mu_o ON c.content_owner = mu_o.account_username
        LEFT JOIN master_user mu_k ON c.content_keeper = mu_k.account_username
      WHERE c.content_type = 'renewable' AND c.content_show = 1 AND c.content_active = 1
        ${buFilter}
      ORDER BY f.folder_tingkat
    `);

    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.default.Workbook();
    const sheet = workbook.addWorksheet('Report Renewable');
    sheet.columns = [
      { width: 30 },{ width: 20 },{ width: 18 },{ width: 18 },{ width: 30 },
      { width: 20 },{ width: 20 },{ width: 20 },{ width: 20 },{ width: 20 },
      { width: 14 },{ width: 10 },
    ];
    sheet.mergeCells('A1:L1');
    const titleCell = sheet.getCell('A1');
    titleCell.value = 'Report Renewable Documents';
    titleCell.font = { size: 14, bold: true };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getRow(1).height = 30;

    const headers = ['Nama Document','Folder','Business Unit','Divisi','Description','Owner','Keeper','Date Created','Last Modified','Last Update','Due Date','Status'];
    const headerRow = sheet.addRow(headers);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = { top:{style:'thin'}, bottom:{style:'thin'}, left:{style:'thin'}, right:{style:'thin'} };
    });

    result.forEach((r, i) => {
      const days = r.content_duedate ? dayjs(r.content_duedate).diff(dayjs(), 'day') : 999;
      const status = days <= 30 ? 'Merah' : days <= 60 ? 'Kuning' : days <= 90 ? 'Hijau' : 'Putih';
      const row = sheet.addRow([
        r.content_name || '', r.folder_name || '', r.bu_name || '', r.div_nama || '',
        r.content_desc || '', r.owner_name || r.content_owner || '', r.keeper_name || r.content_keeper || '',
        r.content_entrydate ? dayjs(String(r.content_entrydate).replace('Z', '')).format('DD/MM/YYYY HH:mm:ss') : '',
        r.content_lastmodified ? dayjs(String(r.content_lastmodified).replace('Z', '')).format('DD/MM/YYYY HH:mm:ss') : '',
        r.last_update ? dayjs(String(r.last_update).replace('Z', '')).format('DD/MM/YYYY HH:mm:ss') : 'Belum ada update',
        r.content_duedate ? dayjs(r.content_duedate).format('DD/MM/YYYY') : '', status,
      ]);
      const bgColor = days <= 30 ? 'FFFFCDD2' : days <= 60 ? 'FFFFF9C4' : days <= 90 ? 'FFC8E6C9' : null;
      row.eachCell((cell) => {
        cell.border = { top:{style:'thin',color:{argb:'FF888888'}}, bottom:{style:'thin',color:{argb:'FF888888'}}, left:{style:'thin',color:{argb:'FF888888'}}, right:{style:'thin',color:{argb:'FF888888'}} };
        if (bgColor) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
      });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=Report_Renewable_${dayjs().format('YYYYMMDD')}.xlsx`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    logger(error, 'GET /document/report-renewable/export-excel', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

/**
 * Export renewable report to CSV
 * GET /api/dms/document/report-renewable/export-csv
 */
export const exportRenewableCsv = async (req, res) => {
  try {
    const { bu_id, empid: empidEnc, domain: bu } = req.query;
    const nik = decrypt(empidEnc);
    const role = await dbDMS('user_grant_role as a').join('master_role as b','a.grant_urole_id','b.role_id')
      .where({'a.grant_user_id': nik, 'a.grant_bu_id': bu, 'b.role_admin': 1}).first();
    const isAdmin = !!role;
    const buFilter = bu_id ? "AND c.content_bu = '" + bu_id.replace(/'/g, "''") + "'"
      : !isAdmin && bu ? "AND f.folder_bu = '" + bu.replace(/'/g, "''") + "'" : '';

    const result = await dbDMS.raw(`
      SELECT c.content_name, c.content_desc, c.content_owner, c.content_keeper,
        c.content_duedate, c.content_entrydate, c.content_lastmodified,
        f.folder_name, bu.bu_name, dv.div_nama,
        mu_o.account_name as owner_name, mu_k.account_name as keeper_name,
        (SELECT TOP 1 update_date FROM feedback WHERE update_contentid = c.content_id ORDER BY update_date DESC) as last_update
      FROM content c
        INNER JOIN mapping_filefolder ff ON c.content_id = ff.mapping_contentid
        INNER JOIN folder f ON ff.mapping_folderid = f.folder_id
        LEFT JOIN v_mstr_bu bu ON c.content_bu = bu.bu_id COLLATE SQL_Latin1_General_CP1_CI_AS
        LEFT JOIN v_mstr_div dv ON c.content_div = dv.div_id COLLATE SQL_Latin1_General_CP1_CI_AS
        LEFT JOIN master_user mu_o ON c.content_owner = mu_o.account_username
        LEFT JOIN master_user mu_k ON c.content_keeper = mu_k.account_username
      WHERE c.content_type = 'renewable' AND c.content_show = 1 AND c.content_active = 1
        ${buFilter}
      ORDER BY f.folder_tingkat
    `);

    const headers = ['Nama Document','Folder','Business Unit','Divisi','Description','Owner','Keeper','Date Created','Last Modified','Last Update','Due Date','Status'];
    const csvEscape = (v) => { const s = String(v ?? ''); return s.includes(',') || s.includes('"') || s.includes('\n') ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const fmtD = (v) => v ? dayjs(String(v).replace('Z', '')).format('DD/MM/YYYY HH:mm:ss') : '';

    const rows = result.map(r => {
      const days = r.content_duedate ? dayjs(r.content_duedate).diff(dayjs(), 'day') : 999;
      const status = days <= 30 ? 'Merah' : days <= 60 ? 'Kuning' : days <= 90 ? 'Hijau' : 'Putih';
      return [r.content_name, r.folder_name, r.bu_name, r.div_nama, r.content_desc,
        r.owner_name || r.content_owner, r.keeper_name || r.content_keeper,
        fmtD(r.content_entrydate), fmtD(r.content_lastmodified),
        r.last_update ? fmtD(r.last_update) : 'Belum ada update',
        r.content_duedate ? dayjs(r.content_duedate).format('DD/MM/YYYY') : '', status
      ].map(csvEscape).join(',');
    });

    const csv = [headers.join(','), ...rows].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=Report_Renewable_${dayjs().format('YYYYMMDD')}.csv`);
    res.send('\uFEFF' + csv);
  } catch (error) {
    logger(error, 'GET /document/report-renewable/export-csv', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

/**
 * Export renewable report to PDF
 * GET /api/dms/document/report-renewable/export-pdf
 */
export const exportRenewablePdf = async (req, res) => {
  try {
    const { bu_id, empid: empidEnc, domain: bu } = req.query;
    const nik = decrypt(empidEnc);
    const role = await dbDMS('user_grant_role as a').join('master_role as b','a.grant_urole_id','b.role_id')
      .where({'a.grant_user_id': nik, 'a.grant_bu_id': bu, 'b.role_admin': 1}).first();
    const isAdmin = !!role;

    const buFilter = bu_id ? "AND c.content_bu = '" + bu_id.replace(/'/g, "''") + "'"
      : !isAdmin && bu ? "AND f.folder_bu = '" + bu.replace(/'/g, "''") + "'" : '';

    const result = await dbDMS.raw(`
      SELECT c.content_name, c.content_desc, c.content_owner, c.content_keeper,
        c.content_duedate, c.content_entrydate, c.content_lastmodified,
        f.folder_name, bu.bu_name, dv.div_nama,
        mu_o.account_name as owner_name, mu_k.account_name as keeper_name,
        (SELECT TOP 1 update_date FROM feedback WHERE update_contentid = c.content_id ORDER BY update_date DESC) as last_update
      FROM content c
        INNER JOIN mapping_filefolder ff ON c.content_id = ff.mapping_contentid
        INNER JOIN folder f ON ff.mapping_folderid = f.folder_id
        LEFT JOIN v_mstr_bu bu ON c.content_bu = bu.bu_id COLLATE SQL_Latin1_General_CP1_CI_AS
        LEFT JOIN v_mstr_div dv ON c.content_div = dv.div_id COLLATE SQL_Latin1_General_CP1_CI_AS
        LEFT JOIN master_user mu_o ON c.content_owner = mu_o.account_username
        LEFT JOIN master_user mu_k ON c.content_keeper = mu_k.account_username
      WHERE c.content_type = 'renewable' AND c.content_show = 1 AND c.content_active = 1
        ${buFilter}
      ORDER BY f.folder_tingkat
    `);

    const PdfPrinter = (await import('pdfmake')).default;
    const __filename2 = fileURLToPath(import.meta.url);
    const __dirname2 = path.dirname(__filename2);
    const fontPath = path.join(__dirname2, '../../view/pdf');
    const fonts = {
      Roboto: {
        normal: path.join(fontPath, 'Roboto-Regular.ttf'), bold: path.join(fontPath, 'Roboto-Medium.ttf'),
        italics: path.join(fontPath, 'Roboto-Italic.ttf'), bolditalics: path.join(fontPath, 'Roboto-MediumItalic.ttf')
      }
    };
    const printer = new PdfPrinter(fonts);

    const tableBody = [
      ['Nama Document','Folder','BU','Divisi','Owner','Keeper','Due Date','Status'].map(t => ({ text: t, style: 'tableHeader' })),
      ...result.map(r => {
        const days = r.content_duedate ? dayjs(r.content_duedate).diff(dayjs(), 'day') : 999;
        const status = days <= 30 ? 'Merah' : days <= 60 ? 'Kuning' : days <= 90 ? 'Hijau' : 'Putih';
        const bg = days <= 30 ? '#ffcdd2' : days <= 60 ? '#fff9c4' : days <= 90 ? '#c8e6c9' : null;
        const cells = [
          r.content_name || '', r.folder_name || '', r.bu_name || '', r.div_nama || '',
          r.owner_name || r.content_owner || '', r.keeper_name || r.content_keeper || '',
          r.content_duedate ? dayjs(r.content_duedate).format('DD/MM/YYYY') : '', status,
        ];
        return cells.map(c => bg ? { text: c, fillColor: bg } : c);
      })
    ];

    const docDefinition = {
      pageOrientation: 'landscape', pageSize: 'A4', pageMargins: [20, 30, 20, 30],
      content: [
        { text: 'Report Renewable Documents', style: 'header', alignment: 'center', margin: [0,0,0,10] },
        { table: { headerRows: 1, widths: ['*','auto','auto','auto','auto','auto','auto','auto'], body: tableBody },
          layout: { hLineWidth:()=>0.5, vLineWidth:()=>0.5, hLineColor:()=>'#888', vLineColor:()=>'#888', paddingLeft:()=>4, paddingRight:()=>4, paddingTop:()=>2, paddingBottom:()=>2 }
        }
      ],
      styles: { header: { fontSize: 13, bold: true }, tableHeader: { bold: true, fontSize: 8, fillColor: '#e0e0e0' } },
      defaultStyle: { fontSize: 7, font: 'Roboto' }
    };

    const pdfDoc = printer.createPdfKitDocument(docDefinition);
    const filename = `Report_Renewable_${dayjs().format('YYYYMMDD_HHmmss')}.pdf`;
    const pdfDir = path.join(__dirname2, '../../file/pdf');
    if (!fs.existsSync(pdfDir)) fs.mkdirSync(pdfDir, { recursive: true });
    const filepath = path.join(pdfDir, filename);
    const writeStream = fs.createWriteStream(filepath);
    pdfDoc.pipe(writeStream);
    pdfDoc.end();
    await new Promise((resolve, reject) => { writeStream.on('finish', resolve); writeStream.on('error', reject); });
    return res.status(200).json({ data: { filename } });
  } catch (error) {
    logger(error, 'GET /document/report-renewable/export-pdf', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

// ─── MASTER DATA ─────────────────────────────────────────────────────────────

/**
 * Rekap Hasil Add File — outstanding dokumen berdasarkan role user
 * GET /dms/document/recap?empid=&bu_id=&tgl_awal=&tgl_akhir=
 */
export const getDocumentRecap = async (req, res) => {
  // #swagger.tags = ['Document']
  /* #swagger.security = [{ "bearerAuth": [] }] */
  try {
    const { empid: empidDecrypt, bu_id, tgl_awal, tgl_akhir } = req.query;
    const nik = decrypt(empidDecrypt);

    const now = new Date();
    const dateFrom = tgl_awal || new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const dateTo = tgl_akhir || new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);

    let whereClause = `a.content_flag_review = 1
      AND (
        a.content_owner = ?
        OR e.id = ?
        OR f.id = ?
        OR (SELECT COUNT(id) FROM v_mstr_employee_ext WHERE id = ? AND id_dir = '11680') > 0
        OR (SELECT COUNT(account_username) FROM master_user WHERE account_username = ? AND account_type = '4') > 0
      )
      AND CONVERT(VARCHAR(10), tgl_doc, 120) >= ?
      AND CONVERT(VARCHAR(10), tgl_doc, 120) <= ?`;

    const params = [nik, nik, nik, nik, nik, dateFrom, dateTo];

    if (bu_id) {
      whereClause += ` AND c.bu_id = ?`;
      params.push(bu_id);
    }

    const result = await dbDMS.raw(`
      SELECT
        a.tgl_doc, a.content_doc, a.content_name, a.arsip_no,
        a.content_owner, a.content_status, a.content_id,
        d.nik, d.id_atasan, d.nama AS nama_owner,
        b.div_nama, c.bu_name, a.arsiparis_id, a.content_arsiparis_lokasi_id, d.id
      FROM content a
        LEFT JOIN v_mstr_employee_ext d ON a.content_owner = d.id
          COLLATE SQL_Latin1_General_CP1_CI_AS
        LEFT JOIN v_mstr_div b ON d.id_div = b.div_pk
        LEFT JOIN v_mstr_bu c ON c.bu_id = d.id_bu
        LEFT JOIN v_mstr_employee_ext e ON CONVERT(VARCHAR(100), d.id_atasan) = CONVERT(VARCHAR(100), e.id)
        LEFT JOIN v_mstr_employee_ext f ON CONVERT(VARCHAR(100), a.content_arsiparis_lokasi_id) = CONVERT(VARCHAR(100), f.id)
        COLLATE SQL_Latin1_General_CP1_CI_AS
      WHERE ${whereClause}
      ORDER BY a.tgl_doc DESC
    `, params);

    const data = result.map(row => {
      const token = encrypt(`${row.id};${row.content_id}`);
      let action = null;
      if (row.content_status === 'Masih menunggu persetujuan atasan dokumen owner' && nik === row.id_atasan) {
        action = { type: 'approval', token };
      } else if (row.content_status?.toLowerCase() === 'revisi' && nik === row.content_owner) {
        action = { type: 'revisi', token };
      } else if (row.content_status === 'Menunggu persetujuan arsiparis lokasi' && String(nik) === String(row.content_arsiparis_lokasi_id)) {
        action = { type: 'konfirmasi', token };
      }
      return { ...row, token, action };
    });

    return res.status(200).json(data);
  } catch (error) {
    logger(error, 'GET /document/recap', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

export const getSubKategori = async (req, res) => {
  // #swagger.tags = ['Document']
  /* #swagger.security = [{ "bearerAuth": [] }] */
  try {
    const result = await dbDMS('mst_sub_categ_arsip').select('*').orderBy('sub_arsip_jenis');
    return res.status(200).json(result);
  } catch (error) {
    logger(error, 'GET /document/sub-kategori', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

/**
 * Generate preview nomor arsip (tanpa increment counter)
 * GET /dms/document/no-arsip?ctr_kateg_doc=&bu=&div=&work_id=
 */
export const getNoArsip = async (req, res) => {
  // #swagger.tags = ['Document']
  /* #swagger.security = [{ "bearerAuth": [] }] */
  try {
    const { ctr_kateg_doc, bu, div, work_id } = req.query;
    if (!ctr_kateg_doc || !bu) return res.status(200).json({ no_konter: '' });

    const result = await dbDMS.raw(`
      SELECT
        ctr_prefix
        + (
          CASE WHEN ctr_count = 0
            THEN RIGHT(REPLICATE('0', ctr_digit_count + 1) + CONVERT(VARCHAR(10), ctr_count + 1), ctr_digit_count)
            ELSE RIGHT(REPLICATE('0', ctr_digit_count + 1) + CONVERT(VARCHAR(10), ctr_count + 1), ctr_digit_count)
          END
        )
        + CASE WHEN ctr_kode_bu_flag = 'yes'
            THEN '/' + (SELECT map_desc_kd_bu FROM mst_map_kode_bu WHERE map_kd_bu_id = a.ctr_kode_bu)
            ELSE '' END
        + CASE WHEN ctr_kode_divisi = 'yes' AND (SELECT COUNT(div_id) FROM v_mstr_div WHERE div_id = ?) > 0
            THEN '/' + (SELECT REPLACE(dbo.fn_extractupper(div_nama), ' ', '') FROM v_mstr_div WHERE div_id = ?)
            ELSE '' END
        + CASE WHEN ctr_work_loc = 'yes' AND ? <> ''
            THEN '/' + (SELECT TOP 1 work_code FROM mst_work_location WHERE work_id = ?)
            ELSE '' END
        + CASE WHEN ctr_prd_yr_mont = 'yes'
            THEN '/' + SUBSTRING(CONVERT(VARCHAR(10), YEAR(GETDATE())), 3, 2)
              + RIGHT(REPLICATE('0', 2) + CONVERT(VARCHAR(10), MONTH(GETDATE())), 2)
            ELSE '' END
        AS no_konter
      FROM mst_no_konter a
        INNER JOIN mst_map_kode_bu b ON a.ctr_kode_bu = b.map_kd_bu_id
      WHERE ctr_kateg_doc = ?
        AND map_mstr_bu_id = ?
    `, [div || '', div || '', work_id || '', work_id || '', ctr_kateg_doc, bu]);

    const row = Array.isArray(result) ? result[0] : (result?.recordset?.[0] || result?.[0]);
    return res.status(200).json({ no_konter: row?.no_konter || '' });
  } catch (error) {
    logger(error, 'GET /document/no-arsip', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};


export const getArsiparisLokasi = async (req, res) => {
  // #swagger.tags = ['Document']
  /* #swagger.security = [{ "bearerAuth": [] }] */
  try {
    const { lokasi_arsip_id } = req.query;
    let query = dbDMS('mst_arsiparis as al')
      .join('master_user as mu', 'al.arsiparis_emp_id', 'mu.account_username')
      .select('al.*', 'mu.account_name', 'mu.account_email');
    if (lokasi_arsip_id) query.where('al.arsiparis_lokasi_arsip_id', lokasi_arsip_id);
    const result = await query;
    return res.status(200).json(result);
  } catch (error) {
    logger(error, 'GET /document/arsiparis-lokasi', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

export const getLemariByLokasi = async (req, res) => {
  // #swagger.tags = ['Document']
  /* #swagger.security = [{ "bearerAuth": [] }] */
  try {
    const { lokasi_arsip_id } = req.query;
    let query = dbDMS('mst_lemari_arsip').select(
      'lemari_id', 'lemari_name', 'lemari_bu_id', 'lemari_lokasi_arsip_id',
      'lemari_tingkat_ke', 'lemari_box_ke', 'lemari_urutan_doc', 'lemari_arsip_status',
      dbDMS.raw(`
        RIGHT(REPLICATE('0', 2) + CONVERT(VARCHAR(10), (lemari_urutan_doc + 1)), 3)
        + '-' + lemari_name
        + '-' + CONVERT(VARCHAR(10), lemari_tingkat_ke)
        + '-' + lemari_box_ke AS kode_lemari
      `)
    ).where('lemari_arsip_status', 1);
    if (lokasi_arsip_id) query.where('lemari_lokasi_arsip_id', lokasi_arsip_id);
    const result = await query.orderBy('lemari_name');
    return res.status(200).json(result);
  } catch (error) {
    logger(error, 'GET /document/lemari-lokasi', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

export const getContentDet = async (req, res) => {
  // #swagger.tags = ['Document']
  /* #swagger.security = [{ "bearerAuth": [] }] */
  try {
    const { content_id } = req.query;
    const result = await dbDMS('content_det').where('cdet_content_id', content_id).select('*');
    return res.status(200).json(result);
  } catch (error) {
    logger(error, 'GET /document/content-det', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

export const saveFilePendukung = async (req, res) => {
  // #swagger.tags = ['Document']
  /* #swagger.security = [{ "bearerAuth": [] }] */
  try {
    const {
      content_id, plkp_type, plkp_id,
      plkp_nama_dokumen, plkp_no_dokumen, plkp_tanggal_dokumen,
      plkp_status_pembaharuan, plkp_tanggal_daluwarsa, plkp_notif_reminder,
    } = req.body;
    const file = req.file;

    if (plkp_type === 'hapus') {
      if (file) await removeLocalFile(file.path).catch(() => {});
      await dbDMS('content_det').where('cdet_content_det_id', plkp_id).delete();
      return res.json({ status: 1, message: 'File pendukung berhasil dihapus' });
    }

    const meta = {
      cdet_doc_name: plkp_nama_dokumen || '',
      cdet_doc_no: plkp_no_dokumen || '',
      cdet_doc_date: plkp_tanggal_dokumen || null,
      cdet_doc_type: plkp_status_pembaharuan || 'non-renewable',
      cdet_doc_daluwarsa: plkp_tanggal_daluwarsa || null,
      cdet_reminder: plkp_notif_reminder || 'yes',
    };

    if (file) {
      const ext = file.originalname.split('.').pop().toLowerCase();
      if (ext !== 'pdf') return res.status(406).json({ type: 'error', message: 'File harus berformat PDF' });
      const filename = await renameAndUpload(file);
      meta.cdet_file = filename;
      meta.cdet_doc_name = plkp_nama_dokumen || file.originalname;
    }

    if (plkp_type === 'edit' && plkp_id) {
      await dbDMS('content_det').where('cdet_content_det_id', plkp_id).update(meta);
    } else {
      await dbDMS('content_det').insert({ cdet_content_id: content_id, ...meta });
    }

    // Kembalikan list terbaru
    const list = await dbDMS('content_det').where('cdet_content_id', content_id).select('*');
    return res.json({ status: 1, message: 'File pendukung berhasil disimpan', data: list });
  } catch (error) {
    logger(error, 'POST /document/content-det', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

/**
 * DMS Report — Target vs Actual per BU (migrated from PHP getdatareporttarget)
 * GET /api/dms/document/report-compliance
 */
export const getReportCompliance = async (req, res) => {
  try {
    const result = await dbDMS.raw(`
      SELECT bu.bu_id, bu.bu_name,
        CASE WHEN t.target_total IS NOT NULL THEN t.target_total ELSE 0 END AS target,
        (SELECT COUNT(*) FROM content c
         WHERE c.content_bu = bu.bu_id COLLATE SQL_Latin1_General_CP1_CI_AS
         AND c.content_show = 1 AND c.content_ver = 1) AS actual
      FROM v_mstr_bu bu
      LEFT JOIN target t ON bu.bu_id = t.target_bu COLLATE SQL_Latin1_General_CP1_CI_AS
      ORDER BY bu.bu_name
    `);
    return res.status(200).json({ data: result });
  } catch (error) {
    logger(error, 'GET /document/report-compliance', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

/**
 * Update target per BU — upsert into target table (migrated from PHP updatetarget)
 * POST /api/dms/document/report-compliance/target
 */
export const updateReportComplianceTarget = async (req, res) => {
  try {
    const { targets } = req.body;
    for (const [bu_id, nilai] of Object.entries(targets)) {
      const exists = await dbDMS('target').where('target_bu', bu_id.trim()).first();
      if (exists) {
        await dbDMS('target').where('target_bu', bu_id.trim()).update({ target_total: nilai });
      } else {
        await dbDMS('target').insert({ target_bu: bu_id.trim(), target_total: nilai });
      }
    }
    return res.json("sukses");
  } catch (error) {
    logger(error, 'POST /document/report-compliance/target', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};


/**
 * Cek nomor dokumen — validasi real-time dari frontend
 * GET /dms/document/check-doc?doc_id=
 */
export const checkDocNumber = async (req, res) => {
  try {
    const { doc_id } = req.query;
    if (!doc_id || !doc_id.trim()) return res.status(200).json({ valid: true, doc: null });
    const doc = await dbDMS('trs_nmr_doc')
      .where('doc_id', doc_id.trim())
      .whereIn('doc_nmr_status', ['Open', 'Open-Overdue'])
      .first();
    return res.status(200).json({ valid: !!doc, doc: doc || null });
  } catch (error) {
    // Jika tabel tidak ada, kembalikan valid agar tidak mengganggu user
    logger(error, 'GET /document/check-doc', req.query);
    return res.status(200).json({ valid: true, doc: null });
  }
};
