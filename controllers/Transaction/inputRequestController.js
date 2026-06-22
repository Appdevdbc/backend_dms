import { dbDMS, dbHris } from "../../config/db.js";
import dayjs from "dayjs";
import { decrypt, encrypt, getErrorResponse } from "../../helpers/utils.js";
import { logger } from "../../helpers/logger.js";
import { sendTemuanMail } from "../../helpers/temuanMail.js";
import { uploadFileToFTP, deleteFileFromFTP } from "../../helpers/ftpUpload.js";

/**
 * Get active Business Units
 */
export const getBusinessUnits = async (req, res) => {
  try {
    const businessUnits = await dbDMS('v_mstr_bu')
      .select('bu_id', 'bu_name')
      .where('bu_status', 'Active')
      .orderBy('bu_name', 'asc');
    
    res.status(200).json(businessUnits);
  } catch (error) {
    logger(error, 'GET /getBusinessUnits', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

/**
 * Get divisions by Business Unit
 */
export const getDivisionsByBU = async (req, res) => {
  try {
    const { bu_id } = req.query;
    
    const divisions = await dbHris.raw(`
      SELECT 
        b.id_div as div_id, 
        b.nama_div as div_nama
      FROM mapping_bu_div a
      LEFT JOIN master_div_new b ON a.map_div_id = b.id_div
      WHERE b.div_active = 'ACTIVE'
        AND a.map_direktorat_pk = ?
      ORDER BY b.nama_div ASC
    `, [bu_id]);
    
    res.status(200).json(divisions);
  } catch (error) {
    logger(error, 'GET /getDivisionsByBU', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

/**
 * Get employees by division for requestee selection
 */
export const getEmployeesByDivision = async (req, res) => {
  try {
    const { bu_id, div_id } = req.query;
    
    let query;
    
    // Different logic for DBC vs non-DBC
    // if (bu_id.toLowerCase() === 'dbc') {
    //   // For DBC: Get Grade 4,5 + their superiors + div head
    //   query = dbHris.raw(`
    //     SELECT DISTINCT e.Emp_Id as employee_id, e.user_name as employee_name 
    //     FROM ptl_hris e 
    //     INNER JOIN master_div_new md ON e.map_div_pk = md.id_div
    //     WHERE md.id_div = ? AND e.grade IN ('4','5') AND e.user_active = 'Active'
    //     UNION
    //     SELECT DISTINCT e.Emp_Id as employee_id, e.user_name as employee_name 
    //     FROM ptl_hris e
    //     WHERE e.user_active = 'Active' AND e.Emp_Id IN 
    //     (SELECT employee_mgr_pk FROM ptl_hris 
    //     WHERE map_div_pk = ? AND grade = '5' AND user_active = 'Active')
    //     ORDER BY employee_name
    //   `, [div_id, div_id]);
    // } else {
    //   // For non-DBC: Get Grade 1,2,3 + their superiors + div head
    //   query = dbHris.raw(`
    //     SELECT DISTINCT e.Emp_Id as employee_id, e.user_name as employee_name 
    //     FROM ptl_hris e
    //     INNER JOIN master_div_new md ON e.map_div_pk = md.id_div
    //     WHERE md.id_div = ? AND e.grade IN ('1','2','3') AND e.user_active = 'Active'
    //     UNION
    //     SELECT DISTINCT e.Emp_Id as employee_id, e.user_name as employee_name 
    //     FROM ptl_hris e
    //     WHERE e.user_active = 'Active' AND e.Emp_Id IN 
    //     (SELECT employee_mgr_pk FROM ptl_hris 
    //     WHERE map_div_pk = ? AND grade = '1' AND user_active = 'Active')
    //     ORDER BY employee_name
    //   `, [div_id, div_id]);
    // }

    query = dbHris.raw(`
        SELECT DISTINCT e.Emp_Id as employee_id, e.user_name as employee_name 
        FROM ptl_hris e 
        INNER JOIN master_div_new md ON e.map_div_pk = md.id_div
        WHERE e.bu_id = ? and md.id_div = ? AND e.user_active = 'Active'
      `, [bu_id, div_id]);
    
    const employees = await query;
    res.status(200).json(employees);
  } catch (error) {
    logger(error, 'GET /getEmployeesByDivision', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

/**
 * Get employee data (email, jabatan) for selected requestees
 */
export const getEmployeeData = async (req, res) => {
  try {
    const { employee_ids } = req.body; // Array of employee IDs
    
    let emails = [];
    let jabatans = [];
    
    for (const emp_id of employee_ids) {
      const employee = await dbHris('ptl_hris')
        .select('user_email', 'jabatan')
        .where('Emp_Id', emp_id)
        .where('user_active', 'Active')
        .first();
      
      if (employee) {
        emails.push(employee.user_email);
        jabatans.push(employee.jabatan);
      }
    }
    
    res.status(200).json({
      email: emails.join(','),
      jabatan: jabatans.join(', ')
    });
  } catch (error) {
    logger(error, 'POST /getEmployeeData', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

/**
 * Get approval chain (Div Head, Chief, Direktur) for division
 */
export const getApprovalChain = async (req, res) => {
  try {
    const { div_id } = req.query;

    let mstr_div = await dbDMS('v_mstr_div')
      .where('div_pk', div_id)
      .first();
    
    // Get from mapping_app_div or similar table
    const approval = await dbHris.raw(`
      SELECT 
        mad.map_divhead_id as divhead_id,
        (SELECT user_name FROM ptl_hris WHERE Emp_Id = mad.map_divhead_pk) as divhead_name,
        (SELECT user_email FROM ptl_hris WHERE Emp_Id = mad.map_divhead_pk) as divhead_email,
        mad.map_cic_id as chief_id,
        (SELECT user_name FROM ptl_hris WHERE Emp_Id = mad.map_cic_pk) as chief_name,
        (SELECT user_email FROM ptl_hris WHERE Emp_Id = mad.map_cic_pk) as chief_email,
        mad.map_dic_id as direktur_id,
        (SELECT user_name FROM ptl_hris WHERE Emp_Id = mad.map_dic_pk) as direktur_name,
        (SELECT user_email FROM ptl_hris WHERE Emp_Id = mad.map_dic_pk) as direktur_email
      FROM mapping_div_chief mad
      WHERE mad.map_div_id = ?
    `, [mstr_div.div_id]);
    
    if (approval.length > 0) {
      res.status(200).json(approval[0]);
    } else {
      res.status(200).json({
        divhead_id: null,
        divhead_name: null,
        divhead_email: null,
        chief_id: null,
        chief_name: null,
        chief_email: null,
        direktur_id: null,
        direktur_name: null,
        direktur_email: null
      });
    }
  } catch (error) {
    logger(error, 'GET /getApprovalChain', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

/**
 * Get superior email for employee
 */
const getSuperiorEmail = async (emp_id) => {
  try {
    const superior = await dbHris('ptl_hris')
      .select('user_email')
      .where('Emp_Id', function() {
        this.select('employee_mgr_pk')
          .from('ptl_hris')
          .where('Emp_Id', emp_id)
          .first();
      })
      .where('user_active', 'Active')
      .first();
    
    return superior ? superior.user_email : null;
  } catch (error) {
    return null;
  }
};

/**
 * Create new temuan/request
 */
export const createTemuan = async (req, res) => {
  const trx = await dbDMS.transaction();
  
  try {
    const {
      bu_id,
      div_id,
      judul,
      periode_awal,
      periode_akhir,
      requestee_emails,
      auditor_nik,
      approval_chain: approval_chain_str
    } = req.body;
    
    // Parse JSON strings
    const requestee_ids = JSON.parse(req.body.requestee_ids);
    const points = JSON.parse(req.body.points);
    const approval_chain = JSON.parse(approval_chain_str);
    
    const creator = decrypt(req.body.creator);
    const now = dayjs().format("YYYY-MM-DD HH:mm:ss");

    let mstr_div = await dbDMS('v_mstr_div')
      .where('div_pk', div_id)
      .first();
    
    // Generate Temuan ID: T/{DIV}/{YEAR}/{NO}
    let no = 1;
    let temuan_id = `T/${mstr_div.div_id}/${dayjs(periode_awal).format('YYYY')}/${no}`;
    
    // Check if ID exists, increment if necessary
    let existingTemuan = await trx('temuan')
      .where('temuan_id', temuan_id)
      .first();
    
    while (existingTemuan) {
      no++;
      temuan_id = `T/${mstr_div.div_id}/${dayjs(periode_awal).format('YYYY')}/${no}`;
      existingTemuan = await trx('temuan')
        .where('temuan_id', temuan_id)
        .first();
    }
    
    // Determine team based on auditor NIK
    let team = 0;
    if (auditor_nik === 'dbc2100219' || auditor_nik === 'dbc2100519') {
      team = 2;
    } else if (auditor_nik === 'djm1049799' || auditor_nik === 'djm1500119') {
      team = 1;
    }
    
    // Insert Temuan Header
    await trx('temuan').insert({
      temuan_id: temuan_id,
      temuan_judul: judul,
      temuan_tglawal: periode_awal,
      temuan_tglakhir: periode_akhir,
      temuan_bu: bu_id,
      temuan_div: div_id,
      temuan_auditee: requestee_ids.join(','),
      temuan_emailauditee: requestee_emails,
      temuan_status: '0',
      temuan_datecreated: now,
      temuan_team: team
    });
    
    // Insert Points and Lines
    for (let i = 0; i < points.length; i++) {
      const point = points[i];
      const list_id = `${temuan_id}-${i + 1}`;
      
      // Insert Point Header
      await trx('list_hdr').insert({
        list_id: list_id,
        list_temuanid: temuan_id,
        list_judul: point.judul,
        list_status: '0'
      });
      
      // Insert Lines for this point
      for (let j = 0; j < point.lines.length; j++) {
        const line = point.lines[j];
        const listdet_id = `${list_id}.${j + 1}`;
        
        // Handle file uploads from req.files
        let uploadedFiles = '';
        if (line.filesCount > 0 && req.files && req.files.length > 0) {
          const fileNames = [];
          const filePrefix = `file_${i}_${j}_`;
          
          // Find all files for this line (req.files is array when using upload.any())
          for (const file of req.files) {
            if (file.fieldname.startsWith(filePrefix)) {
              const fileName = await uploadFileToFTP(file);
              if (fileName) {
                fileNames.push(fileName);
              }
            }
          }
          uploadedFiles = fileNames.join(',');
        }
        
        // Insert Line Detail
        await trx('list_det').insert({
          listdet_id: listdet_id,
          listdet_listid: list_id,
          listdet_isi: line.deskripsi,
          listdet_emailnotif: line.email_notif || '',
          listdet_attach: uploadedFiles,
          listdet_duedate: line.due_date,
          listdet_progress: '0',
          listdet_status: '0'
        });
      }
    }
    
    await trx.commit();
    
    // Send email notification
    try {
      await sendTemuanMail({
        temuan_id,
        judul,
        periode_awal,
        periode_akhir,
        bu_id,
        div_id,
        requestee_ids,
        requestee_emails,
        points,
        approval_chain
      });
    } catch (emailError) {
      logger(emailError, 'Email sending failed for temuan', { temuan_id });
      // Don't fail the whole operation if email fails
    }
    
    res.status(200).json({
      success: true,
      temuan_id: temuan_id,
      message: 'Request berhasil dibuat dan dikirim'
    });
    
  } catch (error) {
    await trx.rollback();
    logger(error, 'POST /createTemuan', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

/**
 * Get list of temuan by BU
 */
export const getTemuanList = async (req, res) => {
  try {
    const { bu_id, user_type, user_div } = req.query;
    
    let query = dbDMS('temuan as t')
      .select(
        't.temuan_id',
        't.temuan_judul',
        't.temuan_tglawal',
        't.temuan_tglakhir',
        't.temuan_bu',
        't.temuan_div',
        't.temuan_status',
        't.temuan_datecreated',
        dbDMS.raw(`(SELECT bu_name FROM portal.dbo.master_bu_new WHERE bu_id = t.temuan_bu) as bu_name`),
        dbDMS.raw(`(SELECT nama_div FROM portal.dbo.master_div_new WHERE id_div = t.temuan_div) as div_nama`),
        dbDMS.raw(`(SELECT COUNT(*) FROM list_det ld 
                   INNER JOIN list_hdr lh ON ld.listdet_listid = lh.list_id 
                   WHERE lh.list_temuanid = t.temuan_id) as total`),
        dbDMS.raw(`(SELECT COUNT(*) FROM list_det ld 
                   INNER JOIN list_hdr lh ON ld.listdet_listid = lh.list_id 
                   WHERE lh.list_temuanid = t.temuan_id 
                   AND ld.listdet_status IN ('0','2') 
                   AND GETDATE() <= ld.listdet_duedate) as outstanding`),
        dbDMS.raw(`(SELECT COUNT(*) FROM list_det ld 
                   INNER JOIN list_hdr lh ON ld.listdet_listid = lh.list_id 
                   WHERE lh.list_temuanid = t.temuan_id 
                   AND ld.listdet_status = '1') as closed`)
      )
      .where('t.temuan_bu', bu_id);
    
    // Filter by division for Type 1 users
    if (user_type === '1' && user_div) {
      query = query.where('t.temuan_div', user_div);
    }
    
    query = query.orderBy('t.temuan_datecreated', 'desc');
    
    const temuan = await query;
    
    res.status(200).json(temuan);
  } catch (error) {
    logger(error, 'GET /getTemuanList', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

/**
 * Get temuan detail
 */
export const getTemuanDetail = async (req, res) => {
  try {
    const { temuan_id } = req.params;
    
    // Get header
    const temuan = await dbDMS('temuan')
      .where('temuan_id', temuan_id)
      .first();
    
    if (!temuan) {
      return res.status(404).json({
        type: 'error',
        message: 'Request tidak ditemukan'
      });
    }
    
    // Get points
    const points = await dbDMS('list_hdr')
      .where('list_temuanid', temuan_id)
      .orderBy('list_id');
    
    // Get lines for each point
    for (const point of points) {
      point.lines = await dbDMS('list_det')
        .where('listdet_listid', point.list_id)
        .orderBy('listdet_id');
    }
    
    res.status(200).json({
      ...temuan,
      points
    });
  } catch (error) {
    logger(error, 'GET /getTemuanDetail', req.params);
    return res.status(406).json(getErrorResponse(error));
  }
};

/**
 * Get temuan data for editing
 */
export const getTemuanForEdit = async (req, res) => {
  try {
    const temuan_id = decrypt(req.params.temuan_id);
    
    // Get temuan header
    const temuan = await dbDMS('temuan')
      .where('temuan_id', temuan_id)
      .first();
    
    if (!temuan) {
      return res.status(404).json({
        type: 'error',
        message: 'Request tidak ditemukan'
      });
    }
    
    // Get points (list headers)
    const points = await dbDMS('list_hdr')
      .where('list_temuanid', temuan_id)
      .orderBy('list_id');
    
    // Get lines for each point
    for (const point of points) {
      point.lines = await dbDMS('list_det')
        .where('listdet_listid', point.list_id)
        .orderBy('listdet_id');
    }
    
    // Get approval chain
    let mstr_div = await dbDMS('v_mstr_div')
      .where('div_pk', temuan.temuan_div)
      .first();
    
    const approval = await dbHris.raw(`
      SELECT 
        mad.map_divhead_id as divhead_id,
        (SELECT user_name FROM ptl_hris WHERE Emp_Id = mad.map_divhead_pk) as divhead_name,
        (SELECT user_email FROM ptl_hris WHERE Emp_Id = mad.map_divhead_pk) as divhead_email,
        mad.map_cic_id as chief_id,
        (SELECT user_name FROM ptl_hris WHERE Emp_Id = mad.map_cic_pk) as chief_name,
        (SELECT user_email FROM ptl_hris WHERE Emp_Id = mad.map_cic_pk) as chief_email,
        mad.map_dic_id as direktur_id,
        (SELECT user_name FROM ptl_hris WHERE Emp_Id = mad.map_dic_pk) as direktur_name,
        (SELECT user_email FROM ptl_hris WHERE Emp_Id = mad.map_dic_pk) as direktur_email
      FROM mapping_div_chief mad
      WHERE mad.map_div_id = ?
    `, [mstr_div.div_id]);
    
    res.status(200).json({
      temuan,
      points,
      approval_chain: approval.length > 0 ? approval[0] : null
    });
  } catch (error) {
    logger(error, 'GET /getTemuanForEdit', req.params);
    return res.status(406).json(getErrorResponse(error));
  }
};

/**
 * Update existing temuan/request
 */
export const updateTemuan = async (req, res) => {
  const trx = await dbDMS.transaction();
  
  try {
    const {
      temuan_id,
      bu_id,
      div_id,
      judul,
      periode_awal,
      periode_akhir,
      requestee_emails,
      auditor_nik
    } = req.body;
    
    // Parse JSON strings
    const requestee_ids = JSON.parse(req.body.requestee_ids);
    const points = JSON.parse(req.body.points);
    
    // Check if temuan exists
    const existingTemuan = await trx('temuan')
      .where('temuan_id', temuan_id)
      .first();
    
    if (!existingTemuan) {
      await trx.rollback();
      return res.status(404).json({
        type: 'error',
        message: 'Request tidak ditemukan'
      });
    }
    
    // Update Temuan Header
    await trx('temuan')
      .where('temuan_id', temuan_id)
      .update({
        temuan_judul: judul,
        temuan_tglawal: periode_awal,
        temuan_tglakhir: periode_akhir,
        temuan_div: div_id,
        temuan_auditee: requestee_ids.join(','),
        temuan_emailauditee: requestee_emails
      });
    
    // Get existing points
    const existingPoints = await trx('list_hdr')
      .where('list_temuanid', temuan_id)
      .orderBy('list_id');
    
    // Update existing points and lines
    for (let i = 0; i < points.length && i < existingPoints.length; i++) {
      const point = points[i];
      const existingPoint = existingPoints[i];
      const list_id = existingPoint.list_id;
      
      // Update Point Header
      await trx('list_hdr')
        .where('list_id', list_id)
        .update({
          list_judul: point.judul
        });
      
      // Get existing lines for this point
      const existingLines = await trx('list_det')
        .where('listdet_listid', list_id)
        .orderBy('listdet_id');
      
      // Update existing lines
      for (let j = 0; j < point.lines.length && j < existingLines.length; j++) {
        const line = point.lines[j];
        const existingLine = existingLines[j];
        const listdet_id = existingLine.listdet_id;
        
        // Handle file uploads
        let uploadedFiles = existingLine.listdet_attach || ''; // Keep existing files
        
        if (line.filesCount > 0 && req.files && req.files.length > 0) {
          const fileNames = [];
          const filePrefix = `file_${i}_${j}_`;
          
          // Find all new files for this line
          for (const file of req.files) {
            if (file.fieldname.startsWith(filePrefix)) {
              const fileName = await uploadFileToFTP(file);
              if (fileName) {
                fileNames.push(fileName);
              }
            }
          }
          
          // If new files uploaded, replace old files
          if (fileNames.length > 0) {
            uploadedFiles = fileNames.join(',');
          }
        }
        
        // Update Line Detail
        await trx('list_det')
          .where('listdet_id', listdet_id)
          .update({
            listdet_isi: line.deskripsi,
            listdet_emailnotif: line.email_notif || '',
            listdet_attach: uploadedFiles,
            listdet_duedate: line.due_date
          });
      }
      
      // Insert new lines if there are more lines than existing
      for (let j = existingLines.length; j < point.lines.length; j++) {
        const line = point.lines[j];
        const listdet_id = `${list_id}.${j + 1}`;
        
        // Handle file uploads
        let uploadedFiles = '';
        if (line.filesCount > 0 && req.files && req.files.length > 0) {
          const fileNames = [];
          const filePrefix = `file_${i}_${j}_`;
          
          for (const file of req.files) {
            if (file.fieldname.startsWith(filePrefix)) {
              const fileName = await uploadFileToFTP(file);
              if (fileName) {
                fileNames.push(fileName);
              }
            }
          }
          uploadedFiles = fileNames.join(',');
        }
        
        // Insert new Line Detail
        await trx('list_det').insert({
          listdet_id: listdet_id,
          listdet_listid: list_id,
          listdet_isi: line.deskripsi,
          listdet_emailnotif: line.email_notif || '',
          listdet_attach: uploadedFiles,
          listdet_duedate: line.due_date,
          listdet_progress: '0',
          listdet_status: '0'
        });
      }
      
      // Delete extra lines if there are fewer lines than existing
      if (point.lines.length < existingLines.length) {
        for (let j = point.lines.length; j < existingLines.length; j++) {
          await trx('list_det')
            .where('listdet_id', existingLines[j].listdet_id)
            .delete();
        }
      }
    }
    
    // Insert new points if there are more points than existing
    for (let i = existingPoints.length; i < points.length; i++) {
      const point = points[i];
      const list_id = `${temuan_id}-${i + 1}`;
      
      // Insert Point Header
      await trx('list_hdr').insert({
        list_id: list_id,
        list_temuanid: temuan_id,
        list_judul: point.judul,
        list_status: '0'
      });
      
      // Insert Lines for this point
      for (let j = 0; j < point.lines.length; j++) {
        const line = point.lines[j];
        const listdet_id = `${list_id}.${j + 1}`;
        
        // Handle file uploads
        let uploadedFiles = '';
        if (line.filesCount > 0 && req.files && req.files.length > 0) {
          const fileNames = [];
          const filePrefix = `file_${i}_${j}_`;
          
          for (const file of req.files) {
            if (file.fieldname.startsWith(filePrefix)) {
              const fileName = await uploadFileToFTP(file);
              if (fileName) {
                fileNames.push(fileName);
              }
            }
          }
          uploadedFiles = fileNames.join(',');
        }
        
        // Insert Line Detail
        await trx('list_det').insert({
          listdet_id: listdet_id,
          listdet_listid: list_id,
          listdet_isi: line.deskripsi,
          listdet_emailnotif: line.email_notif || '',
          listdet_attach: uploadedFiles,
          listdet_duedate: line.due_date,
          listdet_progress: '0',
          listdet_status: '0'
        });
      }
    }
    
    // Delete extra points if there are fewer points than existing
    if (points.length < existingPoints.length) {
      for (let i = points.length; i < existingPoints.length; i++) {
        const list_id = existingPoints[i].list_id;
        
        // Delete lines first
        await trx('list_det')
          .where('listdet_listid', list_id)
          .delete();
        
        // Delete point
        await trx('list_hdr')
          .where('list_id', list_id)
          .delete();
      }
    }
    
    await trx.commit();
    
    res.status(200).json({
      success: true,
      temuan_id: temuan_id,
      message: 'Request berhasil diupdate'
    });
    
  } catch (error) {
    await trx.rollback();
    logger(error, 'POST /updateTemuan', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

/**
 * Upload file
 */
export const uploadFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        type: 'error',
        message: 'No file uploaded'
      });
    }
    
    const fileName = await uploadFileToFTP(req.file);
    
    if (fileName) {
      res.status(200).json({
        success: true,
        fileName: fileName
      });
    } else {
      res.status(500).json({
        type: 'error',
        message: 'File upload failed'
      });
    }
  } catch (error) {
    logger(error, 'POST /uploadFile', req.file);
    return res.status(406).json(getErrorResponse(error));
  }
};
