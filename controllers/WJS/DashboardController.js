import dayjs from "dayjs";
import { dbWJS } from "../../config/db.js";
import { logger } from "../../helpers/logger.js";
import { getErrorResponse } from "../../helpers/utils.js";

// ─── Dashboard Performance ────────────────────────────────────────────────────
export const getDashboardPerformance = async (req, res) => {
  // #swagger.tags = ['Dashboard']
  /* #swagger.security = [{ "bearerAuth": [] }] */
  // #swagger.description = 'Ambil semua data KPI dashboard sekaligus'
  try {
    const year  = dayjs().year();
    const month = dayjs().month() + 1;

    const [
      moldRepairClosedMonth,
      moldRepairTargetMonth,
      moldRepairClosedYear,
      moldRepairTargetYear,
      generalClosedMonth,
      generalTargetMonth,
      generalClosedYear,
      generalTargetYear,
      sla,
      spkMold,
    ] = await Promise.all([
      // Mold Repair — bulan ini
      dbWJS("SPK").count("id_spk as total")
        .whereRaw("status = 'tutup' AND YEAR(target_selesai) = ? AND MONTH(target_selesai) = ?", [year, month])
        .whereIn("id_dept", [2, 6]).first(),

      dbWJS("SPK").count("id_spk as total")
        .whereRaw("YEAR(target_selesai) = ? AND MONTH(target_selesai) = ?", [year, month])
        .whereIn("id_dept", [2, 6]).first(),

      // Mold Repair — tahun ini
      dbWJS("SPK").count("id_spk as total")
        .whereRaw("status = 'tutup' AND YEAR(target_selesai) = ?", [year])
        .whereIn("id_dept", [2, 6]).first(),

      dbWJS("SPK").count("id_spk as total")
        .whereRaw("YEAR(target_selesai) = ?", [year])
        .whereIn("id_dept", [2, 6]).first(),

      // General — bulan ini
      dbWJS("SPK").count("id_spk as total")
        .whereRaw("status = 'tutup' AND YEAR(target_selesai) = ? AND MONTH(target_selesai) = ?", [year, month])
        .whereNotIn("id_dept", [2, 6, 16]).first(),

      dbWJS("SPK").count("id_spk as total")
        .whereRaw("YEAR(target_selesai) = ? AND MONTH(target_selesai) = ?", [year, month])
        .whereNotIn("id_dept", [2, 6, 16]).first(),

      // General — tahun ini
      dbWJS("SPK").count("id_spk as total")
        .whereRaw("status = 'tutup' AND YEAR(target_selesai) = ?", [year])
        .whereNotIn("id_dept", [2, 6, 16]).first(),

      dbWJS("SPK").count("id_spk as total")
        .whereRaw("YEAR(target_selesai) = ?", [year])
        .whereNotIn("id_dept", [2, 6, 16]).first(),

      // SLA — stored function
      dbWJS.raw(`SELECT * FROM tbl_sla_section_dashboard(?, ?, '')`, [
        dayjs().startOf("month").format("YYYY-MM-DD"),
        dayjs().endOf("month").format("YYYY-MM-DD"),
      ]),

      // SPK Mold progress
      dbWJS.raw(`
        SELECT
          a.id_spk,
          CASE WHEN target_analisis_start IS NOT NULL THEN
            CASE WHEN (SELECT TOP 1 finish FROM Scan_SPV WHERE id_spk = a.id_spk AND section = 'bongkar_analisis' ORDER BY id DESC) IS NOT NULL THEN '100' ELSE '-' END
          ELSE '' END analyze,
          CASE WHEN target_drawing_start IS NOT NULL THEN
            CASE WHEN (SELECT TOP 1 finish FROM Scan_SPV WHERE id_spk = a.id_spk AND section = 'drawing' ORDER BY id DESC) IS NOT NULL THEN '100' ELSE '-' END
          ELSE '' END drawing,
          CASE WHEN target_machining_start IS NOT NULL THEN
            CASE WHEN (SELECT TOP 1 finish FROM Scan_Operator WHERE id_spk = a.id_spk ORDER BY id DESC) IS NOT NULL THEN '100' ELSE '-' END
          ELSE '' END machining,
          CASE WHEN target_assy_start IS NOT NULL THEN
            CASE WHEN (SELECT TOP 1 finish FROM Scan_SPV WHERE id_spk = a.id_spk AND section = 'assy' ORDER BY id DESC) IS NOT NULL THEN '100' ELSE '-' END
          ELSE '' END assembly,
          CASE WHEN target_trial_start IS NOT NULL THEN
            CASE WHEN (SELECT TOP 1 finish FROM Scan_SPV WHERE id_spk = a.id_spk AND section = 'trial' ORDER BY id DESC) IS NOT NULL THEN '100' ELSE '-' END
          ELSE '' END trial
        FROM SPK a
        WHERE id_dept IN (2, 6)
      `),
    ]);

    const slaRows = Array.isArray(sla) ? sla : sla[0] ?? [];

    return res.status(200).json({
      moldRepair: {
        closedMonth:  Number(moldRepairClosedMonth?.total ?? 0),
        targetMonth:  Number(moldRepairTargetMonth?.total ?? 0),
        closedYear:   Number(moldRepairClosedYear?.total ?? 0),
        targetYear:   Number(moldRepairTargetYear?.total ?? 0),
      },
      general: {
        closedMonth:  Number(generalClosedMonth?.total ?? 0),
        targetMonth:  Number(generalTargetMonth?.total ?? 0),
        closedYear:   Number(generalClosedYear?.total ?? 0),
        targetYear:   Number(generalTargetYear?.total ?? 0),
      },
      sla: {
        design:    slaRows[2] ? Math.round(slaRows[2].sla) : 0,
        trial:     slaRows[4] ? Math.round(slaRows[4].sla) : 0,
        machining: slaRows[5] ? Math.round(slaRows[5].sla) : 0,
        assembly:  slaRows[6] ? Math.round(slaRows[6].sla) : 0,
      },
      spkMold: Array.isArray(spkMold) ? spkMold : spkMold[0] ?? [],
    });
  } catch (error) {
    logger(error, "GET /dashboard/performance", req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

// ─── SPK Monitor ─────────────────────────────────────────────────────────────
export const getSpkMonitor = async (req, res) => {
  // #swagger.tags = ['Dashboard']
  /* #swagger.security = [{ "bearerAuth": [] }] */
  // #swagger.description = 'Data SPK monitor plan vs actual per section'
  try {
    const result = await dbWJS.raw(`
      SELECT
        a.section,
        a.pic,
        c.opt_name,
        a.id_spk,
        CASE
          WHEN section = 'bongkar_analisis' THEN b.target_analisis_start
          WHEN section = 'drawing'          THEN b.target_drawing_start
          WHEN section = 'machining'        THEN b.target_machining_start
          WHEN section = 'assy'             THEN b.target_assy_start
          WHEN section = 'trial'            THEN b.target_trial_start
        END plan_start,
        CASE
          WHEN section = 'bongkar_analisis' THEN b.target_analisis_finish
          WHEN section = 'drawing'          THEN b.target_drawing_finish
          WHEN section = 'machining'        THEN b.target_machining_finish
          WHEN section = 'assy'             THEN b.target_assy_finish
          WHEN section = 'trial'            THEN b.target_trial_finish
        END plan_finish,
        CASE
          WHEN section = 'machining'
            THEN (SELECT start FROM Scan_Operator WHERE id = (SELECT MIN(id) FROM Scan_Operator WHERE pic = a.pic AND id_spk = a.id_spk))
          ELSE (SELECT start FROM Scan_SPV WHERE id = (SELECT MIN(id) FROM Scan_SPV WHERE section = a.section AND pic = a.pic AND id_spk = a.id_spk))
        END act_start,
        CASE
          WHEN section = 'machining'
            THEN (SELECT finish FROM Scan_Operator WHERE id = (SELECT MAX(id) FROM Scan_Operator WHERE pic = a.pic AND id_spk = a.id_spk))
          ELSE (SELECT finish FROM Scan_SPV WHERE id = (SELECT MAX(id) FROM Scan_SPV WHERE section = a.section AND pic = a.pic AND id_spk = a.id_spk))
        END act_finish
      FROM (
        SELECT id, 'machining' section, pic, id_spk, start, finish FROM Scan_Operator
        UNION
        SELECT id, section, pic, id_spk, start, finish FROM Scan_SPV
      ) a
      INNER JOIN SPK b ON a.id_spk = b.id_spk
      INNER JOIN Employee c ON a.pic = c.opt_nik
      WHERE
        (
          MONTH(GETDATE()) - 1 = CASE
            WHEN section = 'bongkar_analisis' THEN MONTH(b.target_analisis_start)
            WHEN section = 'drawing'          THEN MONTH(b.target_drawing_start)
            WHEN section = 'machining'        THEN MONTH(b.target_machining_start)
            WHEN section = 'assy'             THEN MONTH(b.target_assy_start)
            WHEN section = 'trial'            THEN MONTH(b.target_trial_start)
          END
          AND YEAR(GETDATE()) = CASE
            WHEN section = 'bongkar_analisis' THEN YEAR(b.target_analisis_start)
            WHEN section = 'drawing'          THEN YEAR(b.target_drawing_start)
            WHEN section = 'machining'        THEN YEAR(b.target_machining_start)
            WHEN section = 'assy'             THEN YEAR(b.target_assy_start)
            WHEN section = 'trial'            THEN YEAR(b.target_trial_start)
          END
        )
        OR CASE
          WHEN section = 'machining'
            THEN (SELECT finish FROM Scan_Operator WHERE id = (SELECT MAX(id) FROM Scan_Operator WHERE pic = a.pic AND id_spk = a.id_spk))
          ELSE (SELECT finish FROM Scan_SPV WHERE id = (SELECT MAX(id) FROM Scan_SPV WHERE section = a.section AND pic = a.pic AND id_spk = a.id_spk))
        END IS NULL
      GROUP BY
        a.section, a.pic, c.opt_name, a.id_spk,
        b.target_analisis_start, b.target_drawing_start, b.target_machining_start, b.target_assy_start, b.target_trial_start,
        b.target_analisis_finish, b.target_drawing_finish, b.target_machining_finish, b.target_assy_finish, b.target_trial_finish
    `);

    return res.status(200).json(Array.isArray(result) ? result : result[0] ?? []);
  } catch (error) {
    logger(error, "GET /dashboard/spk-monitor", req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};
