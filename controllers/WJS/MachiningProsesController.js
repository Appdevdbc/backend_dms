import dayjs from "dayjs";
import { dbWJS } from "../../config/db.js";
import { logger } from "../../helpers/logger.js";
import { getErrorResponse } from "../../helpers/utils.js";

const SECTIONS = ["machining", "bongkar_analisis", "order_part", "drawing", "assy", "trial"];
const SPV_SECTIONS = ["bongkar_analisis", "order_part", "drawing", "assy", "trial"];
const LAST_SECTIONS = ["Design", "Machining", "New Mould", "Repair Mould"];

// ─── 1. LIST ADJUSTMENT ───────────────────────────────────────────────────────
export const listAdjustment = async (req, res) => {
  // #swagger.tags = ['MachiningProses']
  /* #swagger.security = [{ "bearerAuth": [] }] */
  // #swagger.description = 'List adjustment scan operator/SPV per section'
  try {
    const { section = "machining", start: qStart, end: qEnd } = req.query;
    // Default: hari ini saja (sesuai adjustment() PHP lama)
    // Jika ada query param start/end dari search, gunakan itu
    const start = qStart ?? dayjs().format("YYYY-MM-DD");
    const end   = qEnd   ?? dayjs().format("YYYY-MM-DD");

    const result = await dbWJS.raw(`
      SELECT
        a.*,
        b.status,
        c.nama AS namaMesin
      FROM (
        SELECT * FROM tbl_scan_opt('${start}', '${end}')
      ) AS a
      JOIN SPK AS b ON a.id_spk = b.id_spk
      LEFT JOIN Machine AS c ON a.id_mesin = c.id
      WHERE 'machining' = '${section}'

      UNION ALL

      SELECT
        a.*,
        b.status,
        CASE
          WHEN a.id_mesin = 'bongkar_analisis' THEN 'Bongkar Analisis'
          WHEN a.id_mesin = 'order_part'       THEN 'Order Part'
          WHEN a.id_mesin = 'drawing'          THEN 'Drawing'
          WHEN a.id_mesin = 'machining'        THEN 'Machining'
          WHEN a.id_mesin = 'assy'             THEN 'Assy'
          WHEN a.id_mesin = 'trial'            THEN 'Trial'
        END AS namaMesin
      FROM (
        SELECT id_spk, section AS id_mesin, pic, nama_pic, start, finish, total, jamTotal, status
        FROM tbl_scan_spv('${start}', '${end}', '${section}')
      ) AS a
      JOIN SPK AS b ON a.id_spk = b.id_spk
    `).timeout(60000);

    return res.status(200).json(Array.isArray(result) ? result : result[0] ?? []);
  } catch (error) {
    logger(error, "GET /adjustment/list", req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

// ─── 2. LIST ADJUSTMENT BY SPK & PIC ─────────────────────────────────────────
export const listAdjustmentBySPK = async (req, res) => {
  // #swagger.tags = ['MachiningProses']
  /* #swagger.security = [{ "bearerAuth": [] }] */
  // #swagger.description = 'List adjustment scan untuk SPK dan PIC tertentu'
  try {
    // Support both path params (PHP compatibility) and query params
    const spk = req.params.spk || req.query.spk;
    const pic = req.params.pic || req.query.pic;
    
    if (!spk || !pic)
      return res.status(400).json({ type: "error", message: "spk dan pic wajib diisi" });

    const result = await dbWJS.raw(`
      SELECT
        [id], [pic], CAST([id_mesin] AS VARCHAR) id_mesin,
        [id_spk], [id_job], [start], [postpone], [finish],
        [created_at], [updated_at], [status], [part_code]
      FROM Scan_Operator
      WHERE id_spk = '${spk}' AND pic = '${pic}'

      UNION ALL

      SELECT
        [id], [pic], [section],
        [id_spk], [id_job], [start], [postpone], [finish],
        [created_at], [updated_at], [status], [part_code]
      FROM Scan_SPV
      WHERE id_spk = '${spk}' AND pic = '${pic}'
    `);

    return res.status(200).json(Array.isArray(result) ? result : result[0] ?? []);
  } catch (error) {
    logger(error, "GET /adjusment/list", { spk, pic });
    return res.status(406).json(getErrorResponse(error));
  }
};

// ─── 3. GET ADJUSTMENT BY ID ──────────────────────────────────────────────────
export const getAdjustment = async (req, res) => {
  // #swagger.tags = ['MachiningProses']
  /* #swagger.security = [{ "bearerAuth": [] }] */
  // #swagger.description = 'Get satu record adjustment untuk form edit'
  try {
    const { id, id_mesin } = req.query;
    if (!id || !id_mesin)
      return res.status(400).json({ type: "error", message: "id dan id_mesin wajib diisi" });

    let record;
    if (SPV_SECTIONS.includes(id_mesin)) {
      record = await dbWJS("Scan_SPV").where("id", id).first();
    } else {
      record = await dbWJS("Scan_Operator").where("id", id).first();
    }

    if (!record)
      return res.status(404).json({ type: "error", message: "Data tidak ditemukan" });

    return res.status(200).json(record);
  } catch (error) {
    logger(error, "GET /adjustment/detail", req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

// ─── 4. STORE ADJUSTMENT (edit finish/postpone) ───────────────────────────────
export const storeAdjustment = async (req, res) => {
  // #swagger.tags = ['MachiningProses']
  /* #swagger.security = [{ "bearerAuth": [] }] */
  // #swagger.description = 'Update finish atau postpone pada record scan'
  try {
    const { id, id_spk, id_mesin, pic, tanggal, jam, menit, action } = req.body;

    if (!id || !id_spk || !id_mesin || !pic || !tanggal || !jam || !menit || !action)
      return res.status(400).json({ type: "error", message: "Semua field wajib diisi" });

    if (!["finish", "postpone"].includes(action))
      return res.status(400).json({ type: "error", message: "Action harus finish atau postpone" });

    const datetime = dayjs(`${tanggal} ${jam}:${menit}:00`, `YYYY-MM-DD HH:mm:ss`).format("YYYY-MM-DD HH:mm:ss");
    const now = dayjs().format("YYYY-MM-DD HH:mm:ss");

    const updateData = {
      [action]: datetime,
      updated_at: now,
    };

    if (SPV_SECTIONS.includes(id_mesin)) {
      await dbWJS("Scan_SPV")
        .where("id_spk", id_spk)
        .where("section", id_mesin)
        .where("pic", pic)
        .where("id", id)
        .update(updateData);
    } else {
      await dbWJS("Scan_Operator")
        .where("id_spk", id_spk)
        .where("id_mesin", id_mesin)
        .where("pic", pic)
        .where("id", id)
        .update(updateData);
    }

    return res.status(200).json({ message: "Adjustment berhasil disimpan" });
  } catch (error) {
    logger(error, "POST /adjustment/store", req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

// ─── 5. LIST MACHINING PROSES (Operator Scan Page) ───────────────────────────
export const listMachiningProses = async (req, res) => {
  // #swagger.tags = ['MachiningProses']
  /* #swagger.security = [{ "bearerAuth": [] }] */
  // #swagger.description = 'List machining proses untuk halaman scan operator'
  try {
    const { start, end } = req.query;
    const startDate = start ?? dayjs().format("YYYY-MM-DD");
    const endDate = end ?? dayjs().format("YYYY-MM-DD");

    // Try using tbl_scan_opt function first
    try {
      const result = await dbWJS.raw(`
        SELECT a.*, b.nama as namaMesin 
        FROM (
          SELECT * FROM tbl_scan_opt('${startDate}', '${endDate}')
        ) AS a 
        LEFT JOIN Machine AS b ON a.id_mesin = b.id
        ORDER BY a.start DESC
      `).timeout(60000);

      const data = Array.isArray(result) ? result : result[0] ?? [];
      console.log("Using tbl_scan_opt, first row:", data[0]);
      return res.status(200).json(data);
    } catch (funcError) {
      // Fallback: Query langsung ke Scan_Operator jika function tidak ada
      console.log("tbl_scan_opt function not found, using direct query");
      
      const result = await dbWJS.raw(`
        SELECT 
          so.id,
          so.id_spk,
          so.pic,
          e.opt_name as nama_pic,
          so.id_mesin,
          m.nama as namaMesin,
          so.id_job,
          so.start,
          so.postpone,
          so.finish,
          so.part_code,
          so.status,
          CASE 
            WHEN so.finish IS NOT NULL THEN 
              DATEDIFF(MINUTE, so.start, so.finish)
            WHEN so.postpone IS NOT NULL THEN 
              DATEDIFF(MINUTE, so.start, so.postpone)
            ELSE 
              DATEDIFF(MINUTE, so.start, GETDATE())
          END as total,
          CASE 
            WHEN so.finish IS NOT NULL THEN 
              CAST(DATEDIFF(MINUTE, so.start, so.finish) / 60 AS VARCHAR) + ' hari ' + 
              CAST((DATEDIFF(MINUTE, so.start, so.finish) % 60) AS VARCHAR) + ' menit'
            WHEN so.postpone IS NOT NULL THEN 
              CAST(DATEDIFF(MINUTE, so.start, so.postpone) / 60 AS VARCHAR) + ' hari ' + 
              CAST((DATEDIFF(MINUTE, so.start, so.postpone) % 60) AS VARCHAR) + ' menit'
            ELSE 
              CAST(DATEDIFF(MINUTE, so.start, GETDATE()) / 60 AS VARCHAR) + ' hari ' + 
              CAST((DATEDIFF(MINUTE, so.start, GETDATE()) % 60) AS VARCHAR) + ' menit'
          END as jamTotal
        FROM Scan_Operator so
        LEFT JOIN Employee e ON so.pic = e.opt_nik
        LEFT JOIN Machine m ON so.id_mesin = m.id
        WHERE CAST(so.start AS DATE) BETWEEN '${startDate}' AND '${endDate}'
        ORDER BY so.start DESC
      `).timeout(60000);

      const data = Array.isArray(result) ? result : result[0] ?? [];
      console.log("Using direct query, first row:", data[0]);
      return res.status(200).json(data);
    }
  } catch (error) {
    logger(error, "GET /machining/proses/list", req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

// ─── 6. CHECK OPERATOR LOG ────────────────────────────────────────────────────
export const checkOperatorLog = async (req, res) => {
  // #swagger.tags = ['MachiningProses']
  /* #swagger.security = [{ "bearerAuth": [] }] */
  // #swagger.description = 'Check apakah operator memiliki SPK aktif'
  try {
    const { pic } = req.params;

    if (!pic)
      return res.status(400).json({ type: "error", message: "PIC wajib diisi" });

    const log = await dbWJS("Log_Scan")
      .where("log_pic", pic)
      .where("log_flag", "O")
      .first();

    if (log) {
      // Get detail scan
      const scan = await dbWJS("Scan_Operator")
        .where("id", log.log_id_scan)
        .first();

      return res.status(200).json({
        hasActiveLog: true,
        log,
        scan,
      });
    }

    return res.status(200).json({
      hasActiveLog: false,
      log: null,
      scan: null,
    });
  } catch (error) {
    logger(error, "GET /machining/proses/check-log", req.params);
    return res.status(406).json(getErrorResponse(error));
  }
};

// ─── 7. SCAN OPERATOR (Start/Postpone/Finish) ────────────────────────────────
export const scanOperator = async (req, res) => {
  // #swagger.tags = ['MachiningProses']
  /* #swagger.security = [{ "bearerAuth": [] }] */
  // #swagger.description = 'Proses scan operator (start/postpone/finish)'
  try {
    const { pic, id_spk, id_mesin, id_job, action, last_type, last_reason, last_moment } = req.body;

    // Validasi input
    if (!pic || !id_spk || !id_mesin || !id_job || !action)
      return res.status(400).json({ type: "error", message: "PIC, SPK, Mesin, Job, dan Action wajib diisi" });

    if (!["start", "postpone", "finish"].includes(action))
      return res.status(400).json({ type: "error", message: "Action harus start, postpone, atau finish" });

    // Cek NIK terdaftar
    const employee = await dbWJS("Employee")
      .where("opt_nik", pic)
      .whereNull("opt_status")
      .first();

    if (!employee)
      return res.status(400).json({ type: "error", message: "NIK tidak terdaftar" });

    // Parse SPK dan part_code
    const spkId = id_spk.substring(0, 6);
    const cekSPK = await dbWJS("SPK")
      .where("id_spk", spkId)
      .where("status", "proses")
      .first();

    const limit = cekSPK ? 6 : 8;
    const finalSpk = id_spk.substring(0, limit);
    const partCode = id_spk.substring(limit);

    // Cek SPK status proses
    const spk = await dbWJS("SPK")
      .where("id_spk", finalSpk)
      .where("status", "proses")
      .first();

    if (!spk)
      return res.status(400).json({ type: "error", message: "SPK tidak ditemukan atau status bukan proses" });

    // ─── ACTION: START ────────────────────────────────────────────────────────
    if (action === "start") {
      // Cek apakah operator punya SPK aktif
      const checkLog = await dbWJS("Log_Scan")
        .where("log_pic", pic)
        .where("log_flag", "O")
        .first();

      if (checkLog)
        return res.status(400).json({ type: "error", message: "Terdapat SPK yang statusnya sedang berjalan" });

      // Cek scan terakhir untuk validasi last_type
      const lastScan = await dbWJS("Scan_Operator")
        .where("pic", pic)
        .where("id_mesin", id_mesin)
        .where("id_spk", finalSpk)
        .orderBy("id", "desc")
        .first();

      // Validasi last_type untuk section tertentu
      if (
        lastScan &&
        lastScan.start &&
        !lastScan.postpone &&
        LAST_SECTIONS.includes(employee.opt_section) &&
        (!last_type || !last_reason || !last_moment)
      ) {
        return res.status(400).json({
          type: "error",
          message: "Mohon dilakukan pengisian Tipe Proses, Alasan, dan Waktu",
          requiresLastFields: true,
        });
      }

      // Insert scan baru
      const insertData = {
        id_spk: finalSpk,
        id_job,
        pic,
        id_mesin: parseInt(id_mesin),
        part_code: partCode,
        start: dayjs().format("YYYY-MM-DD HH:mm:ss"),
        created_at: dayjs().format("YYYY-MM-DD HH:mm:ss"),
      };

      if (last_type) {
        insertData.last_type = last_type;
        insertData.last_reason = last_reason;
        insertData.last_moment = last_moment;
      }

      const [insertedId] = await dbWJS("Scan_Operator").insert(insertData);

      // Insert log
      await dbWJS("Log_Scan").insert({
        log_id_scan: insertedId,
        log_pic: pic,
        log_flag: "O",
        // created_at: dayjs().format("YYYY-MM-DD HH:mm:ss"),
      });

      return res.status(200).json({ message: "SPK Start", scanId: insertedId });
    }

    // ─── ACTION: POSTPONE ─────────────────────────────────────────────────────
    if (action === "postpone") {
      const checkLog = await dbWJS("Log_Scan")
        .where("log_pic", pic)
        .where("log_flag", "O")
        .first();

      if (!checkLog)
        return res.status(400).json({ type: "error", message: "SPK belum start" });

      const cekScan = await dbWJS("Scan_Operator")
        .where("id", checkLog.log_id_scan)
        .first();

      if (!cekScan)
        return res.status(400).json({ type: "error", message: "SPK belum dimulai" });

      if (cekScan.finish)
        return res.status(400).json({ type: "error", message: "SPK sudah finish" });

      if (cekScan.pic !== pic || cekScan.id_mesin !== parseInt(id_mesin))
        return res.status(400).json({ type: "error", message: "SPK hanya bisa diupdate oleh PIC dan Mesin yang sama" });

      // Validasi last_type jika melewati hari
      if (
        dayjs(cekScan.start).format("YYYY-MM-DD") < dayjs().format("YYYY-MM-DD") &&
        LAST_SECTIONS.includes(employee.opt_section) &&
        (!last_type || !last_reason || !last_moment)
      ) {
        return res.status(400).json({
          type: "error",
          message: "Mohon dilakukan pengisian Tipe Proses, Alasan, dan Waktu",
          requiresLastFields: true,
        });
      }

      // Update postpone
      const updateData = {
        postpone: dayjs().format("YYYY-MM-DD HH:mm:ss"),
        updated_at: dayjs().format("YYYY-MM-DD HH:mm:ss"),
      };

      if (last_type) {
        updateData.last_type = last_type;
        updateData.last_reason = last_reason;
        updateData.last_moment = last_moment;
      }

      await dbWJS("Scan_Operator")
        .where("id", checkLog.log_id_scan)
        .update(updateData);

      // Hapus log
      await dbWJS("Log_Scan").where("log_id", checkLog.log_id).delete();

      return res.status(200).json({ message: "SPK postpone" });
    }

    // ─── ACTION: FINISH ───────────────────────────────────────────────────────
    if (action === "finish") {
      const checkLog = await dbWJS("Log_Scan")
        .where("log_pic", pic)
        .where("log_flag", "O")
        .first();

      if (!checkLog)
        return res.status(400).json({ type: "error", message: "SPK belum start" });

      const cekScan = await dbWJS("Scan_Operator")
        .where("id", checkLog.log_id_scan)
        .first();

      if (!cekScan)
        return res.status(400).json({ type: "error", message: "SPK belum start" });

      if (cekScan.pic !== pic || cekScan.id_mesin !== parseInt(id_mesin))
        return res.status(400).json({ type: "error", message: "SPK hanya bisa diupdate oleh PIC dan Mesin yang sama" });

      // Validasi last_type jika melewati hari
      if (
        dayjs(cekScan.start).format("YYYY-MM-DD") < dayjs().format("YYYY-MM-DD") &&
        LAST_SECTIONS.includes(employee.opt_section) &&
        (!last_type || !last_reason || !last_moment)
      ) {
        return res.status(400).json({
          type: "error",
          message: "Mohon dilakukan pengisian Tipe Proses, Alasan, dan Waktu",
          requiresLastFields: true,
        });
      }

      // Update finish
      const updateData = {
        finish: dayjs().format("YYYY-MM-DD HH:mm:ss"),
        updated_at: dayjs().format("YYYY-MM-DD HH:mm:ss"),
      };

      if (last_type) {
        updateData.last_type = last_type;
        updateData.last_reason = last_reason;
        updateData.last_moment = last_moment;
      }

      await dbWJS("Scan_Operator")
        .where("id", checkLog.log_id_scan)
        .update(updateData);

      // Hapus log
      await dbWJS("Log_Scan").where("log_id", checkLog.log_id).delete();

      return res.status(200).json({ message: "SPK finish" });
    }
  } catch (error) {
    logger(error, "POST /machining/proses/scan", req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};
