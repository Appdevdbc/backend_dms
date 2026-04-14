import dayjs from "dayjs";
import { dbDMS } from "../../config/db.js";
import { logger } from "../../helpers/logger.js";
import { decrypt, encrypt, getErrorResponse } from "../../helpers/utils.js";
import { generateMappingBisnisUnitExcel, getMappingBisnisUnitFilename } from "../../model/DMS/master/mappingBisnisUnit.js";
import { generateSubKategoriDokumenExcel, getSubKategoriDokumenFilename } from "../../model/DMS/master/subKategoriDokumen.js";
import { generateKonterTransExcel, getKonterTransFilename } from "../../model/DMS/master/konterTrans.js";


export const listMappingBisnisUnit = async (req, res) => {
    // #swagger.tags = ['Master2']
  /* #swagger.security = [{
          "bearerAuth": []
  }] */
  // #swagger.description = 'Fungsi untuk show data mapping bisnis unit'
    try {
      const {rowsPerPage, bu_id,needle, limit,code,filter, excel, descending, sortBy, page:pageNum} = req.query;
      
      if (rowsPerPage == null) {
        let query= dbDMS('mst_map_kode_bu')
        query.select('map_kd_bu_id','map_mstr_bu_id','map_desc_kd_bu')
        query.where('map_kd_bu_status',1);
        if (limit) query=query.limit(limit);
        if (code) query= query.where('map_kd_bu_id',code)
        if (needle) query= query.where('map_desc_kd_bu','like',`%${needle}%`)
        return res.status(200).json(await query.orderBy('map_desc_kd_bu'));
      }
      
      const sorting = descending === "true" ? "desc" : "asc";
      const columnSort = sortBy === "asc" ? "map_mstr_bu_id asc" : `${sortBy} ${sorting}`;
      let query = dbDMS('mst_map_kode_bu as a').select('map_kd_bu_id','map_mstr_bu_id','map_desc_kd_bu','map_kd_bu_status','map_bu_singkat','log_pakai','bu_name');
      query.join(dbDMS.raw('v_mstr_bu as b ON b.bu_id COLLATE SQL_Latin1_General_CP1_CI_AS = a.map_mstr_bu_id COLLATE SQL_Latin1_General_CP1_CI_AS'));
      
      if (bu_id) query = query.where("map_mstr_bu_id", bu_id);
      if (filter) {
        query = query.where((q) => {
          q.orWhere("bu_name", "like", `%${filter}%`);
          q.orWhere("map_desc_kd_bu", "like", `%${filter}%`);
          q.orWhere("map_bu_singkat", "like", `%${filter}%`);
        });
      }
      
      if (excel) {
        const workbook = generateMappingBisnisUnitExcel(await query.orderByRaw(columnSort).limit(1000));
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=${getMappingBisnisUnitFilename()}`);
        return workbook.xlsx.write(res).then(() => res.end());
      }
      
      res.status(200).json(await query.orderByRaw(columnSort).paginate({ perPage: Math.floor(rowsPerPage), currentPage: Math.floor(pageNum), isLengthAware: true }));
    } catch (error) {
      console.log(error)
      logger(error, 'GET /listMappingBisnisUnit', req.query);
      return res.status(406).json(getErrorResponse(error));
    }
  };

  export const saveMappingBisnisUnit = async (req, res) => {
    // #swagger.tags = ['Master2']
    /* #swagger.security = [{
            "bearerAuth": []
        }] */
    // #swagger.description = 'Update data mapping bisnis unit'
    const trx = await dbDMS.transaction();
    try { 
        const {creator:empidDecrypt,id,name,kode,domain,status,update}=req.body;
        const empid = decrypt(empidDecrypt);
        const now = dayjs().format("YYYY-MM-DD HH:mm:ss");
      
        if (update){
            const duplicate = await trx("mst_map_kode_bu").where({map_mstr_bu_id:domain,map_desc_kd_bu:name}).where('map_kd_bu_id','<>',id).first();
            if (duplicate) return res.status(406).json({type:'error',message:'Mapping Bisnis Unit sudah digunakan'});
            await trx("mst_map_kode_bu").where("map_kd_bu_id", id).update({map_mstr_bu_id:domain,map_desc_kd_bu:name,map_bu_singkat:kode,map_kd_bu_status:status,updated_by:empid,updated_at:now});
        }else{
            const exists = await trx("mst_map_kode_bu").where({map_mstr_bu_id:domain,map_desc_kd_bu:name}).first();
            if (exists) return res.status(406).json({type:'error',message:'Mapping Bisnis Unit sudah digunakan'});
            await trx("mst_map_kode_bu").insert({map_mstr_bu_id:domain,map_desc_kd_bu:name,map_bu_singkat:kode,map_kd_bu_status:status,created_by:empid,created_at:now,updated_by:empid,updated_at:now});
        }
        await trx.commit();
        return res.json("sukses");
    } catch (error) {
        await trx.rollback();
        logger(error, 'POST /saveMappingBisnisUnit', req.body);
        return res.status(406).json(getErrorResponse(error));
    }
};

export const listSubKategoriDokumen = async (req, res) => {
    // #swagger.tags = ['Master2']
  /* #swagger.security = [{
          "bearerAuth": []
  }] */
  // #swagger.description = 'Fungsi untuk show data sub kategori dokumen'
    try {
      const {rowsPerPage,selection,limit,code,needle, kategori, filter, excel, descending, sortBy, page:pageNum} = req.query;
      
      if (rowsPerPage == null && selection==null) {
        let query= dbDMS('mst_sub_categ_arsip')
        query.distinct('sub_arsip_categ')
        query.where('sub_arsip_status',1);
        if (limit) query=query.limit(limit);
        if (needle) query= query.where('sub_arsip_categ','like',`%${needle}%`)
        return res.status(200).json(await query.orderBy('sub_arsip_categ'));
      }

      if (rowsPerPage == null && selection!=null) {
        let query= dbDMS('mst_sub_categ_arsip')
        query.select('sub_arsip_id','sub_arsip_kd_id','sub_arsip_jenis','sub_arsip_categ')
        query.where('sub_arsip_status',1);
        if (limit) query=query.limit(limit);
        if (code) query= query.where('sub_arsip_id',code)
        if (needle) query= query.where('sub_arsip_kd_id','like',`%${needle}%`)
        return res.status(200).json(await query.orderBy('sub_arsip_categ'));
      }
      
      const sorting = descending === "true" ? "desc" : "asc";
      const columnSort = sortBy === "asc" ? "sub_arsip_kd_id asc" : `${sortBy} ${sorting}`;
      let query = dbDMS('mst_sub_categ_arsip').select('sub_arsip_id','sub_arsip_kd_id','sub_arsip_jenis','sub_arsip_categ','sub_arsip_counter','sub_arsip_status');
      
      if (kategori) query = query.where("sub_arsip_categ", kategori);
      if (filter) {
        query = query.where((q) => {
          q.orWhere("sub_arsip_kd_id", "like", `%${filter}%`);
          q.orWhere("sub_arsip_jenis", "like", `%${filter}%`);
          q.orWhere("sub_arsip_categ", "like", `%${filter}%`);
        });
      }
      
      if (excel) {
        const data = await query.orderByRaw(columnSort).limit(1000);
        const workbook = generateSubKategoriDokumenExcel(data);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=${getSubKategoriDokumenFilename()}`);
        return workbook.xlsx.write(res).then(() => res.end());
      }
      
      res.status(200).json(await query.orderByRaw(columnSort).paginate({ perPage: Math.floor(rowsPerPage), currentPage: Math.floor(pageNum), isLengthAware: true }));
    } catch (error) {
      console.log(error)
      logger(error, 'GET /listSubKategoriDokumen', req.query);
      return res.status(406).json(getErrorResponse(error));
    }
};


  export const saveSubKategoriDokumen = async (req, res) => {
    // #swagger.tags = ['Master2']
    /* #swagger.security = [{
            "bearerAuth": []
        }] */
    // #swagger.description = 'Update data sub kategori dokumen'
    const trx = await dbDMS.transaction();
    try { 
        const {creator:empidDecrypt,id,kode,jenis,sub,counter,status,update}=req.body;
        const empid = decrypt(empidDecrypt);
        const now = dayjs().format("YYYY-MM-DD HH:mm:ss");
      
        if (update){
            const duplicate = await trx("mst_sub_categ_arsip").where("sub_arsip_kd_id",kode).where('sub_arsip_id','<>',id).first();
            if (duplicate) return res.status(406).json({type:'error',message:'Kode Sub Kategori sudah digunakan'});
            await trx("mst_sub_categ_arsip").where("sub_arsip_id", id).update({sub_arsip_kd_id:kode,sub_arsip_jenis:jenis,sub_arsip_categ:sub,sub_arsip_counter:counter,sub_arsip_status:status,updated_by:empid,updated_at:now});
        }else{
            const exists = await trx("mst_sub_categ_arsip").where("sub_arsip_kd_id",kode).first();
            if (exists) return res.status(406).json({type:'error',message:'Kode Sub Kategori sudah digunakan'});
            await trx("mst_sub_categ_arsip").insert({sub_arsip_kd_id:kode,sub_arsip_jenis:jenis,sub_arsip_categ:sub,sub_arsip_counter:counter,sub_arsip_status:status,created_by:empid,created_at:now,updated_by:empid,updated_at:now});
        }
        await trx.commit();
        return res.json("sukses");
    } catch (error) {
        await trx.rollback();
        logger(error, 'POST /saveSubKategoriDokumen', req.body);
        return res.status(406).json(getErrorResponse(error));
    }
};

