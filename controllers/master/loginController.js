//import { Menu } from "../model/menu.js";
//import { Users } from "../model/users.js";

import { dbHris, db, dbDMS } from "../../config/db.js";
import { decrypt, encrypt, getErrorResponse, mySimpleCrypt } from "../../helpers/utils.js";
import { logger } from "../../helpers/logger.js";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import { createUserResponse, logAccess } from "../../helpers/master/login.js";

dotenv.config();


export const login = async (req, res) => {
  // #swagger.tags = ['User']
  /* #swagger.security = [{
              "bearerAuth": []
      }] */
  // #swagger.description = 'Fungsi untuk validasi login'
  try {
    const { nik, pass, url } = req.body;
    
    // Query users table (WJS) - name field stores NIK
    const users = await dbDMS("users")
      .select("id", "name", "first_name", "email", "activated", "emp_id")
      .where('name', nik)
      .first();
      
    if (!users) return res.status(406).json({type:'error',message:`User ${nik} belum terdaftar pada aplikasi ini`});

    // Check if user is active (activated bit type: true/false)
    if (!users.activated) {
      return res.status(406).json({type:'error',message:`User ${nik} tidak aktif`});
    }

    // Lookup in portal using emp_id if exists, otherwise use NIK
    const lookupValue = users.emp_id || nik;
    
    const hris = await dbHris("portal.dbo.ptl_hris as a")
              .select("a.Emp_Id","a.user_pass","a.user_newid","a.grade","a.jabatan","a.employee_mgr_pk","a.map_dept_pk","a.map_div_pk","a.bu_id","b.nama_div","d.nama_dept","c.map_dir_pk")
              .leftJoin('master_div as b', function() {
                  this.on('b.id_div', '=', 'a.map_div_pk')
              })
              .leftJoin('mapping_dir_div_dept as c', function() {
                  this.on('c.map_dept_pk', '=', 'a.map_dept_pk')
                  .orOn('c.map_div_pk', '=', 'a.map_div_pk')
              })
              .leftJoin('master_dept as d', function() {
                  this.on('d.id_dept', '=', 'a.map_dept_pk')
              })
              .where('user_active','Active')
              .where('Emp_Id', lookupValue)
              .first()
    
    if (!hris) {
      await dbDMS("users").where('id', users.id).update({activated: false});
      return res.status(406).json({type:'error',message:`User ${nik} sudah tidak aktif`});
    }

    const direktorat = await dbHris("master_dir")
            .where ('direktorat_pk', hris.map_dir_pk)
            .first();

    if (process.env.ENVIRONMENT === 'PRODUCTION' && hris.user_pass !== await mySimpleCrypt(pass)) {
      return res.status(406).json({type:'error',message:`NIK/Password tidak sesuai`});
    }

    const [, resPortal] = await Promise.all([
      dbDMS("users").where('id', users.id).update({
        name: hris.user_newid, // NIK
        emp_id: hris.Emp_Id
      }),
      dbHris("ptl_policy").where("id",0).first()
    ]);

    const token = jwt.sign({user: hris.Emp_Id}, process.env.TOKEN, {expiresIn: resPortal?.idle_time || 3600000});
    
    // Log access
    await dbDMS("log_akses").insert({
      empid: hris.Emp_Id,
      nik: hris.user_newid,
      status: "login",
      keterangan: "user",
      nama_url: url || '/wjs',
    });
    
    // Return response with portal organizational data
    res.status(200).json({
      message: "success",
      data: {
        nama: users.first_name,
        empid: encrypt(hris.Emp_Id),
        nik: hris.user_newid,
        grade: hris.grade,
        jabatan: hris.jabatan,
        domain: hris.bu_id, // BU ID as domain for styling
        bu_id: hris.bu_id,
        dept_id: hris.map_dept_pk,
        dept_name: hris.nama_dept,
        div_id: hris.map_div_pk,
        div_name: hris.nama_div,
        dir_id: direktorat?.direktorat_pk,
        dir_name: direktorat?.direktorat_name,
        role: encrypt('0'),
        super: encrypt('0'),
        token: token,
        idle: process.env.ENVIRONMENT === 'PRODUCTION' ? (resPortal?.idle_time || 3600000) : 3600000,
      },
    });
  } catch (error) {
    logger(error, 'POST /login', req.body);
    return res.status(406).json(getErrorResponse(error));
  } 
};

