import { dbDMS, dbHR } from "../../config/db.js";
import dayjs from "dayjs";
import * as dotenv from 'dotenv';
import { decrypt, getErrorResponse } from "../../helpers/utils.js";
import { logger } from "../../helpers/logger.js";
dotenv.config();

export const listPlant = async (req, res) => {
  // #swagger.tags = ['Plant']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Get list of plants/divisions'
  try {
    if (req.query.rowsPerPage == null) {
      // Simple list without pagination
      const plants = await dbDMS('mDivisi')
        .select(
          'divisi_iddiv',
          'divisi_name',
          'divisi_note',
          'divisi_path',
          'divisi_path1',
          'divisi_domain'
        )
        // .where('divisi_domain', req.query.domain)
        .orderBy('divisi_iddiv', 'desc');
      
      res.status(200).json(plants);
    } else {
      // Paginated list
      const sorting = req.query.descending === "true" ? "desc" : "asc";
      const columnSort = req.query.sortBy === "desc" ? "divisi_iddiv desc" : `${req.query.sortBy} ${sorting}`;
      const page = Math.floor(req.query.page);
      
      const response = await dbDMS('mDivisi')
        .select(
          'divisi_iddiv',
          'divisi_name',
          'divisi_note',
          'divisi_path',
          'divisi_path1',
          'divisi_domain'
        )
        .where((query) => {
          if (req.query.filter != null) {
            query.orWhere("divisi_name", "like", `%${req.query.filter}%`);
            query.orWhere("divisi_note", "like", `%${req.query.filter}%`);
          }
        })
        // .whereNull('deleted_at')
        // .where('divisi_domain', req.query.domain)
        .orderByRaw(columnSort)
        .paginate({
          perPage: Math.floor(req.query.rowsPerPage),
          currentPage: page,
          isLengthAware: true,
        });
      
      res.status(200).json(response);
    }
  } catch (error) {
    logger(error, 'GET /listPlant', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

export const savePlant = async (req, res) => {
  // #swagger.tags = ['Plant']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Save or update plant/division'
  const trx = await dbDMS.transaction();
  try {
    const { id, divisi_name, divisi_note, divisi_domain, creator } = req.body;
    const creator_decrypt = decrypt(creator);
    const now = dayjs().format("YYYY-MM-DD HH:mm:ss");
    
    // Get domain from request body (business unit id)
    const domain = divisi_domain || process.env.DEFAULT_DOMAIN || 'DMS';
    
    const plantData = {
      divisi_name,
      divisi_note: divisi_note || '',
      divisi_path: '', // Path will be managed later if needed
      divisi_path1: '',
      divisi_domain: domain,
      // updated_by: creator_decrypt,
      // updated_at: now,
    };
    
    if (id && id > 0) {
      // Update existing plant
      await trx('mDivisi')
        .where('divisi_iddiv', id)
        .update(plantData);
    } else {
      // Check if plant already exists
      const existing = await trx('mDivisi')
        .where('divisi_name', divisi_name)
        .where('divisi_domain', domain)
        // .whereNull('deleted_at')
        .first();
      
      if (existing) {
        await trx.rollback();
        return res.status(406).json({
          type: 'error',
          message: 'Plant with this name already exists',
        });
      }
      
      // Insert new plant
      await trx('mDivisi').insert({
        ...plantData,
        // created_by: creator_decrypt,
        // created_at: now,
      });
    }
    
    await trx.commit();
    return res.json("sukses");
  } catch (error) {
    await trx.rollback();
    logger(error, 'POST /savePlant', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

export const deletePlant = async (req, res) => {
  // #swagger.tags = ['Plant']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Delete plant/division (soft delete)'
  try {
    const { id, creator } = req.body;
    const creator_decrypt = decrypt(creator);
    const now = dayjs().format("YYYY-MM-DD HH:mm:ss");
    
    // Check if plant has departments
    const hasDepartments = await dbDMS('mDept')
      .where('dept_divisi', id)
      // .whereNull('deleted_at')
      .count('* as count')
      .first();
    
    if (hasDepartments && hasDepartments.count > 0) {
      return res.status(406).json({
        type: 'error',
        message: 'Cannot delete plant with departments. Please delete departments first.',
      });
    }
    
    // Soft delete
    // await dbDMS('mDivisi')
    //   .where('divisi_iddiv', id)
    //   .update({
    //     deleted_by: creator_decrypt,
    //     deleted_at: now,
    //   });

    await dbDMS('mDivisi')
      .where('divisi_iddiv', id)
      .delete();
    
    return res.json("success");
  } catch (error) {
    logger(error, 'POST /deletePlant', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

export const getPlantById = async (req, res) => {
  // #swagger.tags = ['Plant']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Get plant by ID'
  try {
    const { id } = req.query;
    
    const plant = await dbDMS('mDivisi')
      .select(
        'divisi_iddiv',
        'divisi_name',
        'divisi_note',
        'divisi_path',
        'divisi_path1',
        'divisi_domain'
      )
      .where('divisi_iddiv', id)
      .whereNull('deleted_at')
      .first();
    
    if (!plant) {
      return res.status(404).json({
        type: 'error',
        message: 'Plant not found',
      });
    }
    
    res.status(200).json(plant);
  } catch (error) {
    logger(error, 'GET /getPlantById', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

export const getBusinessUnits = async (req, res) => {
  // #swagger.tags = ['Plant']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Get list of active business units'
  try {
    const businessUnits = await dbHR('master_business_unit')
      .select('bu_id as value', 'bu_name as label')
      .where('bu_status', 'Active')
      .orderBy('bu_name', 'asc');
    
    res.status(200).json(businessUnits);
  } catch (error) {
    logger(error, 'GET /getBusinessUnits', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};
