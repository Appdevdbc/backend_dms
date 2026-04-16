import { dbWJS } from "../../config/db.js";
import { getErrorResponse } from "../../helpers/utils.js";
import { logger } from "../../helpers/logger.js";
import dayjs from "dayjs";

// Overtime by job type — tbl_ovt_jobtype(start, end) filtered by id_job
// Returns: { jobtype, total }
export const getOvertimeJobType = async (req, res) => {
  try {
    const { start, end, id_job } = req.query;
    const s = start || '2019-01-01';
    const e = end   || dayjs().format('YYYY-MM-DD');

    let sql = `SELECT * FROM tbl_ovt_jobtype('${s}', '${e}') WHERE id_jobtype NOT IN (8)`;
    if (id_job && id_job !== '0') {
      sql += ` AND id_jobtype IN (${id_job})`;
    }

    const result = await dbWJS.raw(sql);
    res.status(200).json(result);
  } catch (error) {
    logger(error, 'GET /getOvertimeJobType', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

// Overtime by month — tbl_ovt_month(year, id_job)
// Returns: { month, total }
export const getOvertimeMonthly = async (req, res) => {
  try {
    const { year, id_job } = req.query;
    const y = year   || dayjs().format('YYYY');
    const j = id_job || '0';

    const result = await dbWJS.raw(
      `SELECT * FROM tbl_ovt_month(?, ?)`,
      [y, j]
    );
    res.status(200).json(result);
  } catch (error) {
    logger(error, 'GET /getOvertimeMonthly', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

// Overtime by section per month — tbl_ovt_month_by_section(year, section, id_job)
// Returns: { month, total }
// section: bongkar_analisis | trial | assy | drawing | order_part | machining
export const getOvertimeSection = async (req, res) => {
  try {
    const { year, section, id_job } = req.query;
    const y = year    || dayjs().format('YYYY');
    const s = section || 'machining';
    const j = id_job  || '0';

    const result = await dbWJS.raw(
      `SELECT * FROM tbl_ovt_month_by_section(?, ?, ?)`,
      [y, s, j]
    );
    res.status(200).json(result);
  } catch (error) {
    logger(error, 'GET /getOvertimeSection', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};
