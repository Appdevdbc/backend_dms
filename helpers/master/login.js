import { db, dbDMS } from "../../config/db.js";
import { encrypt } from "../utils.js";

export const createUserResponse = (users, token, idle, no_tiket = null, flag = null, tiket = null) => ({
  message: "success",
  data: {
    nama: users.account_name,
    unit: users?.account_bu || null,
    empid: encrypt(users.account_username),
    domain: users.account_bu,
    bu_id: users.account_bu,
    bu_name: users.bu_name,
    div_id: users.account_div_id,
    div_name: users.account_div_name,
    dept_name: users.account_dept_name,
    dir_id: users.account_dir_id,
    dir_name: users.account_dir_name,
    nik: users.account_nik,
    site: null,
    role: encrypt('0'),
    super: encrypt('0'),
    token,
    idle,
    ...(no_tiket && { no_tiket }),
    ...(flag && { flag }),
    ...(tiket && { tiket }),
  },
});

// Helper function to log access
export const logAccess = async (users, hris, url) => {
  await dbDMS("log_akses").insert({
    empid: users.account_username,
    nik: hris.user_newid,
    status: "login",
    keterangan: "user",
    nama_url: url,
  });
};