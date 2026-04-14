/**
 * Pemusnahan Helper Functions
 * Status mapping and permission checking for archive destruction workflow
 */

/**
 * Get status text from status code
 * @param {Number} status - Status code (1-9)
 * @returns {String} - Status text in Indonesian
 */
export function getStatusText(status) {
  const statusMap = {
    1: 'Approval Atasan User Pembuat',
    2: 'Revisi User Pembuat',
    3: 'Ditolak',
    4: 'Approval Corp. Legal SH',
    5: 'Approval Corp. Legal Div. Head / Dept. Head',
    6: 'Approval Corp. Legal Director',
    7: 'Approval Arsiparis Lokasi',
    8: 'Penghapusan Arsip',
    9: 'Approval Arsiparis Lokasi'
  };
  return statusMap[status] || 'Unknown';
}

/**
 * Check if user can approve the ticket at current status
 * @param {Object} ticket - Ticket object from database
 * @param {String} userId - Current user ID
 * @returns {Boolean} - True if user can approve
 */
export function canApprove(ticket, userId) {
  if (ticket.tr_status === 1 && ticket.tr_atasan_user_id === userId) return true;
  if (ticket.tr_status === 4 && ticket.tr_corp_lgl_id === userId) return true;
  if (ticket.tr_status === 5 && ticket.tr_atasan_corp_lgl_id === userId) return true;
  if (ticket.tr_status === 6 && ticket.tr_dir_corp_lgl_id === userId) return true;
  if ([7, 9].includes(ticket.tr_status) && ticket.tr_arsiparis_id === userId) return true;
  return false;
}

/**
 * Check if user can revise the ticket
 * @param {Object} ticket - Ticket object from database
 * @param {String} userId - Current user ID
 * @returns {Boolean} - True if user can revise
 */
export function canRevise(ticket, userId) {
  return ticket.tr_status === 2 && ticket.tr_user_id === userId;
}
/**
 * Check if approver can request revision (send back to user for revision)
 * Only atasan user at status 1 can do this
 * @param {Object} ticket - Ticket object from database
 * @param {String} userId - Current user ID
 * @returns {Boolean} - True if user can request revision as approver
 */
export function canRevisiApproval(ticket, userId) {
  return ticket.tr_status === 1 && ticket.tr_atasan_user_id === userId;
}

/**
 * Check if user can execute the ticket (status 8 = Penghapusan Arsip)
 * @param {Object} ticket - Ticket object from database
 * @param {String} userId - Current user ID
 * @returns {Boolean} - True if user can execute
 */
export function canExecute(ticket, userId) {
  return ticket.tr_status === 8 && ticket.tr_arsiparis_id === userId;
}

/**
 * Check if user can view the ticket
 * @param {Object} ticket - Ticket object from database
 * @param {String} userId - Current user ID
 * @param {Number} userType - User type (1 = Admin, 0 = Non-admin)
 * @returns {Boolean} - True if user can view
 */
export function canView(ticket, userId, userType) {
  if (userType === 1) return true; // Admin
  if (ticket.tr_user_id === userId) return true; // Creator
  if (canApprove(ticket, userId)) return true; // Approver
  return false;
}

/**
 * Check all user permissions for a ticket
 * @param {Object} ticket - Ticket object from database
 * @param {String} userId - Current user ID
 * @param {Number} userType - User type (1 = Admin, 0 = Non-admin)
 * @returns {Object} - Object with permission flags
 */
export function checkUserPermissions(ticket, userId, userType) {
  return {
    can_approve: canApprove(ticket, userId),
    can_reject: canApprove(ticket, userId),
    can_revise: canRevise(ticket, userId),
    can_revisi_approval: canRevisiApproval(ticket, userId),
    can_execute: canExecute(ticket, userId),
    can_view: canView(ticket, userId, userType),
    is_arsiparis: [7, 8, 9].includes(ticket.tr_status) && ticket.tr_arsiparis_id === userId
  };
}

/**
 * Get status badge color for frontend
 * @param {Number} status - Status code (1-9)
 * @returns {String} - Quasar color name
 */
export function getStatusColor(status) {
  const colorMap = {
    1: 'orange-6',    // Pending approval
    2: 'yellow-6',    // Revision
    3: 'red-6',       // Rejected
    4: 'blue-6',      // Legal approval
    5: 'blue-7',      // Legal manager
    6: 'blue-8',      // Legal director
    7: 'purple-6',    // Archivist
    8: 'green-6',     // Completed
    9: 'purple-7'     // Archivist alt
  };
  return colorMap[status] || 'grey-6';
}
