import { dbDMS } from "../../config/db.js";
import dayjs from "dayjs";
import * as dotenv from 'dotenv';
import { decrypt, getErrorResponse } from "../../helpers/utils.js";
import { logger } from "../../helpers/logger.js";
dotenv.config();

export const listMenu = async (req, res) => {
  // #swagger.tags = ['Menu']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Get list of menus'
  try {
    if (req.query.rowsPerPage == null) {
      // Simple list without pagination
      const menus = await dbDMS('mMenu')
        .select(
          'menu_id',
          'menu_name',
          'menu_parent',
          'menu_link',
          'menu_icon',
          dbDMS.raw(`0 as menu_order`)
        )
        .orderBy('menu_id', 'desc');
      
      res.status(200).json(menus);
    } else {
      // Paginated list
      const sorting = req.query.descending === "true" ? "desc" : "asc";
      const columnSort = req.query.sortBy === "desc" ? "menu_id desc" : `${req.query.sortBy} ${sorting}`;
      const page = Math.floor(req.query.page);
      
      const response = await dbDMS('mMenu')
        .select(
          'menu_id',
          'menu_name',
          'menu_parent',
          'menu_link',
          'menu_icon',
          dbDMS.raw(`0 as menu_order`),
          dbDMS.raw(`CASE WHEN menu_parent = 0 THEN 'Main Menu' ELSE 'Sub Menu' END as menu_type`)
        )
        .where((query) => {
          if (req.query.filter != null) {
            query.orWhere("menu_name", "like", `%${req.query.filter}%`);
            query.orWhere("menu_link", "like", `%${req.query.filter}%`);
          }
        })
        .orderByRaw(columnSort)
        .paginate({
          perPage: Math.floor(req.query.rowsPerPage),
          currentPage: page,
          isLengthAware: true,
        });
      
      res.status(200).json(response);
    }
  } catch (error) {
    logger(error, 'GET /listMenu', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

export const getMainMenus = async (req, res) => {
  // #swagger.tags = ['Menu']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Get list of main menus (parent = 0)'
  try {
    const mainMenus = await dbDMS('mst_menu')
      .select('menu_id as value', 'menu_name as label')
      .where('menu_parent', 0)
      .whereNull('deleted_at')
      .orderBy('menu_name', 'asc');
    
    res.status(200).json(mainMenus);
  } catch (error) {
    logger(error, 'GET /getMainMenus', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

export const saveMenu = async (req, res) => {
  // #swagger.tags = ['Menu']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Save or update menu'
  const trx = await dbDMS.transaction();
  try {
    const { id, menu_name, menu_type, menu_parent, menu_link, menu_icon, menu_order, creator } = req.body;
    const creator_decrypt = decrypt(creator);
    const now = dayjs().format("YYYY-MM-DD HH:mm:ss");
    
    const menuData = {
      menu_name,
      menu_parent: menu_type === 'main' ? 0 : menu_parent,
      menu_link: menu_link || '',
      menu_icon: menu_icon || '',
      menu_order: menu_order || 0,
      updated_by: creator_decrypt,
      updated_at: now,
    };
    
    if (id && id > 0) {
      // Update existing menu
      await trx('mst_menu')
        .where('menu_id', id)
        .update(menuData);
    } else {
      // Check if menu already exists
      const existing = await trx('mst_menu')
        .where('menu_name', menu_name)
        .where('menu_parent', menuData.menu_parent)
        .whereNull('deleted_at')
        .first();
      
      if (existing) {
        await trx.rollback();
        return res.status(406).json({
          type: 'error',
          message: 'Menu with this name already exists',
        });
      }
      
      // Insert new menu
      await trx('mst_menu').insert({
        ...menuData,
        created_by: creator_decrypt,
        created_at: now,
      });
    }
    
    await trx.commit();
    return res.json("sukses");
  } catch (error) {
    await trx.rollback();
    logger(error, 'POST /saveMenu', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

export const deleteMenu = async (req, res) => {
  // #swagger.tags = ['Menu']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Delete menu (soft delete)'
  try {
    const { id, creator } = req.body;
    const creator_decrypt = decrypt(creator);
    const now = dayjs().format("YYYY-MM-DD HH:mm:ss");
    
    // Check if menu has children
    const hasChildren = await dbDMS('mst_menu')
      .where('menu_parent', id)
      .whereNull('deleted_at')
      .count('* as count')
      .first();
    
    if (hasChildren.count > 0) {
      return res.status(406).json({
        type: 'error',
        message: 'Cannot delete menu with sub menus. Please delete sub menus first.',
      });
    }
    
    // Soft delete
    await dbDMS('mst_menu')
      .where('menu_id', id)
      .update({
        deleted_by: creator_decrypt,
        deleted_at: now,
      });
    
    return res.json("success");
  } catch (error) {
    logger(error, 'POST /deleteMenu', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

export const getMenuById = async (req, res) => {
  // #swagger.tags = ['Menu']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Get menu by ID'
  try {
    const { id } = req.query;
    
    const menu = await dbDMS('mst_menu')
      .select(
        'menu_id',
        'menu_name',
        'menu_parent',
        'menu_link',
        'menu_icon',
        'menu_order'
      )
      .where('menu_id', id)
      .whereNull('deleted_at')
      .first();
    
    if (!menu) {
      return res.status(404).json({
        type: 'error',
        message: 'Menu not found',
      });
    }
    
    res.status(200).json(menu);
  } catch (error) {
    logger(error, 'GET /getMenuById', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};
