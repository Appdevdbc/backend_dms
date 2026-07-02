import { dbDMS } from "../../config/db.js";
import dayjs from "dayjs";
import * as dotenv from 'dotenv';
import { decrypt, getErrorResponse } from "../../helpers/utils.js";
import { logger } from "../../helpers/logger.js";
dotenv.config();

export const getHistoryDocument = async (req, res) => {
  // #swagger.tags = ['Report']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Get history of documents (all content records)'
  try {
    if (req.query.rowsPerPage == null) {
      // Simple list without pagination
      const documents = await dbDMS('mContent as c')
        .select(
          'c.content_id',
          'c.content_no',
          'c.content_name',
          'c.content_revision',
          'c.content_entry_date',
          'c.content_eff_date',
          'c.content_file',
          'c.content_active',
          'div.divisi_name',
          'dept.dept_name',
          'f.folder_name'
        )
        .leftJoin('mDivisi as div', 'div.divisi_iddiv', 'c.content_iddiv')
        .leftJoin('mDept as dept', 'dept.dept_id', 'c.content_iddept')
        .leftJoin('mFolder as f', 'f.folder_id', 'c.content_idfolder')
        .where('c.content_domain', req.query.domain || 'DMS')
        .whereNotNull('c.content_no')
        // .whereNull('c.deleted_at')
        .orderBy('c.content_no', 'asc');
      
      res.status(200).json(documents);
    } else {
      // Paginated list
      const sorting = req.query.descending === "true" ? "desc" : "asc";
      const columnSort = req.query.sortBy === "desc" ? "c.content_no asc" : `c.${req.query.sortBy} ${sorting}`;
      const page = Math.floor(req.query.page);
      
      const response = await dbDMS('mContent as c')
        .select(
          'c.content_id',
          'c.content_no',
          'c.content_name',
          'c.content_revision',
          'c.content_entry_date',
          'c.content_eff_date',
          'c.content_file',
          'c.content_active',
          'div.divisi_name',
          'dept.dept_name',
          'f.folder_name'
        )
        .leftJoin('mDivisi as div', 'div.divisi_iddiv', 'c.content_iddiv')
        .leftJoin('mDept as dept', 'dept.dept_id', 'c.content_iddept')
        .leftJoin('mFolder as f', 'f.folder_id', 'c.content_idfolder')
        .where('c.content_domain', req.query.domain || 'DMS')
        // .whereNull('c.deleted_at')
        .whereNotNull('c.content_no')
        .where((query) => {
          if (req.query.filter != null) {
            query.orWhere("c.content_no", "like", `%${req.query.filter}%`);
            query.orWhere("c.content_name", "like", `%${req.query.filter}%`);
            query.orWhere("div.divisi_name", "like", `%${req.query.filter}%`);
            query.orWhere("dept.dept_name", "like", `%${req.query.filter}%`);
            query.orWhere("f.folder_name", "like", `%${req.query.filter}%`);
            query.orWhere("c.content_file", "like", `%${req.query.filter}%`);
          }
        })
        .orderByRaw(columnSort)
        .paginate({
          perPage: Math.floor(req.query.rowsPerPage),
          currentPage: page,
          isLengthAware: true,
        });
      
      res.status(200).json(response);
    }
  } catch (error) {
    logger(error, 'GET /getHistoryDocument', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};
