/**
 * Pengaduan Helper Functions
 * Status mapping and permission checking for document complaint workflow
 * 
 * Status flow (text-based, matching PHP):
 * - "Masih menunggu persetujuan atasan dokumen owner" → Atasan approve/revisi
 * - "Menunggu persetujuan corporate legal SH" → Corp Legal SH approve/tolak
 * - "Menunggu persetujuan corporate legal DH" → Corp Legal DH approve/tolak
 * - "Pengaduan diterima dan sedang diproses" → Corp Legal DH selesai
 * - "Selesai" → Done
 * - "Pengaduan ditolak" → Rejected (by atasan → user revisi, by legal → final)
 */

const STATUS = {
  PENDING_ATASAN: 'Masih menunggu persetujuan atasan dokumen owner',
  PENDING_LEGAL_SH: 'Menunggu persetujuan corporate legal SH',
  PENDING_LEGAL_DH: 'Menunggu persetujuan corporate legal DH',
  PROCESSING: 'Pengaduan diterima dan sedang diproses',
  DONE: 'Selesai',
  REJECTED: 'Pengaduan ditolak'
};

export { STATUS };

/**
 * Get status badge color for frontend
 */
export function getStatusColor(status) {
  const colorMap = {
    [STATUS.PENDING_ATASAN]: 'orange-6',
    [STATUS.PENDING_LEGAL_SH]: 'blue-6',
    [STATUS.PENDING_LEGAL_DH]: 'blue-8',
    [STATUS.PROCESSING]: 'purple-6',
    [STATUS.DONE]: 'green-6',
    [STATUS.REJECTED]: 'red-6'
  };
  return colorMap[status] || 'grey-6';
}

/**
 * Parse tr_current_user to extract NIK and position
 * Format: "{nik} - {posisi}"
 */
export function parseCurrentUser(currentUser) {
  if (!currentUser) return { nik: '', posisi: '' };
  const parts = currentUser.split('-');
  return {
    nik: (parts[0] || '').trim(),
    posisi: (parts[1] || '').trim()
  };
}

/**
 * Check all user permissions for a pengaduan ticket
 * @param {Object} ticket - Ticket from trs_pengaduan
 * @param {String} userId - Current user NIK
 * @param {Number} userType - User type from session
 * @returns {Object} Permission flags
 */
export function checkUserPermissions(ticket, userId, userType) {
  const { nik, posisi } = parseCurrentUser(ticket.tr_current_user);
  const isCurrentApprover = nik === userId;

  return {
    can_approve_atasan: isCurrentApprover && posisi === 'Div Head' 
      && ticket.tr_adu_status === STATUS.PENDING_ATASAN,
    can_approve_legal_sh: isCurrentApprover && posisi === 'Legal SH' 
      && ticket.tr_adu_status === STATUS.PENDING_LEGAL_SH,
    can_approve_legal_dh: isCurrentApprover && posisi === 'Legal DH' 
      && ticket.tr_adu_status === STATUS.PENDING_LEGAL_DH,
    can_selesai: isCurrentApprover && posisi === 'Selesai' 
      && ticket.tr_adu_status === STATUS.PROCESSING,
    can_revise: isCurrentApprover && posisi === 'Tolak' 
      && ticket.tr_adu_status === STATUS.REJECTED,
    can_view: true,
    is_creator: ticket.tr_adu_user_nik === userId
  };
}
