import { dbWJS } from "../../config/db.js";
import { decrypt, encrypt, getErrorResponse } from "../../helpers/utils.js";
import { logger } from "../../helpers/logger.js";
import dayjs from "dayjs";

export const listMachiningProses = async (req, res) => {
  // #swagger.tags = ['Machining']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Get list of machining processes'
  try {
    const { rowsPerPage, descending, sortBy, page, filter } = req.query;
    
    // Simple list without pagination
    if (!rowsPerPage) {
      const response = await dbWJS('Proses_Machining')
        .select('id_proses', 'nama')
        .orderBy('nama', 'asc');
      
      return res.status(200).json(response);
    }
    
    // Paginated list
    const sorting = descending === 'true' ? 'desc' : 'asc';
    const columnSort = sortBy === 'desc' ? 'id_proses asc' : `${sortBy} ${sorting}`;
    const currentPage = Math.floor(page);
    const perPage = Math.floor(rowsPerPage);
    
    let query = dbWJS('Proses_Machining')
      .select('id_proses', 'nama', 'created_at', 'updated_at');
    
    // Apply filter if provided
    if (filter) {
      query = query.where((subQuery) => {
        subQuery
          .orWhere('nama', 'like', `%${filter}%`)
          .orWhereRaw('CAST(id_proses AS varchar) like ?', `%${filter}%`);
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
      item.id_proses_encrypted = encrypt(item.id_proses.toString());
    });
    
    res.status(200).json(response);
  } catch (error) {
    logger(error, 'GET /listMachiningProses', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

export const saveMachiningProses = async (req, res) => {
  // #swagger.tags = ['Machining']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Save or update machining process'
  const trx = await dbWJS.transaction();
  try {
    const { id_proses, nama, creator: encryptedCreator } = req.body;
    const now = dayjs().format("YYYY-MM-DD HH:mm:ss");
    const creator = decrypt(encryptedCreator);
    
    if (!nama) {
      await trx.rollback();
      return res.status(406).json({
        type: 'error',
        message: 'Nama proses machining wajib diisi'
      });
    }
    
    // Check if name already exists (for different ID)
    const existingProses = await trx('Proses_Machining')
      .where('nama', nama)
      .where('id_proses', '<>', id_proses || 0)
      .first();
    
    if (existingProses) {
      await trx.rollback();
      return res.status(406).json({
        type: 'error',
        message: 'Nama proses machining sudah ada'
      });
    }
    
    if (id_proses) {
      // Update existing
      await trx('Proses_Machining')
        .where('id_proses', id_proses)
        .update({
          nama,
          updated_at: now
        });
    } else {
      // Insert new
      await trx('Proses_Machining').insert({
        nama,
        created_at: now,
        updated_at: now
      });
    }
    
    await trx.commit();
    res.status(200).json({ message: 'sukses' });
  } catch (error) {
    await trx.rollback();
    logger(error, 'POST /saveMachiningProses', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

export const deleteMachiningProses = async (req, res) => {
  // #swagger.tags = ['Machining']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Delete machining process'
  const trx = await dbWJS.transaction();
  try {
    const { id_proses: encryptedId, creator: encryptedCreator } = req.body;
    const id_proses = decrypt(encryptedId);
    const creator = decrypt(encryptedCreator);
    
    // Hard delete (no dependency check as per PHP version)
    await trx('Proses_Machining')
      .where('id_proses', id_proses)
      .delete();
    
    await trx.commit();
    res.status(200).json({ message: 'sukses' });
  } catch (error) {
    await trx.rollback();
    logger(error, 'DELETE /deleteMachiningProses', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};
