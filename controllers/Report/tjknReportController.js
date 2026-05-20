import { dbWJS } from "../../config/db.js";
import { getErrorResponse } from "../../helpers/utils.js";
import { logger } from "../../helpers/logger.js";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";

dayjs.extend(utc);

// ── Helper: calculate worktime (normal hours vs overtime) ─────────────────────
// Replicates PHP worktime() — splits duration between office hours (08:00-17:00)
// and overtime (outside office hours)
// Uses string comparisons like PHP does
function worktime(valueStart, valueFinish) {
  const officeStart = '08:00';
  const officeFinish = '17:00';

  let duration = { hour: 0, minute: 0 };
  let durationOver = { hour: 0, minute: 0 };

  if (!valueStart || !valueFinish) {
    return { duration: '00:00', durationOver: '00:00' };
  }

  // PHP uses string comparison for the while loop and conditions
  let pointer = valueStart; // string like "2026-05-19 10:15"
  const vFinish = valueFinish; // string like "2026-05-19 10:16"
  let i = 0;

  while (pointer < vFinish && i < 10000) {
    const pointerDate = dayjs.utc(pointer);
    const current = pointerDate.format('YYYY-MM-DD HH:mm');
    const currentDay = pointerDate.format('YYYY-MM-DD');
    const nextDay = pointerDate.add(1, 'day').format('YYYY-MM-DD');
    const officeStartFull = `${currentDay} ${officeStart}`;
    const officeFinishFull = `${currentDay} ${officeFinish}`;
    const nextDayOfficeStart = `${nextDay} ${officeStart}`;

    // Condition 1: During office hours
    if (current >= officeStartFull && current < officeFinishFull) {
      const start = dayjs.utc(pointer);
      let finish, newPointer;
      if (vFinish < officeFinishFull) {
        finish = dayjs.utc(vFinish);
        newPointer = vFinish;
      } else {
        finish = dayjs.utc(officeFinishFull);
        newPointer = officeFinishFull;
      }
      const diff = finish.diff(start, 'minute');
      duration.hour += Math.floor(diff / 60);
      duration.minute += diff % 60;
      pointer = newPointer;
    }
    // Condition 2: After office hours (overtime until next day office start)
    else if (current < nextDayOfficeStart && current >= officeFinishFull) {
      const start = dayjs.utc(pointer);
      let finish, newPointer;
      if (pointer < vFinish && vFinish > nextDayOfficeStart) {
        finish = dayjs.utc(nextDayOfficeStart);
        newPointer = nextDayOfficeStart;
      } else {
        finish = dayjs.utc(vFinish);
        newPointer = vFinish;
      }
      const diff = finish.diff(start, 'minute');
      durationOver.hour += Math.floor(diff / 60);
      durationOver.minute += diff % 60;
      pointer = newPointer;
    }
    else {
      // Safety: shouldn't happen since start_time >= 08:00
      break;
    }
    i++;
  }

  // Normalize minutes
  if (duration.minute >= 60) {
    duration.hour += Math.floor(duration.minute / 60);
    duration.minute = duration.minute % 60;
  }
  if (durationOver.minute >= 60) {
    durationOver.hour += Math.floor(durationOver.minute / 60);
    durationOver.minute = durationOver.minute % 60;
  }

  return {
    duration: `${String(duration.hour).padStart(2, '0')}:${String(duration.minute).padStart(2, '0')}`,
    durationOver: `${String(durationOver.hour).padStart(2, '0')}:${String(durationOver.minute).padStart(2, '0')}`,
  };
}

// ── Helper: calculate_total_time — sums time strings like "HH:MM" ─────────────
function calculateTotalTime(...times) {
  let totalMinutes = 0;
  for (const time of times) {
    if (!time) continue;
    const parts = String(time).split(':');
    const h = parseInt(parts[0]) || 0;
    const m = parseInt(parts[1]) || 0;
    totalMinutes += h * 60 + m;
  }
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// ── Helper: getProdVal — recalculates productivity for a single operator ──────
// Replicates PHP getProdVal($id_pic, $date)
async function getProdVal(idPic, date) {
  const detail = await dbWJS.raw(
    `SELECT *, 
      CASE WHEN CAST([start] AS time) < '08:00:00' 
        THEN DATEADD(DAY, DATEDIFF(DAY, 0, [start]), '08:00:00') 
        ELSE [start] 
      END AS start_time 
     FROM tbl_produktivitas_detail(?, ?)`,
    [date, idPic]
  );

  let totalJam = '00:00';
  let tjkn = 0;
  let tjknOver = 0;
  const pic = {};
  let picCur = '';

  for (const value of detail) {
    // Use UTC to get raw DB values — tedious driver adds timezone offset
    const startTime = value.start_time ? dayjs.utc(value.start_time).format('YYYY-MM-DD HH:mm') : null;
    const valueFinish = !value.finish ? value.postpone : value.finish;
    const finishTime = valueFinish ? dayjs.utc(valueFinish).format('YYYY-MM-DD HH:mm') : null;

    const wt = worktime(startTime, finishTime);
    const overParts = wt.durationOver.split(':');

    if (picCur !== String(value.id_pic)) {
      totalJam = '00:00';
      tjknOver = 0;
    }
    picCur = String(value.id_pic);

    if (parseInt(overParts[0]) > 0 || parseInt(overParts[1]) > 0) {
      tjknOver += 3.5;
    }

    const jkn = wt.duration;
    const jkl = wt.durationOver;
    const totalTime = calculateTotalTime(jkn, jkl);
    totalJam = calculateTotalTime(totalJam, totalTime);
    tjkn = (parseFloat(value.tjkn) || 0) + tjknOver;

    pic[value.id_pic] = {
      totalJam: totalJam.replace(':', '.'),
      tjkn: tjkn,
      tjknOver: tjknOver,
    };
  }

  let total = 0;
  for (const row of Object.values(pic)) {
    const jam = parseFloat(row.totalJam) || 0;
    const divisor = row.tjkn === 0 ? 1 : row.tjkn;
    total += (jam / divisor) * 100;
  }

  return Math.round(total * 100) / 100;
}

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

    // Recalculate productivity (total) for each operator — replicates PHP tjknCorrect()
    for (let i = 0; i < result.length; i++) {
      result[i].total = await getProdVal(result[i].id_pic, s);
    }

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

    // Format datetime fields as dd-MM-YYYY HH:mm (UTC = raw DB value, no timezone conversion)
    const formattedDetail = detail.map(row => ({
      ...row,
      start: row.start ? dayjs.utc(row.start).format('DD-MM-YYYY HH:mm') : null,
      finish: row.finish ? dayjs.utc(row.finish).format('DD-MM-YYYY HH:mm') : null,
      postpone: row.postpone ? dayjs.utc(row.postpone).format('DD-MM-YYYY HH:mm') : null,
      start_time: row.start_time ? dayjs.utc(row.start_time).format('DD-MM-YYYY HH:mm') : null,
    }));

    // Calculate weekend days (Saturday=6, Sunday=7) for TJKN adjustment
    let tjknSabMing = 0;
    groupDate.forEach(row => {
      const dayOfWeek = dayjs(row.tgl).day(); // 0=Sun, 6=Sat
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        tjknSabMing += 8;
      }
    });

    res.status(200).json({ detail: formattedDetail, tjknSabMing });
  } catch (error) {
    logger(error, 'GET /getTJKNDetail', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};
