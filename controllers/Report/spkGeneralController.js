import { dbWJS } from "../../config/db.js";
import { getErrorResponse } from "../../helpers/utils.js";
import { logger } from "../../helpers/logger.js";
import dayjs from "dayjs";

// Department list for filter (excluding dept 2,6 which are Mold depts)
export const getDeptListGeneral = async (req, res) => {
  try {
    const depts = await dbWJS('Department')
      .select('id_dept as value', 'nama as label')
      .whereNotIn('id_dept', [2, 6])
      .orderBy('nama', 'asc');

    res.status(200).json(depts);
  } catch (error) {
    logger(error, 'GET /getDeptListGeneral', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

// SPK General per dept for a given year+month
// Returns: { id_dept, nama, total_spk }
export const getSpkGeneral = async (req, res) => {
  try {
    const { year, month, dept } = req.query;
    const y = year  || dayjs().format('YYYY');
    const m = month || dayjs().format('M');

    let sql = `
      SELECT a.id_dept, b.nama, COUNT(a.id_spk) AS total_spk
      FROM SPK a
      INNER JOIN Department b ON a.id_dept = b.id_dept
      WHERE YEAR(tanggal) = '${y}'
        AND MONTH(tanggal) = '${m}'
        AND a.id_dept NOT IN (2, 6)
    `;
    if (dept) sql += ` AND a.id_dept = ${dept}`;
    sql += ` GROUP BY a.id_dept, b.nama`;

    const result = await dbWJS.raw(sql);
    res.status(200).json(result);
  } catch (error) {
    logger(error, 'GET /getSpkGeneral', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

// Daily SPK totals for a dept — tbl_total_spk_daily(year, month, namaDept)
// Returns: { bulan (day number), total }
export const getSpkTotalDaily = async (req, res) => {
  try {
    const { year, month, namaDept } = req.query;

    const result = await dbWJS.raw(
      `SELECT * FROM tbl_total_spk_daily(?, ?, ?)`,
      [year || dayjs().format('YYYY'), month || dayjs().format('M'), namaDept || '']
    );

    res.status(200).json(result);
  } catch (error) {
    logger(error, 'GET /getSpkTotalDaily', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};
