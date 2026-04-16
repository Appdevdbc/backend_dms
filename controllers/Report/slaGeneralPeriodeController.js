import { dbWJS } from "../../config/db.js";
import { getErrorResponse } from "../../helpers/utils.js";
import { logger } from "../../helpers/logger.js";
import dayjs from "dayjs";

// Weekly Achievement — tbl_sla_periode(start, end, jenis)
// Returns: { week_month, target, actual, target_sla, actual_sla }
export const getSlaPeriode = async (req, res) => {
  // #swagger.tags = ['Report - SLA General Periode']
  /* #swagger.security = [{ "bearerAuth": [] }] */
  try {
    const { start, end, jenis = 'general' } = req.query;

    const result = await dbWJS.raw(
      `SELECT * FROM tbl_sla_periode(?, ?, ?)`,
      [start || '2019-01-01', end || dayjs().format('YYYY-MM-DD'), jenis]
    );

    res.status(200).json(result);
  } catch (error) {
    logger(error, 'GET /getSlaPeriode', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

// Total Penyelesaian SPK per month — tbl_penyelesaian_month(year, jenis)
// Returns: { month, spk_urgent, spk_normal, spk_total }
export const getPenyelesaianSPK = async (req, res) => {
  // #swagger.tags = ['Report - SLA General Periode']
  /* #swagger.security = [{ "bearerAuth": [] }] */
  try {
    const { year, jenis = 'general' } = req.query;

    const result = await dbWJS.raw(
      `SELECT * FROM tbl_penyelesaian_month(?, ?)`,
      [year || dayjs().format('YYYY'), jenis]
    );

    res.status(200).json(result);
  } catch (error) {
    logger(error, 'GET /getPenyelesaianSPK', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

// YTD SPK per dept — tbl_sla_periode_ytd(year, jenis)
// Returns: { dept, spk_urgent, spk_normal }
export const getSpkPeriodeYTD = async (req, res) => {
  // #swagger.tags = ['Report - SLA General Periode']
  /* #swagger.security = [{ "bearerAuth": [] }] */
  try {
    const { year, jenis = 'general' } = req.query;

    const result = await dbWJS.raw(
      `SELECT * FROM tbl_sla_periode_ytd(?, ?)`,
      [year || dayjs().format('YYYY'), jenis]
    );

    res.status(200).json(result);
  } catch (error) {
    logger(error, 'GET /getSpkPeriodeYTD', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};
