import ExcelJS from "exceljs";
import dayjs from "dayjs";

export const generateLokasiArsipExcel = (data) => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Lokasi Arsip');
  sheet.columns = [
    { key: 'lokasi_arsip_name', width: 40 },
    { key: 'lokasi_arsip_bu_id', width: 15 },
    { key: 'lokasi_arsip_status', width: 15 }
  ];
  sheet.mergeCells('A1:C1');
  sheet.getCell('A1').value = 'Daftar Lokasi Arsip';
  sheet.getCell('A1').font = { bold: true, size: 14 };
  sheet.getCell('A1').alignment = { horizontal: 'center' };
  const headerRow = sheet.addRow(['Nama Lokasi', 'Bisnis Unit', 'Status']);
  headerRow.font = { bold: true };
  headerRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF00' } };
    cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
  });
  data.forEach(item => {
    const status = item.lokasi_arsip_status == 1 ? 'Active' : 'Inactive';
    const row = sheet.addRow([item.lokasi_arsip_name, item.lokasi_arsip_bu_id, status]);
    row.eachCell((cell) => {
      cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
    });
  });
  return workbook;
};

export const getLokasiArsipFilename = () => `lokasi_arsip_${dayjs().format('YYYYMMDDHHmmss')}.xlsx`;
