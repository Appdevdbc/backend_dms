import dayjs from "dayjs";
import { formatDateTimeCustom } from "./utils.js";

export const exportSPMSheet1 = (workbook,data_header,data_cust,data_detail) => {
    let jenis
    let total = 0
    let kubikasi = 0
    if(data_header.type.toLowerCase()=='pipa'){
        jenis = ' - PPC'
        kubikasi = data_header.tm_kubikasi
    }else if (data_header.type.toLowerCase()=='fitting'){
        jenis = ' - FT'
        kubikasi = data_header.tm_kubikasi_fitting
    }
    const sheet1 = workbook.addWorksheet('Sheet 1');
    // Set column widths
    sheet1.columns = [
        { width: 5 },  // No
        { width: 12 }, // Lokasi
        { width: 25 }, // Type
        { width: 40 }, // Item
        { width: 10 }, // UOM
        { width: 10 }, // Jml Order
        { width: 10 }, // Jml Muat
        { width: 10 }, // Sisa
        { width: 12 }, // No. Tumpak
        { width: 10 }, // TIR
    ];

    //judul
    sheet1.mergeCells('A1:E1');
    sheet1.getCell('A1').value = `Surat Perintah Muat (SPM)${jenis}`;
    sheet1.getCell('A1').font = { size: 14, bold: true };
    
    //nomor
    sheet1.mergeCells('A2:E2');
    sheet1.getCell('A2').value = `${data_header.no_spm}/ DLV/ ${data_header.no_armada==null?'1':data_header.no_armada}/${data_header.site_muat}`;

    // customer
    sheet1.mergeCells('A3:E3');
    sheet1.getCell('A3').value = `${data_cust.nmcust}`;
    sheet1.getCell('A3').font = { bold: true };

     // Locked Date
    sheet1.mergeCells('H1:J1');
    sheet1.getCell('H1').value = `Locked Date : ${formatDateTimeCustom(dayjs(data_header.spm_date),'YYYY-MM-DD HH:mm','DD-MM-YYYY HH:mm')}`;
    sheet1.getCell('H1').alignment = { horizontal: 'right' };

    // Info Box (Right)
    const infoLabels = ['Ekspedisi', 'No. Kend', 'No. Cont', 'No. Seal'];
    infoLabels.forEach((label, i) => {
        sheet1.getCell(`H${2 + i}`).value = label;
        sheet1.getCell(`H${2 + i}`).font = { bold: true };
        sheet1.getCell(`H${2 + i}`).alignment = { vertical: 'middle' };
        sheet1.getCell(`H${2 + i}`).border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
        };

        sheet1.mergeCells(`I${2 + i}:J${2 + i}`);
        sheet1.getCell(`I${2 + i}`).border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
        };
    });

    const spaceRow = sheet1.lastRow.number + 1;
    sheet1.getCell(`A${spaceRow}`).value = '';
    // Table Header
    const headerRow = sheet1.addRow([
        'No', 'Lokasi', 'Type', 'Item', 'UOM', 'Jml Order', 'Jml Muat', 'Sisa', 'No. Tumpak', 'TIR'
    ]);
    headerRow.font = { bold: true };
    headerRow.alignment = { horizontal: 'center' };
    headerRow.eachCell((cell) => {
        cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
        };
        cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFF00' } // Yellow color
        };
    });

    data_detail.forEach((item, index) => {
        total += item.qty_muat
        const row = [
            index + 1,             // No (index counter)
            item.lokasi_muat,
            '',
            item.deskripsi,             
            item.uom,
            item.qty_muat,
            '', '', '', ''         
        ];
        const r = sheet1.addRow(row);
        r.eachCell((cell) => {
            cell.border = {
                top: { style: 'thin' },
                left: { style: 'thin' },
                bottom: { style: 'thin' },
                right: { style: 'thin' }
            };
        });
    });

    // Footer Totals
    const totalStartRow = sheet1.lastRow.number + 2;
    sheet1.getCell(`I${totalStartRow}`).value = 'Total';
    sheet1.getCell(`J${totalStartRow}`).value = total;

    sheet1.getCell(`I${totalStartRow + 1}`).value = 'Kubikasi';
    sheet1.getCell(`J${totalStartRow + 1}`).value = data_header.kubikasi;

    sheet1.getCell(`I${totalStartRow + 2}`).value = 'Tonase';
    sheet1.getCell(`J${totalStartRow + 2}`).value = data_header.tonase;

    sheet1.getCell(`I${totalStartRow + 3}`).value = 'Sisa Kubikasi';
    sheet1.getCell(`J${totalStartRow + 3}`).value = Math.round((kubikasi-data_header.kubikasi)*1000)/1000;

    // Footer Note
    sheet1.mergeCells(`A${totalStartRow + 5}:F${totalStartRow + 5}`);
    sheet1.getCell(`A${totalStartRow + 5}`).value = 'Untuk detail marking bisa dicek di bagian 2';

};

export const exportSPMSheet2 = (workbook,data_header,data_cust,data_detail) => {
    let jenis
    let total = 0
    let kubikasi = 0
    if(data_header.type.toLowerCase()=='pipa'){
        jenis = ' - PPC'
        kubikasi = data_header.tm_kubikasi
    }else if (data_header.type.toLowerCase()=='fitting'){
        jenis = ' - FT'
        kubikasi = data_header.tm_kubikasi_fitting
    }
    const sheet2 = workbook.addWorksheet('Sheet 2');
    // Set column widths
    sheet2.columns = [
        { width: 5 },  // No
        { width: 20 }, // PPS#
        { width: 20 }, // IP# 
        { width: 15 }, // Channel
        { width: 15 }, // Line
        { width: 40 }, // Remark
        { width: 40 }, // Article-Barang
        { width: 10 }, // UoM
        { width: 15 }, // Qty
        { width: 10 }, // Verf
    ];

    //judul
    sheet2.mergeCells('A1:E1');
    sheet2.getCell('A1').value = `Surat Perintah Muat (SPM)${jenis}`;
    sheet2.getCell('A1').font = { size: 14, bold: true };
    
    //nomor
    sheet2.mergeCells('A2:E2');
    sheet2.getCell('A2').value = `${data_header.no_spm}/ DLV/ ${data_header.no_armada==null?'1':data_header.no_armada}/${data_header.site_muat}`;

    // customer
    sheet2.mergeCells('A3:E3');
    sheet2.getCell('A3').value = `${data_cust.nmcust}`;
    sheet2.getCell('A3').font = { bold: true };

     // Locked Date
    sheet2.mergeCells('H1:J1');
    sheet2.getCell('H1').value = `Locked Date : ${formatDateTimeCustom(dayjs(data_header.spm_date),'YYYY-MM-DD HH:mm','DD-MM-YYYY HH:mm')}`;
    sheet2.getCell('H1').alignment = { horizontal: 'right' };

    // Info Box (Right)
    const infoLabels = ['Ekspedisi', 'No. Kend', 'No. Cont', 'No. Seal'];
    infoLabels.forEach((label, i) => {
        sheet2.getCell(`H${2 + i}`).value = label;
        sheet2.getCell(`H${2 + i}`).font = { bold: true };
        sheet2.getCell(`H${2 + i}`).alignment = { vertical: 'middle' };
        sheet2.getCell(`H${2 + i}`).border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
        };

        sheet2.mergeCells(`I${2 + i}:J${2 + i}`);
        sheet2.getCell(`I${2 + i}`).border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
        };
    });

    const spaceRow = sheet2.lastRow.number + 1;
    sheet2.getCell(`A${spaceRow}`).value = `No Destloc:${data_header.ship_to}`;
    // Table Header
    const headerRow = sheet2.addRow([
        'No', 'PPS#', 'IP#', 'Channel', 'Line', 'Remark', 'Article-Barang', 'UOM', 'Qty', 'Verf'
    ]);
    headerRow.font = { bold: true };
    headerRow.alignment = { horizontal: 'center' };
    headerRow.eachCell((cell) => {
        cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
        };
        cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFF00' } // Yellow color
        };
    });

    data_detail.forEach((item, index) => {
        total += item.qty_muat
        const row = [
            index + 1,             // No (index counter)
            item.pps,
            item.so_nbr,
            item.channel,            
            item.line,
            item.marking,
            `${item.item}-${item.deskripsi}`,
            item.um,
            item.qty_muat,
            ''
        ];
        const r = sheet2.addRow(row);
        r.eachCell((cell) => {
            cell.border = {
                top: { style: 'thin' },
                left: { style: 'thin' },
                bottom: { style: 'thin' },
                right: { style: 'thin' }
            };
        });
    });

    // Footer Totals
    const totalStartRow = sheet2.lastRow.number + 2;
    sheet2.getCell(`B${totalStartRow}`).value = 'Total Surat Jalan';
    sheet2.getCell(`C${totalStartRow}`).value = new Set(data_detail.map(item => item.so_nbr)).size;
    sheet2.getCell(`I${totalStartRow}`).value = 'Total';
    sheet2.getCell(`J${totalStartRow}`).value = total;

    sheet2.getCell(`I${totalStartRow + 1}`).value = 'Kubikasi';
    sheet2.getCell(`J${totalStartRow + 1}`).value = data_header.kubikasi;

    sheet2.getCell(`I${totalStartRow + 2}`).value = 'Tonase';
    sheet2.getCell(`J${totalStartRow + 2}`).value = data_header.tonase;

    sheet2.getCell(`I${totalStartRow + 3}`).value = 'Sisa Kubikasi';
    sheet2.getCell(`J${totalStartRow + 3}`).value = Math.round((kubikasi-data_header.kubikasi)*1000)/1000;

};


