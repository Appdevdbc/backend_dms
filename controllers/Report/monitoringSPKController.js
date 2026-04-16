import { dbWJS } from "../../config/db.js";
import { getErrorResponse } from "../../helpers/utils.js";
import { logger } from "../../helpers/logger.js";
import dayjs from "dayjs";
import ExcelJS from "exceljs";

// Get Department List for filter
export const getDepartmentList = async (req, res) => {
  // #swagger.tags = ['Report - Monitoring SPK']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Get department list for filter dropdown'
  try {
    const departments = await dbWJS('Department as a')
      .select(
        'a.id_dept as value',
        'a.nama as label',
        'b.nama as nama_site'
      )
      .join('Site as b', 'a.id_site', 'b.id_site')
      .orderBy('b.nama', 'asc')
      .orderBy('a.nama', 'asc');
    
    res.status(200).json(departments);
  } catch (error) {
    logger(error, 'GET /getDepartmentList', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

// Get Monitoring SPK Report
export const getMonitoringSPK = async (req, res) => {
  // #swagger.tags = ['Report - Monitoring SPK']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Get SPK monitoring report with process stages'
  try {
    const { spk, dept, start, end } = req.query;
    
    // Call the stored function tbl_monitoring_spk
    const result = await dbWJS.raw(
      `SELECT * FROM tbl_monitoring_spk(?, ?, ?, ?)`,
      [spk || '', dept || '', start || '', end || '']
    );
    
    const data = result;
    
    // Format dates to DD/MM/YYYY
    const formattedData = data.map(item => ({
      ...item,
      tanggal: item.tanggal ? dayjs(item.tanggal).format('DD/MM/YYYY') : '',
      duedate: item.duedate ? dayjs(item.duedate).format('DD/MM/YYYY') : '',
      bongkar_start: item.bongkar_start ? dayjs(item.bongkar_start).format('DD/MM/YYYY HH:mm') : '',
      bongkar_end: item.bongkar_end ? dayjs(item.bongkar_end).format('DD/MM/YYYY HH:mm') : '',
      order_part_start: item.order_part_start ? dayjs(item.order_part_start).format('DD/MM/YYYY HH:mm') : '',
      order_part_end: item.order_part_end ? dayjs(item.order_part_end).format('DD/MM/YYYY HH:mm') : '',
      drawing_start: item.drawing_start ? dayjs(item.drawing_start).format('DD/MM/YYYY HH:mm') : '',
      drawing_end: item.drawing_end ? dayjs(item.drawing_end).format('DD/MM/YYYY HH:mm') : '',
      machining_start: item.machining_start ? dayjs(item.machining_start).format('DD/MM/YYYY HH:mm') : '',
      machining_end: item.machining_end ? dayjs(item.machining_end).format('DD/MM/YYYY HH:mm') : '',
      assy_start: item.assy_start ? dayjs(item.assy_start).format('DD/MM/YYYY HH:mm') : '',
      assy_end: item.assy_end ? dayjs(item.assy_end).format('DD/MM/YYYY HH:mm') : '',
      trial_start: item.trial_start ? dayjs(item.trial_start).format('DD/MM/YYYY HH:mm') : '',
      trial_end: item.trial_end ? dayjs(item.trial_end).format('DD/MM/YYYY HH:mm') : '',
    }));
    
    res.status(200).json(formattedData);
  } catch (error) {
    logger(error, 'GET /getMonitoringSPK', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

// Export Monitoring SPK to Excel
export const exportMonitoringSPK = async (req, res) => {
  // #swagger.tags = ['Report - Monitoring SPK']
  /* #swagger.security = [{
          "bearerAuth": []
    }] */
  // #swagger.description = 'Export SPK monitoring report to Excel'
  try {
    // Accept both query params (GET) and body (POST)
    const { spk, dept, start, end } = { ...req.query, ...req.body };

    // Call the stored function tbl_monitoring_spk
    const result = await dbWJS.raw(
      `SELECT * FROM tbl_monitoring_spk(?, ?, ?, ?)`,
      [spk || '', dept || '', start || '', end || '']
    );

    const data = result;

    // ── Workbook setup ──────────────────────────────────────────────────────
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'WJS System';
    workbook.created = new Date();

    const ws = workbook.addWorksheet('Monitoring SPK', {
      pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
      views: [{ state: 'frozen', xSplit: 0, ySplit: 5 }], // freeze first 5 rows
    });

    // ── Column widths (18 cols: No + 1 index col) ───────────────────────────
    // Col index: 1=No, 2=No SPK, 3=Tanggal, 4=Dept, 5=Due Date, 6=Subjek,
    //            7-8=Bongkar, 9-10=Order Part, 11-12=Drawing,
    //            13-14=Machining, 15-16=Assy, 17-18=Trial
    const colWidths = [5, 18, 13, 22, 13, 35, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20];
    colWidths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

    // ── Helper: apply thin border to a cell ─────────────────────────────────
    const thinBorder = {
      top:    { style: 'thin', color: { argb: 'FFB0B0B0' } },
      left:   { style: 'thin', color: { argb: 'FFB0B0B0' } },
      bottom: { style: 'thin', color: { argb: 'FFB0B0B0' } },
      right:  { style: 'thin', color: { argb: 'FFB0B0B0' } },
    };
    const thickBorder = {
      top:    { style: 'medium', color: { argb: 'FF1F3864' } },
      left:   { style: 'medium', color: { argb: 'FF1F3864' } },
      bottom: { style: 'medium', color: { argb: 'FF1F3864' } },
      right:  { style: 'medium', color: { argb: 'FF1F3864' } },
    };

    const applyBorder = (cell, border = thinBorder) => { cell.border = border; };

    const styleCell = (cell, { bg, fontColor = 'FFFFFFFF', bold = false, size = 10, align = 'center', border = thinBorder, wrapText = false } = {}) => {
      if (bg) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
      cell.font = { bold, size, color: { argb: fontColor }, name: 'Calibri' };
      cell.alignment = { vertical: 'middle', horizontal: align, wrapText };
      applyBorder(cell, border);
    };

    // ── ROW 1: Title ─────────────────────────────────────────────────────────
    ws.mergeCells('A1:R1');
    const titleCell = ws.getCell('A1');
    titleCell.value = 'LAPORAN MONITORING SPK';
    styleCell(titleCell, { bg: 'FF1F3864', bold: true, size: 14, border: thickBorder });
    ws.getRow(1).height = 30;

    // ── ROW 2: Subtitle / period ─────────────────────────────────────────────
    ws.mergeCells('A2:R2');
    const periodLabel = (start || end)
      ? `Periode: ${start ? dayjs(start).format('DD/MM/YYYY') : '...'} s/d ${end ? dayjs(end).format('DD/MM/YYYY') : '...'}`
      : 'Semua Periode';
    const subtitleCell = ws.getCell('A2');
    subtitleCell.value = periodLabel;
    styleCell(subtitleCell, { bg: 'FF2E75B6', bold: false, size: 10, border: thickBorder });
    ws.getRow(2).height = 20;

    // ── ROW 3: Print date ────────────────────────────────────────────────────
    ws.mergeCells('A3:R3');
    const printCell = ws.getCell('A3');
    printCell.value = `Dicetak: ${dayjs().format('DD/MM/YYYY HH:mm')}  |  Total Data: ${data.length}`;
    styleCell(printCell, { bg: 'FF9DC3E6', fontColor: 'FF1F3864', bold: false, size: 9, border: thickBorder });
    ws.getRow(3).height = 18;

    // ── ROW 4: Group headers ─────────────────────────────────────────────────
    // Base columns (with rowspan=2 → merge rows 4-5)
    const baseHeaders = [
      { col: 1, label: 'No',           bg: 'FF1F3864' },
      { col: 2, label: 'No SPK',       bg: 'FF1F3864' },
      { col: 3, label: 'Tanggal',      bg: 'FF1F3864' },
      { col: 4, label: 'Dept Request', bg: 'FF1F3864' },
      { col: 5, label: 'Due Date',     bg: 'FF1F3864' },
      { col: 6, label: 'Subjek',       bg: 'FF1F3864' },
    ];

    // Group headers (colspan=2, rows 4 only)
    const groupHeaders = [
      { startCol: 7,  label: 'Bongkar Analisis', bg: 'FF2E75B6' },
      { startCol: 9,  label: 'Order Part',        bg: 'FF375623' },
      { startCol: 11, label: 'Drawing',            bg: 'FF7030A0' },
      { startCol: 13, label: 'Machining',          bg: 'FFBF5700' },
      { startCol: 15, label: 'Assy',               bg: 'FF006B6B' },
      { startCol: 17, label: 'Trial',              bg: 'FF843C0C' },
    ];

    ws.getRow(4).height = 22;
    ws.getRow(5).height = 20;

    // Base headers: merge rows 4-5
    baseHeaders.forEach(({ col, label, bg }) => {
      const addr = `${ws.getColumn(col).letter}4:${ws.getColumn(col).letter}5`;
      ws.mergeCells(addr);
      const cell = ws.getCell(`${ws.getColumn(col).letter}4`);
      cell.value = label;
      styleCell(cell, { bg, bold: true, size: 10, border: thickBorder, wrapText: true });
    });

    // Group headers: merge 2 cols in row 4
    groupHeaders.forEach(({ startCol, label, bg }) => {
      const c1 = ws.getColumn(startCol).letter;
      const c2 = ws.getColumn(startCol + 1).letter;
      ws.mergeCells(`${c1}4:${c2}4`);
      const cell = ws.getCell(`${c1}4`);
      cell.value = label;
      styleCell(cell, { bg, bold: true, size: 10, border: thickBorder });

      // Sub-headers in row 5
      ['Start', 'Finish'].forEach((sub, i) => {
        const subCell = ws.getCell(`${ws.getColumn(startCol + i).letter}5`);
        subCell.value = sub;
        styleCell(subCell, { bg, bold: true, size: 9, border: thickBorder });
      });
    });

    // ── ROW 6+: Data rows ────────────────────────────────────────────────────
    const evenBg  = 'FFF2F7FF';
    const oddBg   = 'FFFFFFFF';
    const dateFmt = (v) => v ? dayjs(v).format('DD/MM/YYYY') : '';
    const dtFmt   = (v) => v ? dayjs(v).format('DD/MM/YYYY HH:mm') : '';

    data.forEach((item, idx) => {
      const rowNum = idx + 6;
      const bg = idx % 2 === 0 ? evenBg : oddBg;
      const fontColor = 'FF1F1F1F';

      const rowData = [
        idx + 1,
        item.no_spk   || '',
        dateFmt(item.tanggal),
        item.dept     || '',
        dateFmt(item.duedate),
        item.subject  || '',
        dtFmt(item.bongkar_start),
        dtFmt(item.bongkar_end),
        dtFmt(item.order_part_start),
        dtFmt(item.order_part_end),
        dtFmt(item.drawing_start),
        dtFmt(item.drawing_end),
        dtFmt(item.machining_start),
        dtFmt(item.machining_end),
        dtFmt(item.assy_start),
        dtFmt(item.assy_end),
        dtFmt(item.trial_start),
        dtFmt(item.trial_end),
      ];

      rowData.forEach((val, colIdx) => {
        const cell = ws.getCell(rowNum, colIdx + 1);
        cell.value = val;
        const isCenter = colIdx !== 3 && colIdx !== 5; // dept & subject left-aligned
        styleCell(cell, {
          bg,
          fontColor,
          bold: false,
          size: 9,
          align: isCenter ? 'center' : 'left',
          border: thinBorder,
          wrapText: colIdx === 5,
        });
      });

      ws.getRow(rowNum).height = 16;
    });

    // ── Auto-filter on header row 5 ──────────────────────────────────────────
    ws.autoFilter = { from: { row: 5, column: 1 }, to: { row: 5, column: 18 } };

    // ── Response ─────────────────────────────────────────────────────────────
    const timestamp = dayjs().format('YYYYMMDDHHmmss');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=Monitoring_SPK_${timestamp}.xlsx`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    logger(error, 'GET /exportMonitoringSPK', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};
