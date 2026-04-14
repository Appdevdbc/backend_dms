import { dbDMS } from "../../config/db.js";
import { logger } from "../../helpers/logger.js";
import { decrypt, getErrorResponse } from "../../helpers/utils.js";

/**
 * Common base query fragment for rekapitulasi — joins content with all required tables
 * and applies role-based access control.
 * Returns a raw SQL string to be embedded in larger queries.
 */
const buildBaseSubquery = (nik, extraSelect = '', extraJoins = '', extraWhere = '') => {
  return `
    SELECT c.content_id, c.tgl_doc, c.content_bu, c.lokasi_arsip_id, c.content_div,
      c.arsip_kat, c.content_sub_arsip_id, c.content_owner, c.arsiparis_id,
      c.content_kode_lemari,
      (SELECT count(cdet_content_id) FROM content_det WHERE cdet_content_id = c.content_id) AS dok_pendukung_qty,
      (SELECT count(cdet_content_id) FROM content_det WHERE cdet_content_id = c.content_id) + 1 AS all_dok,
      mb.bu_id, mb.bu_name,
      bua.bu_id AS lokasi_bu_id, bua.bu_name AS lokasi_bu_name,
      msca.sub_arsip_categ
      ${extraSelect}
    FROM content c
      INNER JOIN mapping_filefolder ff ON c.content_id = ff.mapping_contentid
      INNER JOIN folder f ON ff.mapping_folderid = f.folder_id
      INNER JOIN v_mstr_bu mb ON mb.bu_id = c.content_bu COLLATE sql_latin1_general_cp1_ci_as
      LEFT JOIN v_mstr_div md ON md.div_id = f.folder_div COLLATE sql_latin1_general_cp1_ci_as
      INNER JOIN mst_lokasi_arsip mla ON mla.lokasi_arsip_id = c.lokasi_arsip_id
      INNER JOIN mst_arsiparis ma ON ma.arsiparis_user_id = c.arsiparis_id
      INNER JOIN v_mstr_employee vme ON vme.employee_id = ma.arsiparis_user_id COLLATE sql_latin1_general_cp1_ci_as
      INNER JOIN mst_sub_categ_arsip msca ON msca.sub_arsip_id = c.content_sub_arsip_id
      INNER JOIN v_mstr_employee vmeo ON vmeo.employee_pk = c.content_owner COLLATE SQL_Latin1_General_CP1_CI_AS
      INNER JOIN v_mstr_bu bua ON bua.bu_id = mla.lokasi_arsip_bu_id COLLATE sql_latin1_general_cp1_ci_as
      INNER JOIN v_mstr_employee_ext d ON CONVERT(varchar(100), d.nik) = CONVERT(varchar(100), c.arsiparis_id) COLLATE sql_latin1_general_cp1_ci_as
      LEFT JOIN v_mstr_employee_ext e ON CONVERT(varchar(100), d.id_atasan) = CONVERT(varchar(100), e.id)
      LEFT JOIN v_mstr_employee_ext g ON CONVERT(varchar(100), c.arsiparis_id) = CONVERT(varchar(100), g.nik)
      ${extraJoins}
    WHERE c.content_kode_lemari IS NOT NULL
      AND c.content_show = 1
      AND f.folder_active = 1
      AND (
        e.id = ? -- atasan arsiparis
        OR g.id = ? -- arsiparis
        OR (SELECT count(id) FROM v_mstr_employee_ext WHERE id = ? AND id_dir = '11680') > 0 -- dept legal
        OR (SELECT count(account_username) FROM master_user WHERE account_username = ? AND account_type = '4') > 0 -- admin corporate
      )
      ${extraWhere}
  `;
};

const isValidParam = (v) => v != null && v !== '' && v !== 'null' && v !== 'undefined';

const buildFilterWhere = ({ bu_id, lokasi_arsip_id, divisi, kategori }) => {
  let where = '';
  const params = [];
  if (isValidParam(bu_id)) { where += ' AND mla.lokasi_arsip_bu_id = ?'; params.push(bu_id); }
  if (isValidParam(lokasi_arsip_id)) { where += ' AND c.lokasi_arsip_id = ?'; params.push(lokasi_arsip_id); }
  if (isValidParam(divisi)) { where += ' AND c.content_div = ?'; params.push(divisi); }
  if (isValidParam(kategori)) { where += ' AND c.arsip_kat = ?'; params.push(kategori); }
  return { where, params };
};

const getContentDetExpr = (tipe) => {
  switch (tipe) {
    case 'Dokumen Induk': return 'count(*)';
    case 'Dokumen Pendukung': return 'sum(dok_pendukung_qty)';
    default: return 'sum(all_dok)';
  }
};

const MONTH_NAMES = ['JAN','FEB','MAR','APR','MEI','JUN','JUL','AGU','SEP','OKT','NOV','DES'];

