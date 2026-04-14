import { dbDMS } from '../../config/db.js';
import { logger } from '../../helpers/logger.js';
import { getErrorResponse, decrypt } from '../../helpers/utils.js';
import { 
  transformApprovalToJSON, 
  transformJSONToApproval
} from '../../helpers/approval.helper.js';
import dayjs from 'dayjs';

/**
 * GET /api/dms/approvals
 * List approvals with pagination and filter
 */
export const listApprovals = async (req, res) => {
  // #swagger.tags = ['Master Approval']
  /* #swagger.security = [{
        "bearerAuth": []
      }] */
  // #swagger.description = 'List all master approvals'
  
  try {
    // Check if rowsPerPage is null (for dropdown/select usage OR viewapproval dialog)
    if (req.query.rowsPerPage == null) {
      let query = dbDMS('mst_approval as a')
        .leftJoin(dbDMS.raw('v_mstr_bu as b ON a.app_bu_id = b.bu_id COLLATE SQL_Latin1_General_CP1_CI_AS'))
        .leftJoin(dbDMS.raw('mst_approval_jenis as c ON CAST(a.app_jns_trans AS INT) = c.app_jns_id'))
        .select('a.*', 'b.bu_name', 'c.app_jns_desc');
      
      // Apply filters (matching PHP logic - all optional)
      if (req.query.bu_id) {
        query = query.where('a.app_bu_id', req.query.bu_id);
      }
      if (req.query.app_jns_trans) {
        query = query.where('a.app_jns_trans', req.query.app_jns_trans);
      }
      if (req.query.app_prioritas) {
        query = query.where('a.app_prioritas', req.query.app_prioritas);
      }
      
      const approvals = await query.orderBy('a.app_kode');
      
      // Flatten approval levels into individual rows for table display
      const flattenedApprovals = [];
      for (const approval of approvals) {
        // Process all 3 bags and their 5 levels
        for (let bag = 1; bag <= 3; bag++) {
          for (let level = 1; level <= 5; level++) {
            const nikField = `app_bag${bag}_nik_id${level}`;
            const empField = `app_bag${bag}_emp_id${level}`;
            const ketField = `app_bag${bag}_ket${level}`;
            
            const nik = approval[nikField];
            const empId = approval[empField];
            const keterangan = approval[ketField];
            
            // Only add if there's an approver assigned
            if (nik && empId) {
              // Get user details
              const user = await dbDMS('master_user')
                .where('account_nik', nik)
                .orWhere('account_username', empId)
                .first();
              
              flattenedApprovals.push({
                app_id: approval.app_id,
                app_kode: `${approval.app_kode}-B${bag}L${level}`,
                app_prioritas: approval.app_prioritas,
                app_nama: user ? user.account_name : empId,
                app_jabatan: keterangan || '-',
                app_email: user ? user.account_email : '-'
              });
            }
          }
        }
      }
      
      return res.status(200).json(flattenedApprovals);
    }
    
    // Pagination logic
    const sorting = req.query.descending === "true" ? "desc" : "asc";
    const columnSort = req.query.sortBy === "asc" 
      ? "app_kode asc" 
      : `${req.query.sortBy} ${sorting}`;
    const page = Math.floor(req.query.page);
    
    let query = dbDMS('mst_approval as a')
      .leftJoin(dbDMS.raw('v_mstr_bu as b ON a.app_bu_id = b.bu_id COLLATE SQL_Latin1_General_CP1_CI_AS'))
      .leftJoin(dbDMS.raw('mst_approval_jenis as c ON CAST(a.app_jns_trans AS INT) = c.app_jns_id'))
      .leftJoin(dbDMS.raw('mst_approval_type as d ON CAST(a.app_bag1 AS INT) = d.app_type_id'))
      .leftJoin(dbDMS.raw('mst_approval_type as e ON CAST(a.app_bag2 AS INT) = e.app_type_id'))
      .leftJoin(dbDMS.raw('mst_approval_type as f ON CAST(a.app_bag3 AS INT) = f.app_type_id'))
      .select(
        'a.*',
        'b.bu_name',
        'c.app_jns_desc',
        'd.app_type_desc as app_bag1_text',
        'e.app_type_desc as app_bag2_text',
        'f.app_type_desc as app_bag3_text'
      );

    // Apply filters
    if (req.query.bu_id) {
      query = query.where('a.app_bu_id', req.query.bu_id);
    }

    if (req.query.filter) {
      query = query.where((q) => {
        q.orWhere('a.app_kode', 'like', `%${req.query.filter}%`);
        q.orWhere('a.app_prioritas', 'like', `%${req.query.filter}%`);
        q.orWhere('b.bu_name', 'like', `%${req.query.filter}%`);
        q.orWhere('c.app_jns_desc', 'like', `%${req.query.filter}%`);
      });
    }

    const response = await query
      .orderByRaw(columnSort)
      .paginate({
        perPage: Math.floor(req.query.rowsPerPage),
        currentPage: page,
        isLengthAware: true,
      });

    res.status(200).json(response);
  } catch (error) {
    logger(error, 'GET /dms/approvals', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

/**
 * GET /api/dms/approvals/:id
 * Get single approval with full details
 */
export const getApprovalById = async (req, res) => {
  // #swagger.tags = ['Master Approval']
  /* #swagger.security = [{
        "bearerAuth": []
      }] */
  // #swagger.description = 'Get approval by ID'
  
  try {
    const { id } = req.params;

    const approval = await dbDMS('mst_approval')
      .where('app_id', id)
      .first();

    if (!approval) {
      return res.status(406).json({
        type: 'error',
        message: 'Approval tidak ditemukan'
      });
    }

    const formatted = transformApprovalToJSON(approval);

    return res.status(200).json({
      success: true,
      data: formatted
    });
  } catch (error) {
    logger(error, 'GET /dms/approvals/:id', req.params);
    return res.status(406).json(getErrorResponse(error));
  }
};

/**
 * POST /api/dms/approvals
 * Create new approval
 */
export const createApproval = async (req, res) => {
  // #swagger.tags = ['Master Approval']
  /* #swagger.security = [{
        "bearerAuth": []
      }] */
  // #swagger.description = 'Create new master approval'
  
  const trx = await dbDMS.transaction();
  try {
    const data = req.body;
    const { creator: empidDecrypt } = req.body;
    const empid = decrypt(empidDecrypt);
    const now = dayjs().format('YYYY-MM-DD HH:mm:ss');

    // Check uniqueness: BU + Transaction Type + Priority
    const existing = await trx('mst_approval')
      .where({
        app_bu_id: data.app_bu_id,
        app_jns_trans: String(data.app_jns_trans),
        app_prioritas: data.app_prioritas
      })
      .first();

    if (existing) {
      await trx.rollback();
      return res.status(400).json({
        success: false,
        message: 'Konfigurasi approval untuk BU, jenis transaksi, dan prioritas ini sudah ada'
      });
    }

    // Transform nested JSON to flat structure
    const flatData = transformJSONToApproval(data);
    flatData.created_by = empid;
    flatData.created_at = now;
    flatData.updated_by = empid;
    flatData.updated_at = now;

    // Create approval
    const [app_id] = await trx('mst_approval').insert(flatData);

    await trx.commit();
    return res.json("sukses");
  } catch (error) {
    await trx.rollback();
    logger(error, 'POST /dms/approvals', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

/**
 * PUT /api/dms/approvals/:id
 * Update approval
 */
export const updateApproval = async (req, res) => {
  // #swagger.tags = ['Master Approval']
  /* #swagger.security = [{
        "bearerAuth": []
      }] */
  // #swagger.description = 'Update master approval'
  
  const trx = await dbDMS.transaction();
  try {
    const { id } = req.params;
    const data = req.body;
    const { creator: empidDecrypt } = req.body;
    const empid = decrypt(empidDecrypt);
    const now = dayjs().format('YYYY-MM-DD HH:mm:ss');

    // Check if approval exists
    const approval = await trx('mst_approval').where('app_id', id).first();
    if (!approval) {
      await trx.rollback();
      return res.status(406).json({
        type: 'error',
        message: 'Approval tidak ditemukan'
      });
    }

    // Check uniqueness (excluding current record)
    const existing = await trx('mst_approval')
      .where({
        app_bu_id: data.app_bu_id,
        app_jns_trans: String(data.app_jns_trans),
        app_prioritas: data.app_prioritas
      })
      .whereNot('app_id', id)
      .first();

    if (existing) {
      await trx.rollback();
      return res.status(406).json({
        type: 'error',
        message: 'Konfigurasi approval untuk BU, jenis transaksi, dan prioritas ini sudah ada'
      });
    }

    // Transform nested JSON to flat structure
    const flatData = transformJSONToApproval(data);
    flatData.updated_by = empid;
    flatData.updated_at = now;

    // Update approval
    await trx('mst_approval').where('app_id', id).update(flatData);

    await trx.commit();
    return res.json("sukses");
  } catch (error) {
    await trx.rollback();
    logger(error, 'PUT /dms/approvals/:id', { params: req.params, body: req.body });
    return res.status(406).json(getErrorResponse(error));
  }
};

/**
 * DELETE /api/dms/approvals/:id
 * Delete approval
 */
export const deleteApproval = async (req, res) => {
  // #swagger.tags = ['Master Approval']
  /* #swagger.security = [{
        "bearerAuth": []
      }] */
  // #swagger.description = 'Delete master approval'
  
  try {
    const { id } = req.params;

    const approval = await dbDMS('mst_approval').where('app_id', id).first();
    if (!approval) {
      return res.status(406).json({
        type: 'error',
        message: 'Approval tidak ditemukan'
      });
    }

    await dbDMS('mst_approval').where('app_id', id).delete();

    return res.json("success");
  } catch (error) {
    logger(error, 'DELETE /dms/approvals/:id', req.params);
    return res.status(406).json(getErrorResponse(error));
  }
};
