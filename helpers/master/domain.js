import dayjs from "dayjs";
import * as dotenv from "dotenv";
import { encrypt } from "../utils.js";
import {db, dbDMS } from "../../config/db.js";
dotenv.config();


export const createLogEntry = (param,modul,source,destination, creator, status, today) => ({
  log_modul: modul,
  log_source: source,
  log_dest: destination,
  log_param: param,
  log_req_date: today,
  log_req_user: creator || 'system',
  log_resp_date: dayjs().format("YYYY-MM-DD HH:mm:ss"),
  status,
  created_at: dayjs().format("YYYY-MM-DD HH:mm:ss"),
  created_by: 'system',
});

export const processSiteItem = (item, domain, creator, today) => {
  const hq = item.desc_site.includes('hq') || item.desc_site.includes('HQ') ? 1 : null;
  const user = creator || 'system';
  
  return {
    site_domain: domain,
    site_code: item.descmstr,
    site_desc: item.desc_site,
    site_ishq: hq,
    updated_by: user,
    updated_at: today,
    deleted_at: null,
    deleted_by: null,
  };
};

// Helper function to encrypt role IDs
export const encryptRoleIds = async (data) => {
  if (Array.isArray(data)) {
    for (const item of data) {
      item.role_id = await encrypt(`${item.role_id}`);
    }
  } else {
    data.role_id = await encrypt(`${data.role_id}`);
  }
  return data;
};

// Helper function to check role dependencies
export const checkRoleDependencies = async (roleId) => {
  const [accessCount, userCount] = await Promise.all([
    dbDMS("user_access")
      .where("access_role", roleId)
      .whereNull('deleted_at')
      .count({ total: "access_role" }),
    dbDMS("user_grant_role")
      .where("grant_urole_id", roleId)
      .whereNull('deleted_at')
      .count({ total: "grant_user_id" })
  ]);

  if (accessCount[0].total > 0) {
    return { canDelete: false, message: `Tidak bisa dihapus karena role akses sudah diset menu` };
  }

  if (userCount[0].total > 0) {
    return { canDelete: false, message: `Tidak bisa dihapus karena role akses sudah diset ke user` };
  }

  return { canDelete: true };
};

// Helper function to encrypt menu IDs
export const encryptMenuIds = async (data) => {
  for (const item of data) {
    item.menu = await encrypt(`${item.menu}`);
  }
  return data;
};

// Helper function to convert access permissions
export const convertAccessPermissions = (permissions) => ({
  access_view: permissions.view === 1 ? 1 : 0,
  access_add: permissions.add === 1 ? 1 : 0,
  access_edit: permissions.edit === 1 ? 1 : 0,
  access_delete: permissions.delete === 1 ? 1 : 0,
});

// Helper function to check if all permissions are disabled
export const hasAnyPermission = (permissions) => 
  permissions.access_view === 1 || 
  permissions.access_add === 1 || 
  permissions.access_edit === 1 || 
  permissions.access_delete === 1;

// Helper function to encrypt access permissions
export const encryptAccessPermissions = async (response) => ({
  icon: response.menu_icon,
  add: await encrypt(`${response.access_add}`),
  edit: await encrypt(`${response.access_edit}`),
  delete: await encrypt(`${response.access_delete}`),
  view: await encrypt(`${response.access_view}`)
});

// Helper function to process location data
export const processLocationData = (locations, domain, creator, today) => 
  locations.map(item => ({
    loc_domain: domain,
    loc_site: item.loc_site,
    loc_location: item.loc_loc || '',
    loc_desc: item.loc_desc,
    loc_status: item.loc_status,
    created_by: creator || 'system',
    created_at: today,
  }));
