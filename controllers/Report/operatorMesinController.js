import { dbWJS } from "../../config/db.js";
import { getErrorResponse } from "../../helpers/utils.js";
import { logger } from "../../helpers/logger.js";

// Get Job Type list for filter dropdown
export const getJobTypeList = async (req, res) => {
  // #swagger.tags = ['Report - Operator Mesin Hours']
  /* #swagger.security = [{ "bearerAuth": [] }] */
  // #swagger.description = 'Get job type list for filter dropdown'
  try {
    const jobTypes = await dbWJS('Job_Type')
      .select('id_job as value', 'nama_job as label')
      .orderBy('nama_job', 'asc');

    res.status(200).json(jobTypes);
  } catch (error) {
    logger(error, 'GET /getJobTypeList', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

// Get Machine Hours report
export const getMesinHours = async (req, res) => {
  // #swagger.tags = ['Report - Operator Mesin Hours']
  /* #swagger.security = [{ "bearerAuth": [] }] */
  // #swagger.description = 'Get total machine hours per machine'
  try {
    const { start, end, id_job } = req.query;

    const result = await dbWJS.raw(
      `SELECT * FROM tbl_machine_hours(?, ?, ?)`,
      [start || '', end || '', id_job || '']
    );

    // Log first row keys so we can verify column names
    if (result && result.length > 0) {
      // columns verified
    }

    res.status(200).json(result);
  } catch (error) {
    logger(error, 'GET /getMesinHours', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

// Get Operator Hours report
export const getOperatorHours = async (req, res) => {
  // #swagger.tags = ['Report - Operator Mesin Hours']
  /* #swagger.security = [{ "bearerAuth": [] }] */
  // #swagger.description = 'Get total operator hours per operator'
  try {
    const { start, end, id_job } = req.query;

    const result = await dbWJS.raw(
      `SELECT * FROM tbl_operator_hours(?, ?, ?)`,
      [start || '', end || '', id_job || '']
    );

    // Log first row keys so we can verify column names
    if (result && result.length > 0) {
      // columns verified
    }

    res.status(200).json(result);
  } catch (error) {
    logger(error, 'GET /getOperatorHours', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};
