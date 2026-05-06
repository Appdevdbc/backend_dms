import { dbWJS } from "../../config/db.js";
import { decrypt, getErrorResponse } from "../../helpers/utils.js";
import { logger } from "../../helpers/logger.js";
import dayjs from "dayjs";

// List Break Times
export const listBreakTimes = async (req, res) => {
  // #swagger.tags = ['Break']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Get list of break times'
  try {
    const { rowsPerPage, descending, sortBy, page, filter } = req.query;
    
    // Simple list without pagination
    if (!rowsPerPage) {
      const response = await dbWJS('MstBreak')
        .select('break_id', 'break_todays', 'break_start', 'break_end')
        .orderBy('break_id', 'asc');
      
      // Format times to HH:mm (without timezone conversion)
      response.forEach(item => {
        if (item.break_start) {
          const d = new Date(item.break_start);
          item.break_start = d.toISOString().slice(11, 16);
        }
        if (item.break_end) {
          const d = new Date(item.break_end);
          item.break_end = d.toISOString().slice(11, 16);
        }
      });
      
      return res.status(200).json(response);
    }
    
    // Paginated list
    const sorting = descending === 'true' ? 'desc' : 'asc';
    const columnSort = sortBy === 'desc' ? 'break_id asc' : `${sortBy} ${sorting}`;
    const currentPage = Math.floor(page);
    const perPage = Math.floor(rowsPerPage);
    
    let query = dbWJS('MstBreak')
      .select('break_id', 'break_todays', 'break_start', 'break_end', 'created_date', 'updated_date');
    
    // Apply filter if provided
    if (filter) {
      query = query.where((subQuery) => {
        subQuery
          .orWhere('break_todays', 'like', `%${filter}%`)
          .orWhereRaw('CAST(break_id AS varchar) like ?', `%${filter}%`);
      });
    }
    
    const response = await query
      .orderByRaw(columnSort)
      .paginate({
        perPage,
        currentPage,
        isLengthAware: true,
      });
    
    // Format times (without timezone conversion)
    response.data.forEach(item => {
      if (item.break_start) {
        const d = new Date(item.break_start);
        item.break_start = d.toISOString().slice(11, 16);
      }
      if (item.break_end) {
        const d = new Date(item.break_end);
        item.break_end = d.toISOString().slice(11, 16);
      }
    });
    
    res.status(200).json(response);
  } catch (error) {
    logger(error, 'GET /listBreakTimes', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

// Update Break Time
export const updateBreakTime = async (req, res) => {
  // #swagger.tags = ['Break']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Update break time'
  try {
    const { break_id, break_start, break_end, creator:creatorDecrypt } = req.body;
    const now = dayjs().format("YYYY-MM-DD HH:mm:ss");
    const creator = decrypt(creatorDecrypt);
    if (!break_start || !break_end) {
      return res.status(406).json({
        type: 'error',
        message: 'Start time and end time are required'
      });
    }
    
    // Validate time format (HH:mm)
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(break_start) || !timeRegex.test(break_end)) {
      return res.status(406).json({
        type: 'error',
        message: 'Invalid time format. Use HH:mm format'
      });
    }
    
    // Convert HH:mm to datetime for storage
    const today = dayjs().format('YYYY-MM-DD');
    const startDateTime = `${today} ${break_start}:00`;
    const endDateTime = `${today} ${break_end}:00`;
    console.log({
        break_start: startDateTime,
        break_end: endDateTime,
        updated_by: creator,
        updated_date: now
      })
    // Update break time
    await dbWJS('MstBreak')
      .where('break_id', break_id)
      .update({
        break_start: startDateTime,
        break_end: endDateTime,
        updated_by: creator,
        updated_date: now
      });
    
    res.status(200).json({ message: 'sukses' });
  } catch (error) {
    logger(error, 'POST /updateBreakTime', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};
