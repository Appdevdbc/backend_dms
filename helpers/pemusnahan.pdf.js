import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Format date to DD/MM/YYYY
 */
const formatDate = (date) => {
  if (!date) return '-';
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
};

/**
 * Convert string to Title Case (matching PHP ucwords(strtolower()))
 */
const toTitleCase = (str) => {
  if (!str || str === '-') return str;
  return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
};

/**
 * Generate Pemusnahan BAST PDF using pdfmake
 * Matches PHP pemusnahan BAST layout: 9 columns, 3 signatories, witness table
 * @param {Object} data - BAST data
 * @returns {Promise<string>} - Filename of generated PDF
 */
export const generatePemusnahanBAST = async (data) => {
  const PdfPrinter = (await import('pdfmake')).default;

  const fontPath = path.join(__dirname, '../view/pdf');
  const fonts = {
    Roboto: {
      normal: path.join(fontPath, 'Roboto-Regular.ttf'),
      bold: path.join(fontPath, 'Roboto-Medium.ttf'),
      italics: path.join(fontPath, 'Roboto-Italic.ttf'),
      bolditalics: path.join(fontPath, 'Roboto-MediumItalic.ttf')
    }
  };

  const printer = new PdfPrinter(fonts);
  const filename = `BAST_Pemusnahan_${data.tr_no_tiket.replace(/\//g, '_')}_${Date.now()}.pdf`;
  const pdfDir = path.join(__dirname, '../file/pdf');
  if (!fs.existsSync(pdfDir)) fs.mkdirSync(pdfDir, { recursive: true });
  const filepath = path.join(pdfDir, filename);

  const tglPemusnahan = formatDate(data.tgl_pemusnahan);
  const lokasiArsip = data.lokasi_arsip_name || '-';
  const arsiparis = toTitleCase(data.arsiparis?.nama || '-');
  const arsiparisAtasan = toTitleCase(data.arsiparis_atasan?.nama || '-');
  const chiefDic = toTitleCase(data.chief_dic?.nama || '-');

  // Build document table
  const tableBody = [
    [
      { text: 'No', style: 'tableHeader', alignment: 'center' },
      { text: 'Kode Arsip', style: 'tableHeader' },
      { text: 'Nama Arsip', style: 'tableHeader' },
      { text: 'Nomor Dokumen', style: 'tableHeader' },
      { text: 'Tanggal Dokumen', style: 'tableHeader' },
      { text: 'Status Berlaku', style: 'tableHeader' },
      { text: 'Kategori Keamanan', style: 'tableHeader' },
      { text: 'Document Owner', style: 'tableHeader' },
      { text: 'Nama BU', style: 'tableHeader' },
      { text: 'Keterangan', style: 'tableHeader' }
    ]
  ];

  (data.documents || []).forEach((doc, i) => {
    tableBody.push([
      { text: String(i + 1), alignment: 'center' },
      { text: doc.trdet_no_arsip || '-' },
      { text: doc.content_name || '-' },
      { text: doc.content_doc || '-' },
      { text: formatDate(doc.tgl_doc) },
      { text: doc.status_berlaku || '-' },
      { text: doc.content_security || '-' },
      { text: toTitleCase(doc.owner_nama || '-') },
      { text: doc.bu_name || '-' },
      { text: doc.trdet_keterangan || '-' }
    ]);
  });

  // Witness table
  const witnessBody = [
    [
      { text: 'No', style: 'tableHeader', alignment: 'center' },
      { text: 'Nama', style: 'tableHeader' },
      { text: 'Jabatan', style: 'tableHeader' },
      { text: 'Tanda Tangan', style: 'tableHeader' }
    ],
    [
      { text: '1', alignment: 'center' },
      { text: data.saksi1?.nama || '-' },
      { text: data.saksi1?.nm_grade || '-' },
      { text: '' }
    ],
    [
      { text: '2', alignment: 'center' },
      { text: data.saksi2?.nama || '-' },
      { text: data.saksi2?.nm_grade || '-' },
      { text: '' }
    ]
  ];

  const docDefinition = {
    pageSize: 'A4',
    pageOrientation: 'landscape',
    pageMargins: [30, 40, 30, 40],
    defaultStyle: { font: 'Roboto', fontSize: 9 },
    styles: {
      header: { fontSize: 14, bold: true, alignment: 'center' },
      subheader: { fontSize: 11, alignment: 'center', margin: [0, 0, 0, 20] },
      tableHeader: { bold: true, fontSize: 8, alignment: 'center' },
      paragraph: { fontSize: 10, alignment: 'justify', margin: [0, 0, 0, 10] }
    },
    content: [
      { text: 'BERITA ACARA PEMUSNAHAN ARSIP', style: 'header' },
      { text: `No. ${data.tr_no_tiket || ''}`, style: 'subheader' },
      {
        text: `Pada hari ini, tanggal ${tglPemusnahan}, di hadapan 2 (dua) orang saksi, telah dilaksanakan pemusnahan dokumen arsip yang ditempatkan di lokasi penyimpanan ${lokasiArsip} oleh arsiparis lokasi ${arsiparis}, yaitu :`,
        style: 'paragraph'
      },
      {
        table: {
          headerRows: 1,
          widths: [20, 65, 80, 70, 50, 45, 55, 70, 65, 60],
          body: tableBody
        },
        layout: {
          hLineWidth: () => 0.5,
          vLineWidth: () => 0.5,
          hLineColor: () => '#000000',
          vLineColor: () => '#000000',
          paddingLeft: () => 4,
          paddingRight: () => 4,
          paddingTop: () => 3,
          paddingBottom: () => 3
        },
        fontSize: 7,
        margin: [0, 5, 0, 15]
      },
      {
        text: 'Dengan dimusnahkan ini, maka segala hak, kewajiban serta akibat hukum yang sebelumnya terbit dari dokumen-dokumen tersebut dianggap tidak ada atau bila ada, digantikan dengan hak, kewajiban serta akibat hukum yang terbit dari dokumen-dokumen yang diakui sah sebagai penggantinya.',
        style: 'paragraph'
      },
      {
        text: `Berita Acara ini dibuat dalam 1 (satu) rangkap untuk disimpan oleh Arsiparis Lokasi ${arsiparis} bagi PIHAK KESATU dan PIHAK KEDUA.`,
        style: 'paragraph',
        margin: [0, 0, 0, 30]
      },
      // Signature section - 3 signatories
      {
        columns: [
          { text: 'Dilaksanakan oleh,\n\nArsiparis Lokasi\n\n\n\n\n\n' + arsiparis, alignment: 'center', width: '*' },
          { text: '\n\nAtasan Arsiparis Lokasi\n\n\n\n\n\n' + arsiparisAtasan, alignment: 'center', width: '*' },
          { text: 'Penanggung Jawab,\n\nChief/DIC\n\n\n\n\n\n' + chiefDic, alignment: 'center', width: '*' }
        ],
        margin: [0, 0, 0, 20]
      },
      // Witness section
      { text: 'Saksi - saksi :', bold: true, fontSize: 10, alignment: 'center', margin: [0, 0, 0, 10] },
      {
        table: {
          headerRows: 1,
          widths: [30, 200, 180, 150],
          body: witnessBody
        },
        layout: {
          hLineWidth: () => 0.5,
          vLineWidth: () => 0.5,
          hLineColor: () => '#000000',
          vLineColor: () => '#000000',
          paddingLeft: () => 4,
          paddingRight: () => 4,
          paddingTop: () => 3,
          paddingBottom: () => 3
        },
        margin: [50, 0, 50, 15]
      },
      { text: `Tempat Pelaksanaan : ${lokasiArsip}`, fontSize: 10, margin: [0, 10, 0, 0] }
    ]
  };

  return new Promise((resolve, reject) => {
    try {
      const pdfDoc = printer.createPdfKitDocument(docDefinition);
      const stream = fs.createWriteStream(filepath);
      pdfDoc.pipe(stream);
      pdfDoc.end();
      stream.on('finish', () => resolve(filename));
      stream.on('error', reject);
    } catch (error) {
      reject(error);
    }
  });
};


