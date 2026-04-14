import { dbWJS, dbPortal } from '../../config/db.js';
import { encrypt, getErrorResponse, mySimpleCrypt } from '../../helpers/utils.js';
import { logger } from '../../helpers/logger.js';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Login - Authenticate user with NIK and password
 * Pattern follows existing loginController.js
 * 
 * Users table structure:
 * - name: stores NIK
 * - first_name: stores actual user name
 * - emp_id: stores Emp_Id from portal
 * - activated: 1 = active, 0 = inactive
 */
export const login = async (req, res) => {
  try {
    const { nik, password } = req.body;

    // Get user from WJS database by NIK (stored in 'name' field)
    const user = await dbWJS('users')
      .select('id', 'name', 'first_name', 'email', 'activated', 'emp_id')
      .where('name', nik)
      .first();
    console.log(user);
    if (!user) {
      return res.status(406).json({
        success: false,
        type: 'error',
        message: `User ${nik} belum terdaftar pada aplikasi ini`
      });
    }

    // Check if user is active (activated = 1)
    if (user.activated !== 1) {
      return res.status(406).json({
        success: false,
        type: 'error',
        message: `User ${nik} tidak aktif`
      });
    }

    // Validate against portal database using emp_id if exists, otherwise use NIK
    const lookupValue = user.emp_id;
    
    const portalUser = await dbPortal('portal.dbo.ptl_hris as a')
      .select(
        'a.Emp_Id',
        'a.user_pass',
        'a.user_newid',
        'a.grade',
        'a.jabatan',
        'a.employee_mgr_pk',
        'a.map_dept_pk',
        'a.map_div_pk',
        'b.nama_div',
        'd.nama_dept',
        'c.map_dir_pk'
      )
      .leftJoin('master_div as b', 'b.id_div', 'a.map_div_pk')
      .leftJoin('mapping_dir_div_dept as c', function() {
        this.on('c.map_dept_pk', '=', 'a.map_dept_pk')
          .orOn('c.map_div_pk', '=', 'a.map_div_pk');
      })
      .leftJoin('master_dept as d', 'd.id_dept', 'a.map_dept_pk')
      .where('a.user_active', 'Active')
      .where('a.Emp_Id', lookupValue)
      .first();

    if (!portalUser) {
      // Deactivate user in WJS database
      await dbWJS('users').where('id', user.id).update({ activated: 0 });
      return res.status(406).json({
        success: false,
        type: 'error',
        message: `User ${nik} sudah tidak aktif`
      });
    }

    // Validate password (only in production)
    if (process.env.ENVIRONMENT === 'PRODUCTION') {
      const hashedPassword = await mySimpleCrypt(password);
      if (portalUser.user_pass !== hashedPassword) {
        return res.status(406).json({
          success: false,
          type: 'error',
          message: 'NIK/Password tidak sesuai'
        });
      }
    }

    // Get direktorat info
    const direktorat = await dbPortal('master_dir')
      .where('direktorat_pk', portalUser.map_dir_pk)
      .first();

    // Get idle time from portal policy
    const portalPolicy = await dbPortal('ptl_policy').where('id', 0).first();
    const idleTime = process.env.ENVIRONMENT === 'PRODUCTION' 
      ? (portalPolicy?.idle_time || 3600000)
      : 3600000; // 1 hour for dev

    // Generate JWT token
    const token = jwt.sign(
      { user: portalUser.Emp_Id },
      process.env.TOKEN,
      { expiresIn: idleTime }
    );

    // Update user info in WJS database
    // name = NIK, first_name = actual name from portal, emp_id = Emp_Id from portal
    await dbWJS('users')
      .where('id', user.id)
      .update({
        name: portalUser.user_newid, // Update NIK from portal
        first_name: user.first_name, // Keep existing name
        emp_id: portalUser.Emp_Id, // Store Emp_Id
        usr_bu_id: user.usr_bu_id,
        usr_ste_id: user.usr_ste_id,
        usr_sec_id: user.usr_sec_id,
        usr_dpt_id: portalUser.map_dept_pk
      });

    // Log access
    await dbWJS('log_akses').insert({
      empid: portalUser.Emp_Id,
      nik: portalUser.user_newid,
      status: 'login',
      keterangan: 'user',
      nama_url: req.body.url || '/wjs'
    });

    // Return success response
    res.status(200).json({
      success: true,
      message: 'Login berhasil',
      data: {
        token,
        user: {
          id: portalUser.Emp_Id,
          nik: portalUser.user_newid,
          name: user.first_name, // Actual name from first_name field
          email: user.email,
          grade: portalUser.grade,
          jabatan: portalUser.jabatan,
          dept_id: portalUser.map_dept_pk,
          dept_name: portalUser.nama_dept,
          div_id: portalUser.map_div_pk,
          div_name: portalUser.nama_div,
          dir_id: direktorat?.direktorat_pk,
          dir_name: direktorat?.direktorat_name
        },
        idle: idleTime
      }
    });
  } catch (error) {
    logger(error, 'POST /wjs/auth/login', req.body);
    return res.status(406).json({
      success: false,
      ...getErrorResponse(error)
    });
  }
};

