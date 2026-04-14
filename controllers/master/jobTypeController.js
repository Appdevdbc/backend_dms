import { dbWJS } from "../../config/db.js";
import { decrypt, encrypt, getErrorResponse } from "../../helpers/utils.js";
import { logger } from "../../helpers/logger.js";
import dayjs from "dayjs";

export const listJobTypes = async (req, res) => {
  // #swagger.tags = ['JobType']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Get list of job types'
  try {
    const { rowsPerPage, descending, sortBy, page, filter } = req.query;
    
    // Simple list without pagination
    if (!rowsPerPage) {
      const response = await dbWJS('Job_Type')
        .select('id_job', 'nama_job')
        .orderBy('nama_job', 'asc');
      
      return res.status(200).json(response);
    }
    
    // Paginated list
    const sorting = descending === 'true' ? 'desc' : 'asc';
    const columnSort = sortBy === 'desc' ? 'id_job asc' : `${sortBy} ${sorting}`;
    const currentPage = Math.floor(page);
    const perPage = Math.floor(rowsPerPage);
    
    let query = dbWJS('Job_Type')
      .select('id_job', 'nama_job', 'created_at', 'updated_at');
    
    // Apply filter if provided
    if (filter) {
      query = query.where((subQuery) => {
        subQuery
          .orWhere('nama_job', 'like', `%${filter}%`)
          .orWhereRaw('CAST(id_job AS varchar) like ?', `%${filter}%`);
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
      item.id_job_encrypted = encrypt(item.id_job.toString());
    });
    
    res.status(200).json(response);
  } catch (error) {
    logger(error, 'GET /listJobTypes', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

export const saveJobType = async (req, res) => {
  // #swagger.tags = ['JobType']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Save or update job type'
  const trx = await dbWJS.transaction();
  try {
    const { id_job, nama_job, creator: encryptedCreator } = req.body;
    const now = dayjs().format("YYYY-MM-DD HH:mm:ss");
    const creator = decrypt(encryptedCreator);
    
    if (!nama_job) {
      await trx.rollback();
      return res.status(406).json({
        type: 'error',
        message: 'Nama job type wajib diisi'
      });
    }
    
    // Check if name already exists (for different ID)
    const existingJobType = await trx('Job_Type')
      .where('nama_job', nama_job)
      .where('id_job', '<>', id_job || 0)
      .first();
    
    if (existingJobType) {
      await trx.rollback();
      return res.status(406).json({
        type: 'error',
        message: 'Nama job type sudah ada'
      });
    }
    
    if (id_job) {
      // Update existing
      await trx('Job_Type')
        .where('id_job', id_job)
        .update({
          nama_job,
          updated_at: now
        });
    } else {
      // Insert new
      await trx('Job_Type').insert({
        nama_job,
        created_at: now,
        updated_at: now
      });
    }
    
    await trx.commit();
    res.status(200).json({ message: 'sukses' });
  } catch (error) {
    await trx.rollback();
    logger(error, 'POST /saveJobType', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

export const deleteJobType = async (req, res) => {
  // #swagger.tags = ['JobType']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Delete job type'
  const trx = await dbWJS.transaction();
  try {
    const { id_job: encryptedId, creator: encryptedCreator } = req.body;
    const id_job = decrypt(encryptedId);
    const creator = decrypt(encryptedCreator);
    
    // Hard delete (no dependency check as per PHP version)
    await trx('Job_Type')
      .where('id_job', id_job)
      .delete();
    
    await trx.commit();
    res.status(200).json({ message: 'sukses' });
  } catch (error) {
    await trx.rollback();
    logger(error, 'DELETE /deleteJobType', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};
