import dayjs from "dayjs";
import { dbDMS, db, dbHris, dbHDS } from "../../config/db.js";
import { logger } from "../../helpers/logger.js";
import { decrypt, encrypt, getErrorResponse } from "../../helpers/utils.js";
import { sendMail } from "../../helpers/mail.js";
import ejs from "ejs";
import path from "path";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================
// AGREEMENT TYPE CRUD
// ============================================

export const listAgreementTypes = async (req, res) => {
  // #swagger.tags = ['Agreement']
  /* #swagger.security = [{
          "bearerAuth": []
  }] */
  // #swagger.description = 'List all agreement types'
  try {
    if (req.query.rowsPerPage == null) {
      const response = await dbDMS('mst_jenis_prj')
        .select('perj_id', 'perj_desc')
        .orderBy('perj_id');
      return res.status(200).json(response);
    }

    const sorting = req.query.descending === "true" ? "desc" : "asc";
    const columnSort = req.query.sortBy === "asc" ? "perj_id asc" : `${req.query.sortBy} ${sorting}`;
    const page = Math.floor(req.query.page);

    const response = await dbDMS('mst_jenis_prj')
      .select('perj_id', 'perj_desc')
      .where((query) => {
        if (req.query.filter != null) {
          query.orWhere("perj_id", "like", `%${req.query.filter}%`);
          query.orWhere("perj_desc", "like", `%${req.query.filter}%`);
        }
      })
      .orderByRaw(columnSort)
      .paginate({
        perPage: Math.floor(req.query.rowsPerPage),
        currentPage: page,
        isLengthAware: true,
      });

    res.status(200).json(response);
  } catch (error) {
    logger(error, 'GET /listAgreementTypes', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

export const createAgreementType = async (req, res) => {
  // #swagger.tags = ['Agreement']
  /* #swagger.security = [{
          "bearerAuth": []
  }] */
  // #swagger.description = 'Create new agreement type'
  const trx = await dbDMS.transaction();
  try {
    const { creator: empidDecrypt, perj_id, perj_desc } = req.body;
    const empid = await decrypt(empidDecrypt);
    const now = dayjs().format("YYYY-MM-DD HH:mm:ss");

    // Check if already exists
    const exists = await trx("mst_jenis_prj").where("perj_id", perj_id).first();
    if (exists) {
      await trx.rollback();
      return res.status(406).json({ type: 'error', message: 'Kode jenis perjanjian sudah digunakan' });
    }

    await trx("mst_jenis_prj").insert({
      perj_id,
      perj_desc,
      created_by: empid,
      created_at: now,
      updated_by: empid,
      updated_at: now
    });

    await trx.commit();
    return res.json("sukses");
  } catch (error) {
    await trx.rollback();
    logger(error, 'POST /createAgreementType', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

export const updateAgreementType = async (req, res) => {
  // #swagger.tags = ['Agreement']
  /* #swagger.security = [{
          "bearerAuth": []
  }] */
  // #swagger.description = 'Update agreement type'
  const trx = await dbDMS.transaction();
  try {
    const { creator: empidDecrypt, perj_id, perj_desc } = req.body;
    const empid = await decrypt(empidDecrypt);
    const now = dayjs().format("YYYY-MM-DD HH:mm:ss");

    await trx("mst_jenis_prj").where("perj_id", perj_id).update({
      perj_desc,
      updated_by: empid,
      updated_at: now
    });

    await trx.commit();
    return res.json("sukses");
  } catch (error) {
    await trx.rollback();
    logger(error, 'POST /updateAgreementType', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

export const deleteAgreementType = async (req, res) => {
  // #swagger.tags = ['Agreement']
  /* #swagger.security = [{
          "bearerAuth": []
  }] */
  // #swagger.description = 'Delete agreement type'
  try {
    const { perj_id } = req.body;

    // Check if used in documents
    const docUsed = await dbDMS("trs_nmr_doc")
      .whereRaw("SUBSTRING(doc_id, CHARINDEX('/', doc_id) + 1, CHARINDEX('/', doc_id, CHARINDEX('/', doc_id) + 1) - CHARINDEX('/', doc_id) - 1) = ?", [perj_id])
      .first();

    if (docUsed) {
      return res.status(406).json({ type: 'error', message: 'Tidak bisa dihapus karena jenis perjanjian sudah digunakan' });
    }

    await dbDMS("mst_jenis_prj").where("perj_id", perj_id).delete();
    return res.json("success");
  } catch (error) {
    logger(error, 'POST /deleteAgreementType', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

// ============================================
// VALIDATION HELPERS
// ============================================

export const validateSPK = async (req, res) => {
  // #swagger.tags = ['Agreement']
  /* #swagger.security = [{
          "bearerAuth": []
  }] */
  // #swagger.description = 'Validate SPK number from Help Desk'
  try {
    const { spk } = req.params;

    // Check SPK exists
    const spkExists = await dbHDS("SPK_Normal").where("no_spk", spk).first();
    if (!spkExists) {
      return res.status(406).json({ type: 'error', message: 'Nomor tiket HDS legal tidak sesuai' });
    }

    // Check SPK is Legal type
    const spkLegal = await dbHDS("SPK_Normal").where("no_spk", spk).where("kat_support", "LGL").first();
    if (!spkLegal) {
      return res.status(406).json({ type: 'error', message: 'Nomor tiket HDS harus bertipe legal' });
    }

    // Check SPK not already used
    const spkUsed = await dbDMS("trs_nmr_doc")
      .where("doc_hds_id", spk)
      .where("doc_nmr_status", "<>", "Cancel")
      .first();

    if (spkUsed) {
      return res.status(406).json({
        type: 'error',
        message: `Nomor tiket HDS sudah dipakai untuk nomer dokumen ${spkUsed.doc_id}`
      });
    }

    return res.json({ valid: true, message: 'SPK valid' });
  } catch (error) {
    logger(error, 'GET /validateSPK', req.params);
    
    // User-friendly error messages
    if (error.message && error.message.includes('Invalid object name')) {
      return res.status(406).json({
        type: 'error',
        message: 'Sistem Help Desk sedang tidak tersedia. Silakan coba beberapa saat lagi atau hubungi tim IT.'
      });
    }
    
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      return res.status(406).json({
        type: 'error',
        message: 'Tidak dapat terhubung ke sistem Help Desk. Silakan coba beberapa saat lagi.'
      });
    }
    
    return res.status(406).json({
      type: 'error',
      message: 'Terjadi kesalahan saat memvalidasi nomor tiket HDS. Silakan coba lagi atau hubungi tim IT.'
    });
  }
};

export const validateUser = async (req, res) => {
  // #swagger.tags = ['Agreement']
  /* #swagger.security = [{
          "bearerAuth": []
  }] */
  // #swagger.description = 'Validate user in HRIS'
  try {
    const { nik } = req.params;

    // Check user exists in HRIS
    const user = await dbDMS("v_mstr_employee")
      .where("employee_pk", nik)
      .first();

    if (!user) {
      return res.status(406).json({ type: 'error', message: 'NIK anda tidak terdaftar pada HRIS' });
    }

    // Check work location
    const workLocation = await dbDMS("v_map_employee_data as a")
      .leftJoin("mst_work_location as b", function() {
        this.on("a.work_location_code", "=", dbDMS.raw("b.work_id COLLATE SQL_Latin1_General_CP1_CI_AS"));
      })
      .where("a.employee_id", nik)
      .select("b.work_desc", "b.work_code")
      .first();

    if (!workLocation || !workLocation.work_code) {
      return res.status(406).json({
        type: 'error',
        message: 'ID user (NIK) belum terdaftar pada master employee HRIS atau work location belum ada di HRIS'
      });
    }

    return res.json({
      valid: true,
      user: {
        nik: user.employee_pk,
        name: user.employee_name,
        bu_id: user.employee_bu_id,
        div_id: user.map_div_id,
        dept_id: user.map_dept_id,
        work_location: workLocation.work_code
      }
    });
  } catch (error) {
    logger(error, 'GET /validateUser', req.params);
    return res.status(406).json(getErrorResponse(error));
  }
};

// ============================================
// DOCUMENT NUMBER REQUEST
// ============================================

export const previewDocumentNumber = async (req, res) => {
  // #swagger.tags = ['Agreement']
  /* #swagger.security = [{
          "bearerAuth": []
  }] */
  // #swagger.description = 'Preview document number format'
  try {
    const { no_spk, emp_id, perj_id } = req.body;

    // Decrypt emp_id
    const decryptedEmpId = await decrypt(emp_id);

    // Validate SPK with better error handling
    try {
      const spkExists = await dbHDS("SPK_Normal").where("no_spk", no_spk).first();
      if (!spkExists) {
        return res.status(406).json({ type: 'error', message: 'Nomor tiket HDS legal tidak sesuai' });
      }

      const spkLegal = await dbHDS("SPK_Normal").where("no_spk", no_spk).where("kat_support", "LGL").first();
      if (!spkLegal) {
        return res.status(406).json({ type: 'error', message: 'Nomor tiket HDS harus bertipe legal' });
      }
    } catch (dbError) {
      if (dbError.message && dbError.message.includes('Invalid object name')) {
        return res.status(406).json({
          type: 'error',
          message: 'Sistem Help Desk sedang tidak tersedia. Silakan coba beberapa saat lagi atau hubungi tim IT.'
        });
      }
      throw dbError;
    }

    const spkUsed = await dbDMS("trs_nmr_doc").where("doc_hds_id", no_spk).where("doc_nmr_status", "<>", "Cancel").first();
    if (spkUsed) {
      return res.status(406).json({ type: 'error', message: `Nomor tiket HDS sudah dipakai untuk nomer dokumen ${spkUsed.doc_id}` });
    }

    // Get user data (use decrypted emp_id)
    const user = await dbDMS("v_mstr_employee").where("employee_pk", decryptedEmpId).first();
    if (!user) {
      return res.status(406).json({ type: 'error', message: 'NIK anda tidak terdaftar pada HRIS' });
    }

    // Get work location (use decrypted emp_id)
    const workLocation = await dbDMS("v_map_employee_data as a")
      .leftJoin("mst_work_location as b", function() {
        this.on("a.work_location_code", "=", dbDMS.raw("b.work_id COLLATE SQL_Latin1_General_CP1_CI_AS"));
      })
      .where("a.employee_id", decryptedEmpId)
      .select("b.work_desc", "b.work_code")
      .first();

    if (!workLocation || !workLocation.work_code) {
      return res.status(406).json({ type: 'error', message: 'ID user (NIK) belum terdaftar pada master employee HRIS atau work location belum ada di HRIS' });
    }

    // Get BU, Division, Department names
    const bu = await dbDMS("v_mstr_bu").where("bu_id", user.employee_bu_id).first();
    const div = await dbDMS("v_mstr_div").where("div_id", user.map_div_id).first();
    const dept = await dbDMS("v_mstr_dept").where("dept_id", user.map_dept_id).first();

    // Build division and department acronyms
    const divAcronym = div ? div.div_nama.replace(' and ', ' ').split(' ').map(w => w[0]).join('') : '';
    const deptAcronym = dept ? dept.dept_name.replace(' and ', ' ').split(' ').map(w => w[0]).join('') : '';

    // Get month in Roman numerals
    const month = dayjs().month() + 1;
    const romanMonths = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
    const monthRoman = romanMonths[month - 1];

    const year = dayjs().year();

    // Preview format: [COUNTER]/[TYPE]/[BU]/[DIV]/[DEPT]/[LOCATION]/[MONTH]/[YEAR]
    const preview = {
      counter: '0001',
      type: perj_id,
      bu: bu ? bu.bu_id : '',
      division: divAcronym,
      department: deptAcronym,
      location: workLocation.work_code,
      month: monthRoman,
      year: year.toString()
    };

    return res.json(preview);
  } catch (error) {
    logger(error, 'POST /previewDocumentNumber', req.body);
    
    // User-friendly error messages
    if (error.message && error.message.includes('Invalid object name')) {
      return res.status(406).json({
        type: 'error',
        message: 'Sistem Help Desk sedang tidak tersedia. Silakan coba beberapa saat lagi atau hubungi tim IT.'
      });
    }
    
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      return res.status(406).json({
        type: 'error',
        message: 'Tidak dapat terhubung ke sistem eksternal. Silakan coba beberapa saat lagi.'
      });
    }
    
    return res.status(406).json({
      type: 'error',
      message: 'Terjadi kesalahan saat membuat preview. Silakan coba lagi atau hubungi tim IT.'
    });
  }
};

export const requestDocumentNumber = async (req, res) => {
  // #swagger.tags = ['Agreement']
  /* #swagger.security = [{
          "bearerAuth": []
  }] */
  // #swagger.description = 'Request document number'
  const trx = await dbDMS.transaction();
  try {
    const { no_spk, emp_id, agr_title, perj_id } = req.body;

    // Decrypt emp_id
    const decryptedEmpId = await decrypt(emp_id);

    // Validate all inputs with better error handling
    try {
      const spkExists = await dbHDS("SPK_Normal").where("no_spk", no_spk).first();
      if (!spkExists) {
        await trx.rollback();
        return res.status(406).json({ type: 'error', message: 'Nomor tiket HDS legal tidak sesuai' });
      }

      const spkLegal = await dbHDS("SPK_Normal").where("no_spk", no_spk).where("kat_support", "LGL").first();
      if (!spkLegal) {
        await trx.rollback();
        return res.status(406).json({ type: 'error', message: 'Nomor tiket HDS harus bertipe legal' });
      }
    } catch (dbError) {
      await trx.rollback();
      if (dbError.message && dbError.message.includes('Invalid object name')) {
        return res.status(406).json({
          type: 'error',
          message: 'Sistem Help Desk sedang tidak tersedia. Silakan coba beberapa saat lagi atau hubungi tim IT.'
        });
      }
      throw dbError;
    }

    const spkUsed = await trx("trs_nmr_doc").where("doc_hds_id", no_spk).where("doc_nmr_status", "<>", "Cancel").first();
    if (spkUsed) {
      await trx.rollback();
      return res.status(406).json({ type: 'error', message: `Nomor tiket HDS sudah dipakai untuk nomer dokumen ${spkUsed.doc_id}` });
    }

    // Insert temp record (use decrypted emp_id)
    const result = await trx("trs_nmr_doc_temp").insert({
      doc_hds_id: no_spk,
      doc_emp_id: decryptedEmpId,
      doc_judul: agr_title,
      doc_perj_id: perj_id,
      doc_nmr_status: 'Approval 1'
    }).returning('doc_id');

    const docId = result[0];

    // Get user and organizational data for email (use decrypted emp_id)
    const user = await trx("v_mstr_employee").where("employee_pk", decryptedEmpId).first();
    const bu = await trx("v_mstr_bu").where("bu_id", user.employee_bu_id).first();
    const div = await trx("v_mstr_div").where("div_id", user.map_div_id).first();
    const perjType = await trx("mst_jenis_prj").where("perj_id", perj_id).first();

    // Get Section Head (DO175621)
    const sectionHead = await trx("v_mstr_employee_ext").where("id", "DO175621").first();

    // Prepare email data
    const token = Buffer.from(`${sectionHead.nik};${docId}`).toString('base64');
    const approvalLink = `${process.env.APP_URL}/app/agrdoc/addagrdocapproval?token=${token}`;

    const emailData = {
      approverName: sectionHead.nama,
      spkNumber: no_spk,
      title: agr_title,
      type: perjType ? perjType.perj_desc : perj_id,
      requester: user.employee_name,
      bu: bu ? bu.bu_name : '',
      division: div ? div.div_nama : '',
      approvalLink
    };

    // Render email template
    const templatePath = path.join(__dirname, '../../view/email/agreement-approval-request.ejs');
    const emailHtml = await ejs.renderFile(templatePath, emailData);

    await trx.commit();

    // Kirim email setelah commit — jangan gagalkan request jika email gagal
    try {
      const emailRecipient = process.env.NODE_ENV === 'prod' ? sectionHead.email : process.env.EMAIL_TESTER;
      await sendMail({ to: emailRecipient, subject: 'NOTIFIKASI APPROVAL', html: emailHtml });
    } catch (emailError) {
      logger(emailError, 'POST /requestDocumentNumber - Email', { docId });
    }

    return res.json({ success: true, message: 'Sukses mengajukan pembuatan nomer dokumen', doc_id: docId });
  } catch (error) {
    await trx.rollback();
    logger(error, 'POST /requestDocumentNumber', req.body);
    
    // User-friendly error messages
    if (error.message && error.message.includes('Invalid object name')) {
      return res.status(406).json({
        type: 'error',
        message: 'Sistem Help Desk sedang tidak tersedia. Silakan coba beberapa saat lagi atau hubungi tim IT.'
      });
    }
    
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      return res.status(406).json({
        type: 'error',
        message: 'Tidak dapat terhubung ke sistem eksternal. Silakan coba beberapa saat lagi.'
      });
    }
    
    if (error.message && error.message.includes('email')) {
      return res.status(406).json({
        type: 'error',
        message: 'Pengajuan berhasil disimpan tetapi gagal mengirim email notifikasi. Silakan hubungi tim IT.'
      });
    }
    
    return res.status(406).json({
      type: 'error',
      message: 'Terjadi kesalahan saat mengajukan dokumen. Silakan coba lagi atau hubungi tim IT.'
    });
  }
};

// ============================================
// APPROVAL WORKFLOW
// ============================================

export const getApprovalDetails = async (req, res) => {
  // #swagger.tags = ['Agreement']
  // #swagger.description = 'Get approval details by token (no auth required)'
  try {
    const { token } = req.params;

    // Decode token
    const decoded = Buffer.from(token, 'base64').toString('utf-8');
    const [nik, docId] = decoded.split(';');

    // Get temp record
    const tempDoc = await dbDMS("trs_nmr_doc_temp").where("doc_id", docId).first();
    if (!tempDoc) {
      return res.status(404).json({ type: 'error', message: 'Dokumen tidak ditemukan' });
    }

    // Check if already approved
    if (tempDoc.doc_nmr_status === 'Open') {
      return res.json({
        approved: true,
        message: `No. Dokumen sudah selesai disetujui dengan nomer ${tempDoc.doc_nmr_id}`
      });
    }

    // Get user data
    const user = await dbDMS("v_mstr_employee").where("employee_pk", tempDoc.doc_emp_id).first();
    const bu = await dbDMS("v_mstr_bu").where("bu_id", user.employee_bu_id).first();
    const div = await dbDMS("v_mstr_div").where("div_id", user.map_div_id).first();
    const perjType = await dbDMS("mst_jenis_prj").where("perj_id", tempDoc.doc_perj_id).first();

    // Get all agreement types for dropdown
    const agreementTypes = await dbDMS("mst_jenis_prj").select('perj_id', 'perj_desc').orderBy('perj_id');

    return res.json({
      approved: false,
      doc_id: tempDoc.doc_id,
      doc_hds_id: tempDoc.doc_hds_id,
      doc_judul: tempDoc.doc_judul,
      doc_perj_id: tempDoc.doc_perj_id,
      doc_nmr_status: tempDoc.doc_nmr_status,
      requester: user.employee_name,
      bu: bu ? bu.bu_name : '',
      division: div ? div.div_nama : '',
      type_desc: perjType ? perjType.perj_desc : '',
      agreement_types: agreementTypes,
      approver_nik: nik
    });
  } catch (error) {
    logger(error, 'GET /getApprovalDetails', req.params);
    return res.status(406).json(getErrorResponse(error));
  }
};

export const approveDocumentNumber = async (req, res) => {
  // #swagger.tags = ['Agreement']
  // #swagger.description = 'Approve document number (no auth required)'
  const trx = await dbDMS.transaction();
  try {
    const { token, perj_id } = req.body;

    // Decode token
    const decoded = Buffer.from(token, 'base64').toString('utf-8');
    const [nik, docId] = decoded.split(';');

    // Get temp record
    const tempDoc = await trx("trs_nmr_doc_temp").where("doc_id", docId).first();
    if (!tempDoc) {
      await trx.rollback();
      return res.status(404).json({ type: 'error', message: 'Dokumen tidak ditemukan' });
    }

    // Check if already approved
    if (tempDoc.doc_nmr_status === 'Open') {
      await trx.rollback();
      return res.json({ success: true, message: `No. Dokumen sudah selesai disetujui dengan nomer ${tempDoc.doc_nmr_id}` });
    }

    const currentStatus = tempDoc.doc_nmr_status;

    if (currentStatus === 'Approval 1') {
      // First approval - move to Approval 2
      await trx("trs_nmr_doc_temp").where("doc_id", docId).update({
        doc_perj_id: perj_id,
        doc_nmr_status: 'Approval 2'
      });

      // Get Section Head's manager (Department Head)
      const sectionHead = await trx("v_mstr_employee_ext").where("id", nik).first();
      const deptHead = await trx("v_mstr_employee_ext").where("id", sectionHead.id_atasan).first();

      // Get data for email
      const user = await trx("v_mstr_employee").where("employee_pk", tempDoc.doc_emp_id).first();
      const bu = await trx("v_mstr_bu").where("bu_id", user.employee_bu_id).first();
      const div = await trx("v_mstr_div").where("div_id", user.map_div_id).first();
      const perjType = await trx("mst_jenis_prj").where("perj_id", perj_id).first();

      // Send email to Department Head
      const token2 = Buffer.from(`${deptHead.nik};${docId}`).toString('base64');
      const approvalLink = `${process.env.APP_URL}/app/agrdoc/addagrdocapproval?token=${token2}`;

      const emailData = {
        approverName: deptHead.nama,
        spkNumber: tempDoc.doc_hds_id,
        title: tempDoc.doc_judul,
        type: perjType ? perjType.perj_desc : perj_id,
        requester: user.employee_name,
        bu: bu ? bu.bu_name : '',
        division: div ? div.div_nama : '',
        approvalLink
      };

      const templatePath = path.join(__dirname, '../../view/email/agreement-approval-request.ejs');
      const emailHtml = await ejs.renderFile(templatePath, emailData);

      const emailRecipient = process.env.NODE_ENV === 'prod' ? deptHead.email : process.env.EMAIL_TESTER;
      await sendMail({
        to: emailRecipient,
        subject: 'NOTIFIKASI APPROVAL',
        html: emailHtml
      });

      await trx.commit();
      return res.json({ success: true, message: 'Approval berhasil, menunggu persetujuan Department Head' });

    } else if (currentStatus === 'Approval 2') {
      // Second approval - generate final document number
      const result = await trx.raw(`
        DECLARE @doc_nmr_id VARCHAR(255);
        SET @doc_nmr_id = dbo.fn_get_doc_id(?, ?);
        SELECT @doc_nmr_id as doc_nmr_id;
      `, [tempDoc.doc_emp_id, perj_id]);

      const finalDocNumber = result[0].doc_nmr_id;

      // Get user organizational data
      const user = await trx("v_mstr_employee").where("employee_pk", tempDoc.doc_emp_id).first();
      const masterUser = await trx("master_user").where("account_username", tempDoc.doc_emp_id).first();

      // Insert to final table
      await trx("trs_nmr_doc").insert({
        doc_id: finalDocNumber,
        doc_hds_id: tempDoc.doc_hds_id,
        doc_bu_id: masterUser ? masterUser.account_bu : user.employee_bu_id,
        doc_div_id: user.map_div_id,
        doc_dept_id: user.map_dept_id,
        doc_emp_id: tempDoc.doc_emp_id,
        doc_judul: tempDoc.doc_judul,
        doc_nmr_status: 'Open',
        created_by: nik
      });

      // Update temp record
      await trx("trs_nmr_doc_temp").where("doc_id", docId).update({
        doc_perj_id: perj_id,
        doc_nmr_status: 'Open',
        doc_nmr_id: finalDocNumber
      });

      // Send email to requester
      const perjType = await trx("mst_jenis_prj").where("perj_id", perj_id).first();
      const emailData = {
        requesterName: user.employee_name,
        docNumber: finalDocNumber,
        title: tempDoc.doc_judul,
        type: perjType ? perjType.perj_desc : perj_id
      };

      const templatePath = path.join(__dirname, '../../view/email/approval-final.ejs');
      const emailHtml = await ejs.renderFile(templatePath, emailData);

      const emailRecipient = process.env.NODE_ENV === 'prod' ? user.employee_email : process.env.EMAIL_TESTER;
      await sendMail({
        to: emailRecipient,
        subject: 'NOTIFIKASI PENGAJUAN NO. DOKUMEN',
        html: emailHtml
      });

      await trx.commit();
      return res.json({ success: true, message: `No. Dokumen sudah selesai disetujui dengan nomer ${finalDocNumber}`, doc_number: finalDocNumber });
    }

    await trx.rollback();
    return res.status(406).json({ type: 'error', message: 'Status dokumen tidak valid' });
  } catch (error) {
    await trx.rollback();
    logger(error, 'POST /approveDocumentNumber', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};
