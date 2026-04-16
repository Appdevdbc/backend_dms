import { dbWJS } from "../../config/db.js";
import { getErrorResponse } from "../../helpers/utils.js";
import { logger } from "../../helpers/logger.js";
import dayjs from "dayjs";

// Get SLA Section chart data
export const getSlaSectionChart = async (req, res) => {
  // #swagger.tags = ['Report - SLA Section']
  /* #swagger.security = [{ "bearerAuth": [] }] */
  // #swagger.description = 'Get SLA per section for chart'
  try {
    const { start, end } = req.query;

    const result = await dbWJS.raw(
      `SELECT * FROM tbl_sla_section_new20210309(?, ?, ?)`,
      [start || '2019-01-01', end || dayjs().format('YYYY-MM-DD'), 'general']
    );

    res.status(200).json(result);
  } catch (error) {
    logger(error, 'GET /getSlaSectionChart', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

// Get SLA Section detail table (when clicking a bar)
export const getSlaSectionDetail = async (req, res) => {
  // #swagger.tags = ['Report - SLA Section']
  /* #swagger.security = [{ "bearerAuth": [] }] */
  // #swagger.description = 'Get SPK detail list for a specific section category'
  try {
    const { category, start, end } = req.query;

    const startDate = start || '2019-01-01';
    const endDate   = end   || dayjs().format('YYYY-MM-DD');

    let sql = '';

    if (category === 'drawing') {
      sql = `
        SELECT res.id_spk,
          FORMAT(res.plan_start,   'dd MMM yyyy') AS plan_start,
          FORMAT(res.plan_finish,  'dd MMM yyyy') AS plan_finish,
          FORMAT(res.start_aktual, 'dd MMM yyyy') AS start_aktual,
          FORMAT(res.finish_aktual,'dd MMM yyyy') AS finish_aktual,
          CASE WHEN CONVERT(varchar(10), res.finish_aktual, 120) <= CONVERT(varchar(10), res.plan_finish, 120) THEN 'OK' ELSE 'Not OK' END AS status,
          CASE WHEN CONVERT(varchar(10), res.finish_aktual, 120) <= CONVERT(varchar(10), res.plan_finish, 120) THEN 100 ELSE 0 END AS persentase
        FROM (
          SELECT DISTINCT a.id_spk,
            target_drawing_start  AS plan_start,
            target_drawing_finish AS plan_finish,
            (SELECT TOP 1 start  FROM Scan_SPV WHERE id_spk = a.id_spk ORDER BY id_spk, created_at) AS start_aktual,
            (SELECT TOP 1 finish FROM Scan_SPV WHERE id_spk = a.id_spk AND finish IS NOT NULL ORDER BY finish DESC) AS finish_aktual
          FROM SPK a LEFT JOIN Scan_SPV b ON a.id_spk = b.id_spk
          WHERE b.section = '${category}'
            AND target_drawing_finish BETWEEN '${startDate}' AND '${endDate}'
            AND a.id_dept <> 16
        ) res
      `;
    } else if (category === 'bongkar_analisis') {
      sql = `
        SELECT res.id_spk,
          FORMAT(res.plan_start,   'dd MMM yyyy') AS plan_start,
          FORMAT(res.plan_finish,  'dd MMM yyyy') AS plan_finish,
          FORMAT(res.start_aktual, 'dd MMM yyyy') AS start_aktual,
          FORMAT(res.finish_aktual,'dd MMM yyyy') AS finish_aktual,
          CASE WHEN CONVERT(varchar(10), res.finish_aktual, 120) <= CONVERT(varchar(10), res.plan_finish, 120) THEN 'OK' ELSE 'Not OK' END AS status,
          CASE WHEN CONVERT(varchar(10), res.finish_aktual, 120) <= CONVERT(varchar(10), res.plan_finish, 120) THEN 100 ELSE 0 END AS persentase
        FROM (
          SELECT DISTINCT a.id_spk,
            target_analisis_start  AS plan_start,
            target_analisis_finish AS plan_finish,
            (SELECT TOP 1 start  FROM Scan_SPV WHERE id_spk = a.id_spk ORDER BY id_spk, created_at) AS start_aktual,
            (SELECT TOP 1 finish FROM Scan_SPV WHERE id_spk = a.id_spk AND finish IS NOT NULL ORDER BY finish DESC) AS finish_aktual
          FROM SPK a LEFT JOIN Scan_SPV b ON a.id_spk = b.id_spk
          WHERE b.section = '${category}'
            AND a.target_analisis_finish BETWEEN '${startDate}' AND '${endDate}'
            AND a.id_dept <> 16
        ) res
      `;
    } else if (category === 'assy') {
      sql = `
        SELECT res.id_spk,
          FORMAT(res.plan_start,   'dd MMM yyyy') AS plan_start,
          FORMAT(res.plan_finish,  'dd MMM yyyy') AS plan_finish,
          FORMAT(res.start_aktual, 'dd MMM yyyy') AS start_aktual,
          FORMAT(res.finish_aktual,'dd MMM yyyy') AS finish_aktual,
          CASE WHEN CONVERT(varchar(10), res.finish_aktual, 120) <= CONVERT(varchar(10), res.plan_finish, 120) THEN 'OK' ELSE 'Not OK' END AS status,
          CASE WHEN CONVERT(varchar(10), res.finish_aktual, 120) <= CONVERT(varchar(10), res.plan_finish, 120) THEN 100 ELSE 0 END AS persentase
        FROM (
          SELECT DISTINCT a.id_spk,
            target_assy_start  AS plan_start,
            target_assy_finish AS plan_finish,
            (SELECT TOP 1 start  FROM Scan_SPV WHERE id_spk = a.id_spk ORDER BY id_spk, created_at) AS start_aktual,
            (SELECT TOP 1 finish FROM Scan_SPV WHERE id_spk = a.id_spk AND finish IS NOT NULL ORDER BY finish DESC) AS finish_aktual
          FROM SPK a LEFT JOIN Scan_SPV b ON a.id_spk = b.id_spk
          WHERE b.section = '${category}'
            AND a.target_assy_finish BETWEEN '${startDate}' AND '${endDate}'
            AND a.id_dept <> 16
        ) res
      `;
    } else if (category === 'order_part') {
      sql = `
        SELECT res.id_spk,
          FORMAT(res.plan_start,   'dd MMM yyyy') AS plan_start,
          FORMAT(res.plan_finish,  'dd MMM yyyy') AS plan_finish,
          FORMAT(res.start_aktual, 'dd MMM yyyy') AS start_aktual,
          FORMAT(res.finish_aktual,'dd MMM yyyy') AS finish_aktual,
          CASE WHEN CONVERT(varchar(10), res.finish_aktual, 120) <= CONVERT(varchar(10), res.plan_finish, 120) THEN 'OK' ELSE 'Not OK' END AS status,
          CASE WHEN CONVERT(varchar(10), res.finish_aktual, 120) <= CONVERT(varchar(10), res.plan_finish, 120) THEN 100 ELSE 0 END AS persentase
        FROM (
          SELECT DISTINCT a.id_spk,
            target_order_start  AS plan_start,
            target_order_finish AS plan_finish,
            (SELECT TOP 1 start  FROM Scan_SPV WHERE id_spk = a.id_spk ORDER BY id_spk, created_at) AS start_aktual,
            (SELECT TOP 1 finish FROM Scan_SPV WHERE id_spk = a.id_spk AND finish IS NOT NULL ORDER BY finish DESC) AS finish_aktual
          FROM SPK a LEFT JOIN Scan_SPV b ON a.id_spk = b.id_spk
          WHERE b.section = '${category}'
            AND a.target_order_finish BETWEEN '${startDate}' AND '${endDate}'
            AND a.id_dept <> 16
        ) res
      `;
    } else if (category === 'trial') {
      sql = `
        SELECT res.id_spk,
          FORMAT(res.plan_start,   'dd MMM yyyy') AS plan_start,
          FORMAT(res.plan_finish,  'dd MMM yyyy') AS plan_finish,
          FORMAT(res.start_aktual, 'dd MMM yyyy') AS start_aktual,
          FORMAT(res.finish_aktual,'dd MMM yyyy') AS finish_aktual,
          CASE WHEN CONVERT(varchar(10), res.finish_aktual, 120) <= CONVERT(varchar(10), res.plan_finish, 120) THEN 'OK' ELSE 'Not OK' END AS status,
          CASE WHEN CONVERT(varchar(10), res.finish_aktual, 120) <= CONVERT(varchar(10), res.plan_finish, 120) THEN 100 ELSE 0 END AS persentase
        FROM (
          SELECT DISTINCT a.id_spk,
            target_trial_start  AS plan_start,
            target_trial_finish AS plan_finish,
            (SELECT TOP 1 start  FROM Scan_SPV WHERE id_spk = a.id_spk ORDER BY id_spk, created_at) AS start_aktual,
            (SELECT TOP 1 finish FROM Scan_SPV WHERE id_spk = a.id_spk AND finish IS NOT NULL ORDER BY finish DESC) AS finish_aktual
          FROM SPK a LEFT JOIN Scan_SPV b ON a.id_spk = b.id_spk
          WHERE b.section = '${category}'
            AND a.target_trial_finish BETWEEN '${startDate}' AND '${endDate}'
            AND a.id_dept <> 16
        ) res
      `;
    } else if (category === 'machining') {
      sql = `
        SELECT res.id_spk,
          FORMAT(res.plan_start,   'dd MMM yyyy') AS plan_start,
          FORMAT(res.plan_finish,  'dd MMM yyyy') AS plan_finish,
          FORMAT(res.start_aktual, 'dd MMM yyyy') AS start_aktual,
          FORMAT(res.finish_aktual,'dd MMM yyyy') AS finish_aktual,
          CASE WHEN CONVERT(varchar(10), res.finish_aktual, 120) <= CONVERT(varchar(10), res.plan_finish, 120) THEN 'OK' ELSE 'Not OK' END AS status,
          CASE WHEN CONVERT(varchar(10), res.finish_aktual, 120) <= CONVERT(varchar(10), res.plan_finish, 120) THEN 100 ELSE 0 END AS persentase
        FROM (
          SELECT DISTINCT a.id_spk,
            target_machining_start  AS plan_start,
            target_machining_finish AS plan_finish,
            (SELECT TOP 1 start  FROM Scan_SPV WHERE id_spk = a.id_spk ORDER BY id_spk, created_at) AS start_aktual,
            (SELECT TOP 1 finish FROM Scan_SPV WHERE id_spk = a.id_spk AND finish IS NOT NULL ORDER BY finish DESC) AS finish_aktual
          FROM SPK a LEFT JOIN Scan_Operator b ON a.id_spk = b.id_spk
          WHERE a.target_machining_finish BETWEEN '${startDate}' AND '${endDate}'
            AND a.id_dept <> 16
        ) res
      `;
    } else {
      return res.status(406).json({ type: 'error', message: `Unknown category: ${category}` });
    }

    const result = await dbWJS.raw(sql);

    // Calculate summary
    const total = result.length;
    const totalPersentase = result.reduce((sum, r) => sum + (parseFloat(r.persentase) || 0), 0);
    const avgPersentase = total > 0 ? (totalPersentase / total).toFixed(2) : 0;

    res.status(200).json({ data: result, total, avgPersentase });
  } catch (error) {
    logger(error, 'GET /getSlaSectionDetail', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};
