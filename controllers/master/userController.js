import { dbHris, db, dbDMS } from "../../config/db.js";
import dayjs from "dayjs";
import * as dotenv from 'dotenv' ;
import { uploadFile,removeFile } from "../../helpers/ftp.js";
import { unlink } from 'node:fs';
import { decrypt, encrypt, getErrorResponse, objectToString } from "../../helpers/utils.js";
import { logger } from "../../helpers/logger.js";
dotenv.config();

  export const listUser = async (req, res) => {
    try {
      if (req.query.rowsPerPage == null) {
        let responseQuery = dbDMS("users")
          .select('name as account_nik','emp_id as account_username','email as account_email','first_name as account_name')
          .where("activated", 1)
          .whereNull('deleted_at')
        if (req.query.limit) {
          responseQuery.limit(req.query.limit);
        }
        if (req.query.code) {
          responseQuery.where('emp_id',req.query.code);
        }
        if (req.query.needle) {
          responseQuery.where('name', 'like', `%${req.query.needle}%`);
          responseQuery.orWhere("first_name", "like", `%${req.query.needle}%`);
        }
        const response=await responseQuery.orderBy("name");
        res.status(200).json(response);
      } else {
        const sorting = req.query.descending === "true" ? "desc" : "asc";
        const columnSort =
          req.query.sortBy === "desc"
            ? "name asc"
            : `${req.query.sortBy} ${sorting}`;

        const page = Math.floor(req.query.page);
        const response = await dbDMS('users as u')
            .select(
              'u.id',
              'u.name as account_nik',
              'u.emp_id as account_username',
              'u.email as account_email',
              'u.first_name as account_name',
              dbDMS.raw(`(SELECT TOP 1 jabatan FROM ${process.env.DB_HRIS}.dbo.ptl_hris WHERE Emp_Id = u.emp_id) as account_jabatan`),
              dbDMS.raw(`(SELECT TOP 1 bu_id FROM ${process.env.DB_HRIS}.dbo.ptl_hris WHERE Emp_Id = u.emp_id) as account_bu`)
            )
            .where("u.activated", 1)
            .whereNull("u.deleted_at")
            .where((query) => {
              if (req.query.filter != null) {
                query.orWhere("u.name", "like", `%${req.query.filter}%`);
                query.orWhere("u.emp_id", "like", `%${req.query.filter}%`);
                query.orWhere("u.email", "like", `%${req.query.filter}%`);
                query.orWhere("u.first_name", "like", `%${req.query.filter}%`);
              }
            })
          .orderByRaw(columnSort)
          .paginate({
            perPage: Math.floor(req.query.rowsPerPage),
            currentPage: page,
            isLengthAware: true,
          });

          for (const data of response.data) {
            data.account_username=await encrypt(data.account_username);
          }

        res.status(200).json(response);
      }
    } catch (error) {
      console.log(error)
      logger(error, 'GET /listUser', req.query);
      return res.status(406).json(getErrorResponse(error));
    }
  };

  export const listAksesDomain = async (req, res) => {
    // #swagger.tags = ['User']
    /* #swagger.security = [{
            "bearerAuth": []
          }] */
    // #swagger.description = 'Fungsi menampilkan list domain yang bisa diakses user'
    
    try {
      const empid = decrypt(req.query.empid)
      const response = await db("user_domain")
        .select("usd_domain as value",db.raw("usd_domain + ' - ' + domain_shortname as [desc]"))
        .innerJoin('mst_domain', function() {
          this.on('usd_domain', '=', 'domain_code');
        })
        .where("usd_empid", empid)
        .whereNull('user_domain.deleted_at')
        .orderByRaw("usd_domain,domain_shortname");
      res.status(200).json(response);
    } catch (error) {
      logger(error, 'GET /listAksesDomain', req.query);
      return res.status(406).json({
          type:'error',
          message: process.env.DEBUG == 1 ?error.message: `Aplikasi sedang mengalami gangguan, silahkan hubungi tim IT` ,
      });
    }
   
  }

 export const listUserMenuByRole = async (req, res) => {
    // #swagger.tags = ['User']
    /* #swagger.security = [{
            "bearerAuth": []
          }] */
    // #swagger.description = 'Fungsi menampilkan list akses menu user saat ini'
    try {
      const { empid:encryptedEmpid,domain } = req.query;
      const empid = decrypt(encryptedEmpid);
      
      // Get user's groups using new user_group table
      const userGroups = await dbDMS('user_group')
        .select('ugrp_group_id')
        .where({'ugrp_user_id':empid, 'ugrp_bu_id':domain})
        .whereNull('deleted_at');
      
      if(userGroups.length === 0) return res.status(200).json({data: []});
      
      const groupIds = userGroups.map(g => g.ugrp_group_id);

      // Get parent menus
      const parent = await dbDMS("mst_menu as a")
        .distinct("a.menu_parent", "menu_icon", "menu_id", "menu_link", "menu_name", "menu_order")
        .join(
          dbDMS("vw_menu_access")
            .distinct("parent")
            .whereIn("maccess_group_id", groupIds)
            .whereNull('deleted_at')
            .as("b"),
          function () {
            this.on("a.menu_id", "=", "b.parent");
          }
        )
        .whereNull('a.deleted_at')
        .orderBy("menu_order", "asc");

      // Get children for each parent
      for (const data of parent) {
        data.children = await dbDMS("vw_menu_access")
          .distinct(
            "mst_menu.menu_parent",
            "mst_menu.menu_icon",
            "mst_menu.menu_id",
            "mst_menu.menu_link",
            "mst_menu.menu_name",
            "mst_menu.menu_order",
            dbDMS.raw("0 as prior")
          )
          .innerJoin("mst_menu", "maccess_menuid", "menu_id")
          .leftJoin("collection_det", "coldet_menu", "mst_menu.menu_id")
          .whereNull("coldet_menu")
          .whereNull("collection_det.deleted_at")
          .whereNull("mst_menu.deleted_at")
          .where("mst_menu.menu_parent", data.menu_id)
          .whereIn("maccess_group_id", groupIds)
          .whereNull('vw_menu_access.deleted_at')
          .unionAll(function () {
            this.distinct(
              dbDMS.raw(`a.col_parent as menu_parent,a.col_icon as menu_icon,
        a.colid as menu_id,a.col_link as menu_link,
        a.col_name as menu_name, a.col_order as menu_order,1 as prior`)
            )
              .from("collection_menu as a")
              .innerJoin("collection_det as b", "b.coldet_colid", "a.colid")
              .innerJoin("menu_access as c", "c.maccess_menuid", "b.coldet_menu")
              .where("col_parent", data.menu_id)
              .whereNull("a.deleted_at")
              .whereNull("c.deleted_at")
              .whereIn("c.maccess_group_id", groupIds);
          })
          .as("a")
          .orderBy("prior", "asc")
          .orderBy("menu_order", "asc");
      }
    
      res.status(200).json({data: parent});
    } catch (error) {
      console.log(error);
      logger(error, 'GET /listUserMenuByRole', req.query);
      return res.status(406).json({type:'error',message:process.env.DEBUG == 1 ?error.message:`Aplikasi sedang mengalami gangguan, silahkan hubungi tim IT`});
    }
  };

  export const listUserSite = async (req, res) => {
    // #swagger.tags = ['PSAK General']
    /* #swagger.security = [{
            "bearerAuth": []
          }] */
    // #swagger.description = 'Fungsi menampilkan list site untuk selection'
    try {
      const domain = req.query.domain;
      const empid = decrypt(req.query.empid);
      const response = await db("user_site")
        .select("usite_site as value",db.raw("site_code + ' - '+ site_desc as description"),"usite_default as default")
        .innerJoin('mst_site', function() {
            this.on('usite_domain', '=', 'site_domain');
            this.on('usite_site', '=', 'site_code');
          })
        .where("usite_domain", domain)
        .where("usite_userid",empid)
        .orderBy("usite_default","desc")
        .orderBy("usite_site","asc");
      res.status(200).json(response);
    } catch (error) {
      logger(error, 'GET /listUserSite', req.query);
      return res.status(406).json({
          type:'error',
          message: process.env.DEBUG == 1 ?error.message:`Aplikasi sedang mengalami gangguan, silahkan hubungi tim IT`,
      });
    }
  
  }

  export const listDomain = async (req, res) => {
    // #swagger.tags = ['User']
    /* #swagger.security = [{
            "bearerAuth": []
          }] */
    // #swagger.description = 'Fungsi menampilkan list domain untuk selection'
    try {
      const response = await db("mst_domain").select("domain_code as value",db.raw("domain_code + ' - '+ domain_shortname as description")).where("domain_status","active").whereNull('deleted_at').orderBy("domain_code");
      if(req.query.param == null) return res.status(200).json(response);
      
      const userDomains = new Set((await db("user_domain").select("usd_domain").where("usd_empid",await decrypt(req.query.empid)).whereNull('deleted_at')).map(d => d.usd_domain));
      res.status(200).json(response.map(el => ({name:el.value,label:el.description,selected:userDomains.has(el.value)})));
    } catch (error) {
      return res.status(406).json({type:'error',message:process.env.DEBUG == 1 ?error.message:`Aplikasi sedang mengalami gangguan, silahkan hubungi tim IT`});
    }
  }

  export const saveUser = async (req, res) => {
    // #swagger.tags = ['User']
    /* #swagger.security = [{
            "bearerAuth": []
          }] */
    // #swagger.description = 'Update user pada aplikasi'
    const trx = await dbDMS.transaction();
    try { 
      const {empid,nik,creator,email,domain,grade,jabatan,nama,dept_id,dept,div_id,div,dir_id,dir}=req.body
      if (!empid) {
        await trx.rollback();
        return res.status(406).json({type:'error',message:`User ${nik} gagal disimpan`});
      }
      
      const empid_decrypt =  decrypt(empid)
      const creator_decrypt = decrypt(creator)
      const now = dayjs().format("YYYY-MM-DD HH:mm:ss")
      let action=null,dataString=null;
      if (await trx("master_user").where("account_username", empid_decrypt).first()) {
        await trx("master_user").where("account_username", empid_decrypt).update({account_nik:nik,account_email:email,account_bu:domain,account_dept_id:dept_id,account_dept_name:dept,account_div_id:div_id,account_div_name:div,account_dir_id:dir_id,account_dir_name:dir,account_grade:grade,account_active:'Active',account_jabatan:jabatan,account_name:nama,updated_at:now,deleted_at:null,deleted_by:null});
        dataString=objectToString({account_nik:nik,account_email:email,account_bu:domain,account_dept_id:dept_id,account_dept_name:dept,account_div_id:div_id,account_div_name:div,account_dir_id:dir_id,account_dir_name:dir,account_grade:grade,account_active:'Active',account_jabatan:jabatan,account_name:nama,updated_at:now,deleted_at:null,deleted_by:null});
        action = 'update';
      } else {
        await trx("master_user").insert({account_username:empid_decrypt,account_nik:nik,account_email:email,account_bu:domain,account_dept_id:dept_id,account_dept_name:dept,account_div_id:div_id,account_div_name:div,account_dir_id:dir_id,account_dir_name:dir,account_grade:grade,account_active:'Active',account_jabatan:jabatan,account_name:nama,created_by:creator_decrypt,created_at:now,updated_by:creator_decrypt,updated_at:now});
        dataString=objectToString({account_nik:nik,account_email:email,account_bu:domain,account_dept_id:dept_id,account_dept_name:dept,account_div_id:div_id,account_div_name:div,account_dir_id:dir_id,account_dir_name:dir,account_grade:grade,account_active:'Active',account_jabatan:jabatan,account_name:nama,created_by:creator_decrypt,created_at:now,updated_by:creator_decrypt,updated_at:now});
        action = 'insert';
      }

      // if (await trx("user_domain").where({usd_empid:empid_decrypt,usd_domain:domain}).first()) {
      //   await trx('user_domain').where({usd_empid:empid_decrypt,usd_domain:domain}).update({updated_by:creator_decrypt,updated_at:now,deleted_by:null,deleted_at:null});
      // } else {
      //   await trx('user_domain').insert({usd_empid:empid_decrypt,usd_domain:domain,created_by:creator_decrypt,created_at:now,updated_by:creator_decrypt,updated_at:now});
      // }

      // await trx("user_site").where("usite_userid", empid_decrypt).update({usite_default:0,updated_by:creator_decrypt,updated_at:now});

      // if (await trx('user_site').where({usite_userid:empid_decrypt,usite_site:site,usite_domain:domain}).first()) {
      //   await trx('user_site').where({usite_userid:empid_decrypt,usite_site:site,usite_domain:domain}).update({usite_default:1,updated_by:creator_decrypt,updated_at:now,deleted_at:null,deleted_by:null});
      // } else {
      //   await trx('user_site').insert({usite_userid:empid_decrypt,usite_site:site,usite_domain:domain,usite_default:1,created_by:creator_decrypt,created_at:now,updated_by:creator_decrypt,updated_at:now});
      // }
      await trx.commit();
      return res.json("sukses");
    } catch (error) {
      await trx.rollback();
      return res.status(406).json({type:'error',message:process.env.DEBUG == 1 ?error.message:`Aplikasi sedang mengalami gangguan, silahkan hubungi tim IT`});
    }
  };

  export const deleteUser = async (req, res) => {
    // #swagger.tags = ['User']
    /* #swagger.security = [{
            "bearerAuth": []
          }] */
    // #swagger.description = 'Fungsi untuk menghapus user'
    try {
      const now = dayjs().format("YYYY-MM-DD HH:mm:ss")
      await db("users").where('user_id',await decrypt(req.body.empid)).update({user_active:0,updated_at:now,updated_by:await decrypt(req.body.creator),deleted_at:now,deleted_by:await decrypt(req.body.creator)});
      return res.json("success");
    } catch (error) {
      return res.status(406).json({type:'error',message:process.env.DEBUG == 1 ?error.message:`Aplikasi sedang mengalami gangguan, silahkan hubungi tim IT`});
    }
  };

  export const saveAksesDomain = async (req, res) => {
     // #swagger.tags = ['User']
    /* #swagger.security = [{
            "bearerAuth": []
          }] */
    // #swagger.description = 'Fungsi untuk menyimpan menu akses domain'
    try {
        const empid = await decrypt(req.body.empid);
        const creator = await decrypt(req.body.creator);
        const now = dayjs().format("YYYY-MM-DD HH:mm:ss");

        await db("user_domain").where("usd_empid",empid).where("usd_domain",'<>',req.body.origin).update({deleted_at:now,deleted_by:creator});
        
        if (req.body.domain.length > 0){
          await Promise.all(req.body.domain.map(async (item) => {
            if (await db('user_domain').where({usd_domain:item,usd_empid:empid}).first()) {
              return db('user_domain').where({usd_domain:item,usd_empid:empid}).update({updated_at:now,updated_by:creator,deleted_at:null,deleted_by:null});
            } else {
              return db('user_domain').insert({usd_domain:item,usd_empid:empid,created_by:creator,created_at:now,updated_at:now,updated_by:creator});
            }
          }));
        }
        return res.json("sukses");
    } catch (error) {
      return res.status(406).json({type:'error',message:process.env.DEBUG == 1 ?error.message:`Aplikasi sedang mengalami gangguan, silahkan hubungi tim IT`});
    }
  };

 export const getHrisByNIK = async (req, res) => {
    // #swagger.tags = ['User']
    /* #swagger.security = [{
            "bearerAuth": []
          }] */
    // #swagger.description = 'Fungsi mendapatkan data user pada hris'
    try {
      const { nik,empid:encryptedEmpid } = req.query;
      const id = encryptedEmpid ? await decrypt(encryptedEmpid) : null;
      
      let hrisQuery = dbHris("portal.dbo.ptl_hris")
        .select("Emp_Id","user_email","employee_mgr_pk","user_newid","grade","user_name","map_div_pk","map_dept_pk","bu_id")
        .where('user_active','Active');
      
      if (nik) {
        hrisQuery = hrisQuery.where('user_newid', nik);
      } else {
        hrisQuery = hrisQuery.where('Emp_Id', id);
      }
      
      const hris = await hrisQuery.first();

      if (!hris){
        return res.status(406).json({
          type:'error',
          message: `User ${nik || id} sudah tidak ditemukan/tidak aktif`,
        });
      }else{
        
        // Check if user already exists in users table (new table)
        let users = await dbDMS("users")
        .select("emp_id","name","first_name","email")
        .where('emp_id', hris.Emp_Id)
        .whereNull('deleted_at')
        .first();
        
         if (users && nik){
         return res.status(406).json({
           type:'error',
           message: `User ${nik || id} sudah ada pada aplikasi ini`,
         });
        }else{
          let [jobHris, direktorat] = await Promise.all([
               dbHris("portal.dbo.ptl_hris as a")
              .select("a.Emp_Id","a.jabatan","a.employee_mgr_pk","a.map_dept_pk","a.map_div_pk","b.nama_div","d.nama_dept","c.map_dir_pk","a.bu_id")
              .leftJoin('portal.dbo.master_div as b', function() {
                  this.on('b.id_div', '=', 'a.map_div_pk')
              })
              .leftJoin('portal.dbo.mapping_dir_div_dept as c', function() {
                  this.on('c.map_dept_pk', '=', 'a.map_dept_pk')
                  .orOn('c.map_div_pk', '=', 'a.map_div_pk')
              })
              .leftJoin('portal.dbo.master_dept as d', function() {
                  this.on('d.id_dept', '=', 'a.map_dept_pk')
              })
              .where ('a.Emp_Id',hris.Emp_Id)
              .first(),
              dbHris("portal.dbo.master_dept_dir")
              .select("id_dir","nama_dir","nama_div")
              .where ('id_div',hris.map_div_pk)
              .first(),
              ]);
          if(jobHris && jobHris.map_dir_pk && jobHris.map_dir_pk!='0'){
            direktorat = await dbHris("portal.dbo.master_dir")
            .where ('direktorat_pk', jobHris.map_dir_pk)
            .first();
          }
          
          let empid = await encrypt(hris.Emp_Id)
          res.status(200).json({
            'type':'success',
            'empid':empid,
            'name':hris.user_name,
            'email':hris.user_email,
            'dept_id':hris.map_dept_pk=='0'?null:hris.map_dept_pk,
            'dept_name':hris.map_dept_pk == '0' ? null : (jobHris ? jobHris.nama_dept : null),
            'div_id':hris.map_div_pk=='0'?null:hris.map_div_pk,
            'div_name':hris.map_div_pk=='0'?null:(jobHris ? jobHris.nama_div : null),
            'dir_id':!direktorat?null:direktorat.direktorat_pk,
            'dir_name':!direktorat?null:direktorat.direktorat_name,
            'grade':hris.grade,
            'bu':hris.bu_id,
            'nik':hris.user_newid,
            'jabatan':jobHris?jobHris.jabatan:''
          });  
        }
      }
    } catch (error) {
      logger(error, 'GET /getHrisByNIK', req.query);
      return res.status(406).json({
          type:'error',
          message: process.env.DEBUG == 1 ?error.message:`Aplikasi sedang mengalami gangguan, silahkan hubungi tim IT`,
      });
    }
  };

