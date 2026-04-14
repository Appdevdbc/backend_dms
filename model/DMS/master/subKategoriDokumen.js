import ExcelJS from "exceljs";
import dayjs from "dayjs";

export const generateSubKategoriDokumenExcel = (data) => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Sub Kategori Dokumen');
  sheet.columns = [
    { key: 'sub_arsip_kd_id', width: 20 },
    { key: 'sub_arsip_jenis', width: 40 },
    { key: 'sub_arsip_categ', width: 30 },
    { key: 'sub_arsip_counter', width: 15 },
    { key: 'sub_arsip_status', width: 15 }
  ];
  sheet.mergeCells('A1:E1');
  sheet.getCell('A1').value = 'Daftar Sub Kategori Dokumen';
  sheet.getCell('A1').font = { bold: true, size: 14 };
  sheet.getCell('A1').alignment = { horizontal: 'center' };
  const headerRow = sheet.addRow(['Kode Jenis', 'Jenis Dokumen', 'Sub Kategori', 'Counter', 'Status']);
  headerRow.font = { bold: true };
  headerRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF00' } };
    cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
  });
  data.forEach(item => {
    const status = item.sub_arsip_status == 1 ? 'Active' : 'Inactive';
    const row = sheet.addRow([item.sub_arsip_kd_id, item.sub_arsip_jenis, item.sub_arsip_categ, item.sub_arsip_counter, status]);
    row.eachCell((cell) => {
      cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
    });
  });
  return workbook;
};

export const getSubKategoriDokumenFilename = () => `sub_kategori_dokumen_${dayjs().format('YYYYMMDDHHmmss')}.xlsx`;
