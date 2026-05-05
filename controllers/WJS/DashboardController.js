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
    });
  } catch (error) {
    logger(error, "GET /dashboard/performance", req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

// ─── SPK Mold Progress ───────────────────────────────────────────────────────
export const getSpkMold = async (req, res) => {
  // #swagger.tags = ['Dashboard']
  /* #swagger.security = [{ "bearerAuth": [] }] */
  // #swagger.description = 'Data SPK Mold Repair progress per section (with pagination)'
  try {
    const { page = 1, rowsPerPage = 10, sortBy, descending, filter } = req.query;

    const baseSql = `
      WITH spk_mold AS (
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
      )
    `;

    let filterClause = "";
    const filterParams = [];
    if (filter) {
      filterClause = `WHERE CAST(id_spk AS VARCHAR) LIKE ?`;
      filterParams.push(`%${filter}%`);
    }

    const allowedSortCols = ["id_spk", "analyze", "drawing", "machining", "assembly", "trial"];
    const sortCol = allowedSortCols.includes(sortBy) ? sortBy : "id_spk";
    const sortDir = descending === "true" ? "DESC" : "ASC";

    const countResult = await dbWJS.raw(
      `${baseSql} SELECT COUNT(*) AS total FROM spk_mold ${filterClause}`,
      filterParams
    );
    const total = countResult[0]?.total ?? 0;

    const perPage = parseInt(rowsPerPage, 10) || 10;
    const currentPage = parseInt(page, 10) || 1;
    const offset = (currentPage - 1) * perPage;

    const dataResult = await dbWJS.raw(
      `${baseSql} SELECT * FROM spk_mold ${filterClause} ORDER BY ${sortCol} ${sortDir} OFFSET ${offset} ROWS FETCH NEXT ${perPage} ROWS ONLY`,
      [...filterParams]
    );

    const rows = Array.isArray(dataResult) ? dataResult : dataResult[0] ?? [];

    return res.status(200).json({
      data: rows,
      pagination: {
        total: Number(total),
        page: currentPage,
        rowsPerPage: perPage,
        sortBy: sortCol,
        descending: descending === "true",
      },
    });
  } catch (error) {
    logger(error, "GET /dashboard/spk-mold", req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

// ─── SPK Monitor ─────────────────────────────────────────────────────────────
export const getSpkMonitor = async (req, res) => {
  // #swagger.tags = ['Dashboard']
  /* #swagger.security = [{ "bearerAuth": [] }] */
  // #swagger.description = 'Data SPK monitor plan vs actual per section (with pagination)'
  try {
    const { page = 1, rowsPerPage = 10, sortBy, descending, filter } = req.query;

    const allowedSortCols = ["id_spk", "opt_name", "section", "plan_start", "plan_finish", "act_start", "act_finish"];
    const sortCol = allowedSortCols.includes(sortBy) ? sortBy : "id_spk";
    const sortDir = descending === "true" ? "DESC" : "ASC";
    const perPage = parseInt(rowsPerPage, 10) || 10;
    const currentPage = parseInt(page, 10) || 1;
    const offset = (currentPage - 1) * perPage;

    // Show all unfinished SPK (act_finish IS NULL) + filter
    let whereClause = `WHERE act_finish IS NULL`;
    const filterParams = [];

    if (filter) {
      whereClause += ` AND (CAST(id_spk AS VARCHAR) LIKE ? OR opt_name LIKE ? OR section LIKE ?)`;
      filterParams.push(`%${filter}%`, `%${filter}%`, `%${filter}%`);
    }

    const [countResult, dataResult] = await Promise.all([
      dbWJS.raw(`SELECT COUNT(*) AS total FROM vw_spk_monitor ${whereClause}`, filterParams),
      dbWJS.raw(`SELECT * FROM vw_spk_monitor ${whereClause} ORDER BY ${sortCol} ${sortDir}, section ASC, pic ASC OFFSET ${offset} ROWS FETCH NEXT ${perPage} ROWS ONLY`, [...filterParams]),
    ]);

    const total = countResult[0]?.total ?? 0;
    const rows  = Array.isArray(dataResult) ? dataResult : dataResult[0] ?? [];

    return res.status(200).json({
      data: rows,
      pagination: {
        total: Number(total),
        page: currentPage,
        rowsPerPage: perPage,
        sortBy: sortCol,
        descending: descending === "true",
      },
    });
  } catch (error) {
    logger(error, "GET /dashboard/spk-monitor", req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};





