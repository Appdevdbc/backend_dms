import { dbWJS } from "../../config/db.js";
import { decrypt, encrypt, getErrorResponse } from "../../helpers/utils.js";
import { logger } from "../../helpers/logger.js";
import dayjs from "dayjs";

export const listParts = async (req, res) => {
  // #swagger.tags = ['Parts']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Get list of parts'
  try {
    const { rowsPerPage, descending, sortBy, page, filter } = req.query;
    
    // Simple list without pagination
    if (!rowsPerPage) {
      const response = await dbWJS('Part')
        .select('id_part', 'nama_part', 'code_part')
        .orderBy('nama_part', 'asc');
      
      return res.status(200).json(response);
    }
    
    // Paginated list
    const sorting = descending === 'true' ? 'desc' : 'asc';
    const columnSort = sortBy === 'desc' ? 'id_part asc' : `${sortBy} ${sorting}`;
    const currentPage = Math.floor(page);
    const perPage = Math.floor(rowsPerPage);
    
    let query = dbWJS('Part')
      .select('id_part', 'nama_part', 'code_part', 'created_at', 'updated_at');
    
    // Apply filter if provided
    if (filter) {
      query = query.where((subQuery) => {
        subQuery
          .orWhere('nama_part', 'like', `%${filter}%`)
          .orWhere('code_part', 'like', `%${filter}%`)
          .orWhereRaw('CAST(id_part AS varchar) like ?', `%${filter}%`);
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
      item.id_part_encrypted = encrypt(item.id_part.toString());
    });
    
    res.status(200).json(response);
  } catch (error) {
    logger(error, 'GET /listParts', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

export const savePart = async (req, res) => {
  // #swagger.tags = ['Parts']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Save or update part'
  const trx = await dbWJS.transaction();
  try {
    const { id_part, nama_part, code_part, creator: encryptedCreator } = req.body;
    const now = dayjs().format("YYYY-MM-DD HH:mm:ss");
    const creator = decrypt(encryptedCreator);
    
    if (!nama_part) {
      await trx.rollback();
      return res.status(406).json({
        type: 'error',
        message: 'Nama part wajib diisi'
      });
    }
    
    if (!code_part) {
      await trx.rollback();
      return res.status(406).json({
        type: 'error',
        message: 'Code part wajib diisi'
      });
    }
    
    // Check if code already exists (for different ID)
    const existingPart = await trx('Part')
      .where('code_part', code_part)
      .where('id_part', '<>', id_part || 0)
      .first();
    
    if (existingPart) {
      await trx.rollback();
      return res.status(406).json({
        type: 'error',
        message: 'Code part sudah ada'
      });
    }
    
    if (id_part) {
      // Update existing
      await trx('Part')
        .where('id_part', id_part)
        .update({
          nama_part,
          code_part,
          updated_at: now
        });
    } else {
      // Insert new
      await trx('Part').insert({
        nama_part,
        code_part,
        created_at: now,
        updated_at: now
      });
    }
    
    await trx.commit();
    res.status(200).json({ message: 'sukses' });
  } catch (error) {
    await trx.rollback();
    logger(error, 'POST /savePart', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

export const deletePart = async (req, res) => {
  // #swagger.tags = ['Parts']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Delete part'
  const trx = await dbWJS.transaction();
  try {
    const { id_part: encryptedId, creator: encryptedCreator } = req.body;
    const id_part = decrypt(encryptedId);
    const creator = decrypt(encryptedCreator);
    
    // Hard delete (no dependency check as per PHP version)
    await trx('Part')
      .where('id_part', id_part)
      .delete();
    
    await trx.commit();
    res.status(200).json({ message: 'sukses' });
  } catch (error) {
    await trx.rollback();
    logger(error, 'DELETE /deletePart', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};
