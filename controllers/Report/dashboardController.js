import { dbDMS } from "../../config/db.js";
import * as dotenv from 'dotenv';
import { decrypt, getErrorResponse } from "../../helpers/utils.js";
import { logger } from "../../helpers/logger.js";
dotenv.config();

/**
 * Get dashboard statistics
 * Returns: Total Prosedur, Total IK (Instruksi Kerja), Total Form
 */
export const getDashboardStats = async (req, res) => {
  // #swagger.tags = ['Report']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Get dashboard statistics (Prosedur, IK, Form totals)'
  try {
    const mUser = await dbDMS("mUser")
      .select("user_iddiv")
      .where("user_empid", decrypt(req.query.empid))
      .first();

    const userDomain = req.query.domain || 'DMS';

    // Get total PROSEDUR documents
    const prosedurResult = await dbDMS("mContent")
      .join("mFolder", "mFolder.folder_id", "mContent.content_idfolder")
      .where("mFolder.folder_name", "PROSEDUR")
      .where("mContent.content_active", 1)
      // .where("mContent.content_domain", userDomain)
      .where("mContent.content_iddiv", mUser.user_iddiv)
      // .whereNull("mContent.deleted_at")
      .count("mContent.content_id as total")
      .first();

    // Get total INSTRUKSI KERJA documents
    const ikResult = await dbDMS("mContent")
      .join("mFolder", "mFolder.folder_id", "mContent.content_idfolder")
      .where("mFolder.folder_name", "INSTRUKSI KERJA")
      .where("mContent.content_active", 1)
      // .where("mContent.content_domain", userDomain)
      .where("mContent.content_iddiv", mUser.user_iddiv)
      // .whereNull("mContent.deleted_at")
      .count("mContent.content_id as total")
      .first();

    // Get total FORMULIR documents
    const formResult = await dbDMS("mContent")
      .join("mFolder", "mFolder.folder_id", "mContent.content_idfolder")
      .where("mFolder.folder_name", "FORMULIR")
      .where("mContent.content_active", 1)
      // .where("mContent.content_domain", userDomain)
      .where("mContent.content_iddiv", mUser.user_iddiv)
      // .whereNull("mContent.deleted_at")
      .count("mContent.content_id as total")
      .first();

    res.status(200).json({
      success: true,
      data: {
        prosedur: prosedurResult?.total || 0,
        ik: ikResult?.total || 0,
        form: formResult?.total || 0,
      },
    });
  } catch (error) {
    logger(error, 'GET /getDashboardStats', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

/**
 * Get chart data for documents per department grouped by folder type
 * Returns: Array of series with folder names and data arrays
 */
export const getChartData = async (req, res) => {
  // #swagger.tags = ['Report']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Get chart data for documents per department by folder type'
  try {
    const mUser = await dbDMS("mUser")
      .select("user_iddiv")
      .where("user_empid", decrypt(req.query.empid))
      .first();

    const userDomain = req.query.domain || 'DMS';

    // Get all unique folder names for this domain
    const folders = await dbDMS("mFolder")
      .select("folder_name")
      .where("folder_iddiv", mUser.user_iddiv)
      // .where("folder_domain", userDomain)
      // .whereNull("deleted_at")
      .groupBy("folder_name")
      .orderBy("folder_name");

    // Get all departments
    const departments = await dbDMS("mDept")
      .select("dept_id", "dept_name")
      .where("dept_divisi", mUser.user_iddiv)
      // .whereNull("deleted_at")
      .orderBy("dept_name");

    // Build series data
    const result = [];

    for (const folder of folders) {
      const seriesData = [];

      for (const dept of departments) {
        // Check if folder exists for this department
        const folderExists = await dbDMS("mFolder")
          .select("folder_id")
          .where("folder_iddept", dept.dept_id)
          .where("folder_name", folder.folder_name)
          // .whereNull("deleted_at")
          .first();

        let count = 0;
        if (folderExists) {
          // Count documents for this dept and folder
          const countResult = await dbDMS("mContent")
            .count("content_id as jumlah")
            .where("content_iddept", dept.dept_id)
            .where("content_idfolder", folderExists.folder_id)
            .where("content_active", 1)
            // .whereNull("deleted_at")
            .first();

          count = parseInt(countResult?.jumlah) || 0;
        }

        seriesData.push(count);
      }

      result.push({
        name: folder.folder_name,
        data: seriesData,
      });
    }

    // Get department names for categories
    const categories = departments.map((dept) => dept.dept_name);

    res.status(200).json({
      success: true,
      data: {
        categories,
        series: result,
      },
    });
  } catch (error) {
    logger(error, 'GET /getChartData', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};
