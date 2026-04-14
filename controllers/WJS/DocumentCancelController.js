import { dbDMS } from "../../config/db.js";
import { logger } from "../../helpers/logger.js";
import { getErrorResponse } from "../../helpers/utils.js";
import { sendCancellationEmail } from "../../helpers/mail.js";
import dayjs from "dayjs";

/**
 * Document Cancel Controller
 * Handles document cancellation operations
 */

/**
 * Cancel document number
 * @route POST /api/document-cancel/cancel
 */
export const cancelDocument = async (req, res) => {
  // #swagger.tags = ['Document Cancel']
  /* #swagger.security = [{
        "bearerAuth": []
      }] */
  // #swagger.description = 'Cancel document number'

  try {
    const { doc_id, doc_alasan_batal } = req.body;
    const user_nik = req.user?.nik || '';

    // Validation
    if (!doc_id || !doc_alasan_batal) {
      return res.status(400).json({
        success: false,
        message: 'Nomor dokumen dan alasan pembatalan wajib diisi',
        error_code: 'VALIDATION_ERROR'
      });
    }

    // Check if document exists
    const document = await dbDMS('trs_nmr_doc')
      .select(
        'doc_id',
        'doc_nmr_status',
        'doc_judul',
        'created_date',
        'created_by'
      )
      .where('doc_id', doc_id)
      .first();

    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Nomor dokumen yang anda cari tidak ada!',
        error_code: 'DOC_NOT_FOUND'
      });
    }

    // Check if status is valid for cancellation
    const validStatuses = ['Open', 'Open-Overdue'];
    if (!validStatuses.includes(document.doc_nmr_status)) {
      return res.status(400).json({
        success: false,
        message: 'Dokumen yang dibatalkan harus berstatus Open atau Open-Overdue',
        error_code: 'INVALID_STATUS',
        current_status: document.doc_nmr_status
      });
    }

    // Update document status
    const now = dayjs().format("YYYY-MM-DD HH:mm:ss");
    const updated = await dbDMS('trs_nmr_doc')
      .where('doc_id', doc_id)
      .whereIn('doc_nmr_status', validStatuses)
      .update({
        doc_nmr_status: 'Cancel',
        doc_alasan_batal: doc_alasan_batal,
        modified_by: user_nik,
        modified_date: now
      });

    if (updated === 0) {
      return res.status(500).json({
        success: false,
        message: 'Nomor dokumen gagal dibatalkan!',
        error_code: 'UPDATE_FAILED'
      });
    }

    // Get document owner email
    const owner = await dbDMS('master_user')
      .select('account_email', 'account_name')
      .where('account_username', document.created_by)
      .first();

    // Send email notification (async, don't wait)
    if (owner && owner.account_email) {
      sendCancellationEmail({
        to: owner.account_email,
        doc_id: doc_id,
        created_date: document.created_date,
        doc_judul: document.doc_judul,
        account_name: owner.account_name,
        doc_alasan_batal: doc_alasan_batal
      }).catch(err => {
        logger(err, 'POST /document-cancel/cancel - Email Error', { doc_id });
      });
    }

    // Return success
    return res.status(200).json({
      success: true,
      message: 'Nomor dokumen berhasil dibatalkan!',
      data: {
        doc_id: doc_id,
        doc_nmr_status: 'Cancel',
        doc_alasan_batal: doc_alasan_batal,
        modified_by: user_nik,
        modified_date: now
      }
    });

  } catch (error) {
    logger(error, 'POST /document-cancel/cancel', req.body);
    return res.status(500).json({
      success: false,
      message: 'Nomor dokumen gagal dibatalkan!',
      error_code: 'SYSTEM_ERROR'
    });
  }
};
