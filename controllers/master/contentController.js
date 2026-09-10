import { dbDMS } from "../../config/db.js";
import dayjs from "dayjs";
import * as dotenv from 'dotenv';
import { decrypt, getErrorResponse } from "../../helpers/utils.js";
import { logger } from "../../helpers/logger.js";
import { uploadToFTP } from "../../helpers/ftp.js";
import multer from 'multer';
import path from 'path';
import fs from 'fs';
dotenv.config();

// Multer configuration for file upload
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = 'file/';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // Keep original filename
    cb(null, file.originalname);
  }
});

export const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  }
});

export const listContent = async (req, res) => {
  // #swagger.tags = ['Content']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Get list of contents'
  try {
    if (req.query.rowsPerPage == null) {
      // Simple list without pagination
      const contents = await dbDMS('mContent as c')
        .select(
          'c.content_id',
          'c.content_no',
          'c.content_name',
          'c.content_revision',
          'c.content_note_revision',
          'c.content_entry_date',
          'c.content_eff_date',
          'c.content_iddiv',
          'c.content_iddept',
          'c.content_idfolder',
          'c.content_idsubfolder1',
          'c.content_idsubfolder2',
          'c.content_file',
          'c.content_file1',
          'c.content_active',
          'c.content_klasifikasi',
          'c.content_domain',
          'div.divisi_name',
          'dept.dept_name',
          'f.folder_name',
          'sf1.subfolder1_name',
          'sf2.subfolder2_name'
        )
        .leftJoin('mDivisi as div', 'div.divisi_iddiv', 'c.content_iddiv')
        .leftJoin('mDept as dept', 'dept.dept_id', 'c.content_iddept')
        .leftJoin('mFolder as f', 'f.folder_id', 'c.content_idfolder')
        .leftJoin('mFolder1 as sf1', 'sf1.subfolder1_id', 'c.content_idsubfolder1')
        .leftJoin('mFolder2 as sf2', 'sf2.subfolder2_id', 'c.content_idsubfolder2')
        // .whereNull('c.deleted_at')
        .orderBy('c.content_id', 'desc');

      res.status(200).json(contents);
    } else {
      // Paginated list
      const sorting = req.query.descending === "true" ? "desc" : "asc";
      const columnSort = req.query.sortBy === "desc" ? "c.content_id desc" : `${req.query.sortBy} ${sorting}`;
      const page = Math.floor(req.query.page);

      const response = await dbDMS('mContent as c')
        .select(
          'c.content_id',
          'c.content_no',
          'c.content_name',
          'c.content_revision',
          'c.content_note_revision',
          'c.content_entry_date',
          'c.content_eff_date',
          'c.content_iddiv',
          'c.content_iddept',
          'c.content_idfolder',
          'c.content_idsubfolder1',
          'c.content_idsubfolder2',
          'c.content_file',
          'c.content_file1',
          'c.content_active',
          'c.content_klasifikasi',
          'c.content_domain',
          'div.divisi_name',
          'dept.dept_name',
          'f.folder_name',
          'sf1.subfolder1_name',
          'sf2.subfolder2_name'
        )
        .leftJoin('mDivisi as div', 'div.divisi_iddiv', 'c.content_iddiv')
        .leftJoin('mDept as dept', 'dept.dept_id', 'c.content_iddept')
        .leftJoin('mFolder as f', 'f.folder_id', 'c.content_idfolder')
        .leftJoin('mFolder1 as sf1', 'sf1.subfolder1_id', 'c.content_idsubfolder1')
        .leftJoin('mFolder2 as sf2', 'sf2.subfolder2_id', 'c.content_idsubfolder2')
        // .whereNull('c.deleted_at')
        .where((query) => {
          if (req.query.filter != null) {
            query.orWhere("c.content_no", "like", `%${req.query.filter}%`);
            query.orWhere("c.content_name", "like", `%${req.query.filter}%`);
            query.orWhere("div.divisi_name", "like", `%${req.query.filter}%`);
            query.orWhere("dept.dept_name", "like", `%${req.query.filter}%`);
            query.orWhere("f.folder_name", "like", `%${req.query.filter}%`);
          }
        })
        .orderByRaw(columnSort)
        .paginate({
          perPage: Math.floor(req.query.rowsPerPage),
          currentPage: page,
          isLengthAware: true,
        });

      res.status(200).json(response);
    }
  } catch (error) {
    logger(error, 'GET /listContent', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

export const saveContent = async (req, res) => {
  // #swagger.tags = ['Content']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Save or update content with file upload'
  const trx = await dbDMS.transaction();
  try {
    const {
      id,
      content_no,
      content_name,
      content_revision,
      content_note_revision,
      content_entry_date,
      content_eff_date,
      content_iddiv,
      content_iddept,
      content_idfolder,
      content_idsubfolder1,
      content_idsubfolder2,
      content_active,
      content_klasifikasi,
      creator
    } = req.body;

    const creator_decrypt = decrypt(creator);
    const now = dayjs().format("YYYY-MM-DD HH:mm:ss");

    // Get domain from request or use default
    const domain = req.body.domain || process.env.DEFAULT_DOMAIN || 'DMS';

    // Get existing file names if updating
    let existingFile = '';
    let existingFile1 = '';
    
    if (id && id > 0) {
      const existing = await trx('mContent')
        .select('content_file', 'content_file1')
        .where('content_id', id)
        .first();
      
      if (existing) {
        existingFile = existing.content_file || '';
        existingFile1 = existing.content_file1 || '';
      }
    } else {
      // For new content, check existing active content with same number
      const existing = await trx('mContent')
        .select('content_file', 'content_file1')
        .where('content_no', content_no)
        .where('content_active', 1)
        .where('content_domain', domain)
        .first();
      
      if (existing) {
        existingFile = existing.content_file || '';
        existingFile1 = existing.content_file1 || '';
      }
    }

    // Handle file uploads
    let fileName = existingFile;
    let fileName1 = existingFile1;

    // Process main file (content_file)
    if (req.files && req.files['file'] && req.files['file'][0]) {
      const file = req.files['file'][0];
      fileName = file.originalname;
      
      try {
        // Upload to FTP
        const ftpPath = process.env.FTP_UPLOAD_DIR || '/dms';
        await uploadToFTP(file.path, `${ftpPath}/${fileName}`);
        
        // Delete temporary file
        fs.unlinkSync(file.path);
      } catch (ftpError) {
        await trx.rollback();
        logger(ftpError, 'FTP Upload Error - file', { fileName });
        return res.status(406).json({
          type: 'error',
          message: 'Gagal upload file ke FTP server',
        });
      }
    }

    // return false;

    // Process attachment file (content_file1)
    if (req.files && req.files['file1'] && req.files['file1'][0]) {
      const file1 = req.files['file1'][0];
      fileName1 = file1.originalname;
      
      try {
        // Upload to FTP
        const ftpPath = process.env.FTP_UPLOAD_DIR || '/dms';
        await uploadToFTP(file1.path, `${ftpPath}/${fileName1}`);
        
        // Delete temporary file
        fs.unlinkSync(file1.path);
      } catch (ftpError) {
        await trx.rollback();
        logger(ftpError, 'FTP Upload Error - file1', { fileName1 });
        return res.status(406).json({
          type: 'error',
          message: 'Gagal upload file lampiran ke FTP server',
        });
      }
    }

    const contentData = {
      content_no,
      content_name,
      content_revision: content_revision || 0,
      content_note_revision: content_note_revision || '',
      content_entry_date: content_entry_date ? dayjs(content_entry_date).format("YYYY-MM-DD") : null,
      content_eff_date: content_eff_date ? dayjs(content_eff_date).format("YYYY-MM-DD") : null,
      content_iddiv,
      content_iddept,
      content_idfolder,
      content_idsubfolder1: content_idsubfolder1 || null,
      content_idsubfolder2: content_idsubfolder2 || null,
      content_file: fileName,
      content_file1: fileName1,
      content_active: content_active !== undefined ? content_active : 1,
      content_klasifikasi: content_klasifikasi || '',
      content_domain: domain,
    };

    if (id && id > 0) {
      // Update existing content
      const oldContent = await trx('mContent')
        .select('content_revision', 'content_active')
        .where('content_id', id)
        .first();

      await trx('mContent')
        .where('content_id', id)
        .update(contentData);

      // Send email notification if revision changed
      if (oldContent && content_revision > oldContent.content_revision) {
        // TODO: Implement email notification
        // http_request to email API: type=send_email_update_document
        logger({ message: 'Email notification: document updated', no: content_no, rev: content_revision, id }, 'Email Queue', {});
      }

      // Send email notification if deactivated
      if (oldContent && content_active == 0 && oldContent.content_active == 1) {
        // TODO: Implement email notification
        // http_request to email API: type=send_email_nonactive_document
        logger({ message: 'Email notification: document deactivated', no: content_no, id }, 'Email Queue', {});
      }
    } else {
      // Check if content with same no and revision already exists
      const existingContent = await trx('mContent')
        .where('content_no', content_no)
        .where('content_revision', content_revision)
        .where('content_domain', domain)
        .first();

      if (existingContent) {
        await trx.rollback();
        return res.status(406).json({
          type: 'error',
          message: 'Dokumen dengan nomor dan revisi ini sudah ada',
        });
      }

      // Deactivate old content with same number (if exists and active)
      const oldActiveContent = await trx('mContent')
        .select('content_id')
        .where('content_no', content_no)
        .where('content_active', 1)
        .where('content_domain', domain)
        .first();

      if (oldActiveContent) {
        await trx('mContent')
          .where('content_id', oldActiveContent.content_id)
          .update({ content_active: 0 });
      }

      // Insert new content
      await trx('mContent').insert(contentData);

      // Send email notification for new document
      // TODO: Implement email notification
      // http_request to email API: type=new_document
      logger({ message: 'Email notification: new document', no: content_no, rev: content_revision }, 'Email Queue', {});
    }

    await trx.commit();
    return res.json("sukses");
  } catch (error) {
    await trx.rollback();
    
    // Clean up uploaded files if error occurs
    if (req.files) {
      if (req.files['file'] && req.files['file'][0]) {
        try {
          fs.unlinkSync(req.files['file'][0].path);
        } catch (e) {}
      }
      if (req.files['file1'] && req.files['file1'][0]) {
        try {
          fs.unlinkSync(req.files['file1'][0].path);
        } catch (e) {}
      }
    }
    
    logger(error, 'POST /saveContent', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

export const deleteContent = async (req, res) => {
  // #swagger.tags = ['Content']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Delete content (soft delete)'
  try {
    const { id, creator } = req.body;
    const creator_decrypt = decrypt(creator);
    const now = dayjs().format("YYYY-MM-DD HH:mm:ss");

    // Soft delete
    // await dbDMS('mContent')
    //   .where('content_id', id)
    //   .update({
    //     deleted_by: creator_decrypt,
    //     deleted_at: now,
    //   });

    await dbDMS('mContent')
      .where('content_id', id)
      .delete();

    return res.json("success");
  } catch (error) {
    logger(error, 'POST /deleteContent', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

export const getContentById = async (req, res) => {
  // #swagger.tags = ['Content']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Get content by ID'
  try {
    const { id } = req.query;

    const content = await dbDMS('mContent as c')
      .select(
        'c.content_id',
        'c.content_no',
        'c.content_name',
        'c.content_revision',
        'c.content_note_revision',
        'c.content_entry_date',
        'c.content_eff_date',
        'c.content_iddiv',
        'c.content_iddept',
        'c.content_idfolder',
        'c.content_idsubfolder1',
        'c.content_idsubfolder2',
        'c.content_file',
        'c.content_file1',
        'c.content_active',
        'c.content_klasifikasi',
        'c.content_domain',
        'div.divisi_name',
        'dept.dept_name',
        'f.folder_name',
        'sf1.subfolder1_name',
        'sf2.subfolder2_name'
      )
      .leftJoin('mDivisi as div', 'div.divisi_iddiv', 'c.content_iddiv')
      .leftJoin('mDept as dept', 'dept.dept_id', 'c.content_iddept')
      .leftJoin('mFolder as f', 'f.folder_id', 'c.content_idfolder')
      .leftJoin('mFolder1 as sf1', 'sf1.subfolder1_id', 'c.content_idsubfolder1')
      .leftJoin('mFolder2 as sf2', 'sf2.subfolder2_id', 'c.content_idsubfolder2')
      .where('c.content_id', id)
      // .whereNull('c.deleted_at')
      .first();

    if (!content) {
      return res.status(404).json({
        type: 'error',
        message: 'Content not found',
      });
    }

    res.status(200).json(content);
  } catch (error) {
    logger(error, 'GET /getContentById', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

export const getSelectKlasifikasi = async (req, res) => {
  // #swagger.tags = ['Content']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Get list of klasifikasi for dropdown'
  try {
    // Return hardcoded options or from a klasifikasi table if exists
    // const klasifikasi = [
    //   { value: 'UMUM', label: 'UMUM' },
    //   { value: 'TERBATAS', label: 'TERBATAS' },
    //   { value: 'RAHASIA', label: 'RAHASIA' }
    // ];

    const klasifikasi = await dbDMS('mKlasifikasi')
      .select(
        'klf_id as value',
        'klf_name as label'
      );

    res.status(200).json(klasifikasi);
  } catch (error) {
    logger(error, 'GET /getSelectKlasifikasi', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

export const getSelectSubFolder1 = async (req, res) => {
  // #swagger.tags = ['Content']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Get list of sub folders 1 by folder for dropdown'
  try {
    const { idfolder } = req.query;

    let query = dbDMS('mFolder1')
      .select(
        'subfolder1_id as value',
        'subfolder1_name as label'
      )
      // .whereNull('deleted_at')
      .orderBy('subfolder1_name', 'asc');

    if (idfolder && idfolder !== '0') {
      query = query.where('subfolder1_idfolder', idfolder);
    }

    const subfolders = await query;
    res.status(200).json(subfolders);
  } catch (error) {
    logger(error, 'GET /getSelectSubFolder1', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

export const getSelectSubFolder2 = async (req, res) => {
  // #swagger.tags = ['Content']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Get list of sub folders 2 by sub folder 1 for dropdown'
  try {
    const { idsubfolder1 } = req.query;

    let query = dbDMS('mFolder2')
      .select(
        'subfolder2_id as value',
        'subfolder2_name as label'
      )
      // .whereNull('deleted_at')
      .orderBy('subfolder2_name', 'asc');

    if (idsubfolder1 && idsubfolder1 !== '0') {
      query = query.where('subfolder2_idsubfolder1', idsubfolder1);
    }

    const subfolders = await query;
    res.status(200).json(subfolders);
  } catch (error) {
    logger(error, 'GET /getSelectSubFolder2', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

export const toggleContentStatus = async (req, res) => {
  // #swagger.tags = ['Content']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Toggle content active/inactive status'
  try {
    const { id, content_active, creator } = req.body;
    const creator_decrypt = decrypt(creator);
    const now = dayjs().format("YYYY-MM-DD HH:mm:ss");

    await dbDMS('mContent')
      .where('content_id', id)
      .update({
        content_active: content_active,
        // updated_by: creator_decrypt,
        // updated_at: now,
      });

    return res.json("success");
  } catch (error) {
    logger(error, 'POST /toggleContentStatus', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};
