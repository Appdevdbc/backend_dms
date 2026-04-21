import dayjs from "dayjs";
import { dbWJS } from "../../config/db.js";
import { logger } from "../../helpers/logger.js";
import { getErrorResponse } from "../../helpers/utils.js";

const SECTIONS = ["machining", "bongkar_analisis", "order_part", "drawing", "assy", "trial"];
const SPV_SECTIONS = ["bongkar_analisis", "order_part", "drawing", "assy", "trial"];

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

    const datetime = dayjs(`${tanggal} ${jam}:${menit}:00`, `DD-MM-YYYY HH:mm`).format("YYYY-MM-DD HH:mm:ss");
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
