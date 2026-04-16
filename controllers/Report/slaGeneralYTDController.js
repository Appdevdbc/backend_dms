import { dbWJS } from "../../config/db.js";
import { getErrorResponse } from "../../helpers/utils.js";
import { logger } from "../../helpers/logger.js";
import dayjs from "dayjs";

// Main YTD chart — tbl_sla_periode_month(year, jenis)
// Returns: { month, sla, target, tercapai }
export const getSlaGeneralYTD = async (req, res) => {
  try {
    const { year, jenis = 'general' } = req.query;
    const result = await dbWJS.raw(
      `SELECT * FROM tbl_sla_periode_month(?, ?)`,
      [year || dayjs().format('YYYY'), jenis]
    );
    res.status(200).json(result);
  } catch (error) {
    logger(error, 'GET /getSlaGeneralYTD', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

// Summary totals + SPK status counts for Target VS Pencapaian & Outstanding charts
export const getSlaGeneralYTDSummary = async (req, res) => {
  try {
    const { year, jenis = 'general' } = req.query;
    // Match PHP behavior: summary always uses the requested year (not hardcoded current year)
    // PHP hardcodes date('Y') but that was likely a bug — using requested year is correct
    const y = year || dayjs().format('YYYY');

    const [targetRes, tercapaiRes, closeRes, openRes, outstandingRes] = await Promise.all([
      dbWJS.raw(`SELECT SUM(target) AS total FROM tbl_sla_periode_month(?, ?)`, [y, jenis]),
      dbWJS.raw(`SELECT SUM(tercapai) AS total FROM tbl_sla_periode_month(?, ?)`, [y, jenis]),
      dbWJS.raw(
        `SELECT COUNT(*) AS total FROM SPK
         WHERE jenis = ? AND id_dept <> 16
           AND DATEPART(YEAR, target_selesai) = ? AND status = 'tutup'`,
        [jenis, y]
      ),
      dbWJS.raw(
        `SELECT COUNT(*) AS total FROM SPK
         WHERE jenis = ? AND id_dept <> 16
           AND DATEPART(YEAR, target_selesai) = ? AND status = 'proses'`,
        [jenis, y]
      ),
      dbWJS.raw(
        `SELECT COUNT(*) AS total FROM SPK
         WHERE jenis = ? AND id_dept <> 16
           AND DATEPART(YEAR, target_selesai) = ? AND status = 'terima'`,
        [jenis, y]
      ),
    ]);

    res.status(200).json({
      target:      targetRes[0]?.total      || 0,
      tercapai:    tercapaiRes[0]?.total    || 0,
      slaClose:    closeRes[0]?.total       || 0,
      slaOpen:     openRes[0]?.total        || 0,
      slaOutstanding: outstandingRes[0]?.total || 0,
    });
  } catch (error) {
    logger(error, 'GET /getSlaGeneralYTDSummary', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

// Detail table when clicking a month bar — tbl_detail_sla_ytd(year, month, jenis)
export const getSlaGeneralYTDDetail = async (req, res) => {
  try {
    const { year, bulan, jenis = 'general' } = req.query;
    const result = await dbWJS.raw(
      `SELECT * FROM tbl_detail_sla_ytd(?, ?, ?)`,
      [year || dayjs().format('YYYY'), bulan, jenis]
    );
    res.status(200).json(result);
  } catch (error) {
    logger(error, 'GET /getSlaGeneralYTDDetail', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

// Level 1 drill-down: SPK days — exec tbl_sla_periode_month_level1_day
export const getSlaGeneralYTDHari = async (req, res) => {
  try {
    const { bulan, tahun, jenis = 'general' } = req.query;
    const result = await dbWJS.raw(
      `EXEC tbl_sla_periode_month_level1_day ?, ?, ?`,
      [bulan, tahun, jenis]
    );
    res.status(200).json(result);
  } catch (error) {
    logger(error, 'GET /getSlaGeneralYTDHari', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

// Level 1 drill-down: SPK hours — exec tbl_sla_periode_month_level1_hour
export const getSlaGeneralYTDJam = async (req, res) => {
  try {
    const { bulan, tahun, jenis = 'general' } = req.query;
    const result = await dbWJS.raw(
      `EXEC tbl_sla_periode_month_level1_hour ?, ?, ?`,
      [bulan, tahun, jenis]
    );
    res.status(200).json(result);
  } catch (error) {
    logger(error, 'GET /getSlaGeneralYTDJam', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

// Level 2 drill-down: hours by section — exec tbl_sla_periode_month_level2_section
export const getSlaGeneralYTDSection = async (req, res) => {
  try {
    const { id_spk } = req.query;
    const result = await dbWJS.raw(
      `EXEC tbl_sla_periode_month_level2_section ?`,
      [id_spk]
    );
    res.status(200).json(result);
  } catch (error) {
    logger(error, 'GET /getSlaGeneralYTDSection', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

// Level 2 drill-down: hours by operator — exec tbl_sla_periode_month_level2_opr
export const getSlaGeneralYTDOpr = async (req, res) => {
  try {
    const { id_spk } = req.query;
    const result = await dbWJS.raw(
      `EXEC tbl_sla_periode_month_level2_opr ?`,
      [id_spk]
    );
    res.status(200).json(result);
  } catch (error) {
    logger(error, 'GET /getSlaGeneralYTDOpr', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};
