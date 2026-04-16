import { dbWJS } from "../../config/db.js";
import { getErrorResponse } from "../../helpers/utils.js";
import { logger } from "../../helpers/logger.js";
import dayjs from "dayjs";

// Department list for Mold (only dept 2 and 6)
export const getDeptListMold = async (req, res) => {
  try {
    const depts = await dbWJS('Department')
      .select('id_dept as value', 'nama as label')
      .whereIn('id_dept', [2, 6])
      .orderBy('nama', 'asc');

    res.status(200).json(depts);
  } catch (error) {
    logger(error, 'GET /getDeptListMold', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

// SPK Mold per dept for a given year+month (dept 2 and 6 only)
// Returns: { id_dept, nama, total_spk }
export const getSpkMold = async (req, res) => {
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
        AND a.id_dept IN (2, 6)
    `;
    if (dept) sql += ` AND a.id_dept = ${dept}`;
    sql += ` GROUP BY a.id_dept, b.nama`;

    const result = await dbWJS.raw(sql);
    res.status(200).json(result);
  } catch (error) {
    logger(error, 'GET /getSpkMold', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};