/**
 * Logout - Log user logout activity
 */
export const logout = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(200).json({ success: true, message: 'Logged out' });
    }

    const decoded = jwt.verify(token, process.env.TOKEN);
    const empid = decoded.user;

    // Get user info
    const user = await dbWJS('users')
      .select('name', 'first_name', 'emp_id')
      .where('emp_id', empid)
      .first();

    if (user) {
      // Log logout activity
      await dbWJS('log_akses').insert({
        empid: user.emp_id,
        nik: user.name,
        status: 'logout',
        keterangan: 'user',
        nama_url: req.body.url || '/wjs'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Logout berhasil'
    });
  } catch (error) {
    logger(error, 'POST /wjs/auth/logout', req.body);
    return res.status(200).json({
      success: true,
      message: 'Logged out'
    });
  }
};

/**
 * Verify - Verify token validity
 */
export const verify = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Token tidak ditemukan'
      });
    }

    const decoded = jwt.verify(token, process.env.TOKEN);
    
    // Check if user is still active in portal
    const portalUser = await dbPortal('portal.dbo.ptl_hris')
      .where('Emp_Id', decoded.user)
      .where('user_active', 'Active')
      .first();

    if (!portalUser) {
      return res.status(401).json({
        success: false,
        message: 'User tidak aktif'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Token valid'
    });
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Token tidak valid atau expired'
    });
  }
};

/**
 * Get Current User - Get authenticated user data
 */
export const getCurrentUser = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Token tidak ditemukan'
      });
    }

    const decoded = jwt.verify(token, process.env.TOKEN);
    
    // Get user from WJS database
    const user = await dbWJS('users')
      .select('id', 'name', 'first_name', 'email', 'emp_id')
      .where('emp_id', decoded.user)
      .first();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User tidak ditemukan'
      });
    }

    // Get portal user info
    const portalUser = await dbPortal('portal.dbo.ptl_hris')
      .select('user_newid', 'grade', 'jabatan', 'map_dept_pk', 'map_div_pk')
      .where('Emp_Id', decoded.user)
      .where('user_active', 'Active')
      .first();

    if (!portalUser) {
      return res.status(401).json({
        success: false,
        message: 'User tidak aktif'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        id: user.emp_id,
        nik: portalUser.user_newid,
        name: user.first_name,
        email: user.email,
        grade: portalUser.grade,
        jabatan: portalUser.jabatan,
        dept_id: portalUser.map_dept_pk,
        div_id: portalUser.map_div_pk
      }
    });
  } catch (error) {
    logger(error, 'GET /wjs/auth/me', {});
    return res.status(401).json({
      success: false,
      message: 'Token tidak valid'
    });
  }
};

/**
 * Refresh Token - Generate new token
 */
export const refreshToken = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Token tidak ditemukan'
      });
    }

    const decoded = jwt.verify(token, process.env.TOKEN);
    
    // Check if user is still active
    const portalUser = await dbPortal('portal.dbo.ptl_hris')
      .where('Emp_Id', decoded.user)
      .where('user_active', 'Active')
      .first();

    if (!portalUser) {
      return res.status(401).json({
        success: false,
        message: 'User tidak aktif'
      });
    }

    // Get idle time
    const portalPolicy = await dbPortal('ptl_policy').where('id', 0).first();
    const idleTime = process.env.ENVIRONMENT === 'PRODUCTION' 
      ? portalPolicy.idle_time 
      : 3600000;

    // Generate new token
    const newToken = jwt.sign(
      { user: decoded.user },
      process.env.TOKEN,
      { expiresIn: idleTime }
    );

    res.status(200).json({
      success: true,
      data: {
        token: newToken
      }
    });
  } catch (error) {
    logger(error, 'POST /wjs/auth/refresh', {});
    return res.status(401).json({
      success: false,
      message: 'Token tidak valid'
    });
  }
};