export const refresh_token = async (req, res) => {
  // #swagger.tags = ['User']
  /* #swagger.security = [{
                "bearerAuth": []
        }] */
  // #swagger.description = 'Fungsi untuk refresh token'
  try {
    const response = await db("users")
      .where("user_id", req.body.empid)
      .first();

    const resPortal = await dbHris("ptl_policy").where("id", 0).first();
    let token = jwt.sign({ user: response.user_id }, process.env.TOKEN, {
      expiresIn: resPortal.idle_time,
    });
    //pakai .toSQL().toNative() untuk mengecek query dalam format sql
    res.status(200).json({ token: token });
  } catch (error) {
    logger(error, 'POST /refresh_token', req.body);
    return res.status(406).json({
      type:'error',
      message: process.env.DEBUG == 1 ?error.message:`Aplikasi sedang mengalami gangguan, silahkan hubungi tim IT`,
  });
  }
};

export const logout = async (req, res) => {
   // #swagger.tags = ['User']
  /* #swagger.security = [{
                "bearerAuth": []
        }] */
  // #swagger.description = 'Fungsi untuk save log aktivitas saat logout'
  try {
    const { empid: encryptedEmpid, note, url } = req.body.params;
    const empid = decrypt(encryptedEmpid);
    
    const users = await dbDMS("users")
      .select("emp_id", "name", "first_name")
      .where('emp_id', empid)
      .first();
    
    if (users) {
      await dbDMS("log_akses").insert({
        empid: users.emp_id,
        nik: users.name,
        status: "logout",
        keterangan: note,
        nama_url: url,
      });
    }
    
    return res.json("sukses");
  }catch (error) {
    logger(error, 'POST /logout', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
}


export const login_portal = async (req, res) => {
  
  // #swagger.tags = ['User']
  /* #swagger.security = [{
              "bearerAuth": []
      }] */
  // #swagger.description = 'Fungsi untuk validasi login via portal'
 try {
    let users = await db("users")
   .select("user_id","user_nik","user_name","user_domain","user_site","user_role")
   .where ('user_id',req.body.nik)
   .first();
   //return res.status(200).json(users);
    if (!users){
    return res.status(406).json({
      type:'error',
      message: `User belum terdaftar pada aplikasi ini`,
    });
   }
   
   let hris = await dbHris("portal.dbo.ptl_hris")
   .select("Emp_Id","user_pass",'user_newid','grade','jabatan')
   .where ('Emp_Id',users.user_id)
   .where('user_active','Active')
   .first();
   if (!hris){
    //update status user
    await db("users")
    .where ('user_id',req.body.nik)
    .update({
      'user_active':0
    });

    return res.status(406).json({
      type:'error',
      message: `User sudah tidak aktif`,
    });
   }else{
    await db("users")
    .where ('user_id',req.body.nik)
    .update({
      'user_active':1
    });
   }
   
   let jabatan = hris.jabatan;

   await db("users")
   .where ('user_id',req.body.nik)
   .update({
     'user_nik':hris.user_newid,
     'user_grade':hris.grade,
     'user_jabatan':jabatan
   });
  
   let unit = await db("domain")
   .select("domain_shortname")
   .where ('domain_code',users.user_domain)
   .first();

   const resPortal = await dbHris("ptl_policy").where("id", 0).first();
   let token = jwt.sign({ user: users.user_id }, process.env.TOKEN, {
     expiresIn: resPortal.idle_time,
   });
  
   await dbDMS("log_akses").insert({
    empid:users.user_id,
    nik: hris.user_newid,
    status: "login",
    keterangan: "user",
    nama_url:req.body.url,
  });
  res.status(200).json({
    message: "success",
    data: {
      nama: users.user_name,
      unit: unit.domain_shortname,
      empid: encrypt(users.user_id),
      domain: users.user_domain,
      nik:users.user_nik,
      site:users.user_site,
      token: token,
      role:encrypt(users.user_role || ''),
      idle: resPortal.idle_time,
    },
  });
   
} catch (error) {
  return res.status(406).json({
    type:'error',
    message: process.env.DEBUG == 1 ?error.message: `Aplikasi sedang mengalami gangguan, silahkan hubungi tim IT` ,
});
} 
};
