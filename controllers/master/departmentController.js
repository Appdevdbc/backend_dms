import { dbWJS } from "../../config/db.js";
import { decrypt, encrypt, getErrorResponse } from "../../helpers/utils.js";
import { logger } from "../../helpers/logger.js";
import dayjs from "dayjs";

export const listDepartments = async (req, res) => {
  // #swagger.tags = ['Department']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Get list of departments'
  try {
    const { rowsPerPage, descending, sortBy, page, filter } = req.query;
    
    // Simple list without pagination
    if (!rowsPerPage) {
      const response = await dbWJS('Department as d')
        .leftJoin('Site as s', 'd.id_site', 's.id_site')
        .select('d.id_dept', 'd.nama', 'd.id_site', 's.nama as nama_site')
        .orderBy('d.nama', 'asc');
      
      return res.status(200).json(response);
    }
    
    // Paginated list
    const sorting = descending === 'true' ? 'desc' : 'asc';
    const columnSort = sortBy === 'desc' ? 'd.id_dept asc' : `d.${sortBy} ${sorting}`;
    const currentPage = Math.floor(page);
    const perPage = Math.floor(rowsPerPage);
    
    let query = dbWJS('Department as d')
      .leftJoin('Site as s', 'd.id_site', 's.id_site')
      .select('d.id_dept', 'd.nama', 'd.id_site', 's.nama as nama_site', 'd.created_at', 'd.updated_at');
    
    // Apply filter if provided
    if (filter) {
      query = query.where((subQuery) => {
        subQuery
          .orWhere('d.nama', 'like', `%${filter}%`)
          .orWhere('s.nama', 'like', `%${filter}%`)
          .orWhereRaw('CAST(d.id_dept AS varchar) like ?', `%${filter}%`);
      });
    }
    
    const response = await query
      .orderByRaw(columnSort)
      .paginate({
        perPage,
        currentPage,
        isLengthAware: true,
      });
    
    // Encrypt IDs
    response.data.forEach(item => {
      item.id_dept_encrypted = encrypt(item.id_dept.toString());
    });
    
    res.status(200).json(response);
  } catch (error) {
    logger(error, 'GET /listDepartments', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

export const getDepartmentSites = async (req, res) => {
  // #swagger.tags = ['Department']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Get list of sites for department dropdown'
  try {
    const sites = await dbWJS('Site')
      .select('id_site', 'nama')
      .orderBy('nama', 'asc');
    
    res.status(200).json(sites);
  } catch (error) {
    logger(error, 'GET /getDepartmentSites', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

export const saveDepartment = async (req, res) => {
  // #swagger.tags = ['Department']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Save or update department'
  const trx = await dbWJS.transaction();
  try {
    const { id_dept, nama, id_site, creator: encryptedCreator } = req.body;
    const now = dayjs().format("YYYY-MM-DD HH:mm:ss");
    const creator = decrypt(encryptedCreator);
    
    if (!nama) {
      await trx.rollback();
      return res.status(406).json({
        type: 'error',
        message: 'Nama department wajib diisi'
      });
    }
    
    if (!id_site) {
      await trx.rollback();
      return res.status(406).json({
        type: 'error',
        message: 'Site wajib dipilih'
      });
    }
    
    // Check if name already exists (for different ID)
    const existingDept = await trx('Department')
      .where('nama', nama)
      .where('id_dept', '<>', id_dept || 0)
      .first();
    
    if (existingDept) {
      await trx.rollback();
      return res.status(406).json({
        type: 'error',
        message: 'Nama department sudah ada'
      });
    }
    
    if (id_dept) {
      // Update existing
      await trx('Department')
        .where('id_dept', id_dept)
        .update({
          nama,
          id_site,
          updated_at: now
        });
    } else {
      // Insert new
      await trx('Department').insert({
        nama,
        id_site,
        created_at: now,
        updated_at: now
      });
    }
    
    await trx.commit();
    res.status(200).json({ message: 'sukses' });
  } catch (error) {
    await trx.rollback();
    logger(error, 'POST /saveDepartment', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

export const deleteDepartment = async (req, res) => {
  // #swagger.tags = ['Department']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Delete department'
  const trx = await dbWJS.transaction();
  try {
    const { id_dept: encryptedId, creator: encryptedCreator } = req.body;
    const id_dept = decrypt(encryptedId);
    const creator = decrypt(encryptedCreator);
    
    // Hard delete (no dependency check as per PHP version)
    await trx('Department')
      .where('id_dept', id_dept)
      .delete();
    
    await trx.commit();
    res.status(200).json({ message: 'sukses' });
  } catch (error) {
    await trx.rollback();
    logger(error, 'DELETE /deleteDepartment', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};
