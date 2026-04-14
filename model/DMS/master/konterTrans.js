import ExcelJS from "exceljs";
import dayjs from "dayjs";

export const generateKonterTransExcel = (data) => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Konter Transaksi');
  sheet.columns = [
    { key: 'sub_arsip_kd_id', width: 20 },
    { key: 'sub_arsip_jenis', width: 40 },
    { key: 'ctr_count', width: 15 },
    { key: 'ctr_kode_divisi', width: 20 },
    { key: 'ctr_kode_bu_flag', width: 15 },
    { key: 'map_desc_kd_bu', width: 20 },
    { key: 'ctr_work_loc', width: 25 },
    { key: 'ctr_prd_yr_mont', width: 20 },
    { key: 'ctr_reset_year', width: 25 },
    { key: 'ctr_status', width: 15 }
  ];
  sheet.mergeCells('A1:J1');
  sheet.getCell('A1').value = 'Daftar Konter Transaksi';
  sheet.getCell('A1').font = { bold: true, size: 14 };
  sheet.getCell('A1').alignment = { horizontal: 'center' };
  const headerRow = sheet.addRow(['Kode Jenis', 'Jenis Dokumen', 'Counter', 'Kode Divisi?', 'Kode BU?', 'Kode BU', 'Kode Worklocation?', 'Tahun & Bulan?', 'Reset ke-1 Per Tahun?', 'Status']);
  headerRow.font = { bold: true };
  headerRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF00' } };
    cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
  });
  data.forEach(item => {
    const status = item.ctr_status == 1 ? 'Active' : 'Inactive';
    const row = sheet.addRow([item.sub_arsip_kd_id, item.sub_arsip_jenis, item.ctr_count, item.ctr_kode_divisi, item.ctr_kode_bu_flag, item.map_desc_kd_bu, item.ctr_work_loc, item.ctr_prd_yr_mont, item.ctr_reset_year, status]);
    row.eachCell((cell) => {
      cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
    });
  });
  return workbook;
};

export const getKonterTransFilename = () => `konter_transaksi_${dayjs().format('YYYYMMDDHHmmss')}.xlsx`;
