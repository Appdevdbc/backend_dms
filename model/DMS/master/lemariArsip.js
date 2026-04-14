import ExcelJS from "exceljs";
import dayjs from "dayjs";

export const generateLemariArsipExcel = (data) => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Lemari Arsip');
  sheet.columns = [
    { key: 'lemari_bu_id', width: 15 },
    { key: 'lemari_name', width: 30 },
    { key: 'lemari_tingkat_ke', width: 15 },
    { key: 'lemari_box_ke', width: 15 },
    { key: 'lemari_urutan_doc', width: 20 },
    { key: 'lokasi_arsip_name', width: 40 },
    { key: 'lemari_arsip_status', width: 15 }
  ];
  sheet.mergeCells('A1:G1');
  sheet.getCell('A1').value = 'Daftar Lemari Arsip';
  sheet.getCell('A1').font = { bold: true, size: 14 };
  sheet.getCell('A1').alignment = { horizontal: 'center' };
  const headerRow = sheet.addRow(['Bisnis Unit', 'Nama Lemari', 'Tingkat Lemari', 'Box', 'Urutan Dokumen', 'Nama Lokasi Arsip', 'Status']);
  headerRow.font = { bold: true };
  headerRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF00' } };
    cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
  });
  data.forEach(item => {
    const status = item.lemari_arsip_status == 1 ? 'Active' : 'Inactive';
    const row = sheet.addRow([item.lemari_bu_id, item.lemari_name, item.lemari_tingkat_ke, item.lemari_box_ke, item.lemari_urutan_doc, item.lokasi_arsip_name, status]);
    row.eachCell((cell) => {
      cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
    });
  });
  return workbook;
};

export const getLemariArsipFilename = () => `lemari_arsip_${dayjs().format('YYYYMMDDHHmmss')}.xlsx`;
