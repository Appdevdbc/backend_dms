import dayjs from "dayjs";
import { dbDMS } from "../../config/db.js";
import { logger } from "../../helpers/logger.js";
import { decrypt, encrypt, getErrorResponse } from "../../helpers/utils.js";
import { generateLokasiArsipExcel, getLokasiArsipFilename } from "../../model/DMS/master/lokasiArsip.js";
import { generateArsipLokasiExcel, getArsipLokasiFilename } from "../../model/DMS/master/arsipLokasi.js";
import { generateLemariArsipExcel, getLemariArsipFilename } from "../../model/DMS/master/lemariArsip.js";

export const listPerjanjian = async (req, res) => {
    // #swagger.tags = ['Master1']
  /* #swagger.security = [{
          "bearerAuth": []
  }] */
  // #swagger.description = 'Fungsi untuk show data perjanjian'
    try {
      if (req.query.rowsPerPage == null) {
        res.status(200).json('sukses');
      } else {
        const sorting = req.query.descending === "true" ? "desc" : "asc";
        const columnSort =
          req.query.sortBy === "asc"
            ? "perj_id asc"
            : `${req.query.sortBy} ${sorting}`;

        const page = Math.floor(req.query.page);
        const response = await dbDMS('mst_jenis_prj')
            .select('perj_id','perj_desc')
            .where((query) => {
              if (req.query.filter != null) {
                query.orWhere("perj_id", "like", `%${req.query.filter}%`);
                query.orWhere("perj_desc", "like", `%${req.query.filter}%`);
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
      console.log(error)
      logger(error, 'GET /listPerjanjian', req.query);
      return res.status(406).json(getErrorResponse(error));
    }
  };

   export const savePerjanjian = async (req, res) => {
      // #swagger.tags = ['Master1']
      /* #swagger.security = [{
              "bearerAuth": []
            }] */
      // #swagger.description = 'Update data perjanjian'
      const trx = await dbDMS.transaction();
      try { 
        const {creator:empidDecrypt,kode,perjanjian}=req.body
        const empid =  decrypt(empidDecrypt)
        const now = dayjs().format("YYYY-MM-DD HH:mm:ss")

        if (await trx("mst_jenis_prj").where("perj_id", kode).first()) {
          await trx("mst_jenis_prj").where("perj_id", kode).update({perj_desc:perjanjian,updated_by:empid,updated_at:now});
        } else {
          await trx("mst_jenis_prj").insert({perj_id:kode,perj_desc:perjanjian,created_by:empid,created_at:now,updated_by:empid,updated_at:now});
        }
        await trx.commit();
        return res.json("sukses");
      } catch (error) {
        await trx.rollback();
        logger(error, 'POST /savePerjanjian', req.body);
        return res.status(406).json(getErrorResponse(error));
      }
    };


export const deletePerjanjian = async (req, res) => {
      // #swagger.tags = ['Master1']
     /* #swagger.security = [{
             "bearerAuth": []
     }] */
     // #swagger.description = 'Fungsi untuk hapus data perjanjian'
    try {
        const { id } = req.body;
        const docUsed = await dbDMS("trs_nmr_doc")
          .whereRaw("SUBSTRING(doc_id, CHARINDEX('/', doc_id) + 1, CHARINDEX('/', doc_id, CHARINDEX('/', doc_id) + 1) - CHARINDEX('/', doc_id) - 1) = ?", [id])
          .first();
        if (docUsed) return res.status(406).json({type:'error',message:'Tidak bisa dihapus karena perjanjian digunakan'});
        await dbDMS("mst_jenis_prj").where("perj_id", id).delete();
        return res.json("success");
    } catch (error) {
       logger(error, 'POST /deletePerjanjian', req.body);
       return res.status(406).json(getErrorResponse(error));
    }
};

export const listWorkLocation = async (req, res) => {
    // #swagger.tags = ['Master1']
  /* #swagger.security = [{
          "bearerAuth": []
  }] */
  // #swagger.description = 'Fungsi untuk show data worklocation'
    try {
      if (req.query.rowsPerPage == null) {
        const { limit, code, needle } = req.query;
        let query = dbDMS('mst_work_location').select('work_id', 'work_desc', 'work_code');
        if (code) query = query.where('work_id', code);
        if (needle) query = query.where((q) => {
          q.where('work_desc', 'like', `%${needle}%`).orWhere('work_code', 'like', `%${needle}%`);
        });
        if (limit) query = query.limit(limit);
        return res.status(200).json(await query.orderBy('work_desc'));
      } else {
        const sorting = req.query.descending === "true" ? "desc" : "asc";
        const columnSort =
          req.query.sortBy === "asc"
            ? "work_desc asc"
            : `${req.query.sortBy} ${sorting}`;

        const page = Math.floor(req.query.page);
        const response = await dbDMS('mst_work_location')
            .select('work_id','work_desc','work_code')
            .where((query) => {
              if (req.query.filter != null) {
                query.orWhere("work_desc", "like", `%${req.query.filter}%`);
                query.orWhere("work_code", "like", `%${req.query.filter}%`);
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
      console.log(error)
      logger(error, 'GET /listWorkLocation', req.query);
      return res.status(406).json(getErrorResponse(error));
    }
  };

export const listVwWorkLocation = async (req, res) => {
    // #swagger.tags = ['Master1']
  /* #swagger.security = [{
          "bearerAuth": []
  }] */
  // #swagger.description = 'Fungsi untuk show data worklocation'
    try {
        const { page, code, needle, descending, sortBy, filter, rowsPerPage } = req.query;
        // Base query builder
        const baseQuery = dbDMS("v_map_employee_data")
      if (!rowsPerPage) {
        let query = baseQuery.distinct('work_location_code', 'work_location_name');
        if (code) {
            query = query.where('work_location_code', code);
        }
        
        if (needle) {
            query = query.where('work_location_name', 'like', `%${needle}%`);
        }
        const response = await query.orderBy("work_location_name").limit(10);
        res.status(200).json(response);
      } else {
        res.status(200).json('sukses');
      }
    } catch (error) {
      console.log(error)
      logger(error, 'GET /listVwWorkLocation', req.query);
      return res.status(406).json(getErrorResponse(error));
    }
  };

export const saveWorkLocation = async (req, res) => {
    // #swagger.tags = ['Master1']
    /* #swagger.security = [{
            "bearerAuth": []
        }] */
    // #swagger.description = 'Update data worklocation'
    const trx = await dbDMS.transaction();
    try { 
        const {creator:empidDecrypt,kode,work,update}=req.body;
        const empid = decrypt(empidDecrypt);
        const now = dayjs().format("YYYY-MM-DD HH:mm:ss");
        const workname = await trx('v_map_employee_data').select('work_location_name').where('work_location_code',work).first();
        
        if (update){
            const duplicate = await trx("mst_work_location").where("work_code", kode).where('work_id','<>',work).first();
            if (duplicate) return res.status(406).json({type:'error',message:'Kode Lokasi Kerja sudah digunakan'});
            await trx("mst_work_location").where("work_id", work).update({work_desc:workname.work_location_name,work_code:kode,updated_by:empid,updated_at:now});
        }else{
            const exists = await trx("mst_work_location").where("work_id", work).first();
            if (exists) return res.status(406).json({type:'error',message:'Lokasi kerja sudah digunakan'});
            await trx("mst_work_location").insert({work_id:work,work_desc:workname.work_location_name,work_code:kode,created_by:empid,created_at:now,updated_by:empid,updated_at:now});
        }
        await trx.commit();
        return res.json("sukses");
    } catch (error) {
        await trx.rollback();
        logger(error, 'POST /saveWorkLocation', req.body);
        return res.status(406).json(getErrorResponse(error));
    }
};

export const deleteWork = async (req, res) => {
      // #swagger.tags = ['Master1']
     /* #swagger.security = [{
             "bearerAuth": []
     }] */
     // #swagger.description = 'Fungsi untuk hapus data work location'
    try {
        const { id } = req.body;
        const docUsed = await dbDMS("trs_nmr_doc")
          .whereRaw("PARSENAME(REPLACE(doc_id, '/', '.'), 3) = ?", [id])
          .first();
        if (docUsed) return res.status(406).json({type:'error',message:'Tidak bisa dihapus karena lokasi kerja digunakan'});
        await dbDMS("mst_work_location").where("work_id", id).delete();
        return res.json("success");
    } catch (error) {
       logger(error, 'POST /deleteWork', req.body);
       return res.status(406).json(getErrorResponse(error));
    }
};

export const listDocKategori = async (req, res) => {
    // #swagger.tags = ['Master1']
  /* #swagger.security = [{
          "bearerAuth": []
  }] */
  // #swagger.description = 'Fungsi untuk show data kategori dokumen'
    try {
      if (req.query.rowsPerPage == null) {
        res.status(200).json('sukses');
      } else {
        const sorting = req.query.descending === "true" ? "desc" : "asc";
        const columnSort =
          req.query.sortBy === "asc"
            ? "kat_desc asc"
            : `${req.query.sortBy} ${sorting}`;

        const page = Math.floor(req.query.page);
        const response = await dbDMS('mst_kategori_doc')
            .select('kat_desc','kat_kode','kat_notif','kat_id')
            .where((query) => {
              if (req.query.filter != null) {
                query.orWhere("kat_desc", "like", `%${req.query.filter}%`);
                query.orWhere("kat_kode", "like", `%${req.query.filter}%`);
                query.orWhere("kat_notif", "like", `%${req.query.filter}%`);
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
      console.log(error)
      logger(error, 'GET /listDocKategori', req.query);
      return res.status(406).json(getErrorResponse(error));
    }
  };

  export const saveDocKategori = async (req, res) => {
    // #swagger.tags = ['Master1']
    /* #swagger.security = [{
            "bearerAuth": []
        }] */
    // #swagger.description = 'Update data doc kategori'
    const trx = await dbDMS.transaction();
    try { 
        const {creator:empidDecrypt,kat_kode,kat_desc,kat_notif,id,update}=req.body;
        const empid = decrypt(empidDecrypt);
        const now = dayjs().format("YYYY-MM-DD HH:mm:ss");

        if (update){
            const duplicate = await trx("mst_kategori_doc").where("kat_kode", kat_kode).where('kat_id','<>',id).first();
            if (duplicate) return res.status(406).json({type:'error',message:'Kode Kategori sudah digunakan'});
            await trx("mst_kategori_doc").where("kat_kode", kat_kode).update({kat_kode:kat_kode,kat_desc:kat_desc,kat_notif:kat_notif,updated_by:empid,updated_at:now});
        }else{
            const exists = await trx("mst_kategori_doc").where("kat_kode", kat_kode).first();
            if (exists) return res.status(406).json({type:'error',message:'Kode kategori sudah digunakan'});
            await trx("mst_kategori_doc").insert({kat_kode:kat_kode,kat_desc:kat_desc,kat_notif:kat_notif,created_by:empid,created_at:now,updated_by:empid,updated_at:now});
        }
        await trx.commit();
        return res.json("sukses");
    } catch (error) {
        await trx.rollback();
        logger(error, 'POST /saveDocKategori', req.body);
        return res.status(406).json(getErrorResponse(error));
    }
};


export const deleteDocKategori = async (req, res) => {
      // #swagger.tags = ['Master1']
     /* #swagger.security = [{
             "bearerAuth": []
     }] */
     // #swagger.description = 'Fungsi untuk hapus data doc kategori'
    try {
        const { kode } = req.body;
        const docUsed = await dbDMS("content")
          .where("content_kat", kode)
          .first();
        if (docUsed) return res.status(406).json({type:'error',message:'Tidak bisa dihapus karena data sudah digunakan pada transaksi'});
        await dbDMS("mst_kategori_doc").where("kat_kode", kode).delete();
        return res.json("success");
    } catch (error) {
       logger(error, 'POST /deleteDocKategori', req.body);
       return res.status(406).json(getErrorResponse(error));
    }
};

export const listLokasiArsip = async (req, res) => {
    // #swagger.tags = ['Master1']
  /* #swagger.security = [{
          "bearerAuth": []
  }] */
  // #swagger.description = 'Fungsi untuk show data lokasi arsip'
    try {
      const {rowsPerPage, limit, code, bu_id, needle, filter, excel, descending, sortBy, page:pageNum} = req.query;
      let query = dbDMS('mst_lokasi_arsip').select('lokasi_arsip_id','lokasi_arsip_name','lokasi_arsip_bu_id','lokasi_arsip_status');
      
      if (rowsPerPage == null) {
        query.where('lokasi_arsip_status',1)
        if (limit) query = query.limit(limit);
        if (code) query = query.where('lokasi_arsip_id', code);
        if (bu_id) query = query.where('lokasi_arsip_bu_id', bu_id);
        if (needle) query = query.where((q) => { q.where('lokasi_arsip_name', 'like', `%${needle}%`).orWhere('lokasi_arsip_bu_id', 'like', `%${needle}%`); });
        return res.status(200).json(await query.orderBy('lokasi_arsip_name'));
      }
      
      const sorting = descending === "true" ? "desc" : "asc";
      const columnSort = sortBy === "asc" ? "lokasi_arsip_bu_id asc" : `${sortBy} ${sorting}`;
      
      if (bu_id) query = query.where("lokasi_arsip_bu_id", bu_id);
      if (filter) query = query.where((q) => { q.orWhere("lokasi_arsip_name", "like", `%${filter}%`).orWhere("lokasi_arsip_bu_id", "like", `%${filter}%`).orWhere("lokasi_arsip_status", "like", `%${filter}%`); });
      
      if (excel) {
        const workbook = generateLokasiArsipExcel(await query.orderByRaw(columnSort).limit(1000));
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=${getLokasiArsipFilename()}`);
        return workbook.xlsx.write(res).then(() => res.end());
      }
      
      res.status(200).json(await query.orderByRaw(columnSort).paginate({ perPage: Math.floor(rowsPerPage), currentPage: Math.floor(pageNum), isLengthAware: true }));
    } catch (error) {
      console.log(error)
      logger(error, 'GET /listLokasiArsip', req.query);
      return res.status(406).json(getErrorResponse(error));
    }
  };

export const saveLokasiArsip = async (req, res) => {
    // #swagger.tags = ['Master1']
    /* #swagger.security = [{
            "bearerAuth": []
        }] */
    // #swagger.description = 'Update data lokasi arsip'
    const trx = await dbDMS.transaction();
    try { 
        const {creator:empidDecrypt,bu,name,status,id,update}=req.body;
        const empid = decrypt(empidDecrypt);
        const now = dayjs().format("YYYY-MM-DD HH:mm:ss");
      
        if (update){
            const duplicate = await trx("mst_lokasi_arsip").where("lokasi_arsip_bu_id", bu).where('lokasi_arsip_name',name).where('lokasi_arsip_id','<>',id).first();
            if (duplicate) return res.status(406).json({type:'error',message:'Lokasi Arsip sudah digunakan'});
            await trx("mst_lokasi_arsip").where("lokasi_arsip_id", id).update({lokasi_arsip_bu_id:bu,lokasi_arsip_name:name,lokasi_arsip_status:status,updated_by:empid,updated_at:now});
        }else{
            const exists = await trx("mst_lokasi_arsip").where("lokasi_arsip_bu_id", bu).where('lokasi_arsip_name',name).first();
            if (exists) return res.status(406).json({type:'error',message:'Lokasi Arsip sudah digunakan'});
            await trx("mst_lokasi_arsip").insert({lokasi_arsip_bu_id:bu,lokasi_arsip_name:name,lokasi_arsip_status:status,created_by:empid,created_at:now,updated_by:empid,updated_at:now});
        }
        await trx.commit();
        return res.json("sukses");
    } catch (error) {
        await trx.rollback();
        logger(error, 'POST /saveLokasiArsip', req.body);
        return res.status(406).json(getErrorResponse(error));
    }
};

export const listArsipLokasi = async (req, res) => {
    // #swagger.tags = ['Master1']
  /* #swagger.security = [{
          "bearerAuth": []
  }] */
  // #swagger.description = 'Fungsi untuk show data arsip lokasi'
    try {
      if (req.query.rowsPerPage == null) {
        res.status(200).json('sukses');
      } else {
        const sorting = req.query.descending === "true" ? "desc" : "asc";
        const columnSort = req.query.sortBy === "asc" ? "account_nik asc" : `${req.query.sortBy} ${sorting}`;
        const page = Math.floor(req.query.page);
        let query = dbDMS('mst_arsiparis as a')
        query.select('lokasi_arsip_name','arsiparis_emp_id','account_name','account_nik','account_bu','account_dept_name','account_div_name','account_dir_name','arsiparis_id','arsiparis_user_id','arsiparis_lokasi_arsip_id','a.lokasi_arsip_status');
        query.innerJoin('master_user as b','b.account_username','a.arsiparis_emp_id')
        query.innerJoin('mst_lokasi_arsip as c','c.lokasi_arsip_id','a.arsiparis_lokasi_arsip_id')        
        if (req.query.bu_id != null) query = query.where("account_bu", req.query.bu_id);
        if (req.query.filter != null) {
          query = query.where((q) => {
            q.orWhere("account_nik", "like", `%${req.query.filter}%`);
            q.orWhere("account_name", "like", `%${req.query.filter}%`);
            q.orWhere("account_bu", "like", `%${req.query.filter}%`);
            q.orWhere("account_dept_name", "like", `%${req.query.filter}%`);
            q.orWhere("account_div_name", "like", `%${req.query.filter}%`);
            q.orWhere("account_dir_name", "like", `%${req.query.filter}%`);
            q.orWhere("lokasi_arsip_name", "like", `%${req.query.filter}%`);
          });
        }
        
        if (req.query.excel) {
          const data = await query.orderByRaw(columnSort).limit(1000);
          const workbook = generateArsipLokasiExcel(data);
          res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
          res.setHeader('Content-Disposition', `attachment; filename=${getArsipLokasiFilename()}`);
          return workbook.xlsx.write(res).then(() => res.end());
        }
        
        const response = await query.orderByRaw(columnSort).paginate({ perPage: Math.floor(req.query.rowsPerPage), currentPage: page, isLengthAware: true });
        res.status(200).json(response);
      }
    } catch (error) {
      console.log(error)
      logger(error, 'GET /listArsipLokasi', req.query);
      return res.status(406).json(getErrorResponse(error));
    }
  };

export const saveArsipLokasi = async (req, res) => {
    // #swagger.tags = ['Master1']
    /* #swagger.security = [{
            "bearerAuth": []
        }] */
    // #swagger.description = 'Update data lokasi arsip'
    const trx = await dbDMS.transaction();
    try { 
        const {creator:empidDecrypt,user,lokasi,status,id,update}=req.body;
        const empid = decrypt(empidDecrypt);
        const now = dayjs().format("YYYY-MM-DD HH:mm:ss");
      
        if (update){
            const duplicate = await trx("mst_arsiparis").where("arsiparis_emp_id", user).where('arsiparis_lokasi_arsip_id',lokasi).where('arsiparis_id','<>',id).first();
            if (duplicate) return res.status(406).json({type:'error',message:'Lokasi Arsip sudah digunakan'});
            await trx("mst_arsiparis").where("arsiparis_id", id).update({arsiparis_lokasi_arsip_id:lokasi,lokasi_arsip_status:status,updated_by:empid,updated_at:now});
        }else{
            const exists = await trx("mst_arsiparis").where("arsiparis_emp_id", user).where('arsiparis_lokasi_arsip_id',lokasi).first();
            if (exists) return res.status(406).json({type:'error',message:'Lokasi Arsip sudah digunakan'});
            await trx("mst_arsiparis").insert({arsiparis_emp_id:user,arsiparis_lokasi_arsip_id:lokasi,lokasi_arsip_status:status,created_by:empid,created_at:now,updated_by:empid,updated_at:now});
        }
        await trx.commit();
        return res.json("sukses");
    } catch (error) {
        await trx.rollback();
        logger(error, 'POST /saveArsipLokasi', req.body);
        return res.status(406).json(getErrorResponse(error));
    }
};

export const listLemariArsip = async (req, res) => {
    // #swagger.tags = ['Master1']
  /* #swagger.security = [{
          "bearerAuth": []
  }] */
  // #swagger.description = 'Fungsi untuk show data lemari arsip'
    try {
      if (req.query.rowsPerPage == null) {
        res.status(200).json('sukses');
      } else {
        const sorting = req.query.descending === "true" ? "desc" : "asc";
        const columnSort = req.query.sortBy === "asc" ? "lemari_name asc" : `${req.query.sortBy} ${sorting}`;
        const page = Math.floor(req.query.page);
        let query = dbDMS('mst_lemari_arsip as a')
        query.select('lemari_id','lemari_name','lemari_bu_id','lemari_lokasi_arsip_id'
      ,'lemari_tingkat_ke','lemari_box_ke','lemari_urutan_doc','lemari_arsip_status','lokasi_arsip_name');
        query.innerJoin('mst_lokasi_arsip as b','b.lokasi_arsip_id','a.lemari_lokasi_arsip_id')        
        if (req.query.bu_id != null) query = query.where("lemari_bu_id", req.query.bu_id);
        if (req.query.filter != null) {
          query = query.where((q) => {
            q.orWhere("lemari_name", "like", `%${req.query.filter}%`);
            q.orWhere("lemari_bu_id", "like", `%${req.query.filter}%`);
            q.orWhere("lokasi_arsip_name", "like", `%${req.query.filter}%`);
            q.orWhere("lemari_box_ke", "like", `%${req.query.filter}%`);
            q.orWhereRaw("CAST(lemari_tingkat_ke AS VARCHAR) LIKE ?", [`%${req.query.filter}%`]);
            q.orWhereRaw("CAST(lemari_urutan_doc AS VARCHAR) LIKE ?", [`%${req.query.filter}%`]);
          });
        }
        
        if (req.query.excel) {
          const data = await query.orderByRaw(columnSort).limit(1000);
          const workbook = generateLemariArsipExcel(data);
          res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
          res.setHeader('Content-Disposition', `attachment; filename=${getLemariArsipFilename()}`);
          return workbook.xlsx.write(res).then(() => res.end());
        }
        
        const response = await query.orderByRaw(columnSort).paginate({ perPage: Math.floor(req.query.rowsPerPage), currentPage: page, isLengthAware: true });
        res.status(200).json(response);
      }
    } catch (error) {
      console.log(error)
      logger(error, 'GET /listLemariArsip', req.query);
      return res.status(406).json(getErrorResponse(error));
    }
  };

  export const saveLemariArsip = async (req, res) => {
    // #swagger.tags = ['Master1']
    /* #swagger.security = [{
            "bearerAuth": []
        }] */
    // #swagger.description = 'Update data lemari arsip'
    const trx = await dbDMS.transaction();
    try { 
        const {creator:empidDecrypt,id,name,tingkat,box,urutan,domain,lokasi,status,update}=req.body;
        const empid = decrypt(empidDecrypt);
        const now = dayjs().format("YYYY-MM-DD HH:mm:ss");
      
        if (update){
            const duplicate = await trx("mst_lemari_arsip").where({lemari_bu_id:domain,lemari_name:name,lemari_lokasi_arsip_id:lokasi,lemari_tingkat_ke:tingkat,lemari_box_ke:box}).where('lemari_id','<>',id).first();
            if (duplicate) return res.status(406).json({type:'error',message:'Lemari Arsip sudah digunakan'});
            await trx("mst_lemari_arsip").where("lemari_id", id).update({lemari_bu_id:domain,lemari_name:name,lemari_lokasi_arsip_id:lokasi,lemari_tingkat_ke:tingkat,lemari_box_ke:box,lemari_urutan_doc:urutan,lemari_arsip_status:status,updated_by:empid,updated_at:now});
        }else{
            const exists = await trx("mst_lemari_arsip").where({lemari_bu_id:domain,lemari_name:name,lemari_lokasi_arsip_id:lokasi,lemari_tingkat_ke:tingkat,lemari_box_ke:box}).first();
            if (exists) return res.status(406).json({type:'error',message:'Lemari Arsip sudah digunakan'});
            await trx("mst_lemari_arsip").insert({lemari_bu_id:domain,lemari_name:name,lemari_lokasi_arsip_id:lokasi,lemari_tingkat_ke:tingkat,lemari_box_ke:box,lemari_urutan_doc:urutan,lemari_arsip_status:status,created_by:empid,created_at:now,updated_by:empid,updated_at:now});
        }
        await trx.commit();
        return res.json("sukses");
    } catch (error) {
        await trx.rollback();
        logger(error, 'POST /saveLemariArsip', req.body);
        return res.status(406).json(getErrorResponse(error));
    }
};

export const listJenisApproval = async (req, res) => {
    // #swagger.tags = ['Master1']
  /* #swagger.security = [{
          "bearerAuth": []
  }] */
  // #swagger.description = 'Fungsi untuk show data jenis approval'
    try {
      const {rowsPerPage, filter,limit,code,needle, descending, sortBy, page:pageNum} = req.query;
      const baseQuery=dbDMS('mst_approval_jenis')
      if (rowsPerPage==null) {
        let query = baseQuery.distinct('app_jns_id', 'app_jns_desc');
        query.where('app_jns_status',1)
        if (code) {
            query = query.where('app_jns_id', code);
        }
        if (needle) {
            query = query.where('app_jns_desc', 'like', `%${needle}%`);
        }
        return res.status(200).json(await query.orderBy("app_jns_desc").limit(limit))
      }
      const sorting = descending === "true" ? "desc" : "asc";
      const columnSort = sortBy === "asc" ? "app_jns_desc asc" : `${sortBy} ${sorting}`;
      let query = baseQuery.select('app_jns_id','app_jns_desc','app_jns_status');
      
      if (filter) query = query.where("app_jns_desc", "like", `%${filter}%`);
      
      res.status(200).json(await query.orderByRaw(columnSort).paginate({ perPage: Math.floor(rowsPerPage), currentPage: Math.floor(pageNum), isLengthAware: true }));
    } catch (error) {
      console.log(error)
      logger(error, 'GET /listJenisApproval', req.query);
      return res.status(406).json(getErrorResponse(error));
    }
  };

export const saveJenisApproval = async (req, res) => {
    // #swagger.tags = ['Master1']
    /* #swagger.security = [{
            "bearerAuth": []
        }] */
    // #swagger.description = 'Update data jenis approval'
    const trx = await dbDMS.transaction();
    try { 
        const {creator:empidDecrypt,jenis,status,id,update}=req.body;
        const empid = decrypt(empidDecrypt);
        const now = dayjs().format("YYYY-MM-DD HH:mm:ss");
        
        if (update){
            const duplicate = await trx("mst_approval_jenis").where("app_jns_desc", jenis).where('app_jns_id','<>',id).first();
            if (duplicate) return res.status(406).json({type:'error',message:'Jenis Approval sudah digunakan'});
            await trx("mst_approval_jenis").where("app_jns_id", id).update({app_jns_desc:jenis,app_jns_status:status,updated_by:empid,updated_at:now});
        }else{
            const exists = await trx("mst_approval_jenis").where("app_jns_desc", jenis).first();
            if (exists) return res.status(406).json({type:'error',message:'Jenis Approval sudah digunakan'});
            await trx("mst_approval_jenis").insert({app_jns_desc:jenis,app_jns_status:status,created_by:empid,created_at:now,updated_by:empid,updated_at:now});
        }
        await trx.commit();
        return res.json("sukses");
    } catch (error) {
        await trx.rollback();
        logger(error, 'POST /saveJenisApproval', req.body);
        return res.status(406).json(getErrorResponse(error));
    }
};