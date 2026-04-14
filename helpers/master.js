import dayjs from "dayjs";
import isSameOrBefore from "dayjs/plugin/isSameOrBefore.js";
import {  db} from "../config/db.js";

export const helperUsers = async(empid) => {
    const users = await db("users").where('user_id', empid).first();
    return users;
};

export const helperRDNumber = async() => {
    var trn_request = await db.select(db.raw('dbo.[GENERATE_NO_RD]() as trn_code_rd')).first()
    return trn_request;
};

export const helperDomain = async(domain) => {
    const mst_domain = await db("mst_domain").where('domain_code', domain).first();
    return mst_domain;
};

export const helperKategori = async(cat_id) => {
    const mst_kategori = await db("mst_kategori").where('cat_id', cat_id).first();
    return mst_kategori;
};

export const helperSuperior = async (empid) => {
  const superior = await db("vw_map_employee_superior").where('employee_pk', empid).first();

  let trn_appv_user = '', trn_appv_user_lvl = ''
  if(superior.approver_sh == ''){
    if(superior.approver_dh == ''){
      if(superior.approver_divhead == ''){
        if(superior.approver_chief == ''){
          trn_appv_user = superior.approver_dir
          trn_appv_user_lvl = superior.grade
        }
        else{
          trn_appv_user = superior.approver_chief
          trn_appv_user_lvl = superior.grade
        }
      }
      else{
        trn_appv_user = superior.approver_divhead
        trn_appv_user_lvl = superior.grade
      }
    }
    else{
      trn_appv_user = superior.approver_dh
      trn_appv_user_lvl = superior.grade
    }
  }
  else{
    trn_appv_user = superior.approver_sh
    trn_appv_user_lvl = superior.grade
  }
  return {'user': trn_appv_user, 'level': trn_appv_user_lvl};
};