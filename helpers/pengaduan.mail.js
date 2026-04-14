import { sendMail } from './mail.js';
import ejs from 'ejs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const formatDate = (date) => {
  if (!date) return '-';
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
};

/**
 * Send Pengaduan approval notification email
 */
export const sendPengaduanApprovalEmail = async (data) => {
  try {
    const html = await ejs.renderFile(
      path.join(__dirname, '../view/email/pengaduan-approval.ejs'),
      {
        recipient_name: data.recipient_name,
        no_pengaduan: data.no_pengaduan,
        nama_arsip: data.nama_arsip,
        no_dokumen: data.no_dokumen,
        kode_arsip: data.kode_arsip,
        status_dokumen: data.status_dokumen,
        kategori_dokumen: data.kategori_dokumen,
        jenis_dokumen: data.jenis_dokumen || 'Asli Hard Copy',
        tanggal_dokumen: formatDate(data.tanggal_dokumen),
        deskripsi: data.deskripsi,
        nama_pengadu: data.nama_pengadu,
        nik_pengadu: data.nik_pengadu,
        dept_pengadu: data.dept_pengadu,
        approval_link: data.approval_link
      }
    );

    await sendMail({
      to: data.recipient_email,
      cc: data.cc || '',
      bcc: data.bcc || '',
      subject: 'Approval Pengaduan',
      html
    });
  } catch (error) {
    throw error;
  }
};

/**
 * Send Pengaduan rejection/revision email to user
 */
export const sendPengaduanRevisionEmail = async (data) => {
  try {
    const html = await ejs.renderFile(
      path.join(__dirname, '../view/email/pengaduan-revision.ejs'),
      {
        recipient_name: data.recipient_name,
        no_pengaduan: data.no_pengaduan,
        nama_arsip: data.nama_arsip,
        no_dokumen: data.no_dokumen,
        kode_arsip: data.kode_arsip,
        status_dokumen: data.status_dokumen,
        kategori_dokumen: data.kategori_dokumen,
        jenis_dokumen: data.jenis_dokumen || 'Asli Hard Copy',
        tanggal_dokumen: formatDate(data.tanggal_dokumen),
        deskripsi: data.deskripsi,
        rejector_name: data.rejector_name,
        rejector_nik: data.rejector_nik,
        rejector_dept: data.rejector_dept,
        reason: data.reason,
        revision_link: data.revision_link,
        is_final_reject: data.is_final_reject || false
      }
    );

    await sendMail({
      to: data.recipient_email,
      subject: data.is_final_reject ? 'Reject Pengaduan' : 'Revisi Pengaduan',
      html
    });
  } catch (error) {
    throw error;
  }
};