export const getUserGroup = async (req, res) => {
  // #swagger.tags = ['User']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Get list of user group assignments'
  try {
    const { bu_id } = req.query;
    
    const data = await dbDMS('user_group as ug')
      .select(
        'ug.ugrp_id',
        'ug.ugrp_user_id',
        'ug.ugrp_group_id',
        'ug.ugrp_bu_id',
        'u.name',
        'u.email',
        'g.grp_name',
        'g.grp_code'
      )
      .innerJoin('users as u', 'ug.ugrp_user_id', 'u.emp_id')
      .innerJoin('group_aplikasi as g', 'ug.ugrp_group_id', 'g.grp_id')
      .where('ug.ugrp_bu_id', bu_id)
      .whereNull('ug.deleted_at')
      .orderBy('u.name', 'asc');
    
    res.status(200).json(data);
  } catch (error) {
    logger(error, 'GET /getUserGroup', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

export const getActiveUsers = async (req, res) => {
  // #swagger.tags = ['User']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Get list of active users'
  try {
    const users = await dbDMS('users')
      .select('id', 'name', 'first_name', 'email', 'emp_id')
      .where('activated', true)
      .whereNull('deleted_at')
      .orderBy('name', 'asc');
    
    res.status(200).json(users);
  } catch (error) {
    logger(error, 'GET /getActiveUsers', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

export const getGroups = async (req, res) => {
  // #swagger.tags = ['User']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Get list of groups'
  try {
    if (req.query.rowsPerPage == null) {
      // Simple list without pagination
      const groups = await dbDMS('group_aplikasi')
        .select('grp_id', 'grp_name', 'grp_code')
        .orderBy('grp_name', 'asc');
      
      res.status(200).json(groups);
    } else {
      // Paginated list
      const sorting = req.query.descending === "true" ? "desc" : "asc";
      const columnSort = req.query.sortBy === "desc" ? "grp_name asc" : `${req.query.sortBy} ${sorting}`;
      const page = Math.floor(req.query.page);
      
      const response = await dbDMS('group_aplikasi')
        .select('grp_id', 'grp_name', 'grp_code')
        .where((query) => {
          if (req.query.filter != null) {
            query.orWhere("grp_name", "like", `%${req.query.filter}%`);
            query.orWhere("grp_code", "like", `%${req.query.filter}%`);
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
    logger(error, 'GET /getGroups', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

export const saveUserGroup = async (req, res) => {
  // #swagger.tags = ['User']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Save user group assignment'
  const trx = await dbDMS.transaction();
  try {
    const { id, user_id, group_id, bu_id, creator } = req.body;
    const creator_decrypt = decrypt(creator);
    const now = dayjs().format("YYYY-MM-DD HH:mm:ss");
    
    if (id) {
      // Update
      await trx('user_group')
        .where('ugrp_id', id)
        .update({
          ugrp_group_id: group_id,
          ugrp_bu_id: bu_id,
          updated_by: creator_decrypt,
          updated_at: now,
        });
    } else {
      // Check if already exists
      const existing = await trx('user_group')
        .where({
          ugrp_user_id: user_id,
          ugrp_group_id: group_id,
          ugrp_bu_id: bu_id,
        })
        .whereNull('deleted_at')
        .first();
      
      if (existing) {
        await trx.rollback();
        return res.status(406).json({
          type: 'error',
          message: 'User already assigned to this group',
        });
      }
      
      // Insert
      await trx('user_group').insert({
        ugrp_user_id: user_id,
        ugrp_group_id: group_id,
        ugrp_bu_id: bu_id,
        created_by: creator_decrypt,
        created_at: now,
        updated_by: creator_decrypt,
        updated_at: now,
      });
    }
    
    await trx.commit();
    return res.json("sukses");
  } catch (error) {
    await trx.rollback();
    logger(error, 'POST /saveUserGroup', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

export const deleteUserGroup = async (req, res) => {
  // #swagger.tags = ['User']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Delete user group assignment'
  try {
    const { id, creator } = req.body;
    const creator_decrypt = decrypt(creator);
    const now = dayjs().format("YYYY-MM-DD HH:mm:ss");
    
    await dbDMS('user_group')
      .where('ugrp_id', id)
      .update({
        deleted_by: creator_decrypt,
        deleted_at: now,
      });
    
    return res.json("success");
  } catch (error) {
    logger(error, 'POST /deleteUserGroup', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

export const getUsers = async (req, res) => {
  // #swagger.tags = ['User']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Get all users from users table'
  try {
    if (req.query.rowsPerPage == null) {
      // Simple list without pagination
      const users = await dbDMS('users')
        .select('id', 'name', 'first_name', 'email', 'emp_id', 'activated')
        .whereNull('deleted_at')
        .orderBy('name', 'asc');
      
      res.status(200).json(users);
    } else {
      // Paginated list
      const sorting = req.query.descending === "true" ? "desc" : "asc";
      const columnSort = req.query.sortBy === "desc" ? "name asc" : `${req.query.sortBy} ${sorting}`;
      const page = Math.floor(req.query.page);
      
      const response = await dbDMS('users')
        .select('id', 'name', 'first_name', 'email', 'emp_id', 'activated')
        .whereNull('deleted_at')
        .where((query) => {
          if (req.query.filter != null) {
            query.orWhere("name", "like", `%${req.query.filter}%`);
            query.orWhere("first_name", "like", `%${req.query.filter}%`);
            query.orWhere("email", "like", `%${req.query.filter}%`);
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
    logger(error, 'GET /getUsers', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

export const saveUserData = async (req, res) => {
  // #swagger.tags = ['User']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Save or update user in users table'
  const trx = await dbDMS.transaction();
  try {
    const { id, nik, first_name, email, emp_id, activated, creator } = req.body;
    const creator_decrypt = decrypt(creator);
    const empid_decrypt = decrypt(emp_id);
    const now = dayjs().format("YYYY-MM-DD HH:mm:ss");
    
    if (id) {
      // Update existing user
      await trx('users')
        .where('id', id)
        .update({
          name: nik,
          first_name: first_name,
          email: email,
          emp_id: empid_decrypt,
          activated: activated,
          updated_at: now,
        });
    } else {
      // Check if user already exists
      const existing = await trx('users')
        .where('name', nik)
        .orWhere('emp_id', empid_decrypt)
        .whereNull('deleted_at')
        .first();
      
      if (existing) {
        await trx.rollback();
        return res.status(406).json({
          type: 'error',
          message: 'User with this NIK or Employee ID already exists',
        });
      }
      
      // Get max ID
      const maxIdResult = await trx('users').max('id as maxId').first();
      const newId = (maxIdResult.maxId || 0) + 1;
      
      // Insert new user
      await trx('users').insert({
        id: newId,
        name: nik,
        first_name: first_name,
        email: email,
        emp_id: empid_decrypt,
        activated: activated !== undefined ? activated : true,
        created_at: now,
        updated_at: now,
      });
    }
    
    await trx.commit();
    return res.json("sukses");
  } catch (error) {
    await trx.rollback();
    logger(error, 'POST /saveUserData', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

export const toggleUserActivation = async (req, res) => {
  // #swagger.tags = ['User']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Toggle user activation status'
  try {
    const { id, activated, creator } = req.body;
    const creator_decrypt = decrypt(creator);
    const now = dayjs().format("YYYY-MM-DD HH:mm:ss");
    
    await dbDMS('users')
      .where('id', id)
      .update({
        activated: activated,
        updated_at: now,
      });
    
    return res.json("success");
  } catch (error) {
    logger(error, 'POST /toggleUserActivation', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

export const getUserGroupsByUser = async (req, res) => {
  // #swagger.tags = ['User']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Get groups assigned to a specific user'
  try {
    const { user_id, bu_id } = req.query;
    
    const groups = await dbDMS('user_group as ug')
      .select(
        'ug.ugrp_id',
        'ug.ugrp_user_id',
        'ug.ugrp_group_id',
        'ug.ugrp_bu_id',
        'g.grp_name',
        'g.grp_code'
      )
      .innerJoin('group_aplikasi as g', 'ug.ugrp_group_id', 'g.grp_id')
      .where('ug.ugrp_user_id', user_id)
      .where('ug.ugrp_bu_id', bu_id)
      .whereNull('ug.deleted_at')
      .orderBy('g.grp_name', 'asc');
    
    res.status(200).json(groups);
  } catch (error) {
    logger(error, 'GET /getUserGroupsByUser', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
}

export const saveGroup = async (req, res) => {
  // #swagger.tags = ['User']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Save or update group'
  const trx = await dbDMS.transaction();
  try {
    const { grp_id, grp_name, grp_code, grp_app_id, creator: encryptedCreator } = req.body;
    const now = dayjs().format("YYYY-MM-DD HH:mm:ss");
    const creatorEmpId = decrypt(encryptedCreator);
    
    // Lookup user ID from users table
    const user = await trx('users')
      .select('id')
      .where('emp_id', creatorEmpId)
      .first();
    
    if (!user) {
      await trx.rollback();
      return res.status(406).json({
        type: 'error',
        message: 'User not found'
      });
    }
    
    const creatorId = user.id;
    
    // Check if group code already exists (for new or different group)
    const existingGroup = await trx('group_aplikasi')
      .where('grp_code', grp_code)
      .where('grp_id', '<>', grp_id || 0)
      .first();
    
    if (existingGroup) {
      await trx.rollback();
      return res.status(406).json({
        type: 'error',
        message: 'Group code already exists'
      });
    }
    
    const groupData = {
      grp_name,
      grp_code,
      grp_app_id: grp_app_id || 8,
      grp_updated_by: creatorId,
      updated_at: now
    };
    
    if (grp_id) {
      // Update existing group
      await trx('group_aplikasi')
        .where('grp_id', grp_id)
        .update(groupData);
    } else {
      // Insert new group
      await trx('group_aplikasi').insert({
        ...groupData,
        grp_created_by: creatorId,
        created_at: now
      });
    }
    
    await trx.commit();
    res.status(200).json({ message: 'sukses' });
  } catch (error) {
    await trx.rollback();
    logger(error, 'POST /saveGroup', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
}

export const deleteGroup = async (req, res) => {
  // #swagger.tags = ['User']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Delete group (hard delete with dependency check)'
  const trx = await dbDMS.transaction();
  try {
    const { grp_id, creator: encryptedCreator } = req.body;
    const creatorEmpId = decrypt(encryptedCreator);
    
    // Lookup user ID from users table
    const user = await trx('users')
      .select('id')
      .where('emp_id', creatorEmpId)
      .first();
    
    if (!user) {
      await trx.rollback();
      return res.status(406).json({
        type: 'error',
        message: 'User not found'
      });
    }
    
    // Check if group is assigned to any users
    const usersCount = await trx('user_group')
      .where('ugrp_group_id', grp_id)
      .whereNull('deleted_at')
      .count('* as count')
      .first();
    
    if (usersCount.count > 0) {
      await trx.rollback();
      return res.status(406).json({
        type: 'error',
        message: `Cannot delete group. It is assigned to ${usersCount.count} user(s)`
      });
    }
    
    // Check if group has menu access
    const menuAccessCount = await trx('menu_access')
      .where('maccess_group_id', grp_id)
      .whereNull('deleted_at')
      .count('* as count')
      .first();
    
    if (menuAccessCount.count > 0) {
      await trx.rollback();
      return res.status(406).json({
        type: 'error',
        message: `Cannot delete group. It has ${menuAccessCount.count} menu access permission(s). Please remove menu access first.`
      });
    }
    
    // Hard delete the group (no dependencies found)
    await trx('group_aplikasi')
      .where('grp_id', grp_id)
      .delete();
    
    await trx.commit();
    res.status(200).json({ message: 'sukses' });
  } catch (error) {
    await trx.rollback();
    logger(error, 'DELETE /deleteGroup', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};