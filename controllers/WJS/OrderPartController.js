import dayjs from "dayjs";
import { dbWJS } from "../../config/db.js";
import { logger } from "../../helpers/logger.js";
import { getErrorResponse } from "../../helpers/utils.js";

// Section yang valid
const VALID_SECTIONS = ["order_part", "bongkar_analisis", "drawing", "assy", "trial"];

// ─── Helper: ambil list scan SPV hari ini per section ─────────────────────────
const getScanList = async (section) => {
  const today = dayjs().format("YYYY-MM-DD");
  const start = section === "bongkar_analisis" || section === "assy" ? "2023-01-01" : today;
  return dbWJS.raw(`SELECT * FROM tbl_scan_spv(?, ?, ?)`, [start, today, section]);
};

// ─── 1. GET LIST SCAN SPV ─────────────────────────────────────────────────────
export const getList = async (req, res) => {
  // #swagger.tags = ['OrderPart']
  /* #swagger.security = [{ "bearerAuth": [] }] */
  // #swagger.description = 'List scan SPV hari ini per section'
  try {
    const { section } = req.query;
    if (!VALID_SECTIONS.includes(section))
      return res.status(400).json({ type: "error", message: "Section tidak valid" });

    const result = await getScanList(section);
    return res.status(200).json(Array.isArray(result) ? result : result[0] ?? []);
  } catch (error) {
    logger(error, "GET /orderPart/list", req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

// ─── 2. GET JOB TYPES ────────────────────────────────────────────────────────
export const getJobTypes = async (req, res) => {
  // #swagger.tags = ['OrderPart']
  /* #swagger.security = [{ "bearerAuth": [] }] */
  try {
    const data = await dbWJS("Job_Type").select("id_job", "nama_job").orderBy("nama_job", "asc");
    return res.status(200).json(data);
  } catch (error) {
    logger(error, "GET /orderPart/job-types", req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

// ─── 3. STORE (start / postpone / finish) ────────────────────────────────────
export const store = async (req, res) => {
  // #swagger.tags = ['OrderPart']
  /* #swagger.security = [{ "bearerAuth": [] }] */
  // #swagger.description = 'Proses start / postpone / finish scan SPV'
  try {
    const { pic, id_spk: rawSpk, id_job, section, action, last_type, last_reason, last_moment } = req.body;

    // ─── Validasi input ───────────────────────────────────────────────────────
    if (!pic || !rawSpk || !id_job || !section || !action)
      return res.status(400).json({ type: "error", message: "Semua field wajib diisi" });

    if (!VALID_SECTIONS.includes(section))
      return res.status(400).json({ type: "error", message: "Section tidak valid" });

    // ─── Validasi NIK ─────────────────────────────────────────────────────────
    const employee = await dbWJS("Employee").where("opt_nik", pic).whereNull("opt_status").first();
    if (!employee)
      return res.status(400).json({ type: "error", message: "NIK tidak terdaftar" });

    // ─── Parse id_spk (6 atau 8 karakter) ────────────────────────────────────
    const spkPrefix = rawSpk.substring(0, 6);
    const spkInProses = await dbWJS("SPK").where("id_spk", spkPrefix).where("status", "proses").first();
    const limit = spkInProses ? 6 : 8;
    const id_spk = rawSpk.substring(0, limit);
    const part_code = rawSpk.substring(limit);

    // ─── Validasi SPK ─────────────────────────────────────────────────────────
    let spkQuery = dbWJS("SPK").where("id_spk", id_spk);
    if (section === "order_part" || section === "bongkar_analisis") {
      spkQuery = spkQuery.where("status", "terima").where("jenis", "repair");
    } else if (section === "drawing") {
      const spkData = await dbWJS("SPK").where("id_spk", id_spk).first();
      if (spkData?.jenis === "repair") {
        spkQuery = spkQuery.where("status", "proses").where("jenis", "repair");
      } else {
        spkQuery = spkQuery.where("status", "proses").where("jenis", "general");
      }
    } else {
      spkQuery = spkQuery.where("status", "proses").where("jenis", "repair");
    }

    const spkExists = await spkQuery.first();
    if (!spkExists)
      return res.status(400).json({ type: "error", message: "SPK tidak ditemukan" });

    const now = dayjs().format("YYYY-MM-DD HH:mm:ss");
    const lastSections = ["Design", "Machining", "New Mould", "Repair Mould"];
    const needsLastType = lastSections.includes(employee.opt_section);

    // ─── START ────────────────────────────────────────────────────────────────
    if (action === "start") {
      const checkLog = await dbWJS("Log_Scan").where("log_pic", pic).where("log_flag", "S").first();
      if (checkLog)
        return res.status(400).json({ type: "error", message: "Terdapat SPK yang statusnya sedang berjalan" });

      const lastScan = await dbWJS("Scan_SPV").where("pic", pic).where("id_spk", id_spk).orderBy("id", "desc").first();
      if (lastScan?.start && !lastScan?.postpone && !last_type && needsLastType)
        return res.status(400).json({
          type: "needs_last_type",
          message: "Mohon dilakukan pengisian Tipe Proses, Alasan, dan Waktu",
          others: { id_spk, opt_name: employee.opt_name },
        });

      const [newId] = await dbWJS("Scan_SPV").insert({
        id_spk, id_job, pic, section, part_code: part_code || null,
        start: now,
        ...(last_type ? { last_type, last_reason, last_moment } : {}),
        created_at: now, updated_at: now,
      });

      // Catat ke Log_Scan
      const query = dbWJS("Log_Scan").insert({
        log_id_scan: newId, log_pic: pic, log_flag: "S",
        created_at: now, updated_at: now,
      });

      console.log(query.toString());

      return res.status(200).json({ message: "SPK dimulai" });
    }

    // ─── POSTPONE ─────────────────────────────────────────────────────────────
    if (action === "postpone") {
      const checkLog = await dbWJS("Log_Scan").where("log_pic", pic).where("log_flag", "S").first();
      if (!checkLog)
        return res.status(400).json({ type: "error", message: "SPK belum start" });

      const scan = await dbWJS("Scan_SPV").where("id", checkLog.log_id_scan).first();
      if (!scan)
        return res.status(400).json({ type: "error", message: "SPK belum dimulai" });
      if (scan.finish)
        return res.status(400).json({ type: "error", message: "SPK sudah finish" });
      if (scan.pic !== pic)
        return res.status(400).json({ type: "error", message: "SPK hanya bisa diupdate oleh PIC yang sama" });

      const startDate = dayjs(scan.start).format("YYYY-MM-DD");
      if (startDate < dayjs().format("YYYY-MM-DD") && !last_type && needsLastType)
        return res.status(400).json({
          type: "needs_last_type",
          message: "Mohon dilakukan pengisian Tipe Proses, Alasan, dan Waktu",
          others: { id_spk, opt_name: employee.opt_name },
        });

      await dbWJS("Scan_SPV").where("id", checkLog.log_id_scan).update({
        postpone: now,
        ...(last_type ? { last_type, last_reason, last_moment } : {}),
        updated_at: now,
      });
      await dbWJS("Log_Scan").where("log_id", checkLog.log_id).delete();

      return res.status(200).json({ message: "SPK postpone" });
    }

    // ─── FINISH ───────────────────────────────────────────────────────────────
    if (action === "finish") {
      const checkLog = await dbWJS("Log_Scan").where("log_pic", pic).where("log_flag", "S").first();
      if (!checkLog)
        return res.status(400).json({ type: "error", message: "SPK belum start" });

      const scan = await dbWJS("Scan_SPV").where("id", checkLog.log_id_scan).first();
      if (!scan)
        return res.status(400).json({ type: "error", message: "SPK belum start" });
      if (scan.pic !== pic)
        return res.status(400).json({ type: "error", message: "SPK hanya bisa diupdate oleh PIC yang sama" });

      const startDate = dayjs(scan.start).format("YYYY-MM-DD");
      if (startDate < dayjs().format("YYYY-MM-DD") && !last_type && needsLastType)
        return res.status(400).json({
          type: "needs_last_type",
          message: "Mohon dilakukan pengisian Tipe Proses, Alasan, dan Waktu",
          others: { id_spk, opt_name: employee.opt_name },
        });

      await dbWJS("Scan_SPV").where("id", checkLog.log_id_scan).update({
        finish: now,
        ...(last_type ? { last_type, last_reason, last_moment } : {}),
        updated_at: now,
      });
      await dbWJS("Log_Scan").where("log_id", checkLog.log_id).delete();

      return res.status(200).json({ message: "SPK finish" });
    }

    return res.status(400).json({ type: "error", message: "Action tidak valid" });
  } catch (error) {
    logger(error, "POST /orderPart/store", req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};