/**
 * 1. Grafik Rekap Arsip — bar chart per kategori + per BU
 * GET /api/dms/rekapitulasi/rekap-arsip
 */
export const getRekapArsip = async (req, res) => {
  try {
    const { bu_id, lokasi_arsip_id, from, to, divisi, kategori, tipe, tipe_grafik, empid: empidEnc } = req.query;
    const nik = decrypt(empidEnc);

    const { where: filterWhere, params: filterParams } = buildFilterWhere({ bu_id, lokasi_arsip_id, divisi, kategori });

    let dateWhere = '';
    const dateParams = [];
    if (isValidParam(from)) { dateWhere += " AND c.tgl_doc >= ?"; dateParams.push(from + '-01'); }
    if (isValidParam(to)) {
      const endDate = new Date(to + '-01');
      endDate.setMonth(endDate.getMonth() + 1);
      endDate.setDate(0); // last day of month
      dateWhere += " AND c.tgl_doc <= ?";
      dateParams.push(endDate.toISOString().slice(0, 10));
    }

    // content_det expression based on tipe
    let contentDetExpr;
    switch (tipe) {
      case 'Dokumen Induk': contentDetExpr = '1 AS jumlah'; break;
      case 'Dokumen Pendukung': contentDetExpr = '(SELECT count(cdet_content_det_id) FROM content_det WHERE cdet_content_id = c.content_id) AS jumlah'; break;
      default: contentDetExpr = '(SELECT count(cdet_content_det_id) FROM content_det WHERE cdet_content_id = c.content_id) + 1 AS jumlah'; break;
    }

    // grafik grouping
    let labelCol, grafikCol;
    if (tipe_grafik === 'BU') {
      labelCol = 'bu_name';
      grafikCol = 'bua.bu_name';
    } else {
      labelCol = 'kategori';
      grafikCol = 'msca.sub_arsip_categ';
    }

    const baseWhere = filterWhere + dateWhere;
    const baseParams = [...filterParams, ...dateParams];

    const sql = `
      SELECT t.kategori AS ${labelCol}, sum(t.jumlah) AS jumlah
      FROM (
        SELECT c.content_id, ${grafikCol} AS kategori, ${contentDetExpr}
        FROM content c
          INNER JOIN mapping_filefolder ff ON c.content_id = ff.mapping_contentid
          INNER JOIN folder f ON ff.mapping_folderid = f.folder_id
          INNER JOIN v_mstr_bu mb ON mb.bu_id = c.content_bu COLLATE sql_latin1_general_cp1_ci_as
          LEFT JOIN v_mstr_div md ON md.div_id = f.folder_div COLLATE sql_latin1_general_cp1_ci_as
          INNER JOIN mst_lokasi_arsip mla ON mla.lokasi_arsip_id = c.lokasi_arsip_id
          INNER JOIN mst_arsiparis ma ON ma.arsiparis_user_id = c.arsiparis_id
          INNER JOIN v_mstr_employee vme ON vme.employee_id = ma.arsiparis_user_id COLLATE sql_latin1_general_cp1_ci_as
          INNER JOIN mst_sub_categ_arsip msca ON msca.sub_arsip_id = c.content_sub_arsip_id
          INNER JOIN v_mstr_employee vmeo ON vmeo.employee_pk = c.content_owner COLLATE SQL_Latin1_General_CP1_CI_AS
          INNER JOIN v_mstr_bu bua ON bua.bu_id = mla.lokasi_arsip_bu_id COLLATE sql_latin1_general_cp1_ci_as
          INNER JOIN v_mstr_employee_ext d ON CONVERT(varchar(100), d.nik) = CONVERT(varchar(100), c.arsiparis_id) COLLATE sql_latin1_general_cp1_ci_as
          LEFT JOIN v_mstr_employee_ext e ON CONVERT(varchar(100), d.id_atasan) = CONVERT(varchar(100), e.id)
          LEFT JOIN v_mstr_employee_ext g ON CONVERT(varchar(100), c.arsiparis_id) = CONVERT(varchar(100), g.nik)
        WHERE c.content_kode_lemari IS NOT NULL AND c.content_show = 1 AND f.folder_active = 1
          AND (
            e.id = ? OR g.id = ?
            OR (SELECT count(id) FROM v_mstr_employee_ext WHERE id = ? AND id_dir = '11680') > 0
            OR (SELECT count(account_username) FROM master_user WHERE account_username = ? AND account_type = '4') > 0
          )
          ${baseWhere}
      ) t
      GROUP BY t.kategori
    `;

    const result = await dbDMS.raw(sql, [nik, nik, nik, nik, ...baseParams]);
    return res.status(200).json({ data: result });
  } catch (error) {
    logger(error, 'GET /rekapitulasi/rekap-arsip', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

/**
 * 2. Grafik Rekap Arsip Perbulan — table + combo chart (bar+line)
 * GET /api/dms/rekapitulasi/rekap-arsip-bulan
 */
export const getRekapArsipBulan = async (req, res) => {
  try {
    const { bu_id, lokasi_arsip_id, from, to, divisi, kategori, tipe, empid: empidEnc } = req.query;
    const nik = decrypt(empidEnc);

    const { where: filterWhere, params: filterParams } = buildFilterWhere({ bu_id, lokasi_arsip_id, divisi, kategori });

    let dateWhere = '';
    const dateParams = [];
    if (isValidParam(from)) {
      const startDate = from.substring(0, 4) + '-' + from.substring(5, 7) + '-01';
      dateWhere += " AND CAST(c.tgl_doc AS DATE) >= ?";
      dateParams.push(startDate);
    }
    if (isValidParam(to)) {
      const toMonth = parseInt(to.substring(5, 7));
      const toYear = parseInt(to.substring(0, 4));
      const endDate = toMonth === 12
        ? `${toYear}-12-31`
        : `${toYear}-${String(toMonth + 1).padStart(2, '0')}-01`;
      dateWhere += " AND CAST(c.tgl_doc AS DATE) < ?";
      dateParams.push(endDate);
    }

    const contentDet = getContentDetExpr(tipe);
    const baseWhere = filterWhere + dateWhere;
    let buWhere = '';
    const buParams = [];
    if (isValidParam(bu_id)) { buWhere = ' AND mb.bu_id = ?'; buParams.push(bu_id); }

    const sql = `
      WITH MonthlyCounts AS (
        SELECT ${contentDet} AS JUMLAH_ARSIP, bu_name,
          year(content_entrydate) AS tahun, month(content_entrydate) AS bulan
        FROM (
          SELECT c.tgl_doc AS content_entrydate, mb.bu_name,
            (SELECT count(cdet_content_id) FROM content_det WHERE cdet_content_id = c.content_id) AS dok_pendukung_qty,
            (SELECT count(cdet_content_id) FROM content_det WHERE cdet_content_id = c.content_id) + 1 AS all_dok
          FROM content c
            INNER JOIN mapping_filefolder ff ON c.content_id = ff.mapping_contentid
            INNER JOIN folder f ON ff.mapping_folderid = f.folder_id
            INNER JOIN v_mstr_bu mb ON mb.bu_id = c.content_bu COLLATE sql_latin1_general_cp1_ci_as
            LEFT JOIN v_mstr_div md ON md.div_id = f.folder_div COLLATE sql_latin1_general_cp1_ci_as
            INNER JOIN mst_lokasi_arsip mla ON mla.lokasi_arsip_id = c.lokasi_arsip_id
            INNER JOIN mst_arsiparis ma ON ma.arsiparis_user_id = c.arsiparis_id
            INNER JOIN v_mstr_employee vme ON vme.employee_id = ma.arsiparis_user_id COLLATE sql_latin1_general_cp1_ci_as
            INNER JOIN mst_sub_categ_arsip msca ON msca.sub_arsip_id = c.content_sub_arsip_id
            INNER JOIN v_mstr_employee vmeo ON vmeo.employee_pk = c.content_owner COLLATE SQL_Latin1_General_CP1_CI_AS
            INNER JOIN v_mstr_employee_ext d ON CONVERT(varchar(100), d.nik) = CONVERT(varchar(100), c.arsiparis_id) COLLATE sql_latin1_general_cp1_ci_as
            LEFT JOIN v_mstr_employee_ext e ON CONVERT(varchar(100), d.id_atasan) = CONVERT(varchar(100), e.id)
            LEFT JOIN v_mstr_employee_ext g ON CONVERT(varchar(100), c.arsiparis_id) = CONVERT(varchar(100), g.nik)
          WHERE c.content_kode_lemari IS NOT NULL AND c.content_show = 1 AND f.folder_active = 1
            AND (
              e.id = ? OR g.id = ?
              OR (SELECT count(id) FROM v_mstr_employee_ext WHERE id = ? AND id_dir = '11680') > 0
              OR (SELECT count(account_username) FROM master_user WHERE account_username = ? AND account_type = '4') > 0
            )
            ${baseWhere} ${buWhere}
        ) a
        GROUP BY year(content_entrydate), month(content_entrydate), bu_name
      ),
      MonthlyComparison AS (
        SELECT mc.bu_name, mc.TAHUN, mc.BULAN, mc.JUMLAH_ARSIP,
          LAG(mc.JUMLAH_ARSIP) OVER (PARTITION BY mc.TAHUN ORDER BY mc.BULAN) AS JUMLAH_ARSIP_BULAN_LALU
        FROM MonthlyCounts mc
      )
      SELECT BU_NAME, TAHUN,
        CASE
          WHEN BULAN = 1 THEN 'JAN' WHEN BULAN = 2 THEN 'FEB' WHEN BULAN = 3 THEN 'MAR'
          WHEN BULAN = 4 THEN 'APR' WHEN BULAN = 5 THEN 'MEI' WHEN BULAN = 6 THEN 'JUN'
          WHEN BULAN = 7 THEN 'JUL' WHEN BULAN = 8 THEN 'AGU' WHEN BULAN = 9 THEN 'SEP'
          WHEN BULAN = 10 THEN 'OKT' WHEN BULAN = 11 THEN 'NOV' WHEN BULAN = 12 THEN 'DES'
        END AS BULANNAMA,
        BULAN,
        JUMLAH_ARSIP,
        CAST(ROUND(
          CASE
            WHEN JUMLAH_ARSIP_BULAN_LALU IS NULL THEN 0
            ELSE ((CAST(JUMLAH_ARSIP AS FLOAT) / NULLIF(JUMLAH_ARSIP_BULAN_LALU, 0)) - 1) * 100
          END, 1
        ) AS DECIMAL(5,1)) AS PERSENTASE_PERUBAHAN
      FROM MonthlyComparison
      ORDER BY TAHUN, BULAN
    `;

    const result = await dbDMS.raw(sql, [nik, nik, nik, nik, ...filterParams, ...dateParams, ...buParams]);
    return res.status(200).json({ data: result });
  } catch (error) {
    logger(error, 'GET /rekapitulasi/rekap-arsip-bulan', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

/**
 * 3. Grafik Arsip DBC — cross-tab BU × Month + stacked bar charts
 * GET /api/dms/rekapitulasi/rekap-arsip-dbc
 */
export const getRekapArsipDbc = async (req, res) => {
  try {
    const { bu_id, lokasi_arsip_id, from, to, divisi, kategori, tipe, empid: empidEnc } = req.query;
    const nik = decrypt(empidEnc);

    // Build date range
    let dateWhere = '';
    const dateParams = [];
    if (isValidParam(from)) {
      const startDate = from.substring(0, 4) + '-' + from.substring(5, 7) + '-01';
      dateWhere += " AND CAST(c.tgl_doc AS DATE) >= ?";
      dateParams.push(startDate);
    }
    if (isValidParam(to)) {
      const toMonth = parseInt(to.substring(5, 7));
      const toYear = parseInt(to.substring(0, 4));
      const endDate = toMonth === 12 ? `${toYear}-12-31` : `${toYear}-${String(toMonth + 1).padStart(2, '0')}-01`;
      dateWhere += " AND CAST(c.tgl_doc AS DATE) <= ?";
      dateParams.push(endDate);
    }

    const { where: filterWhere, params: filterParams } = buildFilterWhere({ bu_id, lokasi_arsip_id, divisi, kategori });

    // Build tipe-specific select
    let tipeSelect;
    switch (tipe) {
      case 'Dokumen Induk':
        tipeSelect = 'count(*) AS Jumlah';
        break;
      case 'Dokumen Pendukung':
        tipeSelect = 'sum(dok_pendukung_qty) AS Jumlah';
        break;
      default:
        tipeSelect = 'sum(all_dok) AS Jumlah';
        break;
    }

    const combinedWhere = filterWhere + dateWhere;
    const combinedParams = [...filterParams, ...dateParams];

    const sql = `
      WITH MonthlyCounts AS (
        SELECT content_bu, year(content_entrydate) AS YearNum, month(content_entrydate) AS MonthNum,
          ${tipeSelect}
        FROM (
          SELECT c.tgl_doc AS content_entrydate, mb.bu_id AS content_bu,
            (SELECT count(cdet_content_id) FROM content_det WHERE cdet_content_id = c.content_id) AS dok_pendukung_qty,
            (SELECT count(cdet_content_id) FROM content_det WHERE cdet_content_id = c.content_id) + 1 AS all_dok
          FROM content c
            INNER JOIN mapping_filefolder ff ON c.content_id = ff.mapping_contentid
            INNER JOIN folder f ON ff.mapping_folderid = f.folder_id
            INNER JOIN v_mstr_bu mb ON mb.bu_id = c.content_bu COLLATE sql_latin1_general_cp1_ci_as
            LEFT JOIN v_mstr_div md ON md.div_id = f.folder_div COLLATE sql_latin1_general_cp1_ci_as
            INNER JOIN mst_lokasi_arsip mla ON mla.lokasi_arsip_id = c.lokasi_arsip_id
            INNER JOIN mst_arsiparis ma ON ma.arsiparis_user_id = c.arsiparis_id
            INNER JOIN v_mstr_employee vme ON vme.employee_id = ma.arsiparis_user_id COLLATE sql_latin1_general_cp1_ci_as
            INNER JOIN mst_sub_categ_arsip msca ON msca.sub_arsip_id = c.content_sub_arsip_id
            INNER JOIN v_mstr_employee vmeo ON vmeo.employee_pk = c.content_owner COLLATE SQL_Latin1_General_CP1_CI_AS
            INNER JOIN v_mstr_employee_ext d ON CONVERT(varchar(100), d.nik) = CONVERT(varchar(100), c.arsiparis_id) COLLATE sql_latin1_general_cp1_ci_as
            LEFT JOIN v_mstr_employee_ext e ON CONVERT(varchar(100), d.id_atasan) = CONVERT(varchar(100), e.id)
            LEFT JOIN v_mstr_employee_ext g ON CONVERT(varchar(100), c.arsiparis_id) = CONVERT(varchar(100), g.nik)
          WHERE c.content_kode_lemari IS NOT NULL AND c.content_show = 1 AND f.folder_active = 1
            AND (
              e.id = ? OR g.id = ?
              OR (SELECT count(id) FROM v_mstr_employee_ext WHERE id = ? AND id_dir = '11680') > 0
              OR (SELECT count(account_username) FROM master_user WHERE account_username = ? AND account_type = '4') > 0
            )
            ${combinedWhere}
        ) a
        GROUP BY year(content_entrydate), month(content_entrydate), content_bu
      ),
      AllMonths AS (
        SELECT DISTINCT YearNum, MonthNum FROM MonthlyCounts
      ),
      AllBU AS (
        SELECT DISTINCT bu_id, bu_name FROM v_mstr_bu
      ),
      FinalCounts AS (
        SELECT a.bu_id AS content_bu, am.YearNum, am.MonthNum,
          ISNULL(mc.Jumlah, 0) AS Jumlah,
          SUM(ISNULL(mc.Jumlah, 0)) OVER (PARTITION BY am.YearNum, am.MonthNum) AS TotalJumlah
        FROM AllMonths am
        CROSS JOIN AllBU a
        LEFT JOIN MonthlyCounts mc ON a.bu_id = mc.content_bu AND am.YearNum = mc.YearNum AND am.MonthNum = mc.MonthNum
      )
      SELECT vmb.bu_name AS BUName, fc.Jumlah, fc.TotalJumlah,
        CASE WHEN fc.TotalJumlah = 0 THEN 0 ELSE CAST(fc.Jumlah AS FLOAT) / fc.TotalJumlah * 100 END AS Percentage,
        fc.YearNum,
        CASE fc.MonthNum
          WHEN 1 THEN 'JAN' WHEN 2 THEN 'FEB' WHEN 3 THEN 'MAR' WHEN 4 THEN 'APR'
          WHEN 5 THEN 'MEI' WHEN 6 THEN 'JUN' WHEN 7 THEN 'JUL' WHEN 8 THEN 'AGU'
          WHEN 9 THEN 'SEP' WHEN 10 THEN 'OKT' WHEN 11 THEN 'NOV' WHEN 12 THEN 'DES'
        END AS Month,
        fc.MonthNum
      FROM FinalCounts fc
      LEFT JOIN v_mstr_bu vmb ON fc.content_bu = vmb.bu_id
      ORDER BY fc.YearNum, fc.MonthNum, vmb.bu_name
    `;

    const result = await dbDMS.raw(sql, [nik, nik, nik, nik, ...combinedParams]);
    return res.status(200).json({ data: result });
  } catch (error) {
    logger(error, 'GET /rekapitulasi/rekap-arsip-dbc', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

/**
 * 4. Grafik Perubahan Arsip BU Pertahun — table + combo chart
 * GET /api/dms/rekapitulasi/rekap-arsip-pertahun
 */
export const getRekapArsipPertahun = async (req, res) => {
  try {
    const { bu_id, lokasi_arsip_id, from, to, divisi, kategori, tipe, empid: empidEnc } = req.query;
    const nik = decrypt(empidEnc);

    const { where: filterWhere, params: filterParams } = buildFilterWhere({ bu_id, lokasi_arsip_id, divisi, kategori });

    let dateWhere = '';
    const dateParams = [];
    if (isValidParam(from)) { dateWhere += " AND year(c.tgl_doc) >= ?"; dateParams.push(from); }
    if (isValidParam(to)) { dateWhere += " AND year(c.tgl_doc) <= ?"; dateParams.push(to); }

    let buWhere = '';
    const buParams = [];
    if (isValidParam(bu_id)) { buWhere = " AND mb.bu_id = ?"; buParams.push(bu_id); }

    const contentDet = getContentDetExpr(tipe);
    const buNameExpr = bu_id ? 'bu_name' : "'All BU' AS bu_name";
    const buGroupBy = bu_id ? 'bu_name,' : '';

    const sql = `
      WITH CTE AS (
        SELECT ${contentDet} AS jumlah,
          ${isValidParam(bu_id) ? 'bu_name,' : "'All BU' AS bu_name,"}
          year(content_entrydate) AS tahun,
          LAG(count(*)) OVER (ORDER BY year(content_entrydate)) AS jumlah_tahun_sebelumnya
        FROM (
          SELECT c.tgl_doc AS content_entrydate, mb.bu_name,
            (SELECT count(cdet_content_id) FROM content_det WHERE cdet_content_id = c.content_id) AS dok_pendukung_qty,
            (SELECT count(cdet_content_id) FROM content_det WHERE cdet_content_id = c.content_id) + 1 AS all_dok
          FROM content c
            INNER JOIN mapping_filefolder ff ON c.content_id = ff.mapping_contentid
            INNER JOIN folder f ON ff.mapping_folderid = f.folder_id
            INNER JOIN v_mstr_bu mb ON mb.bu_id = c.content_bu COLLATE sql_latin1_general_cp1_ci_as
            LEFT JOIN v_mstr_div md ON md.div_id = f.folder_div COLLATE sql_latin1_general_cp1_ci_as
            INNER JOIN mst_lokasi_arsip mla ON mla.lokasi_arsip_id = c.lokasi_arsip_id
            INNER JOIN mst_arsiparis ma ON ma.arsiparis_user_id = c.arsiparis_id
            INNER JOIN v_mstr_employee vme ON vme.employee_id = ma.arsiparis_user_id COLLATE sql_latin1_general_cp1_ci_as
            INNER JOIN mst_sub_categ_arsip msca ON msca.sub_arsip_id = c.content_sub_arsip_id
            INNER JOIN v_mstr_employee vmeo ON vmeo.employee_pk = c.content_owner COLLATE SQL_Latin1_General_CP1_CI_AS
            INNER JOIN v_mstr_employee_ext d ON CONVERT(varchar(100), d.nik) = CONVERT(varchar(100), c.arsiparis_id) COLLATE sql_latin1_general_cp1_ci_as
            LEFT JOIN v_mstr_employee_ext e ON CONVERT(varchar(100), d.id_atasan) = CONVERT(varchar(100), e.id)
            LEFT JOIN v_mstr_employee_ext g ON CONVERT(varchar(100), c.arsiparis_id) = CONVERT(varchar(100), g.nik)
          WHERE c.content_kode_lemari IS NOT NULL AND c.content_show = 1 AND f.folder_active = 1
            AND (
              e.id = ? OR g.id = ?
              OR (SELECT count(id) FROM v_mstr_employee_ext WHERE id = ? AND id_dir = '11680') > 0
              OR (SELECT count(account_username) FROM master_user WHERE account_username = ? AND account_type = '4') > 0
            )
            ${filterWhere} ${dateWhere} ${buWhere}
        ) a
        GROUP BY year(content_entrydate)${isValidParam(bu_id) ? ', bu_name' : ''}
      )
      SELECT jumlah, bu_name, tahun,
        ISNULL(ABS(CAST(jumlah AS FLOAT) / NULLIF(jumlah_tahun_sebelumnya, 0) - 1) * 100, 0) AS prosentase_perubahan
      FROM CTE
      ORDER BY tahun
    `;

    const result = await dbDMS.raw(sql, [nik, nik, nik, nik, ...filterParams, ...dateParams, ...buParams]);
    return res.status(200).json({ data: result });
  } catch (error) {
    logger(error, 'GET /rekapitulasi/rekap-arsip-pertahun', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

/**
 * 5. Perbandingan Arsip Per BU Pertahun — cross-tab + bar charts
 * GET /api/dms/rekapitulasi/perbandingan
 */
export const getRekapPerbandingan = async (req, res) => {
  try {
    const { bu_id, lokasi_arsip_id, from, to, divisi, kategori, tipe, empid: empidEnc } = req.query;
    const nik = decrypt(empidEnc);

    const { where: filterWhere, params: filterParams } = buildFilterWhere({ bu_id, lokasi_arsip_id, divisi, kategori });

    let dateWhere = '';
    const dateParams = [];
    if (isValidParam(from)) { dateWhere += " AND year(c.tgl_doc) >= ?"; dateParams.push(from); }
    if (isValidParam(to)) { dateWhere += " AND year(c.tgl_doc) <= ?"; dateParams.push(to); }

    const allParams = [nik, nik, nik, nik, ...filterParams, ...dateParams];

    // Main query: per BU per year
    const sqlDetail = `
      SELECT sum(jumlah) AS jumlah, sum(jumlah_pendukung) AS jumlah_pendukung,
        bu_id, bu_name, tahun
      FROM (
        SELECT 1 AS jumlah,
          (SELECT count(cdet_content_det_id) FROM content_det WHERE cdet_content_id = c.content_id) AS jumlah_pendukung,
          bua.bu_id, bua.bu_name, year(c.tgl_doc) AS tahun
        FROM content c
          INNER JOIN mapping_filefolder ff ON c.content_id = ff.mapping_contentid
          INNER JOIN folder f ON ff.mapping_folderid = f.folder_id
          INNER JOIN v_mstr_bu mb ON mb.bu_id = c.content_bu COLLATE sql_latin1_general_cp1_ci_as
          LEFT JOIN v_mstr_div md ON md.div_id = f.folder_div COLLATE sql_latin1_general_cp1_ci_as
          INNER JOIN mst_lokasi_arsip mla ON mla.lokasi_arsip_id = c.lokasi_arsip_id
          INNER JOIN mst_arsiparis ma ON ma.arsiparis_user_id = c.arsiparis_id
          INNER JOIN v_mstr_employee vme ON vme.employee_id = ma.arsiparis_user_id COLLATE sql_latin1_general_cp1_ci_as
          INNER JOIN mst_sub_categ_arsip msca ON msca.sub_arsip_id = c.content_sub_arsip_id
          INNER JOIN v_mstr_employee vmeo ON vmeo.employee_pk = c.content_owner COLLATE SQL_Latin1_General_CP1_CI_AS
          INNER JOIN v_mstr_bu bua ON bua.bu_id = mla.lokasi_arsip_bu_id COLLATE sql_latin1_general_cp1_ci_as
          INNER JOIN v_mstr_employee_ext d ON CONVERT(varchar(100), d.nik) = CONVERT(varchar(100), c.arsiparis_id) COLLATE sql_latin1_general_cp1_ci_as
          LEFT JOIN v_mstr_employee_ext e ON CONVERT(varchar(100), d.id_atasan) = CONVERT(varchar(100), e.id)
          LEFT JOIN v_mstr_employee_ext g ON CONVERT(varchar(100), c.arsiparis_id) = CONVERT(varchar(100), g.nik)
        WHERE c.content_kode_lemari IS NOT NULL AND c.content_show = 1 AND f.folder_active = 1
          AND (
            e.id = ? OR g.id = ?
            OR (SELECT count(id) FROM v_mstr_employee_ext WHERE id = ? AND id_dir = '11680') > 0
            OR (SELECT count(account_username) FROM master_user WHERE account_username = ? AND account_type = '4') > 0
          )
          ${filterWhere} ${dateWhere}
      ) t
      GROUP BY bu_id, bu_name, tahun
    `;

    // Total per year
    const contentExpr = tipe === 'Dokumen Induk' ? '1'
      : tipe === 'Dokumen Pendukung' ? '(SELECT count(cdet_content_det_id) FROM content_det WHERE cdet_content_id = c.content_id)'
      : '(SELECT count(cdet_content_det_id) FROM content_det WHERE cdet_content_id = c.content_id) + 1';

    const sqlTotal = `
      SELECT sum(total) AS total, tahun
      FROM (
        SELECT ${contentExpr} AS total, year(c.tgl_doc) AS tahun
        FROM content c
          INNER JOIN mapping_filefolder ff ON c.content_id = ff.mapping_contentid
          INNER JOIN folder f ON ff.mapping_folderid = f.folder_id
          INNER JOIN v_mstr_bu mb ON mb.bu_id = c.content_bu COLLATE sql_latin1_general_cp1_ci_as
          LEFT JOIN v_mstr_div md ON md.div_id = f.folder_div COLLATE sql_latin1_general_cp1_ci_as
          INNER JOIN mst_lokasi_arsip mla ON mla.lokasi_arsip_id = c.lokasi_arsip_id
          INNER JOIN mst_arsiparis ma ON ma.arsiparis_user_id = c.arsiparis_id
          INNER JOIN v_mstr_employee vme ON vme.employee_id = ma.arsiparis_user_id COLLATE sql_latin1_general_cp1_ci_as
          INNER JOIN mst_sub_categ_arsip msca ON msca.sub_arsip_id = c.content_sub_arsip_id
          INNER JOIN v_mstr_employee vmeo ON vmeo.employee_pk = c.content_owner COLLATE SQL_Latin1_General_CP1_CI_AS
          INNER JOIN v_mstr_bu bua ON bua.bu_id = mla.lokasi_arsip_bu_id COLLATE sql_latin1_general_cp1_ci_as
          INNER JOIN v_mstr_employee_ext d ON CONVERT(varchar(100), d.nik) = CONVERT(varchar(100), c.arsiparis_id) COLLATE sql_latin1_general_cp1_ci_as
          LEFT JOIN v_mstr_employee_ext e ON CONVERT(varchar(100), d.id_atasan) = CONVERT(varchar(100), e.id)
          LEFT JOIN v_mstr_employee_ext g ON CONVERT(varchar(100), c.arsiparis_id) = CONVERT(varchar(100), g.nik)
        WHERE c.content_kode_lemari IS NOT NULL AND c.content_show = 1 AND f.folder_active = 1
          AND (
            e.id = ? OR g.id = ?
            OR (SELECT count(id) FROM v_mstr_employee_ext WHERE id = ? AND id_dir = '11680') > 0
            OR (SELECT count(account_username) FROM master_user WHERE account_username = ? AND account_type = '4') > 0
          )
          ${filterWhere} ${dateWhere}
      ) t
      GROUP BY tahun
    `;

    // Total per BU (all years combined)
    const sqlTotalBu = `
      SELECT sum(jumlah) AS total, sum(jumlah_pendukung) AS total_pendukung, bu_name
      FROM (
        SELECT 1 AS jumlah,
          (SELECT count(cdet_content_det_id) FROM content_det WHERE cdet_content_id = c.content_id) AS jumlah_pendukung,
          bua.bu_name
        FROM content c
          INNER JOIN mapping_filefolder ff ON c.content_id = ff.mapping_contentid
          INNER JOIN folder f ON ff.mapping_folderid = f.folder_id
          INNER JOIN v_mstr_bu mb ON mb.bu_id = c.content_bu COLLATE sql_latin1_general_cp1_ci_as
          LEFT JOIN v_mstr_div md ON md.div_id = f.folder_div COLLATE sql_latin1_general_cp1_ci_as
          INNER JOIN mst_lokasi_arsip mla ON mla.lokasi_arsip_id = c.lokasi_arsip_id
          INNER JOIN mst_arsiparis ma ON ma.arsiparis_user_id = c.arsiparis_id
          INNER JOIN v_mstr_employee vme ON vme.employee_id = ma.arsiparis_user_id COLLATE sql_latin1_general_cp1_ci_as
          INNER JOIN mst_sub_categ_arsip msca ON msca.sub_arsip_id = c.content_sub_arsip_id
          INNER JOIN v_mstr_employee vmeo ON vmeo.employee_pk = c.content_owner COLLATE SQL_Latin1_General_CP1_CI_AS
          INNER JOIN v_mstr_bu bua ON bua.bu_id = mla.lokasi_arsip_bu_id COLLATE sql_latin1_general_cp1_ci_as
          INNER JOIN v_mstr_employee_ext d ON CONVERT(varchar(100), d.nik) = CONVERT(varchar(100), c.arsiparis_id) COLLATE sql_latin1_general_cp1_ci_as
          LEFT JOIN v_mstr_employee_ext e ON CONVERT(varchar(100), d.id_atasan) = CONVERT(varchar(100), e.id)
          LEFT JOIN v_mstr_employee_ext g ON CONVERT(varchar(100), c.arsiparis_id) = CONVERT(varchar(100), g.nik)
        WHERE c.content_kode_lemari IS NOT NULL AND c.content_show = 1 AND f.folder_active = 1
          AND (
            e.id = ? OR g.id = ?
            OR (SELECT count(id) FROM v_mstr_employee_ext WHERE id = ? AND id_dir = '11680') > 0
            OR (SELECT count(account_username) FROM master_user WHERE account_username = ? AND account_type = '4') > 0
          )
          ${filterWhere} ${dateWhere}
      ) t
      GROUP BY bu_name
    `;

    const [detail, total, totalBu] = await Promise.all([
      dbDMS.raw(sqlDetail, allParams),
      dbDMS.raw(sqlTotal, allParams),
      dbDMS.raw(sqlTotalBu, allParams),
    ]);

    return res.status(200).json({ data: { detail, total, totalBu } });
  } catch (error) {
    logger(error, 'GET /rekapitulasi/perbandingan', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

/**
 * Get divisi list for filter dropdown (role-based)
 * GET /api/dms/rekapitulasi/divisi
 */
export const getDivisi = async (req, res) => {
  try {
    const { empid: empidEnc } = req.query;
    const nik = decrypt(empidEnc);

    const sql = `
      SELECT * FROM v_mstr_div
      WHERE div_groupid = 'DBC'
        AND (
          (SELECT count(id) FROM v_mstr_employee_ext WHERE id = ? AND id_dir = '11680') > 0
          OR (SELECT count(account_username) FROM master_user WHERE account_username = ? AND account_type = '4') > 0
          OR div_id IN (SELECT map_div_id FROM v_mstr_employee WHERE employee_pk = ?)
        )
    `;
    const result = await dbDMS.raw(sql, [nik, nik, nik]);
    return res.status(200).json({ data: result });
  } catch (error) {
    logger(error, 'GET /rekapitulasi/divisi', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

/**
 * Get kategori dokumen list for filter dropdown
 * GET /api/dms/rekapitulasi/kategori
 */
export const getKategori = async (req, res) => {
  try {
    const result = await dbDMS('mst_sub_categ_arsip').select('sub_arsip_id', 'sub_arsip_categ').orderBy('sub_arsip_categ');
    return res.status(200).json({ data: result });
  } catch (error) {
    logger(error, 'GET /rekapitulasi/kategori', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};
