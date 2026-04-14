import { sendMail } from './mail.js';
import ejs from 'ejs';
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
 * Format security category for display
 */
const formatSecurityCategory = (category) => {
  if (!category) return '-';
  return category.split('-').map(word => 
    word.charAt(0).toUpperCase() + word.slice(1)
  ).join(' ');
};

// ============================================
// PEMUSNAHAN EMAILS
// ============================================

/**
 * Send Pemusnahan approval notification email
 * @param {Object} data - Email data
 */
export const sendPemusnahanApprovalEmail = async (data) => {
  try {
    const html = await ejs.renderFile(
      path.join(__dirname, '../view/email/pemusnahan-approval.ejs'),
      {
        recipient_name: data.recipient_name,
        no_pemusnahan: data.no_pemusnahan,
        documents: data.documents,
        kategori_dokumen: data.kategori_dokumen,
        kategori_keamanan: formatSecurityCategory(data.kategori_keamanan),
        jumlah: data.jumlah,
        tgl_pengajuan: formatDate(data.tgl_pengajuan),
        tgl_pemusnahan: formatDate(data.tgl_pemusnahan),
        user_nama: data.user_nama,
        user_direktorat: data.user_direktorat || '-',
        user_divisi: data.user_divisi || '-',
        keterangan_pemusnahan: data.keterangan_pemusnahan || '-',
        approval_link: data.approval_link,
        is_arsiparis: data.is_arsiparis || false,
        is_arsiparis_complete: data.is_arsiparis_complete || false,
        lokasi_arsip_name: data.lokasi_arsip_name || ''
      }
    );
    
    await sendMail({
      to: data.recipient_email,
      cc: data.cc || '',
      subject: 'NOTIFIKASI PEMUSNAHAN DOKUMEN',
      html: html
    });
    
  } catch (error) {
    throw error;
  }
};

/**
 * Send Pemusnahan revision request email
 * @param {Object} data - Email data
 */
export const sendPemusnahanRevisionEmail = async (data) => {
  try {
    const html = await ejs.renderFile(
      path.join(__dirname, '../view/email/pemusnahan-revision.ejs'),
      {
        recipient_name: data.recipient_name,
        no_pemusnahan: data.no_pemusnahan,
        documents: data.documents,
        kategori_dokumen: data.kategori_dokumen,
        kategori_keamanan: formatSecurityCategory(data.kategori_keamanan),
        jumlah: data.jumlah,
        tgl_pengajuan: formatDate(data.tgl_pengajuan),
        tgl_pemusnahan: formatDate(data.tgl_pemusnahan),
        user_nama: data.user_nama,
        keterangan_pemusnahan: data.keterangan_pemusnahan || '-',
        revisi_reason: data.revisi_reason,
        revision_link: data.revision_link
      }
    );
    
    await sendMail({
      to: data.recipient_email,
      subject: 'NOTIFIKASI PEMUSNAHAN DOKUMEN',
      html: html
    });
    
  } catch (error) {
    throw error;
  }
};


/**
 * Send Pemusnahan rejection notification email
 * @param {Object} data - Email data
 */
export const sendPemusnahanRejectionEmail = async (data) => {
  try {
    const html = await ejs.renderFile(
      path.join(__dirname, '../view/email/pemusnahan-rejection.ejs'),
      {
        recipient_name: data.recipient_name,
        no_pemusnahan: data.no_pemusnahan,
        documents: data.documents,
        kategori_dokumen: data.kategori_dokumen,
        kategori_keamanan: formatSecurityCategory(data.kategori_keamanan),
        jumlah: data.jumlah,
        tgl_pengajuan: formatDate(data.tgl_pengajuan),
        tgl_pemusnahan: formatDate(data.tgl_pemusnahan),
        user_nama: data.user_nama,
        keterangan_pemusnahan: data.keterangan_pemusnahan || '-',
        revisi_reason: data.revisi_reason
      }
    );
    
    await sendMail({
      to: data.recipient_email,
      subject: 'NOTIFIKASI PEMUSNAHAN DOKUMEN',
      html: html
    });
    
  } catch (error) {
    throw error;
  }
};

// ============================================
// MUTASI EMAILS
// ============================================

/**
 * Send Mutasi approval notification email
 * @param {Object} data - Email data
 */
export const sendMutasiApprovalEmail = async (data) => {
  try {
    const html = await ejs.renderFile(
      path.join(__dirname, '../view/email/mutasi-approval.ejs'),
      {
        recipient_name: data.recipient_name,
        no_mutasi: data.no_mutasi,
        documents: data.documents,
        kategori_dokumen: data.kategori_dokumen,
        kategori_keamanan: formatSecurityCategory(data.kategori_keamanan),
        jumlah: data.jumlah,
        tgl_pengajuan: formatDate(data.tgl_pengajuan),
        tgl_mutasi: formatDate(data.tgl_mutasi),
        user_nama: data.user_nama,
        user_direktorat: data.user_direktorat || '-',
        user_divisi: data.user_divisi || '-',
        approval_link: data.approval_link
      }
    );
    
    await sendMail({
      to: data.recipient_email,
      subject: 'NOTIFIKASI MUTASI DOKUMEN',
      html: html
    });
    
  } catch (error) {
    throw error;
  }
};

/**
 * Send Mutasi revision request email
 * @param {Object} data - Email data
 */
export const sendMutasiRevisionEmail = async (data) => {
  try {
    const html = await ejs.renderFile(
      path.join(__dirname, '../view/email/mutasi-revision.ejs'),
      {
        recipient_name: data.recipient_name,
        no_mutasi: data.no_mutasi,
        documents: data.documents,
        kategori_dokumen: data.kategori_dokumen,
        kategori_keamanan: formatSecurityCategory(data.kategori_keamanan),
        jumlah: data.jumlah,
        tgl_pengajuan: formatDate(data.tgl_pengajuan),
        tgl_mutasi: formatDate(data.tgl_mutasi),
        user_nama: data.user_nama,
        revisi_reason: data.revisi_reason,
        revision_link: data.revision_link
      }
    );
    
    await sendMail({
      to: data.recipient_email,
      subject: 'NOTIFIKASI MUTASI DOKUMEN',
      html: html
    });
    
  } catch (error) {
    throw error;
  }
};

/**
 * Send Mutasi execution notification email (status 7→8, sent to arsiparis baru)
 * Contains BAST instructions: download, execute, sign, upload
 * @param {Object} data - Email data
 */
export const sendMutasiExecutionEmail = async (data) => {
  try {
    const html = await ejs.renderFile(
      path.join(__dirname, '../view/email/mutasi-execution.ejs'),
      {
        recipient_name: data.recipient_name,
        no_mutasi: data.no_mutasi,
        documents: data.documents,
        kategori_dokumen: data.kategori_dokumen,
        kategori_keamanan: formatSecurityCategory(data.kategori_keamanan),
        jumlah: data.jumlah,
        tgl_pengajuan: formatDate(data.tgl_pengajuan),
        tgl_mutasi: formatDate(data.tgl_mutasi),
        user_nama: data.user_nama,
        lokasi_arsip_name: data.lokasi_arsip_name,
        approval_link: data.approval_link
      }
    );
    
    await sendMail({
      to: data.recipient_email,
      subject: 'NOTIFIKASI MUTASI DOKUMEN',
      html: html
    });
    
  } catch (error) {
    throw error;
  }
};

/**
 * Send Mutasi completion notification email (after BAST uploaded, sent to all 4 parties)
 * @param {Object} data - Email data
 */
export const sendMutasiCompletionEmail = async (data) => {
  try {
    const html = await ejs.renderFile(
      path.join(__dirname, '../view/email/mutasi-completion.ejs'),
      {
        recipient_name: data.recipient_name,
        no_mutasi: data.no_mutasi,
        documents: data.documents,
        kategori_dokumen: data.kategori_dokumen,
        kategori_keamanan: formatSecurityCategory(data.kategori_keamanan),
        jumlah: data.jumlah,
        tgl_pengajuan: formatDate(data.tgl_pengajuan),
        tgl_mutasi: formatDate(data.tgl_mutasi),
        user_nama: data.user_nama,
        lokasi_arsip_name: data.lokasi_arsip_name,
        detail_link: data.detail_link
      }
    );
    
    await sendMail({
      to: data.recipient_email,
      subject: 'NOTIFIKASI MUTASI DOKUMEN',
      html: html
    });
    
  } catch (error) {
    throw error;
  }
};

/**
 * Send Mutasi rejection notification email
 * @param {Object} data - Email data
 */
export const sendMutasiRejectionEmail = async (data) => {
  try {
    const html = await ejs.renderFile(
      path.join(__dirname, '../view/email/mutasi-rejection.ejs'),
      {
        recipient_name: data.recipient_name,
        no_mutasi: data.no_mutasi,
        documents: data.documents,
        kategori_dokumen: data.kategori_dokumen,
        kategori_keamanan: formatSecurityCategory(data.kategori_keamanan),
        jumlah: data.jumlah,
        tgl_pengajuan: formatDate(data.tgl_pengajuan),
        tgl_mutasi: formatDate(data.tgl_mutasi),
        user_nama: data.user_nama,
        revisi_reason: data.revisi_reason
      }
    );
    
    await sendMail({
      to: data.recipient_email,
      subject: 'NOTIFIKASI MUTASI DOKUMEN',
      html: html
    });
    
  } catch (error) {
    throw error;
  }
};
