import { dbDMS } from "../../config/db.js";
import dayjs from "dayjs";
import * as dotenv from 'dotenv';
import { decrypt, getErrorResponse } from "../../helpers/utils.js";
import { logger } from "../../helpers/logger.js";
dotenv.config();

export const listDept = async (req, res) => {
  // #swagger.tags = ['Department']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Get list of departments'
  try {
    if (req.query.rowsPerPage == null) {
      // Simple list without pagination
      const depts = await dbDMS('mDept as d')
        .select(
          'd.dept_id',
          'd.dept_name',
          'd.dept_note',
          'd.dept_divisi',
          'd.dept_domain',
          'div.divisi_name'
        )
        .leftJoin('mDivisi as div', 'div.divisi_iddiv', 'd.dept_divisi')
        // .whereNull('d.deleted_at')
        .where('dept_domain', req.query.domain)
        .orderBy('d.dept_id', 'desc');
      
      res.status(200).json(depts);
    } else {
      // Paginated list
      const sorting = req.query.descending === "true" ? "desc" : "asc";
      const columnSort = req.query.sortBy === "desc" ? "d.dept_id desc" : `d.${req.query.sortBy} ${sorting}`;
      const page = Math.floor(req.query.page);
      
      const response = await dbDMS('mDept as d')
        .select(
          'd.dept_id',
          'd.dept_name',
          'd.dept_note',
          'd.dept_divisi',
          'd.dept_domain',
          'div.divisi_name'
        )
        .leftJoin('mDivisi as div', 'div.divisi_iddiv', 'd.dept_divisi')
        // .whereNull('d.deleted_at')
        .where('dept_domain', req.query.domain)
        .where((query) => {
          if (req.query.filter != null) {
            query.orWhere("d.dept_name", "like", `%${req.query.filter}%`);
            query.orWhere("d.dept_note", "like", `%${req.query.filter}%`);
            query.orWhere("div.divisi_name", "like", `%${req.query.filter}%`);
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
    logger(error, 'GET /listDept', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

export const saveDept = async (req, res) => {
  // #swagger.tags = ['Department']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Save or update department'
  const trx = await dbDMS.transaction();
  try {
    const { id, dept_name, dept_divisi, dept_note, creator } = req.body;
    const creator_decrypt = decrypt(creator);
    const now = dayjs().format("YYYY-MM-DD HH:mm:ss");
    
    // Get domain from request or use default
    const domain = req.body.domain || process.env.DEFAULT_DOMAIN || 'DMS';
    
    const deptData = {
      dept_name,
      dept_divisi,
      dept_note: dept_note || '',
      dept_path: '', // Path will be managed later if needed
      dept_path1: '',
      dept_seo: dept_name.toLowerCase().replace(/\s+/g, '-'),
      dept_domain: domain,
      // updated_by: creator_decrypt,
      // updated_at: now,
    };
    
    if (id && id > 0) {
      // Update existing department
      await trx('mDept')
        .where('dept_id', id)
        .update(deptData);
    } else {
      // Check if department already exists in same division
      const existing = await trx('mDept')
        .where('dept_name', dept_name)
        .where('dept_divisi', dept_divisi)
        .where('dept_domain', domain)
        // .whereNull('deleted_at')
        .first();
      
      if (existing) {
        await trx.rollback();
        return res.status(406).json({
          type: 'error',
          message: 'Department with this name already exists in the selected division',
        });
      }
      
      // Insert new department
      await trx('mDept').insert({
        ...deptData,
        // created_by: creator_decrypt,
        // created_at: now,
      });
    }
    
    await trx.commit();
    return res.json("sukses");
  } catch (error) {
    await trx.rollback();
    logger(error, 'POST /saveDept', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

export const deleteDept = async (req, res) => {
  // #swagger.tags = ['Department']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Delete department (soft delete)'
  try {
    const { id, creator } = req.body;
    const creator_decrypt = decrypt(creator);
    const now = dayjs().format("YYYY-MM-DD HH:mm:ss");
    
    // Check if department has users
    const hasUsers = await dbDMS('mUser')
      .where('user_iddept', id)
      // .whereNull('deleted_at')
      .count('* as count')
      .first();
    
    if (hasUsers && hasUsers.count > 0) {
      return res.status(406).json({
        type: 'error',
        message: 'Cannot delete department with users. Please reassign users first.',
      });
    }
    
    // Soft delete
    // await dbDMS('mDept')
    //   .where('dept_id', id)
    //   .update({
    //     deleted_by: creator_decrypt,
    //     deleted_at: now,
    //   });

    await dbDMS('mDept')
      .where('dept_id', id)
      .delete();
    
    return res.json("success");
  } catch (error) {
    logger(error, 'POST /deleteDept', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

export const getDeptById = async (req, res) => {
  // #swagger.tags = ['Department']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Get department by ID'
  try {
    const { id } = req.query;
    
    const dept = await dbDMS('mDept as d')
      .select(
        'd.dept_id',
        'd.dept_name',
        'd.dept_note',
        'd.dept_divisi',
        'd.dept_domain',
        'div.divisi_name'
      )
      .leftJoin('mDivisi as div', 'div.divisi_iddiv', 'd.dept_divisi')
      .where('d.dept_id', id)
      .whereNull('d.deleted_at')
      .first();
    
    if (!dept) {
      return res.status(404).json({
        type: 'error',
        message: 'Department not found',
      });
    }
    
    res.status(200).json(dept);
  } catch (error) {
    logger(error, 'GET /getDeptById', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

export const getSelectDivisi = async (req, res) => {
  // #swagger.tags = ['Department']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Get list of divisions for dropdown'
  try {
    const divisi = await dbDMS('mDivisi')
      .select(
        'divisi_iddiv as value',
        'divisi_name as label'
      )
      // .whereNull('deleted_at')
      .whereNotNull('divisi_domain')
      .orderBy('divisi_name', 'asc');
    
    res.status(200).json(divisi);
  } catch (error) {
    logger(error, 'GET /getSelectDivisi', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};
