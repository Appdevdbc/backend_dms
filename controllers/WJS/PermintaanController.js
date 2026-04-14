import dayjs from "dayjs";
import { dbDMS } from "../../config/db.js";
import { logger } from "../../helpers/logger.js";
import { decrypt, encrypt, getErrorResponse } from "../../helpers/utils.js";

export const listPermintaan = async (req, res) => {
  // #swagger.tags = ['Permintaan']
  /* #swagger.security = [{
          "bearerAuth": []
  }] */
  // #swagger.description = 'Fungsi untuk show data permintaan'
  try {
    if (req.query.rowsPerPage == null) {
      res.status(200).json('sukses');
    } else {
      const sorting = req.query.descending === "true" ? "desc" : "asc";
      const columnSort =
        req.query.sortBy === "asc"
          ? "pinjam_no_tiket asc"
          : `${req.query.sortBy} ${sorting}`;

      const page = Math.floor(req.query.page);
      const query = dbDMS('trs_permintaan_arsip')
        .innerJoin('content', 'trs_permintaan_arsip.pinjam_nomor_doc', 'content.content_doc')
        .leftJoin('v_mstr_employee_ext', function() {
          this.on(dbDMS.raw('trs_permintaan_arsip.pinjam_user_approve collate sql_latin1_general_cp1_ci_as'), '=', 'v_mstr_employee_ext.id')
        })
        .leftJoin('mst_lokasi_arsip', 'content.lokasi_arsip_id', 'mst_lokasi_arsip.lokasi_arsip_id')
        .select('pinjam_no_tiket', 'pinjam_aktivitas', 'pinjam_tgl_create', 'pinjam_nama_doc', 'arsip_no', 'pinjam_nomor_doc', 'lokasi_arsip_name', 'content_security', 'pinjam_tgl_est_ambil_to', 'pinjam_tgl_est_kembali_to')
        .where((query) => {
          if (req.query.filter != null) {
            query.orWhere("pinjam_no_tiket", "like", `%${req.query.filter}%`);
          }
        })
        .orderByRaw(columnSort);
      
      console.log('SQL Query:', query.toSQL().sql);
      console.log('Bindings:', query.toSQL().bindings);
      
      const response = await query.paginate({
        perPage: Math.floor(req.query.rowsPerPage),
        currentPage: page,
        isLengthAware: true,
      });

      res.status(200).json(response);
    }
  } catch (error) {
    console.log(error)
    logger(error, 'GET /listPermintaan', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

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
        .select('perj_id', 'perj_desc')
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
    const { creator: empidDecrypt, kode, perjanjian } = req.body
    const empid = decrypt(empidDecrypt)
    const now = dayjs().format("YYYY-MM-DD HH:mm:ss")

    if (await trx("mst_jenis_prj").where("perj_id", kode).first()) {
      await trx("mst_jenis_prj").where("perj_id", kode).update({ perj_desc: perjanjian, updated_by: empid, updated_at: now });
    } else {
      await trx("mst_jenis_prj").insert({ perj_id: kode, perj_desc: perjanjian, created_by: empid, created_at: now, updated_by: empid, updated_at: now });
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
    if (docUsed) return res.status(406).json({ type: 'error', message: 'Tidak bisa dihapus karena perjanjian digunakan' });
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
      res.status(200).json('sukses');
    } else {
      const sorting = req.query.descending === "true" ? "desc" : "asc";
      const columnSort =
        req.query.sortBy === "asc"
          ? "work_desc asc"
          : `${req.query.sortBy} ${sorting}`;

      const page = Math.floor(req.query.page);
      const response = await dbDMS('mst_work_location')
        .select('work_id', 'work_desc', 'work_code')
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
    const { creator: empidDecrypt, kode, work, update } = req.body;
    const empid = decrypt(empidDecrypt);
    const now = dayjs().format("YYYY-MM-DD HH:mm:ss");
    const workname = await trx('v_map_employee_data').select('work_location_name').where('work_location_code', work).first();

    if (update) {
      const duplicate = await trx("mst_work_location").where("work_code", kode).where('work_id', '<>', work).first();
      if (duplicate) return res.status(406).json({ type: 'error', message: 'Kode Lokasi Kerja sudah digunakan' });
      await trx("mst_work_location").where("work_id", work).update({ work_desc: workname.work_location_name, work_code: kode, updated_by: empid, updated_at: now });
    } else {
      const exists = await trx("mst_work_location").where("work_id", work).first();
      if (exists) return res.status(406).json({ type: 'error', message: 'Lokasi kerja sudah digunakan' });
      await trx("mst_work_location").insert({ work_id: work, work_desc: workname.work_location_name, work_code: kode, created_by: empid, created_at: now, updated_by: empid, updated_at: now });
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
    if (docUsed) return res.status(406).json({ type: 'error', message: 'Tidak bisa dihapus karena lokasi kerja digunakan' });
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
        .select('kat_desc', 'kat_kode', 'kat_notif', 'kat_id')
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
    const { creator: empidDecrypt, kat_kode, kat_desc, kat_notif, id, update } = req.body;
    const empid = decrypt(empidDecrypt);
    const now = dayjs().format("YYYY-MM-DD HH:mm:ss");

    if (update) {
      const duplicate = await trx("mst_kategori_doc").where("kat_kode", kat_kode).where('kat_id', '<>', id).first();
      if (duplicate) return res.status(406).json({ type: 'error', message: 'Kode Kategori sudah digunakan' });
      await trx("mst_kategori_doc").where("kat_kode", kat_kode).update({ kat_kode: kat_kode, kat_desc: kat_desc, kat_notif: kat_notif, updated_by: empid, updated_at: now });
    } else {
      const exists = await trx("mst_kategori_doc").where("kat_kode", kat_kode).first();
      if (exists) return res.status(406).json({ type: 'error', message: 'Kode kategori sudah digunakan' });
      await trx("mst_kategori_doc").insert({ kat_kode: kat_kode, kat_desc: kat_desc, kat_notif: kat_notif, created_by: empid, created_at: now, updated_by: empid, updated_at: now });
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
    if (docUsed) return res.status(406).json({ type: 'error', message: 'Tidak bisa dihapus karena data sudah digunakan pada transaksi' });
    await dbDMS("mst_kategori_doc").where("kat_kode", kode).delete();
    return res.json("success");
  } catch (error) {
    logger(error, 'POST /deleteDocKategori', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};