import { dbDMS } from "../../config/db.js";
import dayjs from "dayjs";
import * as dotenv from 'dotenv';
import { decrypt, getErrorResponse } from "../../helpers/utils.js";
import { logger } from "../../helpers/logger.js";
dotenv.config();

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
        .whereNull('c.deleted_at')
        .orderBy('c.content_id', 'desc');
      
      res.status(200).json(contents);
    } else {
      // Paginated list
      const sorting = req.query.descending === "true" ? "desc" : "asc";
      const columnSort = req.query.sortBy === "desc" ? "c.content_id desc" : `c.${req.query.sortBy} ${sorting}`;
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
        .whereNull('c.deleted_at')
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
  // #swagger.description = 'Save or update content'
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
      content_file,
      content_file1,
      content_active,
      content_klasifikasi,
      creator 
    } = req.body;
    
    const creator_decrypt = decrypt(creator);
    const now = dayjs().format("YYYY-MM-DD HH:mm:ss");
    
    // Get domain from request or use default
    const domain = req.body.domain || process.env.DEFAULT_DOMAIN || 'DMS';
    
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
      content_file: content_file || '',
      content_file1: content_file1 || '',
      content_active: content_active !== undefined ? content_active : 1,
      content_klasifikasi: content_klasifikasi || '',
      content_domain: domain,
      updated_by: creator_decrypt,
      updated_at: now,
    };
    
    if (id && id > 0) {
      // Update existing content
      await trx('mContent')
        .where('content_id', id)
        .update(contentData);
    } else {
      // Check if content with same no already exists and is active
      const existing = await trx('mContent')
        .where('content_no', content_no)
        .where('content_active', 1)
        .where('content_domain', domain)
        .whereNull('deleted_at')
        .first();
      
      if (existing) {
        await trx.rollback();
        return res.status(406).json({
          type: 'error',
          message: 'Dokumen dengan nomor ini sudah ada dan aktif',
        });
      }
      
      // Insert new content
      await trx('mContent').insert({
        ...contentData,
        created_by: creator_decrypt,
        created_at: now,
      });
    }
    
    await trx.commit();
    return res.json("sukses");
  } catch (error) {
    await trx.rollback();
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
    await dbDMS('mContent')
      .where('content_id', id)
      .update({
        deleted_by: creator_decrypt,
        deleted_at: now,
      });
    
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
      .whereNull('c.deleted_at')
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
    const klasifikasi = [
      { value: 'UMUM', label: 'UMUM' },
      { value: 'TERBATAS', label: 'TERBATAS' },
      { value: 'RAHASIA', label: 'RAHASIA' }
    ];
    
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
      .whereNull('deleted_at')
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
      .whereNull('deleted_at')
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
        updated_by: creator_decrypt,
        updated_at: now,
      });
    
    return res.json("success");
  } catch (error) {
    logger(error, 'POST /toggleContentStatus', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};
