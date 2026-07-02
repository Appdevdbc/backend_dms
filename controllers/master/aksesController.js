import { dbDMS } from "../../config/db.js";
import dayjs from "dayjs";
import * as dotenv from 'dotenv';
import { decrypt, getErrorResponse } from "../../helpers/utils.js";
import { logger } from "../../helpers/logger.js";
dotenv.config();

export const getUsersAkses = async (req, res) => {
  // #swagger.tags = ['Akses']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Get list of users for akses dropdown'
  try {
    const { domain } = req.query;
    
    const users = await dbDMS('mUser as u')
      .select(
        'u.user_id as value',
        dbDMS.raw('CONCAT(u.user_name, \' (\', u.user_nik, \')\') as label'),
        'u.user_empid',
        'u.user_name'
      )
      .leftJoin('mRole as r', 'r.role_idrole', 'u.user_role')
      .where('u.user_domain', domain)
      // .whereNull('u.deleted_at')
      .orderBy('u.user_name', 'asc');
    
    res.status(200).json(users);
  } catch (error) {
    logger(error, 'GET /getUsersAkses', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

export const getMainMenusAkses = async (req, res) => {
  // #swagger.tags = ['Akses']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Get list of main menus (parent = 0 or NULL)'
  try {
    const menus = await dbDMS('mMenu')
      .select('menu_id', 'menu_name', 'menu_icon')
      .where(function() {
        this.whereNull('menu_parent').orWhere('menu_parent', 0);
      })
      // .whereNull('deleted_at')
      // .orderBy('menu_order', 'asc')
      .orderBy('menu_name', 'asc');
    
    res.status(200).json(menus);
  } catch (error) {
    logger(error, 'GET /getMainMenusAkses', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

export const getSubMenusAkses = async (req, res) => {
  // #swagger.tags = ['Akses']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Get list of sub menus (parent > 0)'
  try {
    const menus = await dbDMS('mMenu')
      .select('menu_id', 'menu_name', 'menu_icon', 'menu_parent')
      .whereNotNull('menu_parent')
      .where('menu_parent', '>', 0)
      // .whereNull('deleted_at')
      // .orderBy('menu_order', 'asc')
      .orderBy('menu_name', 'asc');
    
    res.status(200).json(menus);
  } catch (error) {
    logger(error, 'GET /getSubMenusAkses', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

export const getFoldersAkses = async (req, res) => {
  // #swagger.tags = ['Akses']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Get list of folders grouped by department for akses'
  try {
    const { domain } = req.query;
    
    // Get all departments first
    const departments = await dbDMS('mDept as dept')
      .select(
        'dept.dept_id',
        'dept.dept_name',
        'div.divisi_name'
      )
      .leftJoin('mDivisi as div', 'div.divisi_iddiv', 'dept.dept_divisi')
      .where('dept.dept_domain', domain)
      .orderBy('dept.dept_name', 'asc');
    
    // Get all folders
    const folders = await dbDMS('mFolder as f')
      .select(
        'f.folder_id',
        'f.folder_name',
        'f.folder_iddiv',
        'f.folder_iddept'
      )
      .where('f.folder_domain', domain)
      .orderBy('f.folder_name', 'asc');
    
    // Group folders by department
    const groupedData = departments.map(dept => ({
      dept_id: dept.dept_id,
      dept_name: dept.dept_name,
      divisi_name: dept.divisi_name,
      folders: folders.filter(f => f.folder_iddept === dept.dept_id)
    })).filter(dept => dept.folders.length > 0); // Only include departments with folders
    
    res.status(200).json(groupedData);
  } catch (error) {
    logger(error, 'GET /getFoldersAkses', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

export const getUserAksesDetail = async (req, res) => {
  // #swagger.tags = ['Akses']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Get user access detail (main menus, sub menus, folders)'
  try {
    const { userId } = req.query;
    
    // Get main menus access
    const mainMenus = await dbDMS('mAkses')
      .select('akses_main_menu')
      .where('akses_user', userId)
      .whereNotNull('akses_main_menu')
      // .whereNull('deleted_at')
      .then(rows => rows.map(r => r.akses_main_menu));
    
    // Get sub menus access
    const subMenus = await dbDMS('mAkses')
      .select('akses_sub_menu')
      .where('akses_user', userId)
      .whereNotNull('akses_sub_menu')
      // .whereNull('deleted_at')
      .then(rows => rows.map(r => r.akses_sub_menu));
    
    // Get folders access
    const folders = await dbDMS('mAkses')
      .select('akses_folder')
      .where('akses_user', userId)
      .whereNotNull('akses_folder')
      // .whereNull('deleted_at')
      .then(rows => rows.map(r => r.akses_folder));
    
    res.status(200).json({
      mainMenus,
      subMenus,
      folders
    });
  } catch (error) {
    logger(error, 'GET /getUserAksesDetail', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

export const saveUserAkses = async (req, res) => {
  // #swagger.tags = ['Akses']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Save user access configuration'
  const trx = await dbDMS.transaction();
  try {
    const { userId, mainMenus, subMenus, folders, creator } = req.body;
    const creator_decrypt = decrypt(creator);
    const now = dayjs().format("YYYY-MM-DD HH:mm:ss");
    
    // Delete all existing access for this user
    await trx('mAkses')
      .where('akses_user', userId)
      .delete();
    
    // Insert main menu access
    if (mainMenus && mainMenus.length > 0) {
      const mainMenuInserts = mainMenus.map(menuId => ({
        akses_user: userId,
        akses_main_menu: menuId,
        // created_by: creator_decrypt,
        // created_at: now,
      }));
      await trx('mAkses').insert(mainMenuInserts);
    }
    
    // Insert sub menu access
    if (subMenus && subMenus.length > 0) {
      const subMenuInserts = subMenus.map(menuId => ({
        akses_user: userId,
        akses_sub_menu: menuId,
        // created_by: creator_decrypt,
        // created_at: now,
      }));
      await trx('mAkses').insert(subMenuInserts);
    }
    
    // Insert folder access and auto-insert department access
    if (folders && folders.length > 0) {
      const folderInserts = [];
      const deptInserts = [];
      const processedDepts = new Set();
      
      for (const folderId of folders) {
        // Add folder access
        folderInserts.push({
          akses_user: userId,
          akses_folder: folderId,
          // created_by: creator_decrypt,
          // created_at: now,
        });
        
        // Get department for this folder
        const folder = await trx('mFolder')
          .where('folder_id', folderId)
          .first();
        
        if (folder && folder.folder_iddept && !processedDepts.has(folder.folder_iddept)) {
          // Add department access (avoid duplicates)
          deptInserts.push({
            akses_user: userId,
            akses_dept: folder.folder_iddept,
            // created_by: creator_decrypt,
            // created_at: now,
          });
          processedDepts.add(folder.folder_iddept);
        }
      }
      
      // Insert folder and department access
      if (folderInserts.length > 0) {
        await trx('mAkses').insert(folderInserts);
      }
      if (deptInserts.length > 0) {
        await trx('mAkses').insert(deptInserts);
      }
    }
    
    await trx.commit();
    return res.json("sukses");
  } catch (error) {
    await trx.rollback();
    logger(error, 'POST /saveUserAkses', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};
