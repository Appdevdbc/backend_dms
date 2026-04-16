import { dbWJS } from "../../config/db.js";
import { getErrorResponse } from "../../helpers/utils.js";
import { logger } from "../../helpers/logger.js";
import dayjs from "dayjs";

// SPK list for dropdown — all SPKs (TerimaSPK model maps to SPK table, no filter)
export const getGanttSpkList = async (req, res) => {
  try {
    const result = await dbWJS('SPK')
      .select('id_spk')
      .orderBy('id_spk', 'asc');

    res.status(200).json(result.map(r => ({ value: r.id_spk, label: r.id_spk })));
  } catch (error) {
    logger(error, 'GET /getGanttSpkList', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

// Gantt chart data for a specific SPK
// Returns: gantt rows + month range for column headers
export const getGanttChart = async (req, res) => {
  try {
    const { spk } = req.query;

    if (!spk) {
      return res.status(200).json({ gantt: [], months: [] });
    }

    // Get gantt rows from stored function
    const gantt = await dbWJS.raw(
      `SELECT * FROM tbl_gant_chart(?)`,
      [spk]
    );

    // Get SPK date range to build month columns
    const spkInfo = await dbWJS('SPK')
      .select('tanggal', 'target_selesai')
      .where('id_spk', spk)
      .first();

    if (!spkInfo) {
      return res.status(200).json({ gantt, months: [] });
    }

    const start = dayjs(spkInfo.tanggal).startOf('day');
    const end   = dayjs(spkInfo.target_selesai).startOf('day');

    // Build array of months with their day counts
    const months = [];
    let current = start.startOf('month');
    while (current.isBefore(end.endOf('month')) || current.isSame(end, 'month')) {
      months.push({
        month:   current.month() + 1,       // 1-12
        year:    current.year(),
        label:   current.format('MMMM YYYY'),
        daysInMonth: current.daysInMonth(),
      });
      current = current.add(1, 'month');
    }

    res.status(200).json({ gantt, months });
  } catch (error) {
    logger(error, 'GET /getGanttChart', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};
