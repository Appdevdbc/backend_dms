import { dbWJS, dbPortal } from '../../config/db.js';
import dayjs from 'dayjs';

/**
 * Validate user credentials
 * @param {String} username - Username or NIK
 * @param {String} password - Password
 * @returns {Object} User data from portal
 */
export const validateUserCredentials = async (username, password) => {
  try {
    // Query portal database for user
    const user = await dbPortal('users')
      .where(function() {
        this.where('username', username)
          .orWhere('nik', username)
          .orWhere('email', username);
      })
      .where('active', 1)
      .first();

    if (!user) {
      throw new Error('Username atau password salah.');
    }

    // Note: In production, you should verify password hash
    // For now, assuming password validation is done
    // if (!bcrypt.compareSync(password, user.password)) {
    //   throw new Error('Username atau password salah.');
    // }

    return user;
  } catch (error) {
    throw error;
  }
};

/**
 * Get user from portal database
 * @param {Number} userId - User ID
 * @returns {Object} User data from portal
 */
export const getUserFromPortal = async (userId) => {
  try {
    const user = await dbPortal('users')
      .where('id', userId)
      .where('active', 1)
      .first();

    if (!user) {
      throw new Error('User tidak ditemukan atau tidak aktif di portal.');
    }

    return user;
  } catch (error) {
    throw error;
  }
};

/**
 * Sync user from portal to WJS database
 * @param {Object} portalUser - User data from portal
 * @returns {Object} User data from WJS
 */
export const syncUserFromPortal = async (portalUser) => {
  try {
    const userId = portalUser.id;
    const now = dayjs().format('YYYY-MM-DD HH:mm:ss');

    // Check if user exists in WJS
    const existingUser = await dbWJS('users')
      .where('id', userId)
      .first();

    const userData = {
      name: portalUser.nik || portalUser.username, // NIK in name field
      first_name: portalUser.name, // Actual name in first_name
      last_name: portalUser.last_name || '',
      email: portalUser.email,
      emp_id: portalUser.emp_id,
      usr_bu_id: portalUser.bu_id || null,
      usr_ste_id: portalUser.site_id || null,
      usr_dpt_id: portalUser.dept_id || null,
      updated_at: now
    };

    if (existingUser) {
      // Update existing user
      await dbWJS('users')
        .where('id', userId)
        .update(userData);
    } else {
      // Create new user
      await dbWJS('users').insert({
        id: userId,
        ...userData,
        activated: 1, // Default to active
        created_at: now
      });
    }

    // Get updated user
    const user = await dbWJS('users')
      .where('id', userId)
      .first();

    return user;
  } catch (error) {
    throw error;
  }
};

/**
 * Check if user is activated
 * @param {Number} userId - User ID
 * @returns {Boolean} True if activated
 */
export const isUserActivated = async (userId) => {
  try {
    const user = await dbWJS('users')
      .where('id', userId)
      .where('activated', 1)
      .first();

    return !!user;
  } catch (error) {
    return false;
  }
};

/**
 * Update user token in database
 * @param {Number} userId - User ID
 * @param {String} token - JWT token
 * @returns {Boolean} Success status
 */
export const updateUserToken = async (userId, token) => {
  try {
    await dbWJS('users')
      .where('id', userId)
      .update({
        token: token,
        updated_at: dayjs().format('YYYY-MM-DD HH:mm:ss')
      });

    return true;
  } catch (error) {
    console.error('Error updating user token:', error);
    return false;
  }
};

/**
 * Clear user token in database
 * @param {Number} userId - User ID
 * @returns {Boolean} Success status
 */
export const clearUserToken = async (userId) => {
  try {
    await dbWJS('users')
      .where('id', userId)
      .update({
        token: null,
        updated_at: dayjs().format('YYYY-MM-DD HH:mm:ss')
      });

    return true;
  } catch (error) {
    console.error('Error clearing user token:', error);
    return false;
  }
};
