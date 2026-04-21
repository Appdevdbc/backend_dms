import { dbWJS } from "../../config/db.js";
import { getErrorResponse } from "../../helpers/utils.js";
import { logger } from "../../helpers/logger.js";
import dayjs from "dayjs";

// List SPK Close (Closed SPKs)
export const listSPKClose = async (req, res) => {
  // #swagger.tags = ['SPK Close']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Get list of closed SPK'
  try {
    const { rowsPerPage, descending, sortBy, page, filter } = req.query;
    
    // Simple list without pagination
    if (!rowsPerPage) {
      const response = await dbWJS('SPK')
        .select(
          'SPK.id_spk',
          'SPK.tanggal',
          'SPK.id_dept',
          'SPK.jenis as tipe',
          'SPK.target_selesai',
          'SPK.subject',
          'SPK.status',
          'Department.nama as dept_name'
        )
        .leftJoin('Department', 'SPK.id_dept', 'Department.id_dept')
        .where('SPK.status', 'tutup')
        .orderBy('SPK.id_spk', 'desc');
      
      // Format dates for each SPK
      for (let spk of response) {
        if (spk.tanggal) {
          spk.tanggal = dayjs(spk.tanggal).format('DD-MM-YYYY');
        }
        if (spk.target_selesai) {
          spk.target_selesai = dayjs(spk.target_selesai).format('DD-MM-YYYY');
        }
      }
      
      return res.status(200).json(response);
    }
    
    // Paginated list
    const sorting = descending === 'true' ? 'desc' : 'asc';
    const columnSort = sortBy === 'desc' ? 'SPK.id_spk desc' : `SPK.${sortBy} ${sorting}`;
    const currentPage = Math.floor(page);
    const perPage = Math.floor(rowsPerPage);
    
    let query = dbWJS('SPK')
      .select(
        'SPK.id_spk',
        'SPK.tanggal',
        'SPK.id_dept',
        'SPK.jenis as tipe',
        'SPK.target_selesai',
        'SPK.subject',
        'SPK.status',
        'Department.nama as dept_name'
      )
      .leftJoin('Department', 'SPK.id_dept', 'Department.id_dept')
      .where('SPK.status', 'tutup');
    
    // Apply filter if provided
    if (filter) {
      query = query.where((subQuery) => {
        subQuery
          .orWhere('SPK.id_spk', 'like', `%${filter}%`)
          .orWhere('SPK.subject', 'like', `%${filter}%`)
          .orWhere('Department.nama', 'like', `%${filter}%`)
          .orWhere('SPK.jenis', 'like', `%${filter}%`);
      });
    }
    
    const response = await query
      .orderByRaw(columnSort)
      .paginate({
        perPage,
        currentPage,
        isLengthAware: true,
      });
    
    // Format dates for each SPK
    for (let spk of response.data) {
      if (spk.tanggal) {
        spk.tanggal = dayjs(spk.tanggal).format('DD-MM-YYYY');
      }
      if (spk.target_selesai) {
        spk.target_selesai = dayjs(spk.target_selesai).format('DD-MM-YYYY');
      }
    }
    
    res.status(200).json(response);
  } catch (error) {
    logger(error, 'GET /listSPKClose', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

// Reopen SPK (change status from tutup to proses)
export const reopenSPK = async (req, res) => {
  // #swagger.tags = ['SPK Close']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Reopen closed SPK'
  try {
    const { id_spk, creator } = req.body;
    const now = dayjs().format("YYYY-MM-DD HH:mm:ss");
    
    if (!id_spk) {
      return res.status(406).json({
        type: 'error',
        message: 'ID SPK is required'
      });
    }
    
    // Check if SPK exists and is closed
    const spk = await dbWJS('SPK')
      .where('id_spk', id_spk)
      .first();
    
    if (!spk) {
      return res.status(406).json({
        type: 'error',
        message: 'SPK not found'
      });
    }
    
    if (spk.status !== 'tutup') {
      return res.status(406).json({
        type: 'error',
        message: 'SPK is not in closed status'
      });
    }
    
    // Update SPK status to proses
    await dbWJS('SPK')
      .where('id_spk', id_spk)
      .update({
        status: 'proses',
        updated_at: now
      });
    
    res.status(200).json({ message: 'sukses' });
  } catch (error) {
    logger(error, 'POST /reopenSPK', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};
