import { sendMail } from './mail.js';
import ejs from 'ejs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dbDMS } from '../config/db.js';
import dayjs from 'dayjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const formatDate = (date) => {
  if (!date) return '-';
  return dayjs(date).format('DD/MM/YYYY');
};

const ucwords = (str) => str ? str.toLowerCase().replace(/\b\w/g, l => l.toUpperCase()) : '-';

/**
 * Send Peminjaman approval notification email
 */
export const sendPeminjamanApprovalEmail = async (data) => {
  try {
    const templateName = data.aktivitas === 'Pinjam Asli'
      ? 'document-request-pinjam-asli.ejs'
      : 'document-request-elektronik.ejs';

    const html = await ejs.renderFile(
      path.join(__dirname, '../view/email/', templateName),
      {
        approverName: data.recipient_name,
        documentName: data.nama_dokumen,
        archiveCode: data.kode_arsip || '-',
        ticketNumber: data.no_tiket,
        securityCategory: ucwords(data.kategori_keamanan),
        documentCategory: ucwords(data.kategori_dokumen),
        pickupDate: formatDate(data.tgl_pengambilan),
        returnDate: data.aktivitas === 'Pinjam Asli' ? formatDate(data.tgl_pengembalian) : '',
        notes: data.keterangan || '-',
        requesterName: data.requester_name,
        requesterNik: data.requester_nik,
        divisionName: data.division_name || '-',
        approvalLink: data.approval_link,
      }
    );

    await sendMail({
      to: data.recipient_email,
      cc: data.cc || '',
      subject: 'NOTIFIKASI PERMINTAAN DOKUMEN',
      html,
    });
  } catch (error) {
    throw error;
  }
};
