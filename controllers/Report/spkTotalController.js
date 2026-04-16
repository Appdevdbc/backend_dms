import { dbWJS } from "../../config/db.js";
import { getErrorResponse } from "../../helpers/utils.js";
import { logger } from "../../helpers/logger.js";
import dayjs from "dayjs";

// Total SPK per dept — inline query from Report model
// Returns: { id_dept, nama, total_spk }
export const getSpkTotal = async (req, res) => {
  try {
    const { year } = req.query;
    const y = year || dayjs().format('YYYY');

    const result = await dbWJS.raw(`
      SELECT
        id_dept,
        nama,
        (SELECT COUNT(id_spk) FROM SPK WHERE YEAR(tanggal) = ? AND id_dept = a.id_dept) AS total_spk
      FROM Department a
      WHERE id_dept NOT IN (2, 6)
      ORDER BY nama ASC
    `, [y]);

    res.status(200).json(result);
  } catch (error) {
    logger(error, 'GET /getSpkTotal', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

// Total SPK per month for a dept — tbl_total_spk_dept(year, namaDept)
// Returns: { bulan, total }
export const getSpkTotalBulan = async (req, res) => {
  try {
    const { tahun, namaDept } = req.query;

    const result = await dbWJS.raw(
      `SELECT * FROM tbl_total_spk_dept(?, ?)`,
      [tahun || dayjs().format('YYYY'), namaDept || '']
    );

    res.status(200).json(result);
  } catch (error) {
    logger(error, 'GET /getSpkTotalBulan', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};
