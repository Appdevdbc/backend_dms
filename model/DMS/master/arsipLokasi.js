import ExcelJS from "exceljs";
import dayjs from "dayjs";

export const generateArsipLokasiExcel = (data) => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Arsip Lokasi');
  sheet.columns = [
    { key: 'account_nik', width: 15 },
    { key: 'account_name', width: 30 },
    { key: 'account_bu', width: 15 },
    { key: 'account_dept_name', width: 30 },
    { key: 'account_div_name', width: 30 },
    { key: 'lokasi_arsip_name', width: 40 },
    { key: 'lokasi_arsip_status', width: 15 }
  ];
  sheet.mergeCells('A1:G1');
  sheet.getCell('A1').value = 'Daftar Arsiparis Lokasi';
  sheet.getCell('A1').font = { bold: true, size: 14 };
  sheet.getCell('A1').alignment = { horizontal: 'center' };
  const headerRow = sheet.addRow(['NIK', 'Nama', 'Bisnis Unit', 'Departemen', 'Divisi', 'Nama Lokasi Arsip', 'Status']);
  headerRow.font = { bold: true };
  headerRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF00' } };
    cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
  });
  data.forEach(item => {
    const status = item.lokasi_arsip_status == 1 ? 'Active' : 'Inactive';
    const row = sheet.addRow([item.account_nik, item.account_name, item.account_bu, item.account_dept_name, item.account_div_name, item.lokasi_arsip_name, status]);
    row.eachCell((cell) => {
      cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
    });
  });
  return workbook;
};

export const getArsipLokasiFilename = () => `arsip_lokasi_${dayjs().format('YYYYMMDDHHmmss')}.xlsx`;
