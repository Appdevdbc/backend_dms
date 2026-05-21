import dayjs from "dayjs";
import path from "path";
import { fileURLToPath } from "url";
import { dbWJS, dbSPK } from "../../config/db.js";
import { logger } from "../../helpers/logger.js";
import { decrypt, getErrorResponse } from "../../helpers/utils.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Helper: cek proses sedang berjalan ───────────────────────────────────────
const isRunning = (q) =>
  q.whereNotNull("start").whereNull("finish").whereNull("postpone");

// ─── Helper: close SPK Online ─────────────────────────────────────────────────
const closeSPKOnline = async (id_spk) => {
  try {
    const data = await dbWJS("spk").select("no_spkonline").where("id_spk", id_spk).first();
    if (data?.no_spkonline) {
      await dbSPK.raw(`exec [sp_close] '${data.no_spkonline}', null, 'SPK telah selesai dikerjakan'`);
    }
  } catch (e) {
    // integrasi SPK online tidak boleh gagalkan proses utama
    console.error("closeSPKOnline error:", e.message);
  }
};

// ─── 1. LIST SPK TERIMA ───────────────────────────────────────────────────────
export const listTerimaSPK = async (req, res) => {
  // #swagger.tags = ['TerimaSPK']
  /* #swagger.security = [{ "bearerAuth": [] }] */
  // #swagger.description = 'List SPK dengan status terima, filter by id_group'
  try {
    const { id_group, page, rowsPerPage, sortBy, descending, filter } = req.query;
    const sorting = descending === "true" ? "desc" : "asc";
    const columnSort = sortBy ? `${sortBy} ${sorting}` : "id_spk asc";

    let query = dbWJS("SPK as a")
      .select("a.*", "b.nama as dept")
      .leftJoin("Department as b", "a.id_dept", "b.id_dept")
      .where("a.status", "terima");

    if (id_group) query = query.where("a.id_group", id_group);
    if (filter) {
      query = query.where((q) => {
        q.orWhere("a.id_spk", "like", `%${filter}%`)
          .orWhere("a.subject", "like", `%${filter}%`)
          .orWhere("b.nama", "like", `%${filter}%`);
      });
    }

    if (!rowsPerPage) return res.status(200).json(await query.orderByRaw(columnSort));

    const response = await query.orderByRaw(columnSort).paginate({
      perPage: Math.floor(rowsPerPage),
      currentPage: Math.floor(page) || 1,
      isLengthAware: true,
    });
    return res.status(200).json(response);
  } catch (error) {
    logger(error, "GET /terimaSPK/list", req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

// ─── 2. CREATE SPK ────────────────────────────────────────────────────────────
export const createTerimaSPK = async (req, res) => {
  // #swagger.tags = ['TerimaSPK']
  /* #swagger.security = [{ "bearerAuth": [] }] */
  // #swagger.description = 'Tambah SPK baru'
  const trx = await dbWJS.transaction();
  try {
    const { tanggal, tipe, jenis, target_selesai, subject, id_dept, creator } = req.body;

    // Validasi mandatory
    const missing = [];
    if (!tanggal) missing.push("Tanggal");
    if (!tipe) missing.push("Tipe");
    if (!jenis) missing.push("Jenis");
    if (!target_selesai) missing.push("Target Selesai");
    if (!subject) missing.push("Subject");
    if (!id_dept) missing.push("Departemen");
    if (!creator) missing.push("Creator");
    if (missing.length)
      return res.status(400).json({ type: "error", message: `Field berikut wajib diisi: ${missing.join(", ")}` });

    const empid = decrypt(creator);
    const now = dayjs().format("YYYY-MM-DD HH:mm:ss");

    const groupDept = await trx("Group_Dept").where("dept_id", id_dept).first();
    if (!groupDept) return res.status(406).json({ type: "error", message: "Department tidak ditemukan di GroupDept" });

    const query = trx("SPK").insert({
      tanggal, tipe, jenis, target_selesai, subject,
      id_dept, id_group: groupDept.grp_id,
      status: "terima",
      // created_by: empid, 
      created_at: now,
      // updated_by: empid, 
      updated_at: now,
    });

    console.log(query.toString()); // tampilkan raw SQL

    const [id_spk] = await query;

    await trx.commit();
    return res.status(200).json({ message: "SPK berhasil dibuat", id_spk });
  } catch (error) {
    await trx.rollback();
    logger(error, "POST /terimaSPK/create", req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

// ─── 3. GET SPK BY ID ─────────────────────────────────────────────────────────
export const getTerimaSPK = async (req, res) => {
  // #swagger.tags = ['TerimaSPK']
  /* #swagger.security = [{ "bearerAuth": [] }] */
  try {
    const { id } = req.params;
    const data = await dbWJS("SPK as a")
      .select("a.*", "b.nama as dept")
      .leftJoin("Department as b", "a.id_dept", "b.id_dept")
      .where("a.id_spk", id)
      .first();
    if (!data) return res.status(404).json({ type: "error", message: "SPK tidak ditemukan" });
    return res.status(200).json(data);
  } catch (error) {
    logger(error, "GET /terimaSPK/:id", req.params);
    return res.status(406).json(getErrorResponse(error));
  }
};

// ─── 4. UPDATE SPK ────────────────────────────────────────────────────────────
export const updateTerimaSPK = async (req, res) => {
  // #swagger.tags = ['TerimaSPK']
  /* #swagger.security = [{ "bearerAuth": [] }] */
  // #swagger.description = 'Update data SPK'
  const trx = await dbWJS.transaction();
  try {
    const { id } = req.params;
    const { tanggal, tipe, jenis, target_selesai, subject, id_dept, creator } = req.body;
    const empid = decrypt(creator);
    const now = dayjs().format("YYYY-MM-DD HH:mm:ss");

    const groupDept = await trx("Group_Dept").where("dept_id", id_dept).first();
    if (!groupDept) return res.status(406).json({ type: "error", message: "Department tidak ditemukan di GroupDept" });

    await trx("SPK").where("id_spk", id).update({
      tanggal, tipe, jenis, target_selesai, subject,
      id_dept, id_group: groupDept.grp_id,
      // updated_by: empid, 
      // updated_at: now,
    });

    await trx.commit();
    return res.status(200).json({ message: "SPK berhasil diupdate" });
  } catch (error) {
    await trx.rollback();
    logger(error, `PUT /terimaSPK/update/${req.params.id}`, req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

// ─── 5. DELETE SPK ────────────────────────────────────────────────────────────
export const deleteTerimaSPK = async (req, res) => {
  // #swagger.tags = ['TerimaSPK']
  /* #swagger.security = [{ "bearerAuth": [] }] */
  // #swagger.description = 'Hapus SPK, mendukung single (id) dan bulk (ids[])'
  const trx = await dbWJS.transaction();
  try {
    const { id, ids } = req.body;
    const spkIds = ids && Array.isArray(ids) ? ids : [id];

    for (const spkId of spkIds) {
      // Cek apakah ada data Machining Proses (SPK_Part) yang terkait
      const partCount = await trx("SPK_Part").where("id_spk", spkId).count("* as cnt").first();
      if (partCount.cnt > 0) {
        await trx.rollback();
        return res.status(406).json({
          type: "error",
          message: `SPK ${spkId} tidak bisa dihapus karena masih memiliki ${partCount.cnt} data Machining Proses. Silakan hapus data Machining Proses terlebih dahulu melalui menu Machining Proses pada SPK tersebut.`,
        });
      }

      // Cek apakah ada data Scan Operator yang terkait
      const scanOptCount = await trx("Scan_Operator").where("id_spk", spkId).count("* as cnt").first();
      if (scanOptCount.cnt > 0) {
        await trx.rollback();
        return res.status(406).json({
          type: "error",
          message: `SPK ${spkId} tidak bisa dihapus karena sudah memiliki data scan operator. SPK yang sudah pernah diproses tidak dapat dihapus.`,
        });
      }

      // Cek apakah ada data Scan SPV yang terkait
      const scanSpvCount = await trx("Scan_SPV").where("id_spk", spkId).count("* as cnt").first();
      if (scanSpvCount.cnt > 0) {
        await trx.rollback();
        return res.status(406).json({
          type: "error",
          message: `SPK ${spkId} tidak bisa dihapus karena sudah memiliki data scan supervisor. SPK yang sudah pernah diproses tidak dapat dihapus.`,
        });
      }
    }

    // Semua validasi lolos, hapus SPK
    await trx("SPK").whereIn("id_spk", spkIds).delete();
    await trx.commit();

    return res.status(200).json({ message: "SPK berhasil dihapus" });
  } catch (error) {
    await trx.rollback();
    logger(error, "POST /terimaSPK/delete", req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

// ─── 6. PROSES STORE (status: tutup | proses) ────────────────────────────────
export const prosesStore = async (req, res) => {
  // #swagger.tags = ['TerimaSPK']
  /* #swagger.security = [{ "bearerAuth": [] }] */
  // #swagger.description = 'Ubah status SPK ke tutup atau proses (prosesStore v1)'
  try {
    const { status, table_id, tbl } = req.body;
    const ids = tbl ? tbl.map((t) => t.table_id) : [table_id];

    for (const id of ids) {
      const spk = await dbWJS("SPK").where("id_spk", id).first();
      if (!spk) return res.status(406).json({ status: false, title: "Gagal !!", message: `SPK ${id} tidak ditemukan` });

      if (status === "tutup") {
        if (spk.jenis === "repair") {
          const scanSpv = await dbWJS("Scan_SPV").where("id_spk", id).count("* as cnt").first();
          const scanOpt = await dbWJS("Scan_Operator").where("id_spk", id).count("* as cnt").first();
          if (!scanSpv.cnt || !scanOpt.cnt)
            return res.json({ status: false, title: "Gagal !!", message: "SPK belum mulai proses machining" });

          const logScan = await dbWJS("Log_Scan").where("log_id_spk", id).count("* as cnt").first();
          if (logScan.cnt > 0)
            return res.json({ status: false, title: "Gagal !!", message: "Status SPK sedang berjalan" });

          await dbWJS("SPK").where("id_spk", id).update({ status: "tutup" });
          await closeSPKOnline(id);
        } else {
          const scanOpt = await dbWJS("Scan_Operator").where("id_spk", id).count("* as cnt").first();
          if (!scanOpt.cnt)
            return res.json({ status: false, title: "Gagal !!", message: "SPK belum mulai proses" });

          const running = await isRunning(dbWJS("Scan_Operator").where("id_spk", id)).count("* as cnt").first();
          if (running.cnt > 0)
            return res.json({ status: false, title: "Gagal !!", message: "Masih ada proses yang sedang berjalan tidak dapat diclose" });

          await dbWJS("SPK").where("id_spk", id).update({ status: "tutup" });
          await closeSPKOnline(id);
        }
      } else if (status === "proses") {
        if (spk.jenis === "repair") {
          const dueDateOk = await dbWJS("SPK").where("id_spk", id)
            .whereNotNull("target_analisis_start").whereNotNull("target_analisis_finish")
            .whereNotNull("target_machining_start").whereNotNull("target_machining_finish")
            .whereNotNull("target_assy_start").whereNotNull("target_assy_finish")
            .whereNotNull("target_trial_start").whereNotNull("target_trial_finish")
            .count("* as cnt").first();
          if (!dueDateOk.cnt)
            return res.json({ status: false, title: "Gagal !!", message: `Due date pada SPK ${id} belum disetting pada semua proses.` });

          const bongkar = await dbWJS("Scan_Spv").where("id_spk", id).where("section", "bongkar_analisis").orderBy("id", "desc").first();
          if (!bongkar)
            return res.json({ status: false, title: "Gagal !!", message: "Proses Bongkar belum dimulai" });
          if (bongkar.start && !bongkar.postpone && !bongkar.finish)
            return res.json({ status: false, title: "Gagal !!", message: "Proses Bongkar sedang berjalan" });
          if (bongkar.start && bongkar.postpone && !bongkar.finish)
            return res.json({ status: false, title: "Gagal !!", message: "Proses Bongkar sedang Postpone" });

          // bongkar selesai — cek order_part
          const orderPart = await dbWJS("Scan_Spv").where("id_spk", id).where("section", "order_part").orderBy("id", "desc").first();
          if (!orderPart) {
            await dbWJS("SPK").where("id_spk", id).update({ status: "proses" });
          } else {
            if (orderPart.start && !orderPart.postpone && !orderPart.finish)
              return res.json({ status: false, title: "Gagal !!", message: "Proses Order Part sedang berjalan" });
            if (orderPart.start && orderPart.postpone && !orderPart.finish)
              return res.json({ status: false, title: "Gagal !!", message: "Proses Order Part sedang Postpone" });
            await dbWJS("SPK").where("id_spk", id).update({ status: "proses" });
          }
        } else {
          const dueDateOk = await dbWJS("SPK").where("id_spk", id)
            .whereNotNull("target_machining_start").whereNotNull("target_machining_finish")
            .count("* as cnt").first();
          if (!dueDateOk.cnt)
            return res.json({ status: false, title: "Gagal !!", message: `Due date machining pada SPK ${id} belum disetting.` });

          const running = await isRunning(dbWJS("Scan_Operator").where("id_spk", id)).count("* as cnt").first();
          if (running.cnt > 0)
            return res.json({ status: false, title: "Gagal !!", message: "Masih ada proses yang sedang berjalan tidak dapat diclose" });

          await dbWJS("SPK").where("id_spk", id).update({ status: "proses" });
        }
      }
    }

    return res.json({ status: true, title: "Sukses", message: "SPK sukses diupdate" });
  } catch (error) {
    logger(error, "POST /terimaSPK/prosesStore", req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

// ─── 7. PROSES STORE 2 (status: close | proses) ──────────────────────────────
export const prosesStore2 = async (req, res) => {
  // #swagger.tags = ['TerimaSPK']
  /* #swagger.security = [{ "bearerAuth": [] }] */
  // #swagger.description = 'Ubah status SPK ke close atau proses (prosesStore v2)'
  try {
    const { status, table_id, tbl } = req.body;
    const ids = tbl ? tbl.map((t) => t.table_id) : [table_id];
    const now = dayjs().format("YYYY-MM-DD HH:mm:ss");

    for (const id of ids) {
      const spk = await dbWJS("SPK").where("id_spk", id).first();
      if (!spk) return res.status(406).json({ status: false, title: "Gagal !!", message: `SPK ${id} tidak ditemukan` });

      if (status === "close") {
        if (spk.jenis === "repair") {
          const scanSpv = await dbWJS("Scan_SPV").where("id_spk", id).count("* as cnt").first();
          const scanOpt = await dbWJS("Scan_Operator").where("id_spk", id).count("* as cnt").first();
          if (!scanSpv.cnt || !scanOpt.cnt)
            return res.json({ status: false, title: "Gagal !!", message: "SPK belum mulai proses" });

          const runningSpv = await isRunning(dbWJS("Scan_SPV").where("id_spk", id)).count("* as cnt").first();
          const runningOpt = await isRunning(dbWJS("Scan_Operator").where("id_spk", id)).count("* as cnt").first();
          if (runningSpv.cnt > 0 || runningOpt.cnt > 0)
            return res.json({ status: false, title: "Gagal !!", message: "SPK sedang dalam proses tidak bisa di close" });

          await dbWJS("SPK").where("id_spk", id).update({ status: "close", close_at: now });
        } else {
          const scanOpt = await dbWJS("Scan_Operator").where("id_spk", id).count("* as cnt").first();
          if (!scanOpt.cnt)
            return res.json({ status: false, title: "Gagal !!", message: "SPK belum mulai proses" });

          const running = await isRunning(dbWJS("Scan_Operator").where("id_spk", id)).count("* as cnt").first();
          if (running.cnt > 0)
            return res.json({ status: false, title: "Gagal !!", message: "Masih ada proses yang sedang berjalan tidak dapat diclose" });

          await dbWJS("SPK").where("id_spk", id).update({ status: "close", close_at: now });
        }
      } else if (status === "proses") {
        if (spk.jenis === "repair") {
          const bongkarCount = await dbWJS("Scan_Spv").where("id_spk", id).where("section", "bongkar_analisis").count("* as cnt").first();
          if (!bongkarCount.cnt)
            return res.json({ status: false, title: "Gagal !!", message: "SPK belum mulai proses Bongkar Analisis" });

          const bongkarRunning = await isRunning(dbWJS("Scan_Spv").where("id_spk", id).where("section", "bongkar_analisis")).count("* as cnt").first();
          if (bongkarRunning.cnt > 0)
            return res.json({ status: false, title: "Gagal !!", message: "SPK sedang dalam proses Bongkar tidak dapat diproses" });

          // cek drawing
          const drawingCount = await dbWJS("Scan_Spv").where("id_spk", id).where("section", "drawing").count("* as cnt").first();
          if (drawingCount.cnt > 0) {
            const drawingRunning = await isRunning(dbWJS("Scan_Spv").where("id_spk", id).where("section", "drawing")).count("* as cnt").first();
            if (drawingRunning.cnt > 0)
              return res.json({ status: false, title: "Gagal !!", message: "SPK belum selesai proses drawing" });
          } else {
            return res.json({ status: false, title: "Gagal !!", message: "SPK belum mulai proses drawing" });
          }

          // cek order_part
          const orderCount = await dbWJS("Scan_Spv").where("id_spk", id).where("section", "order_part").count("* as cnt").first();
          if (orderCount.cnt > 0) {
            const orderRunning = await isRunning(dbWJS("Scan_Spv").where("id_spk", id).where("section", "order_part")).count("* as cnt").first();
            if (orderRunning.cnt > 0)
              return res.json({ status: false, title: "Gagal !!", message: "SPK belum selesai proses order part" });
          }

          await dbWJS("SPK").where("id_spk", id).update({ status: "proses" });
        } else {
          const running = await isRunning(dbWJS("Scan_Operator").where("id_spk", id)).count("* as cnt").first();
          if (running.cnt > 0)
            return res.json({ status: false, title: "Gagal !!", message: "Masih ada proses yang sedang berjalan tidak dapat diclose" });

          await dbWJS("SPK").where("id_spk", id).update({ status: "proses" });
        }
      }
    }

    return res.json({ status: true, title: "Sukses", message: "SPK sukses diupdate" });
  } catch (error) {
    logger(error, "POST /terimaSPK/prosesStore2", req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

// ─── 8. GET DUE DATE ──────────────────────────────────────────────────────────
export const getDuedate = async (req, res) => {
  // #swagger.tags = ['TerimaSPK']
  /* #swagger.security = [{ "bearerAuth": [] }] */
  // #swagger.description = 'Get due date data untuk form edit'
  try {
    const { id } = req.params;
    const data = await dbWJS("SPK")
      .select(
        "id_spk",
        "target_analisis_start", "target_analisis_finish",
        "target_drawing_start", "target_drawing_finish",
        "target_order_start", "target_order_finish",
        "target_machining_start", "target_machining_finish",
        "target_assy_start", "target_assy_finish",
        "target_trial_start", "target_trial_finish"
      )
      .where("id_spk", id)
      .first();
    
    if (!data) return res.status(404).json({ type: "error", message: "SPK tidak ditemukan" });
    return res.status(200).json(data);
  } catch (error) {
    logger(error, `GET /terimaSPK/duedate/${req.params.id}`, req.params);
    return res.status(406).json(getErrorResponse(error));
  }
};

// ─── 9. UPDATE DUE DATE ───────────────────────────────────────────────────────
export const updateDuedate = async (req, res) => {
  // #swagger.tags = ['TerimaSPK']
  /* #swagger.security = [{ "bearerAuth": [] }] */
  // #swagger.description = 'Update due date semua proses pada SPK'
  try {
    const { id } = req.params;
    const {
      target_analisis_start, target_analisis_finish,
      target_drawing_start, target_drawing_finish,
      target_order_start, target_order_finish,
      target_machining_start, target_machining_finish,
      target_assy_start, target_assy_finish,
      target_trial_start, target_trial_finish,
    } = req.body;

    await dbWJS("SPK").where("id_spk", id).update({
      target_analisis_start, target_analisis_finish,
      target_drawing_start, target_drawing_finish,
      target_order_start, target_order_finish,
      target_machining_start, target_machining_finish,
      target_assy_start, target_assy_finish,
      target_trial_start, target_trial_finish,
    });

    return res.status(200).json({ message: "Due date berhasil diupdate" });
  } catch (error) {
    logger(error, `PUT /terimaSPK/duedate/${req.params.id}`, req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

// ─── 9. UPDATE DUE DATE ───────────────────────────────────────────────────────
export const listMachining = async (req, res) => {
  // #swagger.tags = ['TerimaSPK']
  /* #swagger.security = [{ "bearerAuth": [] }] */
  // #swagger.description = 'List machining proses per SPK, termasuk resolve nama urutan proses'
  try {
    const { id_spk, page, rowsPerPage, sortBy, descending, filter } = req.query;
    const sorting = descending === "true" ? "desc" : "asc";
    const columnSort = sortBy ? `${sortBy} ${sorting}` : "a.id_spkpart asc";

    let query = dbWJS("SPK_Part as a")
      .select("a.id_spkpart", "a.id_spk", "a.id_part", "a.proses", "c.id_group", "b.nama_part")
      .leftJoin("Part as b", "a.id_part", "b.id_part")
      .leftJoin("SPK as c", "a.id_spk", "c.id_spk")
      .where("a.id_spk", id_spk);

    if (filter) {
      query = query.where((q) => {
        q.orWhere("b.nama_part", "like", `%${filter}%`);
      });
    }

    let rows;
    let meta = null;

    if (!rowsPerPage) {
      rows = await query.orderByRaw(columnSort);
    } else {
      const paginated = await query.orderByRaw(columnSort).paginate({
        perPage: Math.floor(rowsPerPage),
        currentPage: Math.floor(page) || 1,
        isLengthAware: true,
      });
      rows = paginated.data;
      meta = paginated;
    }

    // Resolve nama proses dari string ID koma-separated (setara machiningGetData PHP)
    // Kumpulkan semua ID proses unik dari seluruh baris sekaligus — 1 query saja
    const allProsesIds = [...new Set(
      rows.flatMap((r) => (r.proses ? r.proses.split(",").filter(Boolean) : []))
    )];

    let prosesMap = {};
    if (allProsesIds.length) {
      const prosesData = await dbWJS("Proses_Machining")
        .select("id_proses", "nama")
        .whereIn("id_proses", allProsesIds);
      prosesMap = Object.fromEntries(prosesData.map((p) => [String(p.id_proses), p.nama]));
    }

    const resolved = rows.map((r) => ({
      ...r,
      proses_list: r.proses
        ? r.proses.split(",").filter(Boolean).map((id) => prosesMap[id] ?? id).join(", ")
        : "",
    }));

    if (!rowsPerPage) return res.status(200).json(resolved);

    return res.status(200).json({ ...meta, data: resolved });
  } catch (error) {
    logger(error, "GET /terimaSPK/machining/list", req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

// ─── 10. LIST MACHINING PROSES ─────────────────────────────────────────────────
export const createMachining = async (req, res) => {
  // #swagger.tags = ['TerimaSPK']
  /* #swagger.security = [{ "bearerAuth": [] }] */
  // #swagger.description = 'Tambah machining proses pada SPK'
  const trx = await dbWJS.transaction();
  try {
    const { id_spk, id_part, proses, saveTemplate, creator } = req.body;
    const empid = decrypt(creator);
    const now = dayjs().format("YYYY-MM-DD HH:mm:ss");
    const cleanProses = proses.replace(/,0/g, "");

    await trx("SPK_Part").insert({
      id_spk, id_part, proses: cleanProses,
      // created_by: empid, 
      created_at: now,
      // updated_by: empid, 
      updated_at: now,
    });

    if (saveTemplate === "Y") {
      await trx("Template").insert({
        id_plate: id_part, proses: cleanProses,
        // created_by: empid, 
        created_at: now,
      });
    }

    await trx.commit();
    return res.status(200).json({ message: "Machining proses berhasil dibuat" });
  } catch (error) {
    await trx.rollback();
    logger(error, "POST /terimaSPK/machining/create", req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

// ─── 11. UPDATE MACHINING PROSES ──────────────────────────────────────────────
export const updateMachining = async (req, res) => {
  // #swagger.tags = ['TerimaSPK']
  /* #swagger.security = [{ "bearerAuth": [] }] */
  // #swagger.description = 'Update machining proses'
  const trx = await dbWJS.transaction();
  try {
    const { id } = req.params;
    const { id_part, proses, saveTemplate, creator } = req.body;
    const empid = decrypt(creator);
    const now = dayjs().format("YYYY-MM-DD HH:mm:ss");
    const cleanProses = proses.replace(/,0/g, "");

    await trx("SPK_Part").where("id_spkpart", id).update({
      id_part, proses: cleanProses,
      // updated_by: empid, 
      updated_at: now,
    });

    if (saveTemplate === "Y") {
      await trx("Template").insert({
        id_plate: id_part, proses: cleanProses,
        created_by: empid, created_at: now,
      });
    }

    await trx.commit();
    return res.status(200).json({ message: "Machining proses berhasil diupdate" });
  } catch (error) {
    await trx.rollback();
    logger(error, `PUT /terimaSPK/machining/update/${req.params.id}`, req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

// ─── 12. DELETE MACHINING PROSES ──────────────────────────────────────────────
export const deleteMachining = async (req, res) => {
  // #swagger.tags = ['TerimaSPK']
  /* #swagger.security = [{ "bearerAuth": [] }] */
  // #swagger.description = 'Hapus machining proses, mendukung single (id) dan bulk (ids[])'
  try {
    const { id, ids } = req.body;
    if (ids && Array.isArray(ids)) {
      await dbWJS("SPK_Part").whereIn("id_spkpart", ids).delete();
    } else {
      await dbWJS("SPK_Part").where("id_spkpart", id).delete();
    }
    return res.status(200).json({ message: "Machining proses berhasil dihapus" });
  } catch (error) {
    logger(error, "POST /terimaSPK/machining/delete", req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

// ─── 13. GET TEMPLATE MACHINING ───────────────────────────────────────────────
export const getTemplateMachining = async (req, res) => {
  // #swagger.tags = ['TerimaSPK']
  /* #swagger.security = [{ "bearerAuth": [] }] */
  // #swagger.description = 'Load template machining proses — resolve nama dari Machining_Proses'
  try {
    const { id_template } = req.query;
    const template = await dbWJS("Template").where("id_template", id_template).first();
    if (!template) return res.status(404).json({ type: "error", message: "Template tidak ditemukan" });

    const prosesIds = template.proses.split(",").filter(Boolean);

    // Proses yang ada di template (urutan dipilih)
    const selectedProses = await dbWJS("Proses_Machining")
      .select("id_proses", "nama")
      .whereIn("id_proses", prosesIds)
      .orderBy("nama", "asc");

    // Proses yang belum dipakai di template (tersedia untuk dipilih)
    const remainingProses = await dbWJS("Proses_Machining")
      .select("id_proses", "nama")
      .whereNotIn("id_proses", prosesIds)
      .orderBy("nama", "asc");

    return res.status(200).json({ selectedProses, remainingProses });
  } catch (error) {
    logger(error, "GET /terimaSPK/machining/template", req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

// ─── 14. LIST MASTER MACHINING PROSES ────────────────────────────────────────
export const listMasterMachining = async (req, res) => {
  // #swagger.tags = ['TerimaSPK']
  /* #swagger.security = [{ "bearerAuth": [] }] */
  // #swagger.description = 'List master machining proses dan template untuk form tambah/edit'
  try {
    const { exclude } = req.query;
    const excludeIds = exclude ? exclude.split(",").filter(Boolean) : [];

    let query = dbWJS("Proses_Machining").select("id_proses", "nama").orderBy("nama", "asc");
    if (excludeIds.length) query = query.whereNotIn("id_proses", excludeIds);

    const proses = await query;
    const templates = await dbWJS("Template").select("id_template", "id_plate", "proses");
    const parts = await dbWJS("Part").select("id_part", "nama_part").orderBy("nama_part", "asc");

    return res.status(200).json({ proses, templates, parts });
  } catch (error) {
    logger(error, "GET /terimaSPK/machining/master", req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

// ─── 15. LIST SPK PROSES ──────────────────────────────────────────────────────
export const listProsesSPK = async (req, res) => {
  // #swagger.tags = ['TerimaSPK']
  /* #swagger.security = [{ "bearerAuth": [] }] */
  // #swagger.description = 'List SPK dengan status proses'
  try {
    const { page, rowsPerPage, sortBy, descending, filter } = req.query;
    const sorting = descending === "true" ? "desc" : "asc";
    const columnSort = sortBy ? `${sortBy} ${sorting}` : "a.id_spk asc";

    let query = dbWJS("SPK as a")
      .select("a.*", "b.nama as dept")
      .leftJoin("Department as b", "a.id_dept", "b.id_dept")
      .where("a.status", "proses");

    if (filter) {
      query = query.where((q) => {
        q.orWhere("a.id_spk", "like", `%${filter}%`)
          .orWhere("a.subject", "like", `%${filter}%`)
          .orWhere("b.nama", "like", `%${filter}%`);
      });
    }

    if (!rowsPerPage) return res.status(200).json(await query.orderByRaw(columnSort));

    const response = await query.orderByRaw(columnSort).paginate({
      perPage: Math.floor(rowsPerPage),
      currentPage: Math.floor(page) || 1,
      isLengthAware: true,
    });
    return res.status(200).json(response);
  } catch (error) {
    logger(error, "GET /terimaSPK/proses/list", req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

// ─── 16. UPDATE TARGET SELESAI ────────────────────────────────────────────────
export const updateTarget = async (req, res) => {
  // #swagger.tags = ['TerimaSPK']
  /* #swagger.security = [{ "bearerAuth": [] }] */
  // #swagger.description = 'Update target selesai SPK'
  try {
    const { id_spk, target_selesai } = req.body;
    await dbWJS("SPK").where("id_spk", id_spk).update({ target_selesai });
    return res.status(200).json({ message: "Target selesai berhasil diupdate" });
  } catch (error) {
    logger(error, "PUT /terimaSPK/proses/target", req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

// ─── 17. GET DETAIL STATUS SCAN ───────────────────────────────────────────────
export const getDetailStatus = async (req, res) => {
  // #swagger.tags = ['TerimaSPK']
  /* #swagger.security = [{ "bearerAuth": [] }] */
  // #swagger.description = 'Detail status scan per PIC dan mesin untuk satu SPK'
  try {
    const { no_spk } = req.query;
    const result = await dbWJS.raw(`
      SELECT
        DISTINCT pic,
        (SELECT opt_name FROM Employee WHERE opt_nik = pic) nama_pic,
        id_mesin,
        (SELECT nama FROM Machine WHERE id = id_mesin) nama_mesin,
        (
          SELECT SUM(
            CASE
              WHEN start IS NOT NULL AND postpone IS NOT NULL
                THEN CAST(CAST(DATEDIFF(SECOND, start, postpone) AS FLOAT)/3600 AS DECIMAL(10,1))
              WHEN start IS NOT NULL AND finish IS NOT NULL
                THEN CAST(CAST(DATEDIFF(SECOND, start, finish) AS FLOAT)/3600 AS DECIMAL(10,1))
              WHEN start IS NOT NULL AND postpone IS NULL AND finish IS NULL
                THEN CAST(CAST(DATEDIFF(SECOND, start, GETDATE()) AS FLOAT)/3600 AS DECIMAL(10,1))
              ELSE 0
            END
          ) jam
          FROM Scan_Operator
          WHERE id_spk = s.id_spk AND pic = s.pic AND id_mesin = s.id_mesin
        ) jam,
        (
          SELECT TOP 1
            CASE
              WHEN start IS NOT NULL AND postpone IS NOT NULL THEN 'Postpone'
              WHEN start IS NOT NULL AND finish IS NOT NULL THEN 'Finish'
              WHEN start IS NULL THEN 'Belum Start'
              WHEN start IS NOT NULL AND postpone IS NULL AND finish IS NULL THEN 'Start'
            END statuss
          FROM Scan_Operator
          WHERE id_spk = s.id_spk AND pic = s.pic AND id_mesin = s.id_mesin
          ORDER BY id DESC
        ) status
      FROM Scan_Operator s
      WHERE id_spk = ?

      UNION ALL

      SELECT
        DISTINCT pic,
        (SELECT opt_name FROM Employee WHERE opt_nik = pic) nama_pic,
        '' AS mesin,
        '' AS nama_mesin,
        (
          SELECT SUM(
            CASE
              WHEN start IS NOT NULL AND postpone IS NOT NULL
                THEN CAST(CAST(DATEDIFF(SECOND, start, postpone) AS FLOAT)/3600 AS DECIMAL(10,1))
              WHEN start IS NOT NULL AND finish IS NOT NULL
                THEN CAST(CAST(DATEDIFF(SECOND, start, finish) AS FLOAT)/3600 AS DECIMAL(10,1))
              WHEN start IS NOT NULL AND postpone IS NULL AND finish IS NULL
                THEN CAST(CAST(DATEDIFF(SECOND, start, GETDATE()) AS FLOAT)/3600 AS DECIMAL(10,1))
              ELSE 0
            END
          ) jam
          FROM Scan_SPV
          WHERE id_spk = s.id_spk AND pic = s.pic
        ) jam,
        (
          SELECT TOP 1
            CASE
              WHEN start IS NOT NULL AND postpone IS NOT NULL THEN 'Postpone'
              WHEN start IS NOT NULL AND finish IS NOT NULL THEN 'Finish'
              WHEN start IS NULL THEN 'Belum Start'
              WHEN start IS NOT NULL AND postpone IS NULL AND finish IS NULL THEN 'Start'
            END statuss
          FROM Scan_SPV
          WHERE id_spk = s.id_spk AND pic = s.pic
          ORDER BY id DESC
        ) status
      FROM Scan_SPV s
      WHERE id_spk = ?

      ORDER BY nama_pic
    `, [no_spk, no_spk]);

    return res.status(200).json(result);
  } catch (error) {
    logger(error, "GET /terimaSPK/proses/detail-status", req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

// ─── 18. LIST SPK CLOSE/TUTUP ─────────────────────────────────────────────────
export const listCloseSPK = async (req, res) => {
  // #swagger.tags = ['TerimaSPK']
  /* #swagger.security = [{ "bearerAuth": [] }] */
  // #swagger.description = 'List SPK dengan status tutup/close'
  try {
    const { page, rowsPerPage, sortBy, descending, filter } = req.query;
    const sorting = descending === "true" ? "desc" : "asc";
    const columnSort = sortBy ? `${sortBy} ${sorting}` : "a.id_spk asc";

    let query = dbWJS("SPK as a")
      .select("a.*", "b.nama as dept")
      .leftJoin("Department as b", "a.id_dept", "b.id_dept")
      .whereIn("a.status", ["tutup", "close"]);

    if (filter) {
      query = query.where((q) => {
        q.orWhere("a.id_spk", "like", `%${filter}%`)
          .orWhere("a.subject", "like", `%${filter}%`)
          .orWhere("b.nama", "like", `%${filter}%`);
      });
    }

    if (!rowsPerPage) return res.status(200).json(await query.orderByRaw(columnSort));

    const response = await query.orderByRaw(columnSort).paginate({
      perPage: Math.floor(rowsPerPage),
      currentPage: Math.floor(page) || 1,
      isLengthAware: true,
    });
    return res.status(200).json(response);
  } catch (error) {
    logger(error, "GET /terimaSPK/close/list", req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

// ─── 19. REOPEN SPK ───────────────────────────────────────────────────────────
export const reopenSPK = async (req, res) => {
  // #swagger.tags = ['TerimaSPK']
  /* #swagger.security = [{ "bearerAuth": [] }] */
  // #swagger.description = 'Reopen SPK dari status tutup/close ke proses'
  try {
    const { id } = req.body;
    await dbWJS("SPK").where("id_spk", id).update({ status: "proses", close_at: null });
    return res.status(200).json({ message: "SPK berhasil di-reopen" });
  } catch (error) {
    logger(error, "POST /terimaSPK/close/reopen", req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

// ─── 20. CETAK SPK (PDF) ──────────────────────────────────────────────────────
export const cetakSPK = async (req, res) => {
  // #swagger.tags = ['TerimaSPK']
  /* #swagger.security = [{ "bearerAuth": [] }] */
  // #swagger.description = 'Generate PDF cetak SPK menggunakan pdfmake, stream ke browser'
  try {
    const { id } = req.params;
    const spk = await dbWJS("SPK as a")
      .select("a.*", "b.nama as dept")
      .leftJoin("Department as b", "a.id_dept", "b.id_dept")
      .where("a.id_spk", id)
      .first();

    if (!spk) return res.status(404).json({ type: "error", message: "SPK tidak ditemukan" });

    const machining = await dbWJS("SPK_Part as a")
      .select("a.*", "b.nama_part")
      .leftJoin("Part as b", "a.id_part", "b.id_part")
      .where("a.id_spk", id);

    // Resolve nama proses — satu query untuk semua baris
    const allProsesIds = [...new Set(
      machining.flatMap((r) => (r.proses ? r.proses.split(",").filter(Boolean) : []))
    )];
    let prosesMap = {};
    if (allProsesIds.length) {
      const prosesData = await dbWJS("Proses_Machining").select("id_proses", "nama").whereIn("id_proses", allProsesIds).orderBy("nama");
      prosesMap = Object.fromEntries(prosesData.map((p) => [String(p.id_proses), p.nama]));
    }
    machining.forEach((item) => {
      item.proses_list = item.proses
        ? item.proses.split(",").filter(Boolean).map((pid) => prosesMap[pid] ?? pid).join(", ")
        : "-";
    });

    // ─── Generate PDF dengan pdfmake ─────────────────────────────────────────
    const PdfPrinter = (await import("pdfmake")).default;
    const fs = (await import("fs")).default;
    const fontPath = path.join(__dirname, "../../view/pdf");

    const fonts = {
      Roboto: {
        normal: path.join(fontPath, "Roboto-Regular.ttf"),
        bold: path.join(fontPath, "Roboto-Medium.ttf"),
        italics: path.join(fontPath, "Roboto-Italic.ttf"),
        bolditalics: path.join(fontPath, "Roboto-MediumItalic.ttf"),
      },
    };

    const printer = new PdfPrinter(fonts);

    const isRepair = spk.jenis === "repair";

    // ─── Tabel proses (repair vs general) ────────────────────────────────────
    const prosesTableRows = isRepair
      ? ["Bongkar Analisis", "Drawing", "Order Part", "Machining", "Assy", "Trial"]
      : ["Drawing", "Machining"];

    const prosesTableBody = [
      [
        { text: "PIC", rowSpan: 2, style: "th", alignment: "center" },
        { text: "Plan", colSpan: 2, style: "th", alignment: "center" },
        {},
        { text: "Actual", colSpan: 2, style: "th", alignment: "center" },
        {},
      ],
      [
        {},
        { text: "Start", style: "th", alignment: "center" },
        { text: "Finish", style: "th", alignment: "center" },
        { text: "Start", style: "th", alignment: "center" },
        { text: "Finish", style: "th", alignment: "center" },
      ],
      ...prosesTableRows.map((label) => [
        { text: label, fontSize: 9 },
        { text: "" },
        { text: "" },
        { text: "" },
        { text: "" },
      ]),
    ];

    // ─── Generate barcode Code128 dengan bwip-js ──────────────────────────────
    let barcodeElement;
    try {
      const bwipjs = (await import("bwip-js")).default;
      const barcodeBuffer = await bwipjs.toBuffer({
        bcid:         "code128",
        text:         String(spk.id_spk),
        scale:        2,
        height:       12,
        includetext:  false,
        paddingwidth: 2,
      });
      barcodeElement = {
        image: `data:image/png;base64,${barcodeBuffer.toString("base64")}`,
        width: 130,
        margin: [30, 0, 0, 10],
      };
    } catch {
      barcodeElement = { text: `Barcode: ${spk.id_spk}`, fontSize: 9, margin: [30, 0, 0, 10] };
    }

    const docDefinition = {
      pageSize: "A4",
      pageMargins: [40, 40, 40, 40],
      content: [
        // ─── Header ──────────────────────────────────────────────────────────
        {
          columns: [
            { text: "PT. WAHANA DUTA JAYA RUCIKA", bold: true, fontSize: 10, width: "*" },
            {
              stack: [
                { text: "SURAT PERINTAH KERJA", bold: true, fontSize: 13, decoration: "underline", alignment: "center" },
                { text: `No. SPK : ${spk.id_spk}`, fontSize: 10, alignment: "center" },
              ],
              width: 300,
            },
            { text: "", width: "*" },
          ],
          margin: [0, 0, 0, 6],
        },
        { canvas: [{ type: "line", x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1 }], margin: [0, 0, 0, 6] },

        // ─── Jenis Pekerjaan (checkbox) ───────────────────────────────────────
        {
          columns: [
            { text: "Jenis Pekerjaan :", fontSize: 9, width: "auto" },
            { width: 20, text: "" },
            {
              canvas: [{ type: "rect", x: 0, y: 0, w: 14, h: 14, lineWidth: 1 }],
              width: 20,
            },
            { text: isRepair ? "" : "X", fontSize: 9, width: 14, margin: [-20, 0, 0, 0] },
            { text: "General", fontSize: 9, width: "auto", margin: [4, 0, 0, 0] },
            { width: 20, text: "" },
            {
              canvas: [{ type: "rect", x: 0, y: 0, w: 14, h: 14, lineWidth: 1 }],
              width: 20,
            },
            { text: isRepair ? "X" : "", fontSize: 9, width: 14, margin: [-20, 0, 0, 0] },
            { text: "Repair", fontSize: 9, width: "auto", margin: [4, 0, 0, 0] },
          ],
          margin: [0, 0, 0, 4],
        },
        { canvas: [{ type: "line", x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1 }], margin: [0, 0, 0, 6] },

        // ─── Info SPK ─────────────────────────────────────────────────────────
        {
          table: {
            widths: [90, 10, "*"],
            body: [
              [
                { text: "Tanggal Order", fontSize: 9 },
                { text: ":", fontSize: 9 },
                { text: spk.tanggal ? dayjs(spk.tanggal).format("DD-MM-YYYY") : "-", fontSize: 9 },
              ],
              [
                { text: "Target Selesai", fontSize: 9 },
                { text: ":", fontSize: 9 },
                { text: spk.target_selesai ? dayjs(spk.target_selesai).format("DD-MM-YYYY") : "-", fontSize: 9 },
              ],
              [
                { text: "Dari Departemen", fontSize: 9 },
                { text: ":", fontSize: 9 },
                { text: spk.dept ?? "-", fontSize: 9 },
              ],
              [
                { text: "Jenis Pekerjaan", fontSize: 9 },
                { text: ":", fontSize: 9 },
                { text: spk.jenis ?? "-", fontSize: 9 },
              ],
              [
                { text: "Tipe Pekerjaan", fontSize: 9 },
                { text: ":", fontSize: 9 },
                { text: spk.tipe ?? "-", fontSize: 9 },
              ],
            ],
          },
          layout: "noBorders",
          margin: [0, 0, 0, 8],
        },

        // ─── Sketsa/Uraian ────────────────────────────────────────────────────
        {
          table: {
            widths: ["*"],
            heights: [120],
            body: [[
              {
                stack: [
                  { text: "Sketsa/Uraian :", decoration: "underline", fontSize: 9, margin: [0, 0, 0, 8] },
                  { text: spk.subject ?? "", fontSize: 9 },
                ],
                margin: [5, 5, 5, 5],
              },
            ]],
          },
          layout: {
            hLineWidth: () => 1,
            vLineWidth: () => 1,
            hLineColor: () => "#000",
            vLineColor: () => "#000",
          },
          margin: [0, 0, 0, 10],
        },

        // ─── Barcode Code128 (menggunakan bwip-js) ───────────────────────────
        barcodeElement,

        // ─── Tabel Plan/Actual ────────────────────────────────────────────────
        {
          table: {
            widths: ["*", 60, 60, 60, 60],
            body: prosesTableBody,
          },
          layout: {
            hLineWidth: () => 0.5,
            vLineWidth: () => 0.5,
            hLineColor: () => "#000",
            vLineColor: () => "#000",
            paddingLeft: () => 4,
            paddingRight: () => 4,
            paddingTop: () => 3,
            paddingBottom: () => 3,
          },
          margin: [0, 10, 0, 0],
        },
      ],
      styles: {
        th: { bold: true, fontSize: 9, fillColor: "#f0f0f0" },
      },
      defaultStyle: { fontSize: 9, font: "Roboto" },
    };

    const pdfDoc = printer.createPdfKitDocument(docDefinition);
    const filename = `SPK_${id}_${dayjs().format("YYYYMMDDHHmmss")}.pdf`;
    const pdfDir = path.join(__dirname, "../../file/pdf");
    if (!fs.existsSync(pdfDir)) fs.mkdirSync(pdfDir, { recursive: true });
    const filepath = path.join(pdfDir, filename);

    const writeStream = fs.createWriteStream(filepath);
    pdfDoc.pipe(writeStream);
    pdfDoc.end();

    await new Promise((resolve, reject) => {
      writeStream.on("finish", resolve);
      writeStream.on("error", reject);
    });

    return res.status(200).json({ data: { filename } });
  } catch (error) {
    logger(error, `GET /terimaSPK/cetak/${req.params.id}`, req.params);
    return res.status(406).json(getErrorResponse(error));
  }
}
