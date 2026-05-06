import { dbWJS, dbPortal } from "../../config/db.js";
import { decrypt, encrypt, getErrorResponse } from "../../helpers/utils.js";
import { logger } from "../../helpers/logger.js";
import dayjs from "dayjs";

// Search employee from Portal by NIK
export const searchEmployeeByNIK = async (req, res) => {
  // #swagger.tags = ['Employee']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Search employee from Portal by NIK'
  try {
    const { nik } = req.query;
    
    if (!nik) {
      return res.status(406).json({
        type: 'error',
        message: 'NIK is required'
      });
    }
    
    // Search in Portal database (ptl_hris table)
    // NIK is stored in user_newid column
    const employee = await dbPortal('portal.dbo.ptl_hris')
      .select('Emp_Id', 'user_newid', 'user_name', 'user_active')
      .where('user_newid', nik)
      .where('user_active', 'Active')
      .first();
    
    if (!employee) {
      return res.status(404).json({
        type: 'error',
        message: 'Employee not found in Portal'
      });
    }
    
    res.status(200).json({
      emp_id: employee.Emp_Id,
      nik: employee.user_newid,
      name: employee.user_name,
      status: employee.user_active
    });
  } catch (error) {
    logger(error, 'GET /searchEmployeeByNIK', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

// List Employees
export const listEmployees = async (req, res) => {
  // #swagger.tags = ['Employee']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Get list of employees'
  try {
    const { rowsPerPage, descending, sortBy, page, filter } = req.query;
    
    // Simple list without pagination
    if (!rowsPerPage) {
      const response = await dbWJS('Employee')
        .select('id', 'emp_id', 'opt_nik', 'opt_name', 'opt_section', 'opt_jabatan')
        .where(q => q.whereNull('opt_status').orWhere('opt_status', 1))
        .orderBy('opt_name', 'asc');
      
      return res.status(200).json(response);
    }
    
    // Paginated list
    const sorting = descending === 'true' ? 'desc' : 'asc';
    const columnSort = sortBy === 'desc' ? 'id asc' : `${sortBy} ${sorting}`;
    const currentPage = Math.floor(page);
    const perPage = Math.floor(rowsPerPage);
    
    let query = dbWJS('Employee')
      .select('id', 'emp_id', 'opt_nik', 'opt_name', 'opt_section', 'opt_jabatan', 'created_at', 'updated_at')
      .where(q => q.whereNull('opt_status').orWhere('opt_status', 1));
    
    // Apply filter if provided
    if (filter) {
      query = query.where((subQuery) => {
        subQuery
          .orWhere('emp_id', 'like', `%${filter}%`)
          .orWhere('opt_nik', 'like', `%${filter}%`)
          .orWhere('opt_name', 'like', `%${filter}%`)
          .orWhere('opt_section', 'like', `%${filter}%`)
          .orWhere('opt_jabatan', 'like', `%${filter}%`)
          .orWhereRaw('CAST(id AS varchar) like ?', `%${filter}%`);
      });
    }
    
    const response = await query
      .orderByRaw(columnSort)
      .paginate({
        perPage,
        currentPage,
        isLengthAware: true,
      });
    
    // Encrypt IDs
    response.data.forEach(item => {
      item.id_encrypted = encrypt(item.id.toString());
      item.nik_encrypted = encrypt(item.opt_nik);
    });
    
    res.status(200).json(response);
  } catch (error) {
    logger(error, 'GET /listEmployees', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

// Get sections list
export const getSections = async (req, res) => {
  // #swagger.tags = ['Employee']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Get list of sections'
  try {
    const sections = [
      { value: 'Design', label: 'Design' },
      { value: 'Machining', label: 'Machining' },
      { value: 'New Mould', label: 'New Mould' },
      { value: 'Repair Mould', label: 'Repair Mould' },
      { value: 'Workplan', label: 'Workplan' }
    ];
    
    res.status(200).json(sections);
  } catch (error) {
    logger(error, 'GET /getSections', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

// Get positions list
export const getPositions = async (req, res) => {
  // #swagger.tags = ['Employee']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Get list of positions'
  try {
    const positions = [
      { value: 'spv', label: 'Supervisor' },
      { value: 'opt', label: 'Operator' }
    ];
    
    res.status(200).json(positions);
  } catch (error) {
    logger(error, 'GET /getPositions', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

// Save Employee
export const saveEmployee = async (req, res) => {
  // #swagger.tags = ['Employee']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Save or update employee'
  try {
    const { id, emp_id, opt_nik, opt_name, opt_section, opt_jabatan, creator: encryptedCreator } = req.body;
    const now = dayjs().format("YYYY-MM-DD HH:mm:ss");
    const creator = decrypt(encryptedCreator);
    
    if (!emp_id || !opt_nik || !opt_name || !opt_section || !opt_jabatan) {
      return res.status(406).json({
        type: 'error',
        message: 'Emp ID, NIK, Name, Section, and Jabatan are required'
      });
    }
    
    if (id) {
      // Update existing - emp_id cannot be changed, but NIK can
      await dbWJS('Employee')
        .where('id', id)
        .update({
          opt_nik,
          opt_name,
          opt_section,
          opt_jabatan,
          updated_at: now
        });
    } else {
      // Check if emp_id already exists
      const existing = await dbWJS('Employee')
        .where('emp_id', emp_id)
        .first();
      if (existing && existing.opt_status==null) {
        return res.status(406).json({
          type: 'error',
          message: 'Employee ID already exists'
        });
      }else if(existing && existing.opt_status!=null){
        await dbWJS('Employee')
          .where('emp_id', emp_id)
          .update({
            opt_nik,
            opt_name,
            opt_section,
            opt_jabatan,
            opt_status: existing.opt_status==0?1:existing.opt_status,
            updated_at: now
          });
      }else{
        // Insert new
          await dbWJS('Employee').insert({
            emp_id,
            opt_nik,
            opt_name,
            opt_section,
            opt_jabatan,
            opt_status: null,
            created_at: now,
            updated_at: now
          });
        }
      }
    
    res.status(200).json({ message: 'sukses' });
  } catch (error) {
    logger(error, 'POST /saveEmployee', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

// Delete Employee (soft delete by setting opt_status = 0)
export const deleteEmployee = async (req, res) => {
  // #swagger.tags = ['Employee']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Delete employee (soft delete)'
  try {
    const { id: encryptedId, creator: encryptedCreator } = req.body;
    const id = decrypt(encryptedId);
    const creator = decrypt(encryptedCreator);
    
    // Soft delete by setting opt_status = 0
    await dbWJS('Employee')
      .where('id', id)
      .update({
        opt_status: 0,
        updated_at: dayjs().format("YYYY-MM-DD HH:mm:ss")
      });
    
    res.status(200).json({ message: 'sukses' });
  } catch (error) {
    logger(error, 'DELETE /deleteEmployee', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

// Sync employees from Portal (scheduled job)
export const syncEmployeesFromPortal = async (req, res) => {
  // #swagger.tags = ['Employee']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Sync employee status and NIK from Portal database'
  try {
    const now = dayjs().format("YYYY-MM-DD HH:mm:ss");
    let syncedCount = 0;
    let updatedCount = 0;
    let inactivatedCount = 0;
    
    // Get all active employees from WJS
    const wjsEmployees = await dbWJS('Employee')
      .select('id', 'emp_id', 'opt_nik', 'opt_name')
      .whereNull('opt_status')
      .whereNotNull('emp_id');
    
    for (const wjsEmp of wjsEmployees) {
      try {
        // Look up employee in Portal by emp_id (ptl_hris table)
        // NIK is stored in user_newid column
        const portalEmp = await dbPortal('portal.dbo.ptl_hris')
          .select('Emp_Id', 'user_newid', 'user_name', 'user_active')
          .where('Emp_Id', wjsEmp.emp_id)
          .first();
        
        if (!portalEmp) {
          // Employee not found in Portal - mark as inactive
          await dbWJS('Employee')
            .where('id', wjsEmp.id)
            .update({
              opt_status: 1, // 1 = Not found in Portal
              updated_at: now
            });
          inactivatedCount++;
          continue;
        }
        
        // Check if employee is inactive in Portal
        if (portalEmp.user_active !== 'Active') {
          await dbWJS('Employee')
            .where('id', wjsEmp.id)
            .update({
              opt_status: 1, // 1 = Inactive in Portal
              updated_at: now
            });
          inactivatedCount++;
          continue;
        }
        
        // Check if NIK or Name has changed
        if (wjsEmp.opt_nik !== portalEmp.user_newid || wjsEmp.opt_name !== portalEmp.user_name) {
          await dbWJS('Employee')
            .where('id', wjsEmp.id)
            .update({
              opt_nik: portalEmp.user_newid,
              opt_name: portalEmp.user_name,
              updated_at: now
            });
          updatedCount++;
        }
        
        syncedCount++;
      } catch (empError) {
        logger(empError, 'Sync employee error', { emp_id: wjsEmp.emp_id });
        // Continue with next employee
      }
    }
    
    const result = {
      message: 'Sync completed',
      synced: syncedCount,
      updated: updatedCount,
      inactivated: inactivatedCount,
      total: wjsEmployees.length,
      timestamp: now
    };
    
    logger(result, 'Employee sync completed');
    res.status(200).json(result);
  } catch (error) {
    logger(error, 'POST /syncEmployeesFromPortal', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};
