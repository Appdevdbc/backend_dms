import { dbWJS } from "../../config/db.js";
import { getErrorResponse } from "../../helpers/utils.js";
import { logger } from "../../helpers/logger.js";
import dayjs from "dayjs";

// Employee list for dropdown
export const getEmployeeList = async (req, res) => {
  try {
    const employees = await dbWJS('Employee')
      .select('opt_nik as value', dbWJS.raw("opt_nik + ' - ' + opt_name as label"))
      .orderBy('opt_name', 'asc');
    res.status(200).json(employees);
  } catch (error) {
    logger(error, 'GET /getEmployeeListPerf', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

// Get performance employee data
export const getPerformanceEmployee = async (req, res) => {
  try {
    const { tahun, bulan, employee } = req.query;
    const y = tahun  || dayjs().format('YYYY');
    const m = bulan  || dayjs().format('M');

    let whereEmployee = '';
    if (employee) whereEmployee = `AND a.perf_nik = '${employee}'`;

    const sql = `
      SELECT
        a.*,
        b.opt_name,
        (
          (
            SELECT COUNT(finish)
            FROM Scan_Operator a1
            INNER JOIN (
              SELECT id_spk, (SELECT MAX(id) FROM Scan_Operator WHERE id_spk = a1.id_spk) max_id
              FROM Scan_Operator a1
              WHERE a1.pic = b.opt_nik
                AND a1.finish IS NOT NULL
                AND YEAR(a1.finish) = '${y}'
                AND MONTH(a1.finish) = '${m}'
              GROUP BY id_spk
            ) b1 ON a1.id = b1.max_id
            WHERE a1.finish IS NOT NULL
              AND YEAR(a1.finish) = '${y}'
              AND MONTH(a1.finish) = '${m}'
          ) + (
            SELECT COUNT(finish)
            FROM Scan_SPV a1
            INNER JOIN (
              SELECT id_spk, (SELECT MAX(id) FROM Scan_SPV WHERE id_spk = a1.id_spk) max_id
              FROM Scan_SPV a1
              WHERE a1.pic = b.opt_nik
                AND a1.finish IS NOT NULL
                AND YEAR(a1.finish) = '${y}'
                AND MONTH(a1.finish) = '${m}'
              GROUP BY id_spk
            ) b1 ON a1.id = b1.max_id
            WHERE a1.finish IS NOT NULL
              AND YEAR(a1.finish) = '${y}'
              AND MONTH(a1.finish) = '${m}'
          )
        ) jml_spk,
        CAST(c.total AS float) total,
        (
          (
            SELECT COUNT(finish)
            FROM Scan_Operator a1
            INNER JOIN (
              SELECT a1.id_spk, (SELECT MAX(id) FROM Scan_Operator WHERE id_spk = a1.id_spk) max_id
              FROM Scan_Operator a1
              INNER JOIN SPK b1 ON a1.id_spk = b1.id_spk
              WHERE a1.pic = b.opt_nik
                AND b1.tipe = 'urgent'
                AND a1.finish IS NOT NULL
                AND YEAR(a1.finish) = '${y}'
                AND MONTH(a1.finish) = '${m}'
              GROUP BY a1.id_spk
            ) b1 ON a1.id = b1.max_id
            WHERE a1.finish IS NOT NULL
              AND YEAR(a1.finish) = '${y}'
              AND MONTH(a1.finish) = '${m}'
          ) + (
            SELECT COUNT(finish)
            FROM Scan_SPV a1
            INNER JOIN (
              SELECT a1.id_spk, (SELECT MAX(id) FROM Scan_SPV WHERE id_spk = a1.id_spk) max_id
              FROM Scan_SPV a1
              INNER JOIN SPK b1 ON a1.id_spk = b1.id_spk
              WHERE a1.pic = b.opt_nik
                AND b1.tipe = 'urgent'
                AND a1.finish IS NOT NULL
                AND YEAR(a1.finish) = '${y}'
                AND MONTH(a1.finish) = '${m}'
              GROUP BY a1.id_spk
            ) b1 ON a1.id = b1.max_id
            WHERE a1.finish IS NOT NULL
              AND YEAR(a1.finish) = '${y}'
              AND MONTH(a1.finish) = '${m}'
          )
        ) spk_urgent
      FROM trn_performance_emp a
      INNER JOIN Employee b ON a.perf_nik = b.opt_nik
      LEFT JOIN tbl_produktivitas_section('${y}-${String(m).padStart(2,'0')}-01', 'all') c ON c.id_pic = a.perf_nik
      WHERE a.perf_year = '${y}'
        AND a.perf_month = '${m}'
        ${whereEmployee}
    `;

    const result = await dbWJS.raw(sql);
    res.status(200).json(result);
  } catch (error) {
    logger(error, 'GET /getPerformanceEmployee', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

// Save / upsert performance employee records
export const savePerformanceEmployee = async (req, res) => {
  const trx = await dbWJS.transaction();
  try {
    const { tahun, bulan, employee, rows } = req.body;
    const y = tahun || dayjs().format('YYYY');
    const m = bulan || dayjs().format('M');

    // Ensure record exists for this employee/year/month
    if (employee) {
      const existing = await trx('trn_performance_emp')
        .where({ perf_nik: employee, perf_year: y, perf_month: m })
        .first();

      if (!existing) {
        await trx('trn_performance_emp').insert({
          perf_nik: employee, perf_year: y, perf_month: m,
        });
      }
    }

    // Update each row's editable fields
    if (rows && Array.isArray(rows)) {
      for (const row of rows) {
        await trx('trn_performance_emp')
          .where('perf_id', row.perf_id)
          .update({
            perf_adhspk:    row.perf_adhspk    ?? null,
            perf_efisiensi: row.perf_efisiensi ?? null,
            perf_faultrate: row.perf_faultrate ?? null,
          });
      }
    }

    await trx.commit();
    res.status(200).json({ message: 'sukses' });
  } catch (error) {
    await trx.rollback();
    logger(error, 'POST /savePerformanceEmployee', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};