export const listKonterTrans = async (req, res) => {
    // #swagger.tags = ['Master2']
  /* #swagger.security = [{
          "bearerAuth": []
  }] */
  // #swagger.description = 'Fungsi untuk show data konter transaksi'
    try {
      const {rowsPerPage,limit,needle, kategori, filter, excel, descending, sortBy, page:pageNum} = req.query;
      
      if (rowsPerPage == null) {
        let query= dbDMS('mst_sub_categ_arsip').distinct('sub_arsip_categ').where('sub_arsip_status',1);
        if (limit) query=query.limit(limit);
        if (needle) query= query.where('sub_arsip_categ','like',`%${needle}%`);
        return res.status(200).json(await query.orderBy('sub_arsip_categ'));
      }
      
      const sorting = descending === "true" ? "desc" : "asc";
      const columnSort = sortBy === "asc" ? "sub_arsip_kd_id asc" : `${sortBy} ${sorting}`;
      let query = dbDMS('mst_no_konter as a').select('ctr_id','ctr_nama_transaksi','ctr_kateg_doc','ctr_prefix','ctr_count','ctr_digit_count','ctr_kode_divisi','ctr_kode_bu_flag','ctr_kode_bu','ctr_work_loc','ctr_prd_yr_mont','ctr_reset_year','ctr_status','sub_arsip_kd_id','sub_arsip_categ','sub_arsip_jenis','map_mstr_bu_id','map_desc_kd_bu');
      query.leftJoin('mst_map_kode_bu as b','ctr_kode_bu','b.map_kd_bu_id');
      query.leftJoin('mst_sub_categ_arsip as c', 'ctr_kateg_doc', 'c.sub_arsip_id');
      
      if (kategori) query = query.where("sub_arsip_categ", kategori);
      if (filter) {
        query = query.where((q) => {
          q.orWhere("sub_arsip_kd_id", "like", `%${filter}%`);
          q.orWhere("sub_arsip_jenis", "like", `%${filter}%`);
          q.orWhere("sub_arsip_categ", "like", `%${filter}%`);
          q.orWhere("map_desc_kd_bu", "like", `%${filter}%`);
        });
      }
      
      if (excel) {
        const workbook = generateKonterTransExcel(await query.orderByRaw(columnSort).limit(1000));
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=${getKonterTransFilename()}`);
        return workbook.xlsx.write(res).then(() => res.end());
      }
      
      res.status(200).json(await query.orderByRaw(columnSort).paginate({ perPage: Math.floor(rowsPerPage), currentPage: Math.floor(pageNum), isLengthAware: true }));
    } catch (error) {
      console.log(error)
      logger(error, 'GET /listKonterTrans', req.query);
      return res.status(406).json(getErrorResponse(error));
    }
  };

export const saveKonterTrans = async (req, res) => {
    // #swagger.tags = ['Master2']
    /* #swagger.security = [{
            "bearerAuth": []
        }] */
    // #swagger.description = 'Update data konter transaksi'
    const trx = await dbDMS.transaction();
    try { 
        const {creator:empidDecrypt,id,nama_transaksi,kode_jenis,bisnis,counter,counter_terakhir,kode_divisi,kode_bu_flag,kode_worklocation,tahun_bulan,reset_per_tahun,status,update}=req.body;
        const empid = decrypt(empidDecrypt);
        const now = dayjs().format("YYYY-MM-DD HH:mm:ss");
      
        if (update){
            const duplicate = await trx("mst_no_konter").where({ctr_kateg_doc:kode_jenis,ctr_kode_bu:bisnis}).where('ctr_id','<>',id).first();
            if (duplicate) return res.status(406).json({type:'error',message:'Konter Transaksi sudah digunakan'});
            await trx("mst_no_konter").where("ctr_id", id).update({ctr_nama_transaksi:nama_transaksi,ctr_kateg_doc:kode_jenis,ctr_prefix:kode_jenis,ctr_count:counter,ctr_digit_count:counter_terakhir,ctr_kode_divisi:kode_divisi,ctr_kode_bu_flag:kode_bu_flag,ctr_kode_bu:bisnis,ctr_work_loc:kode_worklocation,ctr_prd_yr_mont:tahun_bulan,ctr_reset_year:reset_per_tahun,ctr_status:status,updated_by:empid,updated_at:now});
        }else{
            const exists = await trx("mst_no_konter").where({ctr_kateg_doc:kode_jenis,ctr_kode_bu:bisnis}).first();
            if (exists) return res.status(406).json({type:'error',message:'Konter Transaksi sudah digunakan'});
            await trx("mst_no_konter").insert({ctr_nama_transaksi:nama_transaksi,ctr_kateg_doc:kode_jenis,ctr_prefix:kode_jenis,ctr_count:counter,ctr_digit_count:counter_terakhir,ctr_kode_divisi:kode_divisi,ctr_kode_bu_flag:kode_bu_flag,ctr_kode_bu:bisnis,ctr_work_loc:kode_worklocation,ctr_prd_yr_mont:tahun_bulan,ctr_reset_year:reset_per_tahun,ctr_status:status,created_by:empid,created_at:now,updated_by:empid,updated_at:now});
        }
        await trx.commit();
        return res.json("sukses");
    } catch (error) {
        await trx.rollback();
        logger(error, 'POST /saveKonterTrans', req.body);
        return res.status(406).json(getErrorResponse(error));
    }
};

export const listKonterTransBU = async (req, res) => {
    // #swagger.tags = ['Master2']
  /* #swagger.security = [{
          "bearerAuth": []
  }] */
  // #swagger.description = 'Fungsi untuk show data konter transaksi BU'
    try {
      const {rowsPerPage, bu_id, needle, limit, code, filter, excel, descending, sortBy, page:pageNum} = req.query;
      
      if (!rowsPerPage) {
        return res.status(200).json('sukses');
      }
      
      const sorting = descending === "true" ? "desc" : "asc";
      const columnSort = sortBy === "asc" ? "bu_name asc" : `${sortBy} ${sorting}`;
      let query = dbDMS('mst_counter as a').select('cnt_id','cnt_bu_id','cnt_jns_trans','cnt_cat_doc','cnt_nilai_counter','cnt_reset','bu_name','cnt_date','cnt_prefix','cnt_status','app_jns_desc');
      query.join(dbDMS.raw('v_mstr_bu as b ON b.bu_id COLLATE SQL_Latin1_General_CP1_CI_AS = a.cnt_bu_id COLLATE SQL_Latin1_General_CP1_CI_AS'));
      query.leftJoin('mst_approval_jenis as c','a.cnt_jns_trans','c.app_jns_id');
      
      if (bu_id) query = query.where("cnt_bu_id", bu_id);
      if (filter) query = query.where((q) => { q.orWhere("bu_name", "like", `%${filter}%`).orWhere("app_jns_desc", "like", `%${filter}%`).orWhere("cnt_jns_trans", "like", `%${filter}%`).orWhere("cnt_cat_doc", "like", `%${filter}%`).orWhere("cnt_prefix", "like", `%${filter}%`); });
      
      res.status(200).json(await query.orderByRaw(columnSort).paginate({ perPage: Math.floor(rowsPerPage), currentPage: Math.floor(pageNum), isLengthAware: true }));
    } catch (error) {
      console.log(error)
      logger(error, 'GET /listKonterTransBU', req.query);
      return res.status(406).json(getErrorResponse(error));
    }
  };

  export const saveKonterTransBU = async (req, res) => {
    // #swagger.tags = ['Master2']
    /* #swagger.security = [{
            "bearerAuth": []
        }] */
    // #swagger.description = 'Update data konter transaksi BU'
    const trx = await dbDMS.transaction();
    try { 
        const {creator:empidDecrypt,id,bisnis,jenis_approval,kategori,counter,prefix,reset_per_tahun,status,update}=req.body;
        const empid = decrypt(empidDecrypt);
        const now = dayjs().format("YYYY-MM-DD HH:mm:ss");
      
        if (update){
            const duplicate = await trx("mst_counter").where({cnt_bu_id:bisnis,cnt_jns_trans:jenis_approval,cnt_cat_doc:kategori}).where('cnt_id','<>',id).first();
            if (duplicate) return res.status(406).json({type:'error',message:'Konter Transaksi BU sudah digunakan'});
            await trx("mst_counter").where("cnt_id", id).update({cnt_bu_id:bisnis,cnt_jns_trans:jenis_approval,cnt_cat_doc:kategori,cnt_nilai_counter:counter,cnt_prefix:prefix,cnt_reset:reset_per_tahun,cnt_status:status,updated_by:empid,updated_at:now});
        }else{
            const exists = await trx("mst_counter").where({cnt_bu_id:bisnis,cnt_jns_trans:jenis_approval,cnt_cat_doc:kategori}).first();
            if (exists) return res.status(406).json({type:'error',message:'Konter Transaksi BU sudah digunakan'});
            await trx("mst_counter").insert({cnt_bu_id:bisnis,cnt_jns_trans:jenis_approval,cnt_cat_doc:kategori,cnt_nilai_counter:counter,cnt_prefix:prefix,cnt_reset:reset_per_tahun,cnt_status:status,created_by:empid,created_at:now,updated_by:empid,updated_at:now});
        }
        await trx.commit();
        return res.json("sukses");
    } catch (error) {
        await trx.rollback();
        logger(error, 'POST /saveKonterTransBU', req.body);
        return res.status(406).json(getErrorResponse(error));
    }
};

export const listTypeApproval = async (req, res) => {
    // #swagger.tags = ['Master1']
  /* #swagger.security = [{
          "bearerAuth": []
  }] */
  // #swagger.description = 'Fungsi untuk show data type approval'
    try {
      const {rowsPerPage, filter,limit,code,needle, descending, sortBy, page:pageNum} = req.query;
      const baseQuery=dbDMS('mst_approval_type')
      if (rowsPerPage==null) {
        let query = baseQuery.distinct('app_type_id', 'app_type_desc');
        query.where('app_type_status',1)
        if (code) {
            query = query.where('app_type_id', code);
        }
        if (needle) {
            query = query.where('app_type_desc', 'like', `%${needle}%`);
        }
        return res.status(200).json(await query.orderBy("app_type_desc").limit(limit))
      }
      const sorting = descending === "true" ? "desc" : "asc";
      const columnSort = sortBy === "asc" ? "app_type_desc asc" : `${sortBy} ${sorting}`;
      let query = baseQuery.select('app_type_id','app_type_desc','app_type_status');
      
      if (filter) query = query.where("app_type_desc", "like", `%${filter}%`);
      
      res.status(200).json(await query.orderByRaw(columnSort).paginate({ perPage: Math.floor(rowsPerPage), currentPage: Math.floor(pageNum), isLengthAware: true }));
    } catch (error) {
      console.log(error)
      logger(error, 'GET /listTypeApproval', req.query);
      return res.status(406).json(getErrorResponse(error));
    }
  };

export const saveTypeApproval = async (req, res) => {
    // #swagger.tags = ['Master1']
    /* #swagger.security = [{
            "bearerAuth": []
        }] */
    // #swagger.description = 'Update data type approval'
    const trx = await dbDMS.transaction();
    try { 
        const {creator:empidDecrypt,jenis,status,id,update}=req.body;
        const empid = decrypt(empidDecrypt);
        const now = dayjs().format("YYYY-MM-DD HH:mm:ss");
        
        if (update){
            const duplicate = await trx("mst_approval_type").where("app_type_desc", jenis).where('app_type_id','<>',id).first();
            if (duplicate) return res.status(406).json({type:'error',message:'Type Approval sudah digunakan'});
            await trx("mst_approval_type").where("app_type_id", id).update({app_type_desc:jenis,app_type_status:status,updated_by:empid,updated_at:now});
        }else{
            const exists = await trx("mst_approval_type").where("app_type_desc", jenis).first();
            if (exists) return res.status(406).json({type:'error',message:'Type Approval sudah digunakan'});
            await trx("mst_approval_type").insert({app_type_desc:jenis,app_type_status:status,created_by:empid,created_at:now,updated_by:empid,updated_at:now});
        }
        await trx.commit();
        return res.json("sukses");
    } catch (error) {
        await trx.rollback();
        logger(error, 'POST /saveTypeApproval', req.body);
        return res.status(406).json(getErrorResponse(error));
    }
};