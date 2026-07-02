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
        // .whereNull('f.deleted_at')
        .where('f.folder_domain', req.query.domain)
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
        // .whereNull('f.deleted_at')
        .where('f.folder_domain', req.query.domain)
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

    const mDivisi = await trx('mDivisi')
      .where('divisi_iddiv', folder_iddiv)
      .first();

    const mDept = await trx('mDept')
      .where('dept_id', folder_iddept)
      .first();

    const folderData = {
      folder_name: folder_name.toUpperCase(), // Uppercase as per old system
      folder_iddiv,
      folder_iddept,
      folder_desc: folder_desc || '',
      folder_path: mDivisi.divisi_name + '\\' + mDept.dept_name, // Path will be managed later if needed
      folder_path1: mDivisi.divisi_name + '/' + mDept.dept_name,
      folder_seo: folder_name.toLowerCase().replace(/\s+/g, '-'),
      folder_domain: domain,
      // updated_by: creator_decrypt,
      // updated_at: now,
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
        // .whereNull('deleted_at')
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
        // created_by: creator_decrypt,
        // created_at: now,
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
      // .whereNull('deleted_at')
      .count('* as count')
      .first();

    if (hasSubfolders && hasSubfolders.count > 0) {
      return res.status(406).json({
        type: 'error',
        message: 'Cannot delete folder with subfolders. Please delete subfolders first.',
      });
    }

    // Soft delete
    // await dbDMS('mFolder')
    //   .where('folder_id', id)
    //   .update({
    //     deleted_by: creator_decrypt,
    //     deleted_at: now,
    //   });

    await dbDMS('mFolder')
      .where('folder_id', id)
      .delete();

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
      // .whereNull('f.deleted_at')
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
      // .whereNull('deleted_at')
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
      // .whereNull('deleted_at')
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

// Sub Folder 1 Functions
export const listSubFolder1 = async (req, res) => {
  // #swagger.tags = ['Folder']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Get list of sub folders 1'
  try {
    if (req.query.rowsPerPage == null) {
      // Simple list without pagination
      const subfolders = await dbDMS('mFolder1 as sf1')
        .select(
          'sf1.subfolder1_id',
          'sf1.subfolder1_name',
          'sf1.subfolder1_desc',
          'sf1.subfolder1_path',
          'sf1.subfolder1_idfolder',
          'sf1.subfolder1_iddiv',
          'sf1.subfolder1_iddept',
          'f.folder_name',
          'div.divisi_name',
          'dept.dept_name'
        )
        .leftJoin('mFolder as f', 'f.folder_id', 'sf1.subfolder1_idfolder')
        .leftJoin('mDivisi as div', 'div.divisi_iddiv', 'sf1.subfolder1_iddiv')
        .leftJoin('mDept as dept', 'dept.dept_id', 'sf1.subfolder1_iddept')
        // .whereNull('sf1.deleted_at')
        .where('f.folder_domain', req.query.domain)
        .orderBy('sf1.subfolder1_id', 'desc');

      res.status(200).json(subfolders);
    } else {
      // Paginated list
      const sorting = req.query.descending === "true" ? "desc" : "asc";
      const columnSort = req.query.sortBy === "desc" ? "sf1.subfolder1_id desc" : `sf1.${req.query.sortBy} ${sorting}`;
      const page = Math.floor(req.query.page);

      const response = await dbDMS('mFolder1 as sf1')
        .select(
          'sf1.subfolder1_id',
          'sf1.subfolder1_name',
          'sf1.subfolder1_desc',
          'sf1.subfolder1_path',
          'sf1.subfolder1_idfolder',
          'sf1.subfolder1_iddiv',
          'sf1.subfolder1_iddept',
          'f.folder_name',
          'div.divisi_name',
          'dept.dept_name'
        )
        .leftJoin('mFolder as f', 'f.folder_id', 'sf1.subfolder1_idfolder')
        .leftJoin('mDivisi as div', 'div.divisi_iddiv', 'sf1.subfolder1_iddiv')
        .leftJoin('mDept as dept', 'dept.dept_id', 'sf1.subfolder1_iddept')
        // .whereNull('sf1.deleted_at')
        .where('f.folder_domain', req.query.domain)
        .where((query) => {
          if (req.query.filter != null) {
            query.orWhere("sf1.subfolder1_name", "like", `%${req.query.filter}%`);
            query.orWhere("sf1.subfolder1_desc", "like", `%${req.query.filter}%`);
            query.orWhere("f.folder_name", "like", `%${req.query.filter}%`);
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
    logger(error, 'GET /listSubFolder1', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

export const saveSubFolder1 = async (req, res) => {
  // #swagger.tags = ['Folder']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Save or update sub folder 1'
  const trx = await dbDMS.transaction();
  try {
    const { id, subfolder1_name, subfolder1_idfolder, subfolder1_iddiv, subfolder1_iddept, subfolder1_desc, creator } = req.body;
    const creator_decrypt = decrypt(creator);
    const now = dayjs().format("YYYY-MM-DD HH:mm:ss");

    const mFolder = await trx('mFolder')
      .where('folder_id', subfolder1_idfolder)
      .first();

    if (!mFolder) {
      await trx.rollback();
      return res.status(406).json({
        type: 'error',
        message: 'Main folder not found',
      });
    }

    const mDivisi = await trx('mDivisi')
      .where('divisi_iddiv', subfolder1_iddiv)
      .first();

    const mDept = await trx('mDept')
      .where('dept_id', subfolder1_iddept)
      .first();

    const subfolderData = {
      subfolder1_name: subfolder1_name.toUpperCase(),
      subfolder1_idfolder,
      subfolder1_iddiv,
      subfolder1_iddept,
      subfolder1_desc: subfolder1_desc || '',
      subfolder1_path: mDivisi.divisi_name + '\\' + mDept.dept_name + '\\' + mFolder.folder_name,
      subfolder1_path1: mDivisi.divisi_name + '/' + mDept.dept_name + '/' + mFolder.folder_name,
      subfolder1_seo: subfolder1_name.toLowerCase().replace(/\s+/g, '-'),
      // updated_by: creator_decrypt,
      // updated_at: now,
    };

    if (id && id > 0) {
      // Update existing subfolder
      await trx('mFolder1')
        .where('subfolder1_id', id)
        .update(subfolderData);
    } else {
      // Check if subfolder already exists
      const existing = await trx('mFolder1')
        .where('subfolder1_name', subfolderData.subfolder1_name)
        .where('subfolder1_idfolder', subfolder1_idfolder)
        .where('subfolder1_iddept', subfolder1_iddept)
        // .whereNull('deleted_at')
        .first();

      if (existing) {
        await trx.rollback();
        return res.status(406).json({
          type: 'error',
          message: 'Sub folder with this name already exists in the selected folder',
        });
      }

      // Insert new subfolder
      await trx('mFolder1').insert({
        ...subfolderData,
        // created_by: creator_decrypt,
        // created_at: now,
      });
    }

    await trx.commit();
    return res.json("sukses");
  } catch (error) {
    await trx.rollback();
    logger(error, 'POST /saveSubFolder1', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

export const deleteSubFolder1 = async (req, res) => {
  // #swagger.tags = ['Folder']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Delete sub folder 1 (soft delete)'
  try {
    const { id, creator } = req.body;
    const creator_decrypt = decrypt(creator);
    const now = dayjs().format("YYYY-MM-DD HH:mm:ss");

    // Check if subfolder has sub folders 2
    const hasSubfolders = await dbDMS('mFolder2')
      .where('subfolder2_idsubfolder1', id)
      // .whereNull('deleted_at')
      .count('* as count')
      .first();

    if (hasSubfolders && hasSubfolders.count > 0) {
      return res.status(406).json({
        type: 'error',
        message: 'Cannot delete sub folder with sub folder 2. Please delete sub folder 2 first.',
      });
    }

    // Soft delete
    // await dbDMS('mFolder1')
    //   .where('subfolder1_id', id)
    //   .update({
    //     deleted_by: creator_decrypt,
    //     deleted_at: now,
    //   });

    await dbDMS('mFolder1')
      .where('subfolder1_id', id)
      .delete();

    return res.json("success");
  } catch (error) {
    logger(error, 'POST /deleteSubFolder1', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

// Sub Folder 2 Functions
export const listSubFolder2 = async (req, res) => {
  // #swagger.tags = ['Folder']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Get list of sub folders 2'
  try {
    if (req.query.rowsPerPage == null) {
      // Simple list without pagination
      const subfolders = await dbDMS('mFolder2 as sf2')
        .select(
          'sf2.subfolder2_id',
          'sf2.subfolder2_name',
          'sf2.subfolder2_desc',
          'sf2.subfolder2_path',
          'sf2.subfolder2_idfolder',
          'sf2.subfolder2_idsubfolder1',
          'sf2.subfolder2_iddiv',
          'sf2.subfolder2_iddept',
          'f.folder_name',
          'sf1.subfolder1_name',
          'div.divisi_name',
          'dept.dept_name'
        )
        .leftJoin('mFolder as f', 'f.folder_id', 'sf2.subfolder2_idfolder')
        .leftJoin('mFolder1 as sf1', 'sf1.subfolder1_id', 'sf2.subfolder2_idsubfolder1')
        .leftJoin('mDivisi as div', 'div.divisi_iddiv', 'sf2.subfolder2_iddiv')
        .leftJoin('mDept as dept', 'dept.dept_id', 'sf2.subfolder2_iddept')
        // .whereNull('sf2.deleted_at')
        .where('f.folder_domain', req.query.domain)
        .orderBy('sf2.subfolder2_id', 'desc');

      res.status(200).json(subfolders);
    } else {
      // Paginated list
      const sorting = req.query.descending === "true" ? "desc" : "asc";
      const columnSort = req.query.sortBy === "desc" ? "sf2.subfolder2_id desc" : `sf2.${req.query.sortBy} ${sorting}`;
      const page = Math.floor(req.query.page);

      const response = await dbDMS('mFolder2 as sf2')
        .select(
          'sf2.subfolder2_id',
          'sf2.subfolder2_name',
          'sf2.subfolder2_desc',
          'sf2.subfolder2_path',
          'sf2.subfolder2_idfolder',
          'sf2.subfolder2_idsubfolder1',
          'sf2.subfolder2_iddiv',
          'sf2.subfolder2_iddept',
          'f.folder_name',
          'sf1.subfolder1_name',
          'div.divisi_name',
          'dept.dept_name'
        )
        .leftJoin('mFolder as f', 'f.folder_id', 'sf2.subfolder2_idfolder')
        .leftJoin('mFolder1 as sf1', 'sf1.subfolder1_id', 'sf2.subfolder2_idsubfolder1')
        .leftJoin('mDivisi as div', 'div.divisi_iddiv', 'sf2.subfolder2_iddiv')
        .leftJoin('mDept as dept', 'dept.dept_id', 'sf2.subfolder2_iddept')
        // .whereNull('sf2.deleted_at')
        .where('f.folder_domain', req.query.domain)
        .where((query) => {
          if (req.query.filter != null) {
            query.orWhere("sf2.subfolder2_name", "like", `%${req.query.filter}%`);
            query.orWhere("sf2.subfolder2_desc", "like", `%${req.query.filter}%`);
            query.orWhere("f.folder_name", "like", `%${req.query.filter}%`);
            query.orWhere("sf1.subfolder1_name", "like", `%${req.query.filter}%`);
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
    logger(error, 'GET /listSubFolder2', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

export const saveSubFolder2 = async (req, res) => {
  // #swagger.tags = ['Folder']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Save or update sub folder 2'
  const trx = await dbDMS.transaction();
  try {
    const { id, subfolder2_name, subfolder2_idfolder, subfolder2_idsubfolder1, subfolder2_iddiv, subfolder2_iddept, subfolder2_desc, creator } = req.body;
    const creator_decrypt = decrypt(creator);
    const now = dayjs().format("YYYY-MM-DD HH:mm:ss");

    const mFolder = await trx('mFolder')
      .where('folder_id', subfolder2_idfolder)
      .first();

    const mSubFolder1 = await trx('mFolder1')
      .where('subfolder1_id', subfolder2_idsubfolder1)
      .first();

    if (!mFolder || !mSubFolder1) {
      await trx.rollback();
      return res.status(406).json({
        type: 'error',
        message: 'Main folder or Sub folder 1 not found',
      });
    }

    const mDivisi = await trx('mDivisi')
      .where('divisi_iddiv', subfolder2_iddiv)
      .first();

    const mDept = await trx('mDept')
      .where('dept_id', subfolder2_iddept)
      .first();

    const subfolderData = {
      subfolder2_name: subfolder2_name.toUpperCase(),
      subfolder2_idfolder,
      subfolder2_idsubfolder1,
      subfolder2_iddiv,
      subfolder2_iddept,
      subfolder2_desc: subfolder2_desc || '',
      subfolder2_path: mDivisi.divisi_name + '\\' + mDept.dept_name + '\\' + mFolder.folder_name + '\\' + mSubFolder1.subfolder1_name,
      subfolder2_path1: mDivisi.divisi_name + '/' + mDept.dept_name + '/' + mFolder.folder_name + '/' + mSubFolder1.subfolder1_name,
      subfolder2_seo: subfolder2_name.toLowerCase().replace(/\s+/g, '-'),
      // updated_by: creator_decrypt,
      // updated_at: now,
    };

    if (id && id > 0) {
      // Update existing subfolder
      await trx('mFolder2')
        .where('subfolder2_id', id)
        .update(subfolderData);
    } else {
      // Check if subfolder already exists
      const existing = await trx('mFolder2')
        .where('subfolder2_name', subfolderData.subfolder2_name)
        .where('subfolder2_idsubfolder1', subfolder2_idsubfolder1)
        .where('subfolder2_iddept', subfolder2_iddept)
        // .whereNull('deleted_at')
        .first();

      if (existing) {
        await trx.rollback();
        return res.status(406).json({
          type: 'error',
          message: 'Sub folder 2 with this name already exists in the selected sub folder 1',
        });
      }

      // Insert new subfolder
      await trx('mFolder2').insert({
        ...subfolderData,
        // created_by: creator_decrypt,
        // created_at: now,
      });
    }

    await trx.commit();
    return res.json("sukses");
  } catch (error) {
    await trx.rollback();
    logger(error, 'POST /saveSubFolder2', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

export const deleteSubFolder2 = async (req, res) => {
  // #swagger.tags = ['Folder']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Delete sub folder 2 (soft delete)'
  try {
    const { id, creator } = req.body;
    const creator_decrypt = decrypt(creator);
    const now = dayjs().format("YYYY-MM-DD HH:mm:ss");

    // Soft delete
    // await dbDMS('mFolder2')
    //   .where('subfolder2_id', id)
    //   .update({
    //     deleted_by: creator_decrypt,
    //     deleted_at: now,
    //   });

    await dbDMS('mFolder2')
      .where('subfolder2_id', id)
      .delete();

    return res.json("success");
  } catch (error) {
    logger(error, 'POST /deleteSubFolder2', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

// Dropdown selects
export const getSelectFolder = async (req, res) => {
  // #swagger.tags = ['Folder']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Get list of folders for dropdown'
  try {
    const { iddept } = req.query;

    let query = dbDMS('mFolder')
      .select(
        'folder_id as value',
        'folder_name as label'
      )
      // .whereNull('deleted_at')
      .orderBy('folder_name', 'asc');

    if (iddept && iddept !== '0') {
      query = query.where('folder_iddept', iddept);
    }

    const folders = await query;
    res.status(200).json(folders);
  } catch (error) {
    logger(error, 'GET /getSelectFolder', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

export const getSelectSubFolder1 = async (req, res) => {
  // #swagger.tags = ['Folder']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Get list of sub folders 1 for dropdown'
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
