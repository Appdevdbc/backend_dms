import { db, dbDMS, dbHris } from "../../config/db.js";
import dayjs from "dayjs";
import * as dotenv from 'dotenv';
import { uploadToFTP, deleteFromFTP } from "../../helpers/ftp.js";
import { unlink } from 'node:fs';
import { decrypt, encrypt, getErrorResponse, objectToString } from "../../helpers/utils.js";
import { logger } from "../../helpers/logger.js";
dotenv.config();

export const listUser = async (req, res) => {
  try {
    if (req.query.rowsPerPage == null) {
      let responseQuery = dbDMS("mUser as u")
        .select(
          'u.user_nik',
          'u.emp_id as user_name',
          'v.user_email as account_email',
          'v.user_name as account_name',
          'v.user_active as account_active'
        )
        .leftJoin('portal.dbo.ptl_hris as v', 'v.Emp_Id', 'u.emp_id')
        .whereNull('u.deleted_at')
      if (req.query.limit) {
        responseQuery.limit(req.query.limit);
      }
      if (req.query.code) {
        responseQuery.where('u.emp_id', req.query.code);
      }
      if (req.query.needle) {
        responseQuery.where(function () {
          this.where('u.user_nik', 'like', `%${req.query.needle}%`)
            .orWhere('v.user_name', 'like', `%${req.query.needle}%`);
        });
      }
      responseQuery = responseQuery.orderBy("u.user_nik");

      // Log SQL query
      // console.log('=== listUser Query (No Pagination) ===');
      // console.log(responseQuery.toSQL().toNative());
      // console.log('=====================================');

      const response = await responseQuery;
      res.status(200).json(response);
    } else {
      const sorting = req.query.descending === "true" ? "desc" : "asc";
      const columnSort =
        req.query.sortBy === "desc"
          ? "u.user_nik asc"
          : req.query.sortBy === "account_name"
            ? `v.user_name ${sorting}`
            : req.query.sortBy === "account_email"
              ? `v.user_email ${sorting}`
              : req.query.sortBy === "divisi_name"
                ? `div.divisi_name ${sorting}`
                : req.query.sortBy === "dept_name"
                  ? `dept.dept_name ${sorting}`
                  : req.query.sortBy === "role_name"
                    ? `role.role_name ${sorting}`
                    : `u.user_nik ${sorting}`;

      const page = Math.floor(req.query.page);
      let paginatedQuery = dbDMS('mUser as u')
        .select(
          'u.user_id',
          'u.user_nik as user_nik',
          'u.user_empid as emp_id',
          'u.user_name as user_name',
          'u.user_domain as account_bu',
          'u.user_email as account_email',
          'u.user_name as account_name',
          'v.jabatan as account_jabatan',
          'v.user_active as account_active',
          'div.divisi_name as divisi_name',
          'dept.dept_name as dept_name',
          'role.grp_name as role_name',
          'u.user_iddiv',
          'u.user_iddept',
          'u.user_role'
        )
        .leftJoin('portal.dbo.ptl_hris as v', 'v.Emp_Id', 'u.user_empid')
        .leftJoin('mDivisi as div', 'div.divisi_iddiv', 'u.user_iddiv')
        .leftJoin('mDept as dept', 'dept.dept_id', 'u.user_iddept')
        .leftJoin('group_aplikasi as role', 'role.grp_id', 'u.user_role')
        .where((query) => {
          if (req.query.filter != null) {
            query.orWhere("u.user_nik", "like", `%${req.query.filter}%`);
            query.orWhere("u.user_empid", "like", `%${req.query.filter}%`);
            query.orWhere("v.user_name", "like", `%${req.query.filter}%`);
            query.orWhere("v.user_email", "like", `%${req.query.filter}%`);
          }
        })
        .orderByRaw(columnSort);

      // Log SQL query before pagination
      // console.log('=== listUser Query (With Pagination) ===');
      // console.log(paginatedQuery.toSQL().toNative());
      // console.log('Page:', page, 'RowsPerPage:', req.query.rowsPerPage);
      // console.log('=========================================');

      const response = await paginatedQuery.paginate({
        perPage: Math.floor(req.query.rowsPerPage),
        currentPage: page,
        isLengthAware: true,
      });

      // Encrypt user_name only if it's not null
      for (const data of response.data) {
        if (data.user_name) {
          data.user_name = await encrypt(data.user_name);
        }
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
      .select("usd_domain as value", db.raw("usd_domain + ' - ' + domain_shortname as [desc]"))
      .innerJoin('mst_domain', function () {
        this.on('usd_domain', '=', 'domain_code');
      })
      .where("usd_empid", empid)
      .whereNull('user_domain.deleted_at')
      .orderByRaw("usd_domain,domain_shortname");
    res.status(200).json(response);
  } catch (error) {
    logger(error, 'GET /listAksesDomain', req.query);
    return res.status(406).json({
      type: 'error',
      message: process.env.DEBUG == 1 ? error.message : `Aplikasi sedang mengalami gangguan, silahkan hubungi tim IT`,
    });
  }

}

export const listUserMenuByRoleOld = async (req, res) => {
  // #swagger.tags = ['User']
  /* #swagger.security = [{
          "bearerAuth": []
        }] */
  // #swagger.description = 'Fungsi menampilkan list akses menu user saat ini'
  try {
    const { empid: encryptedEmpid, domain } = req.query;
    const empid = decrypt(encryptedEmpid);

    const mUser = await dbDMS('mUser')
      .select('user_role', 'user_id')
      .where({ 'user_empid': empid })
      .first();

    const parentQuery = dbDMS('mAkses as a')
      .select(
        'b.menu_id',
        'b.menu_name',
        'b.menu_link',
        'b.menu_icon',
        db.raw("0 as menu_order"),
        db.raw("case when b.menu_parent = 0 then null else b.menu_parent end as menu_parent")
      )
      .innerJoin('mMenu as b', function () {
        this.on(dbDMS.raw(`b.menu_id = a.akses_main_menu`));
      })
      .where('a.akses_user', mUser.user_id);

    // Log SQL query
    // console.log('=== listUserMenuByRole Query ===');
    // console.log(parentQuery.toSQL().toNative());
    // console.log('=====================================');

    const parent = await parentQuery;

    // Get children for each parent
    for (const data of parent) {
      // Get sub-menu children
      const subMenus = await dbDMS('mAkses as a')
        .select(
          'b.menu_id',
          'b.menu_name',
          'b.menu_link',
          'b.menu_icon',
          db.raw("0 as menu_order"),
          'b.menu_parent',
          dbDMS.raw("0 as prior")
        )
        .innerJoin('mMenu as b', function () {
          this.on(dbDMS.raw(`b.menu_id = a.akses_sub_menu`));
        })
        .where("b.menu_parent", data.menu_id)
        .where('a.akses_user', mUser.user_id);

      // Get department children (if parent menu is "Departement")
      let deptMenus = [];
      if (data.menu_name === 'Departement' || data.menu_link === 'departement') {
        deptMenus = await dbDMS('mAkses as a')
          .select(
            db.raw("CAST(b.dept_id as varchar) as menu_id"),
            db.raw("b.dept_name as menu_name"),
            db.raw("'dept/' + CAST(b.dept_seo as varchar) as menu_link"),
            db.raw("'description' as menu_icon"),
            db.raw("0 as menu_order"),
            db.raw("? as menu_parent", [data.menu_id]),
            dbDMS.raw("1 as prior")
          )
          .innerJoin('mDept as b', function () {
            this.on(dbDMS.raw(`b.dept_id = a.akses_dept`));
          })
          .where('a.akses_user', mUser.user_id)
          .whereNotNull('a.akses_dept');
      }

      // Combine sub-menus and departments, sort by prior then menu_order
      data.children = [...subMenus, ...deptMenus].sort((a, b) => {
        if (a.prior !== b.prior) return a.prior - b.prior;
        return a.menu_order - b.menu_order;
      });
    }

    res.status(200).json({ data: parent });
  } catch (error) {
    console.log(error);
    logger(error, 'GET /listUserMenuByRole', req.query);
    return res.status(406).json({ type: 'error', message: process.env.DEBUG == 1 ? error.message : `Aplikasi sedang mengalami gangguan, silahkan hubungi tim IT` });
  }
};

export const listUserMenuByRole = async (req, res) => {
  // #swagger.tags = ['User']
  /* #swagger.security = [{
          "bearerAuth": []
        }] */
  // #swagger.description = 'Fungsi menampilkan list akses menu user saat ini'
  try {
    const { empid: encryptedEmpid, domain } = req.query;
    const empid = decrypt(encryptedEmpid);

    // Get user's groups using new user_group table
    const userGroupsQuery = dbDMS('mUser')
      .select('user_role')
      .where({ 'user_empid': empid });

    // Show raw SQL query for userGroups
    // console.log('=== listUserMenuByRole - Get User Groups Query ===');
    // console.log('Raw SQL Query:', userGroupsQuery.toSQL().sql);
    // console.log('Query Bindings:', userGroupsQuery.toSQL().bindings);
    // console.log('====================================================');

    const userGroups = await userGroupsQuery;
    // .whereNull('deleted_at');

    if (userGroups.length === 0) return res.status(200).json({ data: [] });

    const groupIds = userGroups.map(g => g.user_role);

    // Get mUser data for the user
    const mUser = await dbDMS('mUser')
      .select('user_id', 'user_domain')
      .where({ 'user_empid': empid })
      .first();

    if (!mUser) return res.status(404).json({ message: 'User tidak ditemukan' });

    // Get parent menus with UNION for Departement menu
    const parentQuery = dbDMS.raw(`
      select distinct [a].[menu_parent], [menu_icon], [menu_id], [menu_link], [menu_name] 
      from [mMenu] as [a] 
      inner join (
        select distinct [parent] 
        from [vw_menu_access] 
        where [maccess_group_id] in (${groupIds.join(',')}) 
        and [deleted_at] is null
      ) as [b] 
      on [a].[menu_id] = [b].[parent]
      union
      select distinct [menu_parent], [menu_icon], [menu_id], [menu_link], [menu_name] 
      from [mMenu] m
      where menu_link = 'divisi'
      and menu_name = ?
      /*
      and (
        select
          count(a.dept_id)
        from 
          mDept a
          inner join mAkses b
            on a.dept_id = b.akses_dept
        where
          b.akses_user = ?
          and a.dept_domain = m.menu_name
      ) > 0
      */
    `, [mUser.user_domain, mUser.user_id]);

    // Show raw SQL query for parent menus
    // console.log('=== listUserMenuByRole - Get Parent Menus Query (UNION) ===');
    // console.log('Raw SQL Query:', parentQuery.sql);
    // console.log('Query Bindings:', parentQuery.bindings);
    // console.log('Group IDs:', groupIds);
    // console.log('User ID:', mUser.user_id);
    // console.log('=============================================================');

    const parent = await parentQuery;
    // .whereNull('a.deleted_at')
    // .orderBy("menu_order", "asc");

    // Get children for each parent
    for (const data of parent) {
      // Build query for sub-menus (from vw_menu_access)
      const subMenusQuery = dbDMS("vw_menu_access")
        .distinct(
          "mMenu.menu_parent",
          "mMenu.menu_icon",
          "mMenu.menu_id",
          "mMenu.menu_link",
          "mMenu.menu_name",
          dbDMS.raw("0 as menu_order"),
          dbDMS.raw("0 as prior")
        )
        .innerJoin("mMenu", "maccess_menuid", "menu_id")
        .leftJoin("collection_det", "coldet_menu", "mMenu.menu_id")
        .whereNull("coldet_menu")
        .whereNull("collection_det.deleted_at")
        .where("mMenu.menu_parent", data.menu_id)
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
        .orderBy("prior", "asc");

      // Execute query to get sub-menus
      const subMenus = await subMenusQuery;

      // Get department children (if parent menu is "Departement")
      let deptMenus = [];
      if (data.menu_link === 'divisi') {
        // deptMenus = await dbDMS('mAkses as a')
        //   .select(
        //     dbDMS.raw("CAST(b.dept_id as varchar) as menu_id"),
        //     dbDMS.raw("b.dept_name as menu_name"),
        //     dbDMS.raw("'dept/' + CAST(b.dept_seo as varchar) as menu_link"),
        //     dbDMS.raw("'description' as menu_icon"),
        //     dbDMS.raw("0 as menu_order"),
        //     dbDMS.raw("? as menu_parent", [data.menu_id]),
        //     dbDMS.raw("1 as prior")
        //   )
        //   .innerJoin('mDept as b', function () {
        //     this.on(dbDMS.raw(`b.dept_id = a.akses_dept`));
        //   })
        //   .where('a.akses_user', mUser.user_id)
        //   .whereNotNull('a.akses_dept');

        const deptQuery = dbDMS('mDept as b')
          .select(
            dbDMS.raw("CAST(b.dept_id as varchar) as menu_id"),
            dbDMS.raw("b.dept_name as menu_name"),
            dbDMS.raw("'dept/' + CAST(b.dept_seo as varchar) as menu_link"),
            dbDMS.raw("'description' as menu_icon"),
            dbDMS.raw("0 as menu_order"),
            dbDMS.raw("? as menu_parent", [data.menu_id]),
            dbDMS.raw("1 as prior")
          )
          .innerJoin('mAkses as a', 'b.dept_id', 'a.akses_dept')
          .where('b.dept_domain', data.menu_name)
          .where('a.akses_user', mUser.user_id);

        // Show raw SQL query for department menus
        console.log('=== listUserMenuByRole - Get Department Menus Query ===');
        console.log('Raw SQL Query:', deptQuery.toSQL().sql);
        console.log('Query Bindings:', deptQuery.toSQL().bindings);
        console.log('Parent Menu Name:', data.menu_name);
        console.log('User ID:', mUser.user_id);
        console.log('===========================================================');

        deptMenus = await deptQuery;
      }

      // Combine sub-menus and departments, sort by prior then menu_order
      data.children = [...subMenus, ...deptMenus].sort((a, b) => {
        if (a.prior !== b.prior) return a.prior - b.prior;
        return a.menu_order - b.menu_order;
      });

      // Show raw SQL query for children (only for first parent to avoid too much logging)
      // if (parent.indexOf(data) === 0) {
      //   console.log('=== listUserMenuByRole - Get Children Query (First Parent) ===');
      //   console.log('Parent Menu ID:', data.menu_id);
      //   console.log('Sub-menus count:', subMenus.length);
      //   console.log('Dept menus count:', deptMenus.length);
      //   console.log('===============================================================');
      // }
    }

    res.status(200).json({ data: parent });
  } catch (error) {
    console.log(error);
    logger(error, 'GET /listUserMenuByRole', req.query);
    return res.status(406).json({ type: 'error', message: process.env.DEBUG == 1 ? error.message : `Aplikasi sedang mengalami gangguan, silahkan hubungi tim IT` });
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
      .select("usite_site as value", db.raw("site_code + ' - '+ site_desc as description"), "usite_default as default")
      .innerJoin('mst_site', function () {
        this.on('usite_domain', '=', 'site_domain');
        this.on('usite_site', '=', 'site_code');
      })
      .where("usite_domain", domain)
      .where("usite_userid", empid)
      .orderBy("usite_default", "desc")
      .orderBy("usite_site", "asc");
    res.status(200).json(response);
  } catch (error) {
    logger(error, 'GET /listUserSite', req.query);
    return res.status(406).json({
      type: 'error',
      message: process.env.DEBUG == 1 ? error.message : `Aplikasi sedang mengalami gangguan, silahkan hubungi tim IT`,
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
    const response = await db("mst_domain").select("domain_code as value", db.raw("domain_code + ' - '+ domain_shortname as description")).where("domain_status", "active").whereNull('deleted_at').orderBy("domain_code");
    if (req.query.param == null) return res.status(200).json(response);

    const userDomains = new Set((await db("user_domain").select("usd_domain").where("usd_empid", await decrypt(req.query.empid)).whereNull('deleted_at')).map(d => d.usd_domain));
    res.status(200).json(response.map(el => ({ name: el.value, label: el.description, selected: userDomains.has(el.value) })));
  } catch (error) {
    return res.status(406).json({ type: 'error', message: process.env.DEBUG == 1 ? error.message : `Aplikasi sedang mengalami gangguan, silahkan hubungi tim IT` });
  }
}

export const saveUser = async (req, res) => {
  // #swagger.tags = ['User']
  /* #swagger.security = [{
          "bearerAuth": []
        }] */
  // #swagger.description = 'Update user pada aplikasi'
  // console.log(req); return false;
  const trx = await dbDMS.transaction();
  try {
    const { id, empid, nik, creator, email, domain, role, jabatan, nama, dept_id, dept, divisi, dir_id, dir } = req.body

    if (!empid) {
      await trx.rollback();
      return res.status(406).json({ type: 'error', message: `User ${nik} gagal disimpan` });
    }

    let mDivisi = await dbDMS("mDivisi")
      .select("divisi_domain")
      .where('divisi_iddiv', divisi)
      .first();

    const now = dayjs().format("YYYY-MM-DD HH:mm:ss")
    let action = null, dataString = null;
    if (await trx("mUser").where("user_id", id).first()) {
      await trx("mUser").where("user_id", id).update({ user_nik: nik, user_email: email, user_domain: mDivisi.divisi_domain, user_iddept: dept, user_iddiv: divisi, user_role: role, user_name: nama });
      dataString = objectToString({ user_nik: nik, user_email: email, user_domain: mDivisi.divisi_domain, user_iddept: dept, user_iddiv: divisi, user_role: role, user_name: nama });
      action = 'update';
    } else {
      await trx("mUser").insert({ user_empid: decrypt(empid), user_nik: nik, user_email: email, user_domain: mDivisi.divisi_domain, user_iddept: dept, user_iddiv: divisi, user_role: role, user_name: nama });
      dataString = objectToString({ user_nik: nik, user_email: email, user_domain: mDivisi.divisi_domain, user_iddept: dept, user_iddiv: divisi, user_role: role, user_name: nama });
      action = 'insert';
    }

    await trx.commit();
    return res.json("sukses");
  } catch (error) {
    await trx.rollback();
    return res.status(406).json({ type: 'error', message: process.env.DEBUG == 1 ? error.message : `Aplikasi sedang mengalami gangguan, silahkan hubungi tim IT` });
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

    await dbDMS('mUser')
      .where('user_id', req.body.id)
      .delete();

    await dbDMS('mAkses')
      .where('akses_user', req.body.id)
      .delete();

    return res.json("success");
  } catch (error) {
    return res.status(406).json({ type: 'error', message: process.env.DEBUG == 1 ? error.message : `Aplikasi sedang mengalami gangguan, silahkan hubungi tim IT` });
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

    await db("user_domain").where("usd_empid", empid).where("usd_domain", '<>', req.body.origin).update({ deleted_at: now, deleted_by: creator });

    if (req.body.domain.length > 0) {
      await Promise.all(req.body.domain.map(async (item) => {
        if (await db('user_domain').where({ usd_domain: item, usd_empid: empid }).first()) {
          return db('user_domain').where({ usd_domain: item, usd_empid: empid }).update({ updated_at: now, updated_by: creator, deleted_at: null, deleted_by: null });
        } else {
          return db('user_domain').insert({ usd_domain: item, usd_empid: empid, created_by: creator, created_at: now, updated_at: now, updated_by: creator });
        }
      }));
    }
    return res.json("sukses");
  } catch (error) {
    return res.status(406).json({ type: 'error', message: process.env.DEBUG == 1 ? error.message : `Aplikasi sedang mengalami gangguan, silahkan hubungi tim IT` });
  }
};

export const getHrisByNIK = async (req, res) => {
  // #swagger.tags = ['User']
  /* #swagger.security = [{
          "bearerAuth": []
        }] */
  // #swagger.description = 'Fungsi mendapatkan data user pada hris'
  try {
    const { nik, empid: encryptedEmpid } = req.query;
    let id = null;

    // Try to decrypt empid, if it fails, use it as plain text
    if (encryptedEmpid) {
      try {
        id = await decrypt(encryptedEmpid);
      } catch (decryptError) {
        // If decryption fails, assume it's already plain text
        id = encryptedEmpid;
      }
    }

    let hrisQuery = dbHris("ptl_hris as a")
      .select(
        "a.Emp_Id",
        "a.user_email",
        "a.employee_mgr_pk",
        "a.user_newid",
        "a.grade",
        "a.user_name",
        "a.map_div_pk",
        "a.map_dept_pk",
        "a.bu_id",
        "a.jabatan",
        "b.bu_name",
        "c.nama_div",
        "d.nama_dept"
      )
      .leftJoin('master_bu_new as b', 'a.bu_id', 'b.bu_id')
      .leftJoin('master_div_new as c', 'a.map_div_pk', 'c.id_div')
      .leftJoin('master_dept as d', 'a.map_dept_pk', 'd.id_dept')
      .where('a.user_active', 'Active');

    if (nik) {
      hrisQuery = hrisQuery.where('a.user_newid', nik);
    } else {
      hrisQuery = hrisQuery.where('a.Emp_Id', id);
    }

    const hris = await hrisQuery.first();

    if (!hris) {
      return res.status(406).json({
        type: 'error',
        message: `User ${nik || id} sudah tidak ditemukan/tidak aktif`,
      });
    } else {

      // Check if user already exists in mUser table
      let users = await dbDMS("mUser")
        .select("user_empid", "user_nik", "user_name")
        .where('user_empid', hris.Emp_Id)
        .first();

      if (users && nik) {
        return res.status(406).json({
          type: 'error',
          message: `User ${nik || id} sudah ada pada aplikasi ini`,
        });
      } else {
        let [jobHris, direktorat] = await Promise.all([
          dbHris("ptl_hris as a")
            .select("a.Emp_Id", "a.jabatan", "a.employee_mgr_pk", "a.map_dept_pk", "a.map_div_pk", "b.nama_div", "d.nama_dept", "c.map_dir_pk", "a.bu_id")
            .leftJoin('master_div as b', function () {
              this.on('b.id_div', '=', 'a.map_div_pk')
            })
            .leftJoin('mapping_dir_div_dept as c', function () {
              this.on('c.map_dept_pk', '=', 'a.map_dept_pk')
                .orOn('c.map_div_pk', '=', 'a.map_div_pk')
            })
            .leftJoin('master_dept as d', function () {
              this.on('d.id_dept', '=', 'a.map_dept_pk')
            })
            .where('a.Emp_Id', hris.Emp_Id)
            .first(),
          dbHris("master_dept_dir")
            .select("id_dir", "nama_dir", "nama_div")
            .where('id_div', hris.map_div_pk)
            .first(),
        ]);
        if (jobHris && jobHris.map_dir_pk && jobHris.map_dir_pk != '0') {
          direktorat = await dbHris("master_dir")
            .where('direktorat_pk', jobHris.map_dir_pk)
            .first();
        }

        let empid = await encrypt(hris.Emp_Id)
        res.status(200).json({
          'type': 'success',
          'empid': empid,
          'name': hris.user_name,
          'email': hris.user_email,
          'bu_name': hris.bu_name,
          'nama_div': hris.nama_div,
          'nama_dept': hris.nama_dept,
          'jabatan': hris.jabatan,
          'dept_id': hris.map_dept_pk == '0' ? null : hris.map_dept_pk,
          'dept_name': hris.map_dept_pk == '0' ? null : (jobHris ? jobHris.nama_dept : null),
          'div_id': hris.map_div_pk == '0' ? null : hris.map_div_pk,
          'div_name': hris.map_div_pk == '0' ? null : (jobHris ? jobHris.nama_div : null),
          'dir_id': !direktorat ? null : direktorat.direktorat_pk,
          'dir_name': !direktorat ? null : direktorat.direktorat_name,
          'grade': hris.grade,
          'bu': hris.bu_id,
          'nik': hris.user_newid
        });
      }
    }
  } catch (error) {
    logger(error, 'GET /getHrisByNIK', req.query);
    return res.status(406).json({
      type: 'error',
      message: process.env.DEBUG == 1 ? error.message : `Aplikasi sedang mengalami gangguan, silahkan hubungi tim IT`,
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
        'u.user_nik as name',
        'u.account_email as email',
        'g.grp_name',
        'g.grp_code'
      )
      .innerJoin('mUser as u', 'ug.ugrp_user_id', 'u.emp_id')
      .innerJoin('group_aplikasi as g', 'ug.ugrp_group_id', 'g.grp_id')
      .where('ug.ugrp_bu_id', bu_id)
      .whereNull('ug.deleted_at')
      .orderBy('u.user_nik', 'asc');

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
    const users = await dbDMS('mUser as u')
      .select(
        'u.user_nik',
        'u.user_name',
        'u.emp_id',
        'v.user_name as account_name',
        'v.user_email as account_email',
        'v.user_active as account_active'
      )
      .leftJoin('portal.dbo.ptl_hris as v', 'v.Emp_Id', 'u.emp_id')
      .whereNull('u.deleted_at')
      .where('v.user_active', 'Active')
      .orderBy('u.user_nik', 'asc');

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
  // #swagger.description = 'Get all users from mUser table with data from ptl_hris'
  try {
    if (req.query.rowsPerPage == null) {
      // Simple list without pagination
      const users = await dbDMS('mUser as u')
        .select(
          'u.user_nik',
          'u.user_name',
          'u.user_empid',
          'v.bu_id',
          'u.user_role',
          'v.user_name as account_name',
          'v.user_email as account_email',
          'v.user_active as account_active',
          'v.jabatan as account_jabatan'
        )
        .leftJoin('portal.dbo.ptl_hris as v', function () {
          this.on(dbDMS.raw('v.Emp_Id COLLATE SQL_Latin1_General_CP1_CI_AS'), '=', dbDMS.raw('u.emp_id COLLATE SQL_Latin1_General_CP1_CI_AS'));
        })
        .orderBy('u.user_nik', 'asc');

      res.status(200).json(users);
    } else {
      // Paginated list
      const sorting = req.query.descending === "true" ? "desc" : "asc";
      const columnSort = req.query.sortBy === "desc" ? "u.user_nik asc" : `u.${req.query.sortBy} ${sorting}`;
      const page = Math.floor(req.query.page);

      const response = await dbDMS('mUser as u')
        // .select(
        //   'u.user_nik',
        //   'u.user_name',
        //   'u.emp_id',
        //   'u.account_bu',
        //   'u.account_type',
        //   'v.user_name as account_name',
        //   'v.user_email as account_email',
        //   'v.user_active as account_active',
        //   'v.jabatan as account_jabatan'
        // )
        .select(
          'u.user_nik',
          'u.user_name',
          'u.user_empid',
          'v.bu_id',
          'u.user_role',
          'v.user_name as account_name',
          'v.user_email as account_email',
          'v.user_active as account_active',
          'v.jabatan as account_jabatan'
        )
        .leftJoin('portal.dbo.ptl_hris as v', function () {
          this.on(dbDMS.raw('v.Emp_Id COLLATE SQL_Latin1_General_CP1_CI_AS'), '=', dbDMS.raw('u.user_empid COLLATE SQL_Latin1_General_CP1_CI_AS'));
        })
        .where((query) => {
          if (req.query.filter != null) {
            query.orWhere("u.user_nik", "like", `%${req.query.filter}%`);
            query.orWhere("u.user_empid", "like", `%${req.query.filter}%`);
            query.orWhere("v.user_name", "like", `%${req.query.filter}%`);
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
  // #swagger.description = 'Save or update user in mUser table'
  const trx = await dbDMS.transaction();
  try {
    const { nik, account_name, account_email, emp_id, account_active, creator, role_id } = req.body;
    const creator_decrypt = decrypt(creator);
    const empid_decrypt = decrypt(emp_id);
    const now = dayjs().format("YYYY-MM-DD HH:mm:ss");

    // Check if user already exists by NIK
    const existing = await trx('mUser')
      .where('user_nik', nik)
      .first();

    const ptl_hris = await trx('portal.dbo.ptl_hris')
      .where('user_newid', nik)
      .first();

    if (existing) {
      // Update existing user
      await trx('mUser')
        .where('user_nik', nik)
        .update({
          // account_name: account_name,
          // account_email: account_email,
          emp_id: empid_decrypt,
          // account_active: account_active || 'Active',
          account_bu: ptl_hris.bu_id,
          account_type: role_id,
          updated_at: now,
          updated_by: creator_decrypt,
        });
    } else {
      // Check if emp_id already exists
      const existingEmpId = await trx('mUser')
        .where('emp_id', empid_decrypt)
        .first();

      if (existingEmpId) {
        await trx.rollback();
        return res.status(406).json({
          type: 'error',
          message: 'User with this Employee ID already exists',
        });
      }

      // Insert new user
      await trx('mUser').insert({
        user_nik: nik,
        user_name: nik, // Duplicate NIK as username
        // account_name: account_name,
        // account_email: account_email,
        emp_id: empid_decrypt,
        // account_active: account_active || 'Active',
        account_bu: ptl_hris.bu_id,
        account_type: role_id,
        // created_by: creator_decrypt,
        // created_at: now,
        // updated_by: creator_decrypt,
        // updated_at: now,
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
    const { nik, account_active, creator } = req.body;
    const creator_decrypt = decrypt(creator);
    const now = dayjs().format("YYYY-MM-DD HH:mm:ss");

    await dbDMS('mUser')
      .where('user_nik', nik)
      .update({
        account_active: account_active,
        updated_at: now,
        updated_by: creator_decrypt,
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

export const getRoles = async (req, res) => {
  // #swagger.tags = ['User']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Get list of roles'
  try {
    const roles = await dbDMS('group_aplikasi')
      .select('grp_id as role_id', 'grp_name as role_name')
      .orderBy('grp_name', 'asc');

    res.status(200).json(roles);
  } catch (error) {
    logger(error, 'GET /getRoles', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

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
    const user = await trx('mUser')
      .select('user_id')
      .where('user_empid', creatorEmpId)
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