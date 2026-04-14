import ExcelJS from "exceljs";
import dayjs from "dayjs";

export const generateMappingBisnisUnitExcel = (data) => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Mapping Bisnis Unit');
  sheet.columns = [
    { key: 'bu_name', width: 40 },
    { key: 'map_desc_kd_bu', width: 20 },
    { key: 'map_bu_singkat', width: 20 },
    { key: 'map_kd_bu_status', width: 15 }
  ];
  sheet.mergeCells('A1:D1');
  sheet.getCell('A1').value = 'Daftar Mapping Bisnis Unit';
  sheet.getCell('A1').font = { bold: true, size: 14 };
  sheet.getCell('A1').alignment = { horizontal: 'center' };
  const headerRow = sheet.addRow(['Bisnis Unit', 'Kode BU', 'Kode Singkat BU', 'Status']);
  headerRow.font = { bold: true };
  headerRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF00' } };
    cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
  });
  data.forEach(item => {
    const status = item.map_kd_bu_status == 1 ? 'Active' : 'Inactive';
    const row = sheet.addRow([item.bu_name, item.map_desc_kd_bu, item.map_bu_singkat, status]);
    row.eachCell((cell) => {
      cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
    });
  });
  return workbook;
};

export const getMappingBisnisUnitFilename = () => `mapping_bisnis_unit_${dayjs().format('YYYYMMDDHHmmss')}.xlsx`;
