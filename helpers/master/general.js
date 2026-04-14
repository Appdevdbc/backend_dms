import { db, dbDMS } from "../../config/db.js";
import { encrypt } from "../utils.js";

// Helper function to process site data with user selections
export const processSiteData = async (sites, domain, empid) => {
  const siteArray = sites.map(site => ({
    name: site.site_code,
    label: `${site.site_code}-${site.site_desc}`,
    selected: false,
  }));

  const userSites = await db("user_site")
    .select("usite_site")
    .where("usite_domain", domain)
    .where("usite_userid", empid)
    .whereNull('deleted_at')
    .orderBy('usite_site');

  if (userSites.length > 0) {
    const userSiteSet = new Set(userSites.map(s => s.usite_site));
    siteArray.forEach(site => {
      if (userSiteSet.has(site.name)) {
        site.selected = true;
      }
    });
  }

  return siteArray;
};


// Helper function to encrypt menu IDs
export const encryptMenuIds = async (data) => {
  if (Array.isArray(data)) {
    for (const item of data) {
      item.menuid = `${item.menu_id}`;
      item.menu_id = await encrypt(`${item.menu_id}`);
    }
  }
  return data;
};

// Helper function to check if parent has sub menus
export const checkSubMenus = async (parentId) => {
  const subMenuCount = await dbDMS("mst_menu")
    .where("menu_parent", parentId)
    .whereNull('deleted_at')
    .count({ total: "menu_name" });
  
  return subMenuCount[0].total > 0;
};

// Helper function to encrypt collection IDs
export const encryptCollectionIds = async (data) => {
  for (const item of data) {
    item.colid = await encrypt(`${item.colid}`);
     item.col_parentid = `${item.col_parent}`;
    item.col_parent = await encrypt(`${item.col_parent}`);
  }
  return data;
};

// Helper function to check if collection has sub details
export const checkCollectionDetails = async (collectionId) => {
  const detailCount = await dbDMS("collection_menu as a")
    .leftJoin('collection_det as b', function() {
      this.on('a.colid', '=', 'b.coldet_colid')
    })
    .whereNotNull("coldet_colid")
    .whereNull("b.deleted_at")
    .where('a.colid', collectionId)
    .count({ total: "coldet_colid" });
  
  return detailCount[0].total > 0;
};

// Helper function to encrypt collection detail IDs
export const encryptCollectionDetailIds = async (data) => {
  for (const item of data) {
    item.coldet_colid = await encrypt(`${item.coldet_colid}`);
  }
  return data;
};

// Helper function to filter products by full pipe items
export const filterProductsByFullPipe = (products, fullPipeItems) => {
  const fullPipeItemSet = new Set(fullPipeItems.map(item => item.item));
  return products.filter(product => fullPipeItemSet.has(product.idqad));
};