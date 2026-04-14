import { dbWJS } from "../../config/db.js";
import { decrypt, encrypt, getErrorResponse } from "../../helpers/utils.js";
import { logger } from "../../helpers/logger.js";
import dayjs from "dayjs";

export const listTemplates = async (req, res) => {
  // #swagger.tags = ['Template']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Get list of templates'
  try {
    const { rowsPerPage, descending, sortBy, page, filter } = req.query;
    
    // Simple list without pagination
    if (!rowsPerPage) {
      const response = await dbWJS('Template')
        .select('id_template', 'proses', 'id_plate')
        .orderBy('id_template', 'asc');
      
      return res.status(200).json(response);
    }
    
    // Paginated list
    const sorting = descending === 'true' ? 'desc' : 'asc';
    const columnSort = sortBy === 'desc' ? 'id_template asc' : `${sortBy} ${sorting}`;
    const currentPage = Math.floor(page);
    const perPage = Math.floor(rowsPerPage);
    
    let query = dbWJS('Template as t')
      .leftJoin('Part as p', 't.id_plate', 'p.id_part')
      .select('t.id_template', 't.proses', 't.id_plate', 'p.nama_part', 't.created_at', 't.updated_at');
    
    // Apply filter if provided
    if (filter) {
      query = query.where((subQuery) => {
        subQuery
          .orWhere('p.nama_part', 'like', `%${filter}%`)
          .orWhereRaw('CAST(t.id_template AS varchar) like ?', `%${filter}%`);
      });
    }
    
    const response = await query
      .orderByRaw(columnSort)
      .paginate({
        perPage,
        currentPage,
        isLengthAware: true,
      });
    
    // Get machining process names for each template
    for (const item of response.data) {
      if (item.proses) {
        const prosesIds = item.proses.split(',').filter(id => id && id !== '0');
        if (prosesIds.length > 0) {
          const machiningProses = await dbWJS('Proses_Machining')
            .whereIn('id_proses', prosesIds)
            .select('id_proses', 'nama');
          
          // Sort by the order in proses string
          const sortedProses = prosesIds.map(id => {
            const found = machiningProses.find(p => p.id_proses.toString() === id);
            return found ? found.nama : '';
          }).filter(name => name);
          
          item.urutan_proses = sortedProses.join(', ');
        } else {
          item.urutan_proses = '';
        }
      } else {
        item.urutan_proses = '';
      }
      
      item.id_template_encrypted = encrypt(item.id_template.toString());
    }
    
    res.status(200).json(response);
  } catch (error) {
    logger(error, 'GET /listTemplates', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

export const getTemplateParts = async (req, res) => {
  // #swagger.tags = ['Template']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Get list of parts for template dropdown'
  try {
    const parts = await dbWJS('Part')
      .select('id_part', 'nama_part')
      .orderBy('nama_part', 'asc');
    
    res.status(200).json(parts);
  } catch (error) {
    logger(error, 'GET /getTemplateParts', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

export const getTemplateMachiningProses = async (req, res) => {
  // #swagger.tags = ['Template']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Get list of machining processes for template'
  try {
    const { excludeIds } = req.query;
    
    let query = dbWJS('Proses_Machining')
      .select('id_proses', 'nama')
      .orderBy('nama', 'asc');
    
    if (excludeIds) {
      const idsArray = excludeIds.split(',').filter(id => id && id !== '0');
      if (idsArray.length > 0) {
        query = query.whereNotIn('id_proses', idsArray);
      }
    }
    
    const proses = await query;
    res.status(200).json(proses);
  } catch (error) {
    logger(error, 'GET /getTemplateMachiningProses', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

export const saveTemplate = async (req, res) => {
  // #swagger.tags = ['Template']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Save or update template'
  const trx = await dbWJS.transaction();
  try {
    const { id_template, id_plate, proses, creator: encryptedCreator } = req.body;
    const now = dayjs().format("YYYY-MM-DD HH:mm:ss");
    const creator = decrypt(encryptedCreator);
    
    if (!id_plate) {
      await trx.rollback();
      return res.status(406).json({
        type: 'error',
        message: 'Part wajib dipilih'
      });
    }
    
    if (!proses || proses === '0' || proses === ',0') {
      await trx.rollback();
      return res.status(406).json({
        type: 'error',
        message: 'Minimal satu proses machining harus dipilih'
      });
    }
    
    // Clean proses string (remove trailing ,0)
    const cleanProses = proses.replace(/,0$/, '').replace(/^,/, '');
    
    if (id_template) {
      // Update existing
      await trx('Template')
        .where('id_template', id_template)
        .update({
          id_plate,
          proses: cleanProses,
          updated_at: now
        });
    } else {
      // Insert new
      await trx('Template').insert({
        id_plate,
        proses: cleanProses,
        created_at: now,
        updated_at: now
      });
    }
    
    await trx.commit();
    res.status(200).json({ message: 'sukses' });
  } catch (error) {
    await trx.rollback();
    logger(error, 'POST /saveTemplate', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

export const deleteTemplate = async (req, res) => {
  // #swagger.tags = ['Template']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Delete template'
  const trx = await dbWJS.transaction();
  try {
    const { id_template: encryptedId, creator: encryptedCreator } = req.body;
    const id_template = decrypt(encryptedId);
    const creator = decrypt(encryptedCreator);
    
    // Hard delete (no dependency check as per PHP version)
    await trx('Template')
      .where('id_template', id_template)
      .delete();
    
    await trx.commit();
    res.status(200).json({ message: 'sukses' });
  } catch (error) {
    await trx.rollback();
    logger(error, 'DELETE /deleteTemplate', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};
