import { dbDMS } from "../../config/db.js";
import dayjs from "dayjs";
import * as dotenv from 'dotenv';
import { decrypt, getErrorResponse } from "../../helpers/utils.js";
import { logger } from "../../helpers/logger.js";
dotenv.config();

export const listFolder = async (req, res) => {
  // #swagger.tags = ['Folder']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Get list of folders'
  try {
    if (req.query.rowsPerPage == null) {
      // Simple list without pagination
      const folders = await dbDMS('mFolder as f')
        .select(
          'f.folder_id',
          'f.folder_name',
          'f.folder_desc',
          'f.folder_path',
          'f.folder_iddiv',
          'f.folder_iddept',
          'f.folder_domain',
          'div.divisi_name',
          'dept.dept_name'
        )
        .leftJoin('mDivisi as div', 'div.divisi_iddiv', 'f.folder_iddiv')
        .leftJoin('mDept as dept', 'dept.dept_id', 'f.folder_iddept')
        .whereNull('f.deleted_at')
        .orderBy('f.folder_id', 'desc');
      
      res.status(200).json(folders);
    } else {
      // Paginated list
      const sorting = req.query.descending === "true" ? "desc" : "asc";
      const columnSort = req.query.sortBy === "desc" ? "f.folder_id desc" : `f.${req.query.sortBy} ${sorting}`;
      const page = Math.floor(req.query.page);
      
      const response = await dbDMS('mFolder as f')
        .select(
          'f.folder_id',
          'f.folder_name',
          'f.folder_desc',
          'f.folder_path',
          'f.folder_iddiv',
          'f.folder_iddept',
          'f.folder_domain',
          'div.divisi_name',
          'dept.dept_name'
        )
        .leftJoin('mDivisi as div', 'div.divisi_iddiv', 'f.folder_iddiv')
        .leftJoin('mDept as dept', 'dept.dept_id', 'f.folder_iddept')
        .whereNull('f.deleted_at')
        .where((query) => {
          if (req.query.filter != null) {
            query.orWhere("f.folder_name", "like", `%${req.query.filter}%`);
            query.orWhere("f.folder_desc", "like", `%${req.query.filter}%`);
            query.orWhere("div.divisi_name", "like", `%${req.query.filter}%`);
            query.orWhere("dept.dept_name", "like", `%${req.query.filter}%`);
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
    logger(error, 'GET /listFolder', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

export const saveFolder = async (req, res) => {
  // #swagger.tags = ['Folder']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Save or update folder'
  const trx = await dbDMS.transaction();
  try {
    const { id, folder_name, folder_iddiv, folder_iddept, folder_desc, creator } = req.body;
    const creator_decrypt = decrypt(creator);
    const now = dayjs().format("YYYY-MM-DD HH:mm:ss");
    
    // Get domain from request or use default
    const domain = req.body.domain || process.env.DEFAULT_DOMAIN || 'DMS';
    
    const folderData = {
      folder_name: folder_name.toUpperCase(), // Uppercase as per old system
      folder_iddiv,
      folder_iddept,
      folder_desc: folder_desc || '',
      folder_path: '', // Path will be managed later if needed
      folder_path1: '',
      folder_seo: folder_name.toLowerCase().replace(/\s+/g, '-'),
      folder_domain: domain,
      updated_by: creator_decrypt,
      updated_at: now,
    };
    
    if (id && id > 0) {
      // Update existing folder
      await trx('mFolder')
        .where('folder_id', id)
        .update(folderData);
    } else {
      // Check if folder already exists in same department
      const existing = await trx('mFolder')
        .where('folder_name', folderData.folder_name)
        .where('folder_iddept', folder_iddept)
        .where('folder_domain', domain)
        .whereNull('deleted_at')
        .first();
      
      if (existing) {
        await trx.rollback();
        return res.status(406).json({
          type: 'error',
          message: 'Folder with this name already exists in the selected department',
        });
      }
      
      // Insert new folder
      await trx('mFolder').insert({
        ...folderData,
        created_by: creator_decrypt,
        created_at: now,
      });
    }
    
    await trx.commit();
    return res.json("sukses");
  } catch (error) {
    await trx.rollback();
    logger(error, 'POST /saveFolder', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

export const deleteFolder = async (req, res) => {
  // #swagger.tags = ['Folder']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Delete folder (soft delete)'
  try {
    const { id, creator } = req.body;
    const creator_decrypt = decrypt(creator);
    const now = dayjs().format("YYYY-MM-DD HH:mm:ss");
    
    // Check if folder has subfolders
    const hasSubfolders = await dbDMS('mFolder1')
      .where('subfolder1_idfolder', id)
      .whereNull('deleted_at')
      .count('* as count')
      .first();
    
    if (hasSubfolders && hasSubfolders.count > 0) {
      return res.status(406).json({
        type: 'error',
        message: 'Cannot delete folder with subfolders. Please delete subfolders first.',
      });
    }
    
    // Soft delete
    await dbDMS('mFolder')
      .where('folder_id', id)
      .update({
        deleted_by: creator_decrypt,
        deleted_at: now,
      });
    
    return res.json("success");
  } catch (error) {
    logger(error, 'POST /deleteFolder', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

export const getFolderById = async (req, res) => {
  // #swagger.tags = ['Folder']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Get folder by ID'
  try {
    const { id } = req.query;
    
    const folder = await dbDMS('mFolder as f')
      .select(
        'f.folder_id',
        'f.folder_name',
        'f.folder_desc',
        'f.folder_path',
        'f.folder_iddiv',
        'f.folder_iddept',
        'f.folder_domain',
        'div.divisi_name',
        'dept.dept_name'
      )
      .leftJoin('mDivisi as div', 'div.divisi_iddiv', 'f.folder_iddiv')
      .leftJoin('mDept as dept', 'dept.dept_id', 'f.folder_iddept')
      .where('f.folder_id', id)
      .whereNull('f.deleted_at')
      .first();
    
    if (!folder) {
      return res.status(404).json({
        type: 'error',
        message: 'Folder not found',
      });
    }
    
    res.status(200).json(folder);
  } catch (error) {
    logger(error, 'GET /getFolderById', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

export const getSelectDivisi = async (req, res) => {
  // #swagger.tags = ['Folder']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Get list of divisions for dropdown'
  try {
    const divisi = await dbDMS('mDivisi')
      .select(
        'divisi_iddiv as value',
        'divisi_name as label'
      )
      .whereNull('deleted_at')
      .orderBy('divisi_name', 'asc');
    
    res.status(200).json(divisi);
  } catch (error) {
    logger(error, 'GET /getSelectDivisi', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

export const getSelectDept = async (req, res) => {
  // #swagger.tags = ['Folder']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Get list of departments by division for dropdown'
  try {
    const { iddiv } = req.query;
    
    let query = dbDMS('mDept')
      .select(
        'dept_id as value',
        'dept_name as label'
      )
      .whereNull('deleted_at')
      .orderBy('dept_name', 'asc');
    
    if (iddiv && iddiv !== '0') {
      query = query.where('dept_divisi', iddiv);
    }
    
    const dept = await query;
    res.status(200).json(dept);
  } catch (error) {
    logger(error, 'GET /getSelectDept', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

// Placeholder exports for future Sub Folder 1 implementation
export const listSubFolder1 = async (req, res) => {
  res.status(200).json([]);
};

export const saveSubFolder1 = async (req, res) => {
  res.status(501).json({ message: 'Not implemented yet' });
};

export const deleteSubFolder1 = async (req, res) => {
  res.status(501).json({ message: 'Not implemented yet' });
};

// Placeholder exports for future Sub Folder 2 implementation
export const listSubFolder2 = async (req, res) => {
  res.status(200).json([]);
};

export const saveSubFolder2 = async (req, res) => {
  res.status(501).json({ message: 'Not implemented yet' });
};

export const deleteSubFolder2 = async (req, res) => {
  res.status(501).json({ message: 'Not implemented yet' });
};

export const getSelectFolder = async (req, res) => {
  res.status(200).json([]);
};

export const getSelectSubFolder1 = async (req, res) => {
  res.status(200).json([]);
};
