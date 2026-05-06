import { dbWJS } from "../../config/db.js";
import { decrypt, encrypt, getErrorResponse } from "../../helpers/utils.js";
import { logger } from "../../helpers/logger.js";
import dayjs from "dayjs";

// Get Group_Menu list with SPK terima count per group — used by TerimaSPK collection page
export const getGroupMenuWithCount = async (req, res) => {
  // #swagger.tags = ['GroupDepartment']
  /* #swagger.security = [{ "bearerAuth": [] }] */
  // #swagger.description = 'Get Group_Menu list with count of SPK status=terima per group'
  try {
    const groups = await dbWJS('Group_Menu')
      .select('id_group', 'nama')
      .orderBy('nama', 'asc');

    // Count SPK terima per group in one query
    const counts = await dbWJS('SPK')
      .select('id_group')
      .count('* as cnt')
      .where('status', 'terima')
      .groupBy('id_group');

    const countMap = Object.fromEntries(counts.map(c => [String(c.id_group), parseInt(c.cnt) || 0]));

    const result = groups.map(g => ({
      id_group: g.id_group,
      nama:     g.nama,
      count:    countMap[String(g.id_group)] || 0,
    }));

    res.status(200).json(result);
  } catch (error) {
    logger(error, 'GET /getGroupMenuWithCount', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

export const listGroupDepartments = async (req, res) => {
  // #swagger.tags = ['GroupDepartment']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Get list of group departments'
  try {
    const { rowsPerPage, descending, sortBy, page, filter } = req.query;
    
    // Simple list without pagination
    if (!rowsPerPage) {
      const response = await dbWJS('Group_Menu')
        .select('id_group', 'nama')
        .orderBy('nama', 'asc');
      
      return res.status(200).json(response);
    }
    
    // Paginated list
    const sorting = descending === 'true' ? 'desc' : 'asc';
    const columnSort = sortBy === 'desc' ? 'id_group asc' : `${sortBy} ${sorting}`;
    const currentPage = Math.floor(page);
    const perPage = Math.floor(rowsPerPage);
    
    let query = dbWJS('Group_Menu')
      .select('id_group', 'nama', 'created_at', 'updated_at');
    
    // Apply filter if provided
    if (filter) {
      query = query.where((subQuery) => {
        subQuery
          .orWhere('nama', 'like', `%${filter}%`)
          .orWhereRaw('CAST(id_group AS varchar) like ?', `%${filter}%`);
      });
    }
    
    const response = await query
      .orderByRaw(columnSort)
      .paginate({
        perPage,
        currentPage,
        isLengthAware: true,
      });
    
    // Get department names for each group
    for (const item of response.data) {
      const depts = await dbWJS('Group_Dept as gd')
        .join('Department as d', 'gd.dept_id', 'd.id_dept')
        .where('gd.grp_id', item.id_group)
        .select('d.nama')
        .orderBy('d.nama', 'asc');
      
      item.dept = depts.map(d => d.nama).join('<br>');
      item.id_group_encrypted = encrypt(item.id_group.toString());
    }
    
    res.status(200).json(response);
  } catch (error) {
    logger(error, 'GET /listGroupDepartments', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

export const getAvailableDepartments = async (req, res) => {
  // #swagger.tags = ['GroupDepartment']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Get list of available departments (not assigned to any group)'
  try {
    const { grp_id } = req.query;
    
    let query = dbWJS('Department as d')
      .leftJoin('Site as s', 'd.id_site', 's.id_site')
      .select('d.id_dept', 'd.nama', 's.nama as nama_site')
      .orderBy('s.nama', 'asc')
      .orderBy('d.nama', 'asc');
    
    if (grp_id) {
      // For edit: show unassigned + currently assigned to this group
      query = query.where(function() {
        this.whereNotIn('d.id_dept', function() {
          this.select('dept_id').from('Group_Dept');
        })
        .orWhereIn('d.id_dept', function() {
          this.select('dept_id').from('Group_Dept').where('grp_id', grp_id);
        });
      });
    } else {
      // For create: show only unassigned
      query = query.whereNotIn('d.id_dept', function() {
        this.select('dept_id').from('Group_Dept');
      });
    }
    
    const depts = await query;
    res.status(200).json(depts);
  } catch (error) {
    logger(error, 'GET /getAvailableDepartments', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

export const getGroupDepartments = async (req, res) => {
  // #swagger.tags = ['GroupDepartment']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Get departments assigned to a group'
  try {
    const { grp_id } = req.query;
    
    const depts = await dbWJS('Group_Dept as gd')
      .join('Department as d', 'gd.dept_id', 'd.id_dept')
      .leftJoin('Site as s', 'd.id_site', 's.id_site')
      .where('gd.grp_id', grp_id)
      .select('d.id_dept', 'd.nama', 's.nama as nama_site', 'gd.id')
      .orderBy('s.nama', 'asc')
      .orderBy('d.nama', 'asc');
    
    res.status(200).json(depts);
  } catch (error) {
    logger(error, 'GET /getGroupDepartments', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

export const saveGroupDepartment = async (req, res) => {
  // #swagger.tags = ['GroupDepartment']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Save or update group department'
  const trx = await dbWJS.transaction();
  try {
    const { id_group, nama, id_dept, creator: encryptedCreator } = req.body;
    const now = dayjs().format("YYYY-MM-DD HH:mm:ss");
    const creator = decrypt(encryptedCreator);
    
    if (!nama) {
      await trx.rollback();
      return res.status(406).json({
        type: 'error',
        message: 'Nama group wajib diisi'
      });
    }
    
    if (!id_dept || id_dept.length === 0) {
      await trx.rollback();
      return res.status(406).json({
        type: 'error',
        message: 'Minimal satu department harus dipilih'
      });
    }
    
    let groupId = id_group;
    
    if (id_group) {
      // Update existing
      await trx('Group_Menu')
        .where('id_group', id_group)
        .update({
          nama,
          updated_at: now
        });
      
      // Delete existing department assignments
      await trx('Group_Dept')
        .where('grp_id', id_group)
        .delete();
    } else {
      // Insert new - SQL Server requires OUTPUT clause to get the inserted ID
      await trx('Group_Menu').insert({
        nama,
        created_at: now,
        updated_at: now
      });
      
      // Get the newly inserted group ID
      const newGroup = await trx('Group_Menu')
        .where('nama', nama)
        .orderBy('id_group', 'desc')
        .first();
      
      groupId = newGroup.id_group;
    }
    
    // Insert department assignments
    const deptInserts = id_dept.map(deptId => ({
      grp_id: groupId,
      dept_id: deptId
    }));
    
    await trx('Group_Dept').insert(deptInserts);
    
    await trx.commit();
    res.status(200).json({ message: 'sukses' });
  } catch (error) {
    await trx.rollback();
    logger(error, 'POST /saveGroupDepartment', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

export const deleteGroupDepartment = async (req, res) => {
  // #swagger.tags = ['GroupDepartment']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Delete group department'
  const trx = await dbWJS.transaction();
  try {
    const { id_group: encryptedId, creator: encryptedCreator } = req.body;
    const id_group = decrypt(encryptedId);
    const creator = decrypt(encryptedCreator);
    
    // Delete department assignments first
    await trx('Group_Dept')
      .where('grp_id', id_group)
      .delete();
    
    // Delete group
    await trx('Group_Menu')
      .where('id_group', id_group)
      .delete();
    
    await trx.commit();
    res.status(200).json({ message: 'sukses' });
  } catch (error) {
    await trx.rollback();
    logger(error, 'DELETE /deleteGroupDepartment', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};
