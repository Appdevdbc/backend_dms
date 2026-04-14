import { dbWJS } from "../../config/db.js";
import { decrypt, encrypt, getErrorResponse } from "../../helpers/utils.js";
import { logger } from "../../helpers/logger.js";
import dayjs from "dayjs";

// List TJKN (General)
export const listTJKN = async (req, res) => {
  // #swagger.tags = ['TJKN']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Get list of TJKN records'
  try {
    const { rowsPerPage, descending, sortBy, page, filter } = req.query;
    
    // Simple list without pagination
    if (!rowsPerPage) {
      const response = await dbWJS('TJKN')
        .select('tjkn_id', 'tjkn_year', 'tjkn_month', 'tjkn_duration')
        .orderBy('tjkn_year', 'desc')
        .orderBy('tjkn_month', 'asc');
      
      return res.status(200).json(response);
    }
    
    // Paginated list
    const sorting = descending === 'true' ? 'desc' : 'asc';
    const columnSort = sortBy === 'desc' ? 'tjkn_id asc' : `${sortBy} ${sorting}`;
    const currentPage = Math.floor(page);
    const perPage = Math.floor(rowsPerPage);
    
    let query = dbWJS('TJKN as t')
      .leftJoin('Month as m', 't.tjkn_month', 'm.mth_id')
      .select(
        't.tjkn_id',
        't.tjkn_year',
        't.tjkn_month',
        'm.mth_name as month_name',
        't.tjkn_duration',
        't.created_at',
        't.updated_at'
      );
    
    // Apply filter if provided
    if (filter) {
      query = query.where((subQuery) => {
        subQuery
          .orWhere('t.tjkn_year', 'like', `%${filter}%`)
          .orWhere('m.mth_name', 'like', `%${filter}%`)
          .orWhere('t.tjkn_duration', 'like', `%${filter}%`)
          .orWhereRaw('CAST(t.tjkn_id AS varchar) like ?', `%${filter}%`);
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
      item.tjkn_id_encrypted = encrypt(item.tjkn_id.toString());
    });
    
    res.status(200).json(response);
  } catch (error) {
    logger(error, 'GET /listTJKN', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

// List TJKN Employee
export const listTJKNEmployee = async (req, res) => {
  // #swagger.tags = ['TJKN']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Get list of TJKN Employee records'
  try {
    const { rowsPerPage, descending, sortBy, page, filter, nik } = req.query;
    
    // Simple list without pagination
    if (!rowsPerPage) {
      let query = dbWJS('TJKN_Employee')
        .select('tjkn_id', 'tjkn_nik', 'tjkn_year', 'tjkn_month', 'tjkn_duration')
        .orderBy('tjkn_year', 'desc')
        .orderBy('tjkn_month', 'asc');
      
      if (nik && nik !== 'all') {
        query = query.where('tjkn_nik', nik);
      }
      
      const response = await query;
      return res.status(200).json(response);
    }
    
    // Paginated list
    const sorting = descending === 'true' ? 'desc' : 'asc';
    const columnSort = sortBy === 'desc' ? 'tjkn_id asc' : `${sortBy} ${sorting}`;
    const currentPage = Math.floor(page);
    const perPage = Math.floor(rowsPerPage);
    
    let query = dbWJS('TJKN_Employee as te')
      .leftJoin('Month as m', 'te.tjkn_month', 'm.mth_id')
      .select(
        'te.tjkn_id',
        'te.tjkn_nik',
        'te.tjkn_year',
        'te.tjkn_month',
        'm.mth_name as month_name',
        'te.tjkn_duration',
        'te.created_at',
        'te.updated_at'
      );
    
    // Filter by NIK if provided
    if (nik && nik !== 'all') {
      query = query.where('te.tjkn_nik', nik);
    }
    
    // Apply search filter if provided
    if (filter) {
      query = query.where((subQuery) => {
        subQuery
          .orWhere('te.tjkn_year', 'like', `%${filter}%`)
          .orWhere('m.mth_name', 'like', `%${filter}%`)
          .orWhere('te.tjkn_duration', 'like', `%${filter}%`)
          .orWhere('te.tjkn_nik', 'like', `%${filter}%`)
          .orWhereRaw('CAST(te.tjkn_id AS varchar) like ?', `%${filter}%`);
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
      item.tjkn_id_encrypted = encrypt(item.tjkn_id.toString());
    });
    
    res.status(200).json(response);
  } catch (error) {
    logger(error, 'GET /listTJKNEmployee', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

// Get months list
export const getMonths = async (req, res) => {
  // #swagger.tags = ['TJKN']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Get list of months'
  try {
    const months = await dbWJS('Month')
      .select('mth_id', 'mth_name')
      .orderBy('mth_id', 'asc');
    
    res.status(200).json(months);
  } catch (error) {
    logger(error, 'GET /getMonths', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

// Save TJKN (General)
export const saveTJKN = async (req, res) => {
  // #swagger.tags = ['TJKN']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Save or update TJKN record'
  try {
    const { tjkn_id, tjkn_year, tjkn_month, tjkn_duration, creator: encryptedCreator } = req.body;
    const now = dayjs().format("YYYY-MM-DD HH:mm:ss");
    const creator = decrypt(encryptedCreator);
    
    if (!tjkn_year || !tjkn_month || !tjkn_duration) {
      return res.status(406).json({
        type: 'error',
        message: 'Tahun, Bulan, dan TJKN wajib diisi'
      });
    }
    
    if (tjkn_id) {
      // Update existing
      await dbWJS('TJKN')
        .where('tjkn_id', tjkn_id)
        .update({
          tjkn_year,
          tjkn_month,
          tjkn_duration,
          updated_at: now
        });
    } else {
      // Insert new
      await dbWJS('TJKN').insert({
        tjkn_year,
        tjkn_month,
        tjkn_duration,
        created_at: now,
        updated_at: now
      });
    }
    
    res.status(200).json({ message: 'sukses' });
  } catch (error) {
    logger(error, 'POST /saveTJKN', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

// Save TJKN Employee
export const saveTJKNEmployee = async (req, res) => {
  // #swagger.tags = ['TJKN']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Save or update TJKN Employee record'
  try {
    const { tjkn_id, tjkn_nik, tjkn_year, tjkn_month, tjkn_duration, creator: encryptedCreator } = req.body;
    const now = dayjs().format("YYYY-MM-DD HH:mm:ss");
    const creator = decrypt(encryptedCreator);
    
    if (!tjkn_nik || !tjkn_year || !tjkn_month || !tjkn_duration) {
      return res.status(406).json({
        type: 'error',
        message: 'NIK, Tahun, Bulan, dan Pengurang TJKN wajib diisi'
      });
    }
    
    if (tjkn_id) {
      // Update existing
      await dbWJS('TJKN_Employee')
        .where('tjkn_id', tjkn_id)
        .update({
          tjkn_nik,
          tjkn_year,
          tjkn_month,
          tjkn_duration,
          updated_at: now
        });
    } else {
      // Insert new
      await dbWJS('TJKN_Employee').insert({
        tjkn_nik,
        tjkn_year,
        tjkn_month,
        tjkn_duration,
        created_at: now,
        updated_at: now
      });
    }
    
    res.status(200).json({ message: 'sukses' });
  } catch (error) {
    logger(error, 'POST /saveTJKNEmployee', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

// Delete TJKN (General)
export const deleteTJKN = async (req, res) => {
  // #swagger.tags = ['TJKN']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Delete TJKN record'
  try {
    const { tjkn_id: encryptedId, creator: encryptedCreator } = req.body;
    const tjkn_id = decrypt(encryptedId);
    const creator = decrypt(encryptedCreator);
    
    await dbWJS('TJKN')
      .where('tjkn_id', tjkn_id)
      .delete();
    
    res.status(200).json({ message: 'sukses' });
  } catch (error) {
    logger(error, 'DELETE /deleteTJKN', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

// Delete TJKN Employee
export const deleteTJKNEmployee = async (req, res) => {
  // #swagger.tags = ['TJKN']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Delete TJKN Employee record'
  try {
    const { tjkn_id: encryptedId, creator: encryptedCreator } = req.body;
    const tjkn_id = decrypt(encryptedId);
    const creator = decrypt(encryptedCreator);
    
    await dbWJS('TJKN_Employee')
      .where('tjkn_id', tjkn_id)
      .delete();
    
    res.status(200).json({ message: 'sukses' });
  } catch (error) {
    logger(error, 'DELETE /deleteTJKNEmployee', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};