/**
 * Generate Mutasi BAST PDF using pdfmake
 * Matches PHP bastmutasi layout: no saksi, with Jenis/Kondisi columns, 4 signatories
 * Saves to file/pdf/ folder
 * @param {Object} data - BAST data
 * @returns {Promise<string>} - Filename of generated PDF
 */
export const generateMutasiBAST = async (data) => {
  const PdfPrinter = (await import('pdfmake')).default;

  const fontPath = path.join(__dirname, '../view/pdf');
  const fonts = {
    Roboto: {
      normal: path.join(fontPath, 'Roboto-Regular.ttf'),
      bold: path.join(fontPath, 'Roboto-Medium.ttf'),
      italics: path.join(fontPath, 'Roboto-Italic.ttf'),
      bolditalics: path.join(fontPath, 'Roboto-MediumItalic.ttf')
    }
  };

  const printer = new PdfPrinter(fonts);
  const filename = `BAST_Mutasi_${data.tr_no_tiket.replace(/\//g, '_')}_${Date.now()}.pdf`;
  const pdfDir = path.join(__dirname, '../file/pdf');
  if (!fs.existsSync(pdfDir)) fs.mkdirSync(pdfDir, { recursive: true });
  const filepath = path.join(pdfDir, filename);

  const tglMutasi = formatDate(data.tgl_mutasi);
  const lokasiLama = data.lokasi_arsip_lama_name || '-';
  const lokasiBaru = data.lokasi_arsip_baru_name || '-';
  const picLama = toTitleCase(data.arsiparis_lama?.nama || '-');
  const picBaru = toTitleCase(data.arsiparis_baru?.nama || '-');
  const atasanLama = toTitleCase(data.arsiparis_atasan_lama?.nama || '-');
  const atasanBaru = toTitleCase(data.arsiparis_atasan_baru?.nama || '-');

  // Build document table rows
  const tableBody = [
    [
      { text: 'No', style: 'tableHeader', alignment: 'center' },
      { text: 'Kode Arsip', style: 'tableHeader' },
      { text: 'Nama Dokumen', style: 'tableHeader' },
      { text: 'Nomor Dokumen', style: 'tableHeader' },
      { text: 'Tanggal Dokumen', style: 'tableHeader' },
      { text: 'Status Berlaku Arsip', style: 'tableHeader' },
      { text: 'Kategori Keamanan', style: 'tableHeader' },
      { text: 'Document Owner', style: 'tableHeader' },
      { text: 'Nama BU', style: 'tableHeader' },
      { text: 'Keterangan', style: 'tableHeader' },
      { text: 'Jenis dan Jumlah', style: 'tableHeader' },
      { text: 'Kondisi', style: 'tableHeader' },
      { text: 'Keterangan', style: 'tableHeader' }
    ]
  ];

  (data.documents || []).forEach((doc, i) => {
    const jenisText = `Asli: ${doc.jenis_asli_qty || 0}\nCopy: ${doc.jenis_copy_qty || 0}\nElektronik: ${doc.jenis_elektronik_qty || 0}`;
    tableBody.push([
      { text: String(i + 1), alignment: 'center' },
      { text: doc.trdet_no_arsip || '-' },
      { text: doc.content_name || '-' },
      { text: doc.content_doc || '-' },
      { text: doc.content_entrydate || formatDate(doc.tgl_doc) || '-' },
      { text: doc.status_berlaku || '-' },
      { text: doc.content_security || '-' },
      { text: toTitleCase(doc.owner_nama || '-') },
      { text: doc.bu_name || '-' },
      { text: doc.trdet_keterangan || '-' },
      { text: jenisText },
      { text: doc.kondisi_doc_ket || '-' },
      { text: doc.trdet_keterangan || '-' }
    ]);
  });

  const docDefinition = {
    pageSize: 'A4',
    pageOrientation: 'landscape',
    pageMargins: [30, 40, 30, 40],
    defaultStyle: { font: 'Roboto', fontSize: 9 },
    styles: {
      header: { fontSize: 14, bold: true, alignment: 'center' },
      subheader: { fontSize: 11, alignment: 'center', margin: [0, 0, 0, 20] },
      tableHeader: { bold: true, fontSize: 8, alignment: 'center' },
      paragraph: { fontSize: 10, alignment: 'justify', margin: [0, 0, 0, 10] }
    },
    content: [
      { text: 'BERITA ACARA MUTASI ARSIP', style: 'header' },
      { text: data.tr_no_tiket || '', style: 'subheader' },
      {
        text: `Pada hari ini tanggal ${tglMutasi}, bertempat di ${lokasiBaru} telah dilakukan serah terima dokumen arsip dari lokasi penyimpanan semula di ${lokasiLama} oleh ${picLama} ("Arsiparis Lokasi Lama") ke lokasi penyimpanan baru ${lokasiBaru} oleh ${picBaru} ("Arsiparis Lokasi Baru") dengan detail arsip sebagaimana tertera dalam daftar pemindahan arsip yang disetujui.`,
        style: 'paragraph'
      },
      {
        table: {
          headerRows: 1,
          widths: [20, 45, 60, 50, 45, 40, 45, 55, 45, 50, 60, 45, 50],
          body: tableBody
        },
        layout: {
          hLineWidth: () => 0.5,
          vLineWidth: () => 0.5,
          hLineColor: () => '#000000',
          vLineColor: () => '#000000',
          paddingLeft: () => 4,
          paddingRight: () => 4,
          paddingTop: () => 3,
          paddingBottom: () => 3
        },
        fontSize: 7,
        margin: [0, 5, 0, 15]
      },
      {
        text: 'Sejak Berita Acara Mutasi Dokumen ini ditandatangani maka tanggung jawab keamanan dokumen beralih dari Arsiparis Lokasi lama ke arsiparis lokasi Baru.',
        style: 'paragraph'
      },
      {
        text: 'Berita Acara ini dibuat dalam 2 (dua) rangkap untuk disimpan oleh masing-masing dari Arsiparis Lokasi Lama dan Arsiparis Lokasi Baru.',
        style: 'paragraph',
        margin: [0, 0, 0, 30]
      },
      // Signature section - 4 signatories
      {
        columns: [
          { text: 'Diserahkan oleh\n\nArsiparis Lokasi Lama\n\n\n\n\n\n' + picLama, alignment: 'center', width: '*' },
          { text: '\n\nAtasan Arsiparis Lokasi Lama\n\n\n\n\n\n' + atasanLama, alignment: 'center', width: '*' },
          { text: 'Diterima oleh\n\nArsiparis Lokasi Baru\n\n\n\n\n\n' + picBaru, alignment: 'center', width: '*' },
          { text: '\n\nAtasan Arsiparis Lokasi Baru\n\n\n\n\n\n' + atasanBaru, alignment: 'center', width: '*' }
        ],
        margin: [0, 0, 0, 10]
      }
    ]
  };

  return new Promise((resolve, reject) => {
    try {
      const pdfDoc = printer.createPdfKitDocument(docDefinition);
      const stream = fs.createWriteStream(filepath);
      pdfDoc.pipe(stream);
      pdfDoc.end();
      stream.on('finish', () => resolve(filename));
      stream.on('error', reject);
    } catch (error) {
      reject(error);
    }
  });
};
