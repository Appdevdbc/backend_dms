import { dbDMS } from "../../config/db.js";

/**
 * Check if user is admin based on group membership
 * @param {string} empid - Employee ID
 * @param {string} domain - Business Unit ID
 * @returns {Promise<boolean>} - True if user is admin
 */
export const isUserAdmin = async (empid, domain) => {
  try {
    // Check if user belongs to any admin group
    // Admin groups are identified by grp_code = 'ADMIN' or grp_name contains 'Admin'
    const adminGroup = await dbDMS('user_group as ug')
      .join('group_aplikasi as g', 'ug.ugrp_group_id', 'g.grp_id')
      .where({
        'ug.ugrp_user_id': empid,
        'ug.ugrp_bu_id': domain
      })
      .where(function() {
        this.where('g.grp_code', 'ADMIN')
          .orWhere('g.grp_name', 'like', '%Admin%')
          .orWhere('g.grp_name', 'like', '%ADMIN%');
      })
      .whereNull('ug.deleted_at')
      .first();
    
    return !!adminGroup;
  } catch (error) {
    console.error('Error checking admin status:', error);
    return false;
  }
};

/**
 * Get user's groups for a specific domain
 * @param {string} empid - Employee ID
 * @param {string} domain - Business Unit ID
 * @returns {Promise<Array>} - Array of group objects
 */
export const getUserGroups = async (empid, domain) => {
  try {
    const groups = await dbDMS('user_group as ug')
      .select('g.grp_id', 'g.grp_name', 'g.grp_code')
      .join('group_aplikasi as g', 'ug.ugrp_group_id', 'g.grp_id')
      .where({
        'ug.ugrp_user_id': empid,
        'ug.ugrp_bu_id': domain
      })
      .whereNull('ug.deleted_at');
    
    return groups;
  } catch (error) {
    console.error('Error getting user groups:', error);
    return [];
  }
};

/**
 * Check if user has specific group
 * @param {string} empid - Employee ID
 * @param {string} domain - Business Unit ID
 * @param {string} groupCode - Group code to check
 * @returns {Promise<boolean>} - True if user has the group
 */
export const userHasGroup = async (empid, domain, groupCode) => {
  try {
    const group = await dbDMS('user_group as ug')
      .join('group_aplikasi as g', 'ug.ugrp_group_id', 'g.grp_id')
      .where({
        'ug.ugrp_user_id': empid,
        'ug.ugrp_bu_id': domain,
        'g.grp_code': groupCode
      })
      .whereNull('ug.deleted_at')
      .first();
    
    return !!group;
  } catch (error) {
    console.error('Error checking group membership:', error);
    return false;
  }
};
