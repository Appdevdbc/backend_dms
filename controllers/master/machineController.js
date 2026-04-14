import { dbWJS } from "../../config/db.js";
import { decrypt, encrypt, getErrorResponse } from "../../helpers/utils.js";
import { logger } from "../../helpers/logger.js";
import dayjs from "dayjs";

export const listMachines = async (req, res) => {
  // #swagger.tags = ['Machine']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Get list of machines'
  try {
    const { rowsPerPage, descending, sortBy, page, filter } = req.query;
    
    // Simple list without pagination
    if (!rowsPerPage) {
      const response = await dbWJS('Machine')
        .select('id', 'nama', 'kode')
        .orderBy('nama', 'asc');
      
      return res.status(200).json(response);
    }
    
    // Paginated list
    const sorting = descending === 'true' ? 'desc' : 'asc';
    const columnSort = sortBy === 'desc' ? 'id asc' : `${sortBy} ${sorting}`;
    const currentPage = Math.floor(page);
    const perPage = Math.floor(rowsPerPage);
    
    let query = dbWJS('Machine')
      .select('id', 'nama', 'kode', 'created_at', 'updated_at');
    
    // Apply filter if provided
    if (filter) {
      query = query.where((subQuery) => {
        subQuery
          .orWhere('nama', 'like', `%${filter}%`)
          .orWhere('kode', 'like', `%${filter}%`)
          .orWhereRaw('CAST(id AS varchar) like ?', `%${filter}%`);
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
      item.id_encrypted = encrypt(item.id.toString());
    });
    
    res.status(200).json(response);
  } catch (error) {
    logger(error, 'GET /listMachines', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

export const saveMachine = async (req, res) => {
  // #swagger.tags = ['Machine']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Save or update machine'
  const trx = await dbWJS.transaction();
  try {
    const { id, nama, kode, creator: encryptedCreator } = req.body;
    const now = dayjs().format("YYYY-MM-DD HH:mm:ss");
    const creator = decrypt(encryptedCreator);
    
    if (!nama) {
      await trx.rollback();
      return res.status(406).json({
        type: 'error',
        message: 'Nama mesin wajib diisi'
      });
    }
    
    if (!kode) {
      await trx.rollback();
      return res.status(406).json({
        type: 'error',
        message: 'Kode mesin wajib diisi'
      });
    }
    
    // Check if code already exists (for different ID)
    const existingMachine = await trx('Machine')
      .where('kode', kode)
      .where('id', '<>', id || 0)
      .first();
    
    if (existingMachine) {
      await trx.rollback();
      return res.status(406).json({
        type: 'error',
        message: 'Kode mesin sudah ada'
      });
    }
    
    if (id) {
      // Update existing
      await trx('Machine')
        .where('id', id)
        .update({
          nama,
          kode,
          updated_at: now
        });
    } else {
      // Insert new
      await trx('Machine').insert({
        nama,
        kode,
        created_at: now,
        updated_at: now
      });
    }
    
    await trx.commit();
    res.status(200).json({ message: 'sukses' });
  } catch (error) {
    await trx.rollback();
    logger(error, 'POST /saveMachine', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

export const deleteMachine = async (req, res) => {
  // #swagger.tags = ['Machine']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Delete machine'
  const trx = await dbWJS.transaction();
  try {
    const { id: encryptedId, creator: encryptedCreator } = req.body;
    const id = decrypt(encryptedId);
    const creator = decrypt(encryptedCreator);
    
    // Hard delete (no dependency check as per PHP version)
    await trx('Machine')
      .where('id', id)
      .delete();
    
    await trx.commit();
    res.status(200).json({ message: 'sukses' });
  } catch (error) {
    await trx.rollback();
    logger(error, 'DELETE /deleteMachine', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};
