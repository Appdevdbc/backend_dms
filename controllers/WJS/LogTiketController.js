import { dbDMS } from "../../config/db.js";
import { logger } from "../../helpers/logger.js";
import { getErrorResponse } from "../../helpers/utils.js";

/**
 * Get ticket logs by ticket number (public access - no authentication required)
 * GET /api/dms/log-tiket
 */
export const getLogByTicketNumber = async (req, res) => {
  try {
    const { no_tiket } = req.query;

    if (!no_tiket) {
      return res.status(406).json({ 
        type: 'error', 
        message: 'Nomor tiket wajib diisi' 
      });
    }

    // Get ticket header to check if ticket exists
    const ticket = await dbDMS('trs_arsip_header')
      .select('tr_arsip_id', 'tr_no_tiket', 'tr_jenis_aktivitas', 'tr_status', 'tr_tgl_pengajuan')
      .where('tr_no_tiket', no_tiket)
      .first();

    if (!ticket) {
      return res.status(406).json({ 
        type: 'error', 
        message: 'Nomor tiket tidak ditemukan' 
      });
    }

    // Get logs for this ticket
    const logs = await dbDMS('trs_log as l')
      .select(
        'l.trs_log_no_tiket',
        'l.trs_log_proses',
        'l.trs_log_hasil',
        'l.trs_log_pic',
        'l.trs_log_tgl',
        'l.trs_log_status',
        'l.trs_log_catatan',
        'l.trs_log_reason_revisi',
        'u.account_name'
      )
      .leftJoin('master_user as u', 'l.trs_log_pic', 'u.account_username')
      .where('l.trs_log_no_tiket', no_tiket)
      .orderBy('l.trs_log_tgl', 'asc');

    // Get ticket type name
    const ticketType = ticket.tr_jenis_aktivitas === 6 ? 'Pemusnahan' : 'Mutasi';

    // Get status text
    const getStatusText = (status, jenis) => {
      if (jenis === 6) {
        // Pemusnahan
        const statusMap = {
          1: 'Approval Atasan User Pembuat',
          2: 'Revisi User Pembuat',
          3: 'Ditolak',
          4: 'Approval Corp. Legal SH',
          5: 'Approval Corp. Legal Div. Head / Dept. Head',
          6: 'Approval Corp. Legal Director',
          7: 'Approval Arsiparis Lokasi',
          8: 'Penghapusan Arsip',
          9: 'Selesai'
        };
        return statusMap[status] || 'Unknown';
      } else {
        // Mutasi
        const statusMap = {
          1: 'Approval Atasan User Pembuat',
          2: 'Revisi User Pembuat',
          3: 'Ditolak',
          4: 'Approval Arsiparis Lama',
          5: 'Approval Atasan Arsiparis Lama',
          6: 'Approval Arsiparis Baru',
          7: 'Approval Atasan Arsiparis Baru',
          8: 'Pemindahan Arsip',
          9: 'Selesai'
        };
        return statusMap[status] || 'Unknown';
      }
    };

    return res.status(200).json({
      data: {
        ticket: {
          no_tiket: ticket.tr_no_tiket,
          jenis: ticketType,
          status: ticket.tr_status,
          status_text: getStatusText(ticket.tr_status, ticket.tr_jenis_aktivitas),
          tgl_pengajuan: ticket.tr_tgl_pengajuan
        },
        logs: logs
      }
    });
  } catch (error) {
    console.log(error);
    logger(error, 'GET /log-tiket', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

/**
 * Export logs to Excel
 * GET /api/dms/log-tiket/export
 */
export const exportLogToExcel = async (req, res) => {
  try {
    const { no_tiket } = req.query;

    if (!no_tiket) {
      return res.status(406).json({ 
        type: 'error', 
        message: 'Nomor tiket wajib diisi' 
      });
    }

    // Get ticket and logs
    const ticket = await dbDMS('trs_arsip_header')
      .select('tr_no_tiket', 'tr_jenis_aktivitas', 'tr_tgl_pengajuan')
      .where('tr_no_tiket', no_tiket)
      .first();

    if (!ticket) {
      return res.status(406).json({ 
        type: 'error', 
        message: 'Nomor tiket tidak ditemukan' 
      });
    }

    const logs = await dbDMS('trs_log as l')
      .select(
        'l.trs_log_no_tiket',
        'l.trs_log_proses',
        'l.trs_log_hasil',
        'l.trs_log_tgl',
        'l.trs_log_catatan',
        'u.account_name'
      )
      .leftJoin('master_user as u', 'l.trs_log_pic', 'u.account_username')
      .where('l.trs_log_no_tiket', no_tiket)
      .orderBy('l.trs_log_tgl', 'asc');

    const XLSX = await import('xlsx');

    // Prepare data for Excel
    const excelData = logs.map(log => ({
      'Nomor Tiket': log.trs_log_no_tiket,
      'Proses': log.trs_log_proses,
      'Hasil Proses': log.trs_log_hasil,
      'PIC': log.account_name || '-',
      'Tanggal': log.trs_log_tgl ? new Date(log.trs_log_tgl).toLocaleString('id-ID') : '-',
      'Catatan': log.trs_log_catatan || '-'
    }));

    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Log Tiket');

    // Set column widths
    worksheet['!cols'] = [
      { wch: 20 }, // Nomor Tiket
      { wch: 35 }, // Proses
      { wch: 35 }, // Hasil Proses
      { wch: 30 }, // PIC
      { wch: 20 }, // Tanggal
      { wch: 50 }  // Catatan
    ];

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=Log_Tiket_${no_tiket}.xlsx`);

    return res.send(buffer);
  } catch (error) {
    logger(error, 'GET /log-tiket/export', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};
