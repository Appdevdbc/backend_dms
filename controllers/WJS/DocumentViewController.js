import { dbDMS } from "../../config/db.js";
import { logger } from "../../helpers/logger.js";
import { decrypt, getErrorResponse } from "../../helpers/utils.js";

/**
 * Document View Controller
 * Handles viewing all document numbers (final + pending)
 */

/**
 * List all documents (final + pending)
 * @route GET /api/document-view/list
 */
export const listDocuments = async (req, res) => {
  // #swagger.tags = ['Document View']
  /* #swagger.security = [{
        "bearerAuth": []
      }] */
  // #swagger.description = 'Get list of all documents (final + pending)'

  try {
    const {
      page = 1,
      rowsPerPage = 10,
      sortBy = 'created_date',
      descending = 'true',
      filter = '',
      empid: empidDecrypt = ''
    } = req.query;

    // Decrypt empid untuk mendapatkan NIK user saat ini
    let currentUserNik = '';
    try {
      if (empidDecrypt) currentUserNik = decrypt(empidDecrypt);
    } catch {}

    // Section Head NIK (hardcoded as per legacy system)
    const sectionHeadNik = 'DO175621';

    // Get Department Head (atasan of Section Head)
    let departmentHeadNik = '';
    try {
      const sectionHead = await dbDMS('v_mstr_employee_ext')
        .where('id', sectionHeadNik)
        .first();
      if (sectionHead) {
        // id_atasan berisi ID atasan, ambil NIK-nya
        const atasanId = sectionHead.id_atasan || sectionHead.atasan_id || '';
        if (atasanId) {
          const deptHead = await dbDMS('v_mstr_employee_ext').where('id', atasanId).first();
          departmentHeadNik = deptHead ? (deptHead.id || '') : '';
        }
      }
    } catch (err) {
      logger(err, 'GET /document-view/list - Get Department Head', { sectionHeadNik });
    }

    // Build the UNION query
    const query = dbDMS.raw(`
      SELECT
        doc_id,
        CONVERT(VARCHAR(10), created_date, 103) created_date,
        doc_judul,
        d.account_nik,
        g.nama account_name,
        b.div_nama,
        c.dept_name,
        a.doc_nmr_status,
        CONVERT(VARCHAR(10), e.content_entrydate, 105) content_entrydate,
        a.doc_alasan_batal,
        CONVERT(VARCHAR(10), a.modified_date, 105) modified_date,
        f.bu_name,
        a.doc_hds_id,
        a.corp_lgl_id,
        a.corp_lgl_nik,
        a.corp_lgl_atasan_id,
        a.corp_lgl_atasan_nik,
        '' doc_id_param
      FROM 
        trs_nmr_doc a
        INNER JOIN v_mstr_div b ON a.doc_div_id = b.div_id
          COLLATE SQL_Latin1_General_CP1_CI_AS
        INNER JOIN v_mstr_dept c ON a.doc_dept_id = c.dept_id
          COLLATE SQL_Latin1_General_CP1_CI_AS
        INNER JOIN master_user d ON a.doc_emp_id = d.account_username
        LEFT JOIN content e ON a.doc_id = e.content_doc AND e.content_show <> 0
        INNER JOIN v_mstr_bu f ON a.doc_bu_id = f.bu_id
          COLLATE SQL_Latin1_General_CP1_CI_AS
        INNER JOIN v_mstr_employee_ext g ON g.id = a.doc_emp_id
          COLLATE SQL_Latin1_General_CP1_CI_AS
      
      UNION
      
      SELECT
        '' doc_id,
        '' created_date,
        doc_judul,
        d.account_nik,
        h.nama account_name,
        b.div_nama,
        c.dept_name,
        a.doc_nmr_status,
        CONVERT(VARCHAR(10), e.content_entrydate, 105) content_entrydate,
        '' doc_alasan_batal,
        '' modified_date,
        f.bu_name,
        a.doc_hds_id,
        '' corp_lgl_id,
        '' corp_lgl_nik,
        '' corp_lgl_atasan_id,
        '' corp_lgl_atasan_nik,
        CAST(a.doc_id AS VARCHAR) doc_id_param
      FROM
        trs_nmr_doc_temp a
        LEFT JOIN v_mstr_employee g ON a.doc_emp_id = g.employee_pk
          COLLATE SQL_Latin1_General_CP1_CI_AS
        LEFT JOIN v_mstr_div b ON g.map_div_id = b.div_id
          COLLATE SQL_Latin1_General_CP1_CI_AS
        LEFT JOIN v_mstr_dept c ON g.map_dept_id = c.dept_id
          COLLATE SQL_Latin1_General_CP1_CI_AS
        INNER JOIN master_user d ON a.doc_emp_id = d.account_username
        LEFT JOIN content e ON a.doc_nmr_id = e.content_doc AND e.content_show <> 0
        LEFT JOIN v_mstr_bu f ON g.map_bu_id = f.bu_id
          COLLATE SQL_Latin1_General_CP1_CI_AS
        INNER JOIN v_mstr_employee_ext h ON h.id = a.doc_emp_id
          COLLATE SQL_Latin1_General_CP1_CI_AS
      WHERE
        a.doc_id IN (SELECT MAX(doc_id) FROM trs_nmr_doc_temp GROUP BY doc_hds_id)
        AND a.doc_nmr_status <> 'Open'
    `);

    // Execute query
    const allDocuments = await query;

    // Apply search filter if provided
    let filteredDocuments = allDocuments;
    if (filter) {
      const filterLower = filter.toLowerCase();
      filteredDocuments = allDocuments.filter(doc => {
        return (
          (doc.doc_id || '').toLowerCase().includes(filterLower) ||
          (doc.doc_judul || '').toLowerCase().includes(filterLower) ||
          (doc.account_name || '').toLowerCase().includes(filterLower) ||
          (doc.account_nik || '').toLowerCase().includes(filterLower) ||
          (doc.div_nama || '').toLowerCase().includes(filterLower) ||
          (doc.dept_name || '').toLowerCase().includes(filterLower) ||
          (doc.doc_nmr_status || '').toLowerCase().includes(filterLower) ||
          (doc.bu_name || '').toLowerCase().includes(filterLower) ||
          (doc.doc_hds_id || '').toLowerCase().includes(filterLower) ||
          (doc.doc_alasan_batal || '').toLowerCase().includes(filterLower)
        );
      });
    }

    // Apply sorting
    const sortColumn = sortBy || 'created_date';
    const isDescending = descending === 'true';
    
    filteredDocuments.sort((a, b) => {
      let aVal = a[sortColumn] || '';
      let bVal = b[sortColumn] || '';
      
      // Handle date sorting (DD/MM/YYYY or DD-MM-YYYY)
      if (sortColumn === 'created_date' || sortColumn === 'content_entrydate' || sortColumn === 'modified_date') {
        // Convert to comparable format
        const parseDate = (dateStr) => {
          if (!dateStr) return new Date(0);
          const parts = dateStr.split(/[/-]/);
          if (parts.length === 3) {
            // DD/MM/YYYY or DD-MM-YYYY
            return new Date(parts[2], parts[1] - 1, parts[0]);
          }
          return new Date(0);
        };
        aVal = parseDate(aVal);
        bVal = parseDate(bVal);
      }
      
      if (aVal < bVal) return isDescending ? 1 : -1;
      if (aVal > bVal) return isDescending ? -1 : 1;
      return 0;
    });

    // Calculate total rows
    const totalRows = filteredDocuments.length;

    // Apply pagination
    const pageNum = parseInt(page) || 1;
    const rowsPerPageNum = parseInt(rowsPerPage) || 10;
    const startIndex = (pageNum - 1) * rowsPerPageNum;
    const endIndex = startIndex + rowsPerPageNum;
    const paginatedDocuments = filteredDocuments.slice(startIndex, endIndex);

    // Add row numbers and approval authorization
    const documentsWithMeta = paginatedDocuments.map((doc, index) => {
      const rowNumber = startIndex + index + 1;
      
      // Determine if current user can approve
      let canApprove = false;
      let approveUrl = '';
      
      if (doc.doc_nmr_status === 'Approval 1' && currentUserNik === sectionHeadNik) {
        canApprove = true;
      } else if (doc.doc_nmr_status === 'Approval 2' && currentUserNik === departmentHeadNik) {
        canApprove = true;
      }
      
      // Generate approval URL if authorized
      if (canApprove && doc.doc_id_param) {
        const token = Buffer.from(`${currentUserNik};${doc.doc_id_param}`).toString('base64');
        approveUrl = `${process.env.FRONTEND_URL || 'http://localhost:7060'}/#/dms/agreement-approval?token=${token}`;
      }
      
      return {
        no: rowNumber,
        ...doc,
        can_approve: canApprove,
        approve_url: approveUrl
      };
    });

    // Return response
    res.status(200).json({
      data: documentsWithMeta,
      pagination: {
        sortBy: sortColumn,
        descending: isDescending,
        page: pageNum,
        rowsPerPage: rowsPerPageNum,
        rowsNumber: totalRows
      }
    });

  } catch (error) {
    logger(error, 'GET /document-view/list', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};
