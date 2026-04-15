import { dbWJS } from "../../config/db.js";
import { getErrorResponse } from "../../helpers/utils.js";
import { logger } from "../../helpers/logger.js";
import dayjs from "dayjs";

// Helper function to determine process status
const getProcessStatus = async (id_spk) => {
  try {
    // Check if there are any Scan_SPV or Scan_Operator records
    const scanSpvCount = await dbWJS('Scan_SPV')
      .where('id_spk', id_spk)
      .count('* as count')
      .first();
    
    const scanOptCount = await dbWJS('Scan_Operator')
      .where('id_spk', id_spk)
      .count('* as count')
      .first();
    
    // If no scans at all, status is "Open"
    if (scanSpvCount.count === 0 && scanOptCount.count === 0) {
      return 'Open';
    }
    
    // Check if there are any log entries
    const logCount = await dbWJS('Log_Scan')
      .where('log_id_spk', id_spk)
      .count('* as count')
      .first();
    
    // If there are logs, status is "Progress", otherwise "Close"
    return logCount.count > 0 ? 'Progress' : 'Close';
  } catch (error) {
    return 'Unknown';
  }
};

// List SPK Proses
export const listSPKProses = async (req, res) => {
  // #swagger.tags = ['SPK Proses']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Get list of SPK in process'
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
        .where('SPK.status', 'proses')
        .orderBy('SPK.id_spk', 'desc');
      
      // Add process status and format dates for each SPK
      for (let spk of response) {
        spk.process_status = await getProcessStatus(spk.id_spk);
        if (spk.tanggal) {
          spk.tanggal = dayjs(spk.tanggal).format('DD/MM/YYYY');
        }
        if (spk.target_selesai) {
          spk.target_selesai = dayjs(spk.target_selesai).format('DD/MM/YYYY');
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
      .where('SPK.status', 'proses');
    
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
    
    // Add process status and format dates for each SPK
    for (let spk of response.data) {
      spk.process_status = await getProcessStatus(spk.id_spk);
      if (spk.tanggal) {
        spk.tanggal = dayjs(spk.tanggal).format('DD/MM/YYYY');
      }
      if (spk.target_selesai) {
        spk.target_selesai = dayjs(spk.target_selesai).format('DD/MM/YYYY');
      }
    }
    
    res.status(200).json(response);
  } catch (error) {
    logger(error, 'GET /listSPKProses', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

// Get SPK Detail Status
export const getSPKDetailStatus = async (req, res) => {
  // #swagger.tags = ['SPK Proses']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Get SPK process detail status'
  try {
    const { id_spk } = req.body;
    
    const details = await dbWJS('Scan_Operator')
      .select(
        'Scan_Operator.id',
        'Scan_Operator.id_spk',
        'Scan_Operator.pic',
        'Scan_Operator.id_mesin as mesin',
        'Scan_Operator.start',
        'Scan_Operator.finish',
        'Scan_Operator.postpone',
        dbWJS.raw('DATEDIFF(HOUR, Scan_Operator.start, ISNULL(Scan_Operator.finish, GETDATE())) as total_jam')
      )
      .where('Scan_Operator.id_spk', id_spk)
      .orderBy('Scan_Operator.id', 'asc');
    
    return res.status(200).json(details);
  } catch (error) {
    logger(error, 'POST /getSPKDetailStatus', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

// Close SPK
export const closeSPK = async (req, res) => {
  // #swagger.tags = ['SPK Proses']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Close SPK'
  try {
    const { id_spk, creator } = req.body;
    const now = dayjs().format("YYYY-MM-DD HH:mm:ss");
    
    if (!id_spk) {
      return res.status(406).json({
        type: 'error',
        message: 'ID SPK is required'
      });
    }
    
    // Check if SPK exists and is in process
    const spk = await dbWJS('SPK')
      .where('id_spk', id_spk)
      .first();
    
    if (!spk) {
      return res.status(406).json({
        type: 'error',
        message: 'SPK not found'
      });
    }
    
    if (spk.status !== 'proses') {
      return res.status(406).json({
        type: 'error',
        message: 'SPK is not in process status'
      });
    }
    
    // Check if there are any ongoing processes
    const ongoingProcess = await dbWJS('Scan_Operator')
      .where('id_spk', id_spk)
      .whereNotNull('start')
      .whereNull('finish')
      .whereNull('postpone')
      .count('* as count')
      .first();
    
    if (ongoingProcess.count > 0) {
      return res.status(406).json({
        type: 'error',
        message: 'Cannot close SPK. There are still ongoing processes'
      });
    }
    
    // Update SPK status to closed
    await dbWJS('SPK')
      .where('id_spk', id_spk)
      .update({
        status: 'tutup',
        updated_at: now
      });
    
    res.status(200).json({ message: 'sukses' });
  } catch (error) {
    logger(error, 'POST /closeSPK', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

// Edit Target Selesai
export const editTargetSelesai = async (req, res) => {
  // #swagger.tags = ['SPK Proses']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Edit SPK target completion date'
  try {
    const { id_spk, target_selesai, creator } = req.body;
    const now = dayjs().format("YYYY-MM-DD HH:mm:ss");
    
    if (!id_spk || !target_selesai) {
      return res.status(406).json({
        type: 'error',
        message: 'ID SPK and target completion date are required'
      });
    }
    
    // Validate date format
    if (!dayjs(target_selesai).isValid()) {
      return res.status(406).json({
        type: 'error',
        message: 'Invalid date format'
      });
    }
    
    // Update target selesai
    await dbWJS('SPK')
      .where('id_spk', id_spk)
      .update({
        target_selesai: target_selesai,
        updated_at: now
      });
    
    res.status(200).json({ message: 'sukses' });
  } catch (error) {
    logger(error, 'POST /editTargetSelesai', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};
