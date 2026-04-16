import { dbWJS } from "../../config/db.js";
import { getErrorResponse } from "../../helpers/utils.js";
import { logger } from "../../helpers/logger.js";
import dayjs from "dayjs";

// TJKN productivity chart — tbl_produktivitas_section(start, section)
// Returns: { pic, id_pic, menit, total, tjkn, presentase }
export const getTJKNReport = async (req, res) => {
  try {
    const { start, section } = req.query;
    const s = start   || dayjs().format('YYYY-MM-DD');
    const sec = section || 'all';

    const result = await dbWJS.raw(
      `SELECT * FROM tbl_produktivitas_section(?, ?) ORDER BY menit DESC`,
      [s, sec]
    );

    res.status(200).json(result);
  } catch (error) {
    logger(error, 'GET /getTJKNReport', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

// TJKN detail for a specific operator — tbl_produktivitas_detail(date, nik)
// Returns scan records with start/finish/postpone/totalJam/presentase/tjkn
export const getTJKNDetail = async (req, res) => {
  try {
    const { tanggal, nik } = req.query;

    const [detail, groupDate] = await Promise.all([
      dbWJS.raw(
        `SELECT *, 
          CASE WHEN CAST([start] AS time) < '08:00:00' 
            THEN DATEADD(DAY, DATEDIFF(DAY, 0, [start]), '08:00:00') 
            ELSE [start] 
          END AS start_time 
         FROM tbl_produktivitas_detail(?, ?)`,
        [tanggal, nik]
      ),
      dbWJS.raw(
        `SELECT SUBSTRING(FORMAT(start, 'yyyy-MM-dd'), 1, 10) AS tgl 
         FROM tbl_produktivitas_detail(?, ?) 
         GROUP BY SUBSTRING(FORMAT(start, 'yyyy-MM-dd'), 1, 10)`,
        [tanggal, nik]
      ),
    ]);

    // Calculate weekend days (Saturday=6, Sunday=7) for TJKN adjustment
    let tjknSabMing = 0;
    groupDate.forEach(row => {
      const dayOfWeek = dayjs(row.tgl).day(); // 0=Sun, 6=Sat
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        tjknSabMing += 8;
      }
    });

    res.status(200).json({ detail, tjknSabMing });
  } catch (error) {
    logger(error, 'GET /getTJKNDetail', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};