export const exportReportSPM = (workbook,data) => {
    
    const sheet1 = workbook.addWorksheet('Sheet 1');
    // Set column widths
    sheet1.columns = [
        { width: 5 }, //No
        { width: 15 },  // Date Created
        { width: 15 }, // Tgl Kirim
        { width: 20 }, // ID Nesting 
        { width: 15 }, // No SPM 
        { width: 15 }, // No SO
        { width: 15 }, // Shipto
        { width: 40 }, // Shiptoname
        { width: 20 }, // Jenis Truck
        { width: 10 }, // Allo site
        { width: 15 }, // Kubikasi
        { width: 15 }, // Tonase
    ];

    // Table Header
    const headerRow = sheet1.addRow([
        'No', 'Date Created', 'Tgl Rencana Kirim','ID Nesting','No SPM', 'No SO', 'Shipto', 'Shipto Name', 'Jenis Truck', 'Allo. Site', 'Kubikasi','Tonase'
    ]);
    headerRow.font = { bold: true };
    headerRow.alignment = { horizontal: 'center' };
    headerRow.eachCell((cell) => {
        cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
        };
        cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFF00' } // Yellow color
        };
    });

    data.forEach((item, index) => {
        const row = [
            index + 1,             // No (index counter)
            item.spm_date,
            item.ship_date,
            item.nest_id,
            item.no_spm,            
            item.no_so,
            item.ship_to,
            item.shipto_name==null?'':item.shipto_name,
            item.jenis_truck,
            item.site_muat,
            item.kubikasi,
            item.tonase,
        ];
        const r = sheet1.addRow(row);
        r.eachCell((cell) => {
            cell.border = {
                top: { style: 'thin' },
                left: { style: 'thin' },
                bottom: { style: 'thin' },
                right: { style: 'thin' }
            };
        });
    });

};