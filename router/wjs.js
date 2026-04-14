import express from "express";
import multer from "multer";
import { deleteDocKategori, deletePerjanjian, deleteWork, listArsipLokasi, listDocKategori, listJenisApproval, listLemariArsip, listLokasiArsip, listPerjanjian, listVwWorkLocation, listWorkLocation, saveArsipLokasi, saveDocKategori, saveJenisApproval, saveLemariArsip, saveLokasiArsip, savePerjanjian, saveWorkLocation } from "../controllers/WJS/Master1Controller.js";
import { listKonterTrans, listKonterTransBU, listMappingBisnisUnit, listSubKategoriDokumen, listTypeApproval, saveKonterTrans, saveKonterTransBU, saveMappingBisnisUnit, saveSubKategoriDokumen, saveTypeApproval } from "../controllers/WJS/Master2Controller.js";
import { listPermintaan } from "../controllers/WJS/PermintaanController.js";
import { 
  listPeminjaman, 
  getDocumentByName, 
  addPermintaanDokumen, 
  approvePermintaan, 
  deletePermintaan, 
  getLogTiket,
  getBU,
  checkUserPeminjaman,
  getEmployeeById,
  getMasterApproval,
  exportPeminjamanExcel,
  getLokasiArsipByBU,
  getUserData,
  getDocumentData,
  validateFileUpload,
  checkUserEligibility,
  getEmployeeSupervisor,
  getApprovalDirect,
  processApprovalDirect,
  validatePeminjamanToken
} from "../controllers/WJS/PeminjamanController.js";
import { 
  listApprovals, 
  getApprovalById, 
  createApproval, 
  updateApproval, 
  deleteApproval,
} from "../controllers/WJS/ApprovalController.js";
import {
  list as listPemusnahan,
  getById as getPemusnahanById,
  create as createPemusnahan,
  getArchives,
  approve as approvePemusnahan,
  reject as rejectPemusnahan,
  revise as revisePemusnahanTicket,
  revisiApproval as revisiApprovalPemusnahan,
  executeDelete as executePemusnahanDelete,
  validateArchive,
  getArsiparis,
  getArsiparisAtasan,
  getEmployeeByNik,
  generateBAST,
  executeDeleteWithBAST,
  submitArsiparis,
  uploadDetails,
  downloadTemplate,
  generateBASTpdf as generatePemusnahanBASTpdf,
  downloadBASTpdf as downloadPemusnahanBASTpdf,
  exportToExcel as exportPemusnahanToExcel,
  validateToken as validatePemusnahanToken
} from "../controllers/WJS/PemusnahanController.js";
import {
  list as listMutasi,
  getById as getMutasiById,
  create as createMutasi,
  approve as approveMutasi,
  reject as rejectMutasi,
  revise as reviseMutasiTicket,
  revisiApproval as revisiApprovalMutasi,
  executeMutasi,
  getArchives as getMutasiArchives,
  validateArchive as validateMutasiArchive,
  getArsiparis as getMutasiArsiparis,
  getArsiparisAtasan as getMutasiArsiparisAtasan,
  uploadDetails as uploadMutasiDetails,
  downloadTemplate as downloadMutasiTemplate,
  exportToExcel as exportMutasiToExcel,
  generateBASTpdf as generateMutasiBASTpdf,
  generateBAST as generateMutasiBAST,
  validateToken as validateMutasiToken,
  downloadBASTpdf as downloadMutasiBASTpdf,
  uploadBASTFiles as uploadMutasiBASTFiles,
  getLemariByLokasi as getMutasiLemariByLokasi,
  getKodeLemari as getMutasiKodeLemari
} from "../controllers/WJS/MutasiController.js";

import {
  list as listPengaduan,
  getById as getPengaduanById,
  create as createPengaduan,
  approveAtasan as approveAtasanPengaduan,
  rejectAtasan as rejectAtasanPengaduan,
  revise as revisePengaduan,
  approveLegalSH as approveLegalSHPengaduan,
  rejectLegalSH as rejectLegalSHPengaduan,
  approveLegalDH as approveLegalDHPengaduan,
  rejectLegalDH as rejectLegalDHPengaduan,
  selesai as selesaiPengaduan,
  getDocumentDetail as getPengaduanDocDetail,
  getDocumentList as getPengaduanDocList,
  uploadPengaduanFile,
  riwayat as riwayatPengaduan,
  logTiket as logTiketPengaduan,
  validateToken as validatePengaduanToken,
  exportRiwayatExcel as exportRiwayatPengaduanExcel,
  exportRiwayatPdf as exportRiwayatPengaduanPdf
} from "../controllers/WJS/PengaduanController.js";
import {
  getLogByTicketNumber,
  exportLogToExcel
} from "../controllers/WJS/LogTiketController.js";
import {
  getRekapArsip,
  getRekapArsipBulan,
  getRekapArsipDbc,
  getRekapArsipPertahun,
  getRekapPerbandingan,
  getDivisi as getRekapDivisi,
  getKategori as getRekapKategori,
} from "../controllers/WJS/RekapitulasiController.js";
import {
  getFolderTree, createFolder, renameFolder, deleteFolder,
  getFilesByFolder, getDocumentById, uploadDocument, updateDocument, renewDocument, deleteDocument, restoreDocument,
  validateApprovalToken, approveByAtasan, approveByArsiparis, submitRevisi,
  checkDocNumber,
  confirmKeeper, rejectKeeper,
  getFolderPermissions, addFolderPermission, updateFolderPermission, deleteFolderPermission,
  getFilePermissions, addFilePermission, updateFilePermission, deleteFilePermission,
  saveDownloadLog, checkDownloadLog, saveDownloadLogPinjam,
  searchDocuments, getDMSReport, updateDMSTarget, getRenewableReport,
  getSubKategori, getArsiparisLokasi, getLemariByLokasi, getContentDet, saveFilePendukung,
  getReportCompliance, updateReportComplianceTarget,
  getDeletedDocuments, getDeletedFolders, restoreFolder, getDocumentLog,
  getReportRenewableFull, exportRenewableExcel, exportRenewablePdf, exportRenewableCsv,
  getNoArsip, getDocumentRecap,
} from "../controllers/WJS/DocumentController.js";
import {
  listPengembalian,
  getPengembalianByTiket,
  getLogTiketPengembalian,
  submitPengembalian,
  approvePengembalian,
  tolakPengembalian,
  submitPerpanjangan,
  approveAtasanUser,
  tolakAtasanUser,
  approveLegal,
  tolakLegal,
  approveAtasanLegal,
  tolakAtasanLegal,
  revisiAtasanLegal,
  getLaporanPeminjaman,
} from "../controllers/WJS/PengembalianPerpanjangan.js";

// class definition

//end class definition

//route definition
const router = express.Router();

const maxSizeImage = 1 * 1024 * 1024 ;
const maxSizeDocument = 2 * 1024 * 1024 ;
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "file");
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    if (file) {
      let ext = file.originalname.split(".");
      cb(null, uniqueSuffix + "." + ext[ext.length - 1]);
    } else {
      let ext = file.originalname.split(".");
      cb(null, null);
    }
  },
});

const fileFilter = (req, file, cb) => {
  if (file.fieldname === "fimage") { // if uploading fimage
    if (
      file.mimetype === 'image/png' ||
      file.mimetype === 'image/jpg' ||
      file.mimetype === 'image/jpeg'
    ) { // check file type to be png, jpeg, or jpg
        cb(null, true);
    }
  } else { // else uploading fdokumen
      cb(null, true);
  }
}

const upload = multer({ 
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB limit 
});

//Master1
router.get('/listPerjanjian', listPerjanjian);
router.post('/savePerjanjian', savePerjanjian);
router.post('/deletePerjanjian', deletePerjanjian);

router.get('/listWorkLocation', listWorkLocation);
router.get('/listVwWorkLocation', listVwWorkLocation);
router.post('/saveWorkLocation', saveWorkLocation);
router.post('/deleteWork', deleteWork);

router.get('/listDocKategori', listDocKategori);
router.post('/saveDocKategori', saveDocKategori);
router.post('/deleteDocKategori', deleteDocKategori);

router.get('/listLokasiArsip', listLokasiArsip);
router.post('/saveLokasiArsip', saveLokasiArsip);

router.get('/listArsipLokasi', listArsipLokasi);
router.post('/saveArsipLokasi', saveArsipLokasi);

router.get('/listLemariArsip', listLemariArsip);
router.post('/saveLemariArsip', saveLemariArsip);

router.get('/listMappingBisnisUnit', listMappingBisnisUnit);
router.post('/saveMappingBisnisUnit', saveMappingBisnisUnit);

router.get('/listSubKategoriDokumen', listSubKategoriDokumen);
router.post('/saveSubKategoriDokumen', saveSubKategoriDokumen);

router.get('/listKonterTrans', listKonterTrans);
router.post('/saveKonterTrans', saveKonterTrans);

router.get('/listJenisApproval', listJenisApproval);
router.post('/saveJenisApproval', saveJenisApproval);

router.get('/listKonterTransBU', listKonterTransBU);
router.post('/saveKonterTransBU', saveKonterTransBU);

router.get('/listPermintaan', listPermintaan);

// Peminjaman routes
router.get('/listPeminjaman', listPeminjaman);
router.get('/getDocumentByName', getDocumentByName);
router.post('/addPermintaanDokumen', addPermintaanDokumen);
router.post('/approvePermintaan', approvePermintaan);
router.post('/deletePermintaan', deletePermintaan);
router.get('/getLogTiket', getLogTiket);
router.get('/getBU', getBU);
router.get('/checkUserPeminjaman', checkUserPeminjaman);
router.get('/getEmployeeById', getEmployeeById);
router.get('/getMasterApproval', getMasterApproval);
router.get('/exportPeminjamanExcel', exportPeminjamanExcel);
router.get('/getLokasiArsipByBU', getLokasiArsipByBU);
router.get('/getUserData', getUserData);
router.get('/getDocumentData', getDocumentData);
router.post('/validateFileUpload', validateFileUpload);
router.get('/checkUserEligibility', checkUserEligibility);
router.get('/getEmployeeSupervisor', getEmployeeSupervisor);

// Approval Direct routes
router.get('/peminjaman/validate-token', validatePeminjamanToken); // Public - no auth required
router.get('/getApprovalDirect/:token', getApprovalDirect);
router.post('/processApprovalDirect', processApprovalDirect);

router.get('/listTypeApproval', listTypeApproval);
router.post('/saveTypeApproval', saveTypeApproval);

// Master Approval routes
router.get('/approvals/:id', getApprovalById);
router.get('/approvals', listApprovals);
router.post('/approvals', createApproval);
router.put('/approvals/:id', updateApproval);
router.delete('/approvals/:id', deleteApproval);

// Alias for PHP compatibility (viewapproval endpoint)
router.get('/master-approval', listApprovals);

// Pemusnahan routes
router.get('/pemusnahan/validate-token', validatePemusnahanToken); // Public - no auth required
router.get('/pemusnahan/export', exportPemusnahanToExcel);
router.get('/pemusnahan/template', downloadTemplate);
router.get('/pemusnahan/archives', getArchives);
router.get('/pemusnahan/download-bast/:filename', downloadPemusnahanBASTpdf);
router.get('/pemusnahan/:id/generate-bast-pdf', generatePemusnahanBASTpdf);
router.get('/pemusnahan/:id/bast', generateBAST);
router.get('/pemusnahan/:id', getPemusnahanById);
router.get('/pemusnahan', listPemusnahan);
router.post('/pemusnahan/upload-details', upload.single('file'), uploadDetails);
router.post('/pemusnahan/validate-archive', validateArchive);
router.post('/pemusnahan', createPemusnahan);
router.post('/pemusnahan/:id/approve', approvePemusnahan);
router.post('/pemusnahan/:id/reject', rejectPemusnahan);
router.post('/pemusnahan/:id/revisi-approval', revisiApprovalPemusnahan);
router.put('/pemusnahan/:id/revise', revisePemusnahanTicket);
router.post('/pemusnahan/:id/execute', executePemusnahanDelete);
router.put('/pemusnahan/:id/execute-bast', executeDeleteWithBAST);
router.post('/pemusnahan/:id/submit-arsiparis', upload.fields([{name:'upload1',maxCount:1},{name:'upload2',maxCount:1},{name:'upload3',maxCount:1},{name:'upload4',maxCount:1}]), submitArsiparis);

// Employee lookup route
router.get('/employee/:nik', getEmployeeByNik);

// Arsiparis routes
router.get('/arsiparis', getArsiparis);
router.get('/arsiparis-atasan', getArsiparisAtasan);

// Mutasi routes
router.get('/mutasi/validate-token', validateMutasiToken); // Public - no auth required
router.get('/mutasi/export', exportMutasiToExcel);
router.get('/mutasi/template', downloadMutasiTemplate);
router.get('/mutasi/archives', getMutasiArchives);
router.get('/mutasi/arsiparis', getMutasiArsiparis);
router.get('/mutasi/arsiparis-atasan', getMutasiArsiparisAtasan);
router.get('/mutasi/lemari-by-lokasi', getMutasiLemariByLokasi);
router.get('/mutasi/kode-lemari', getMutasiKodeLemari);
router.get('/mutasi/download-bast/:filename', downloadMutasiBASTpdf);
router.get('/mutasi/:id/generate-bast-pdf', generateMutasiBASTpdf);
router.get('/mutasi/:id/bast', generateMutasiBAST);
router.get('/mutasi/:id', getMutasiById);
router.get('/mutasi', listMutasi);
router.post('/mutasi/upload-details', upload.single('file'), uploadMutasiDetails);
router.post('/mutasi/validate-archive', validateMutasiArchive);
router.post('/mutasi', createMutasi);
router.post('/mutasi/:id/approve', approveMutasi);
router.post('/mutasi/:id/reject', rejectMutasi);
router.post('/mutasi/:id/revisi-approval', revisiApprovalMutasi);
router.put('/mutasi/:id/revise', reviseMutasiTicket);
router.post('/mutasi/:id/execute', upload.fields([{name:'upload1',maxCount:1},{name:'upload2',maxCount:1},{name:'upload3',maxCount:1},{name:'upload4',maxCount:1}]), executeMutasi);
router.post('/mutasi/:id/upload-bast', upload.array('files', 4), uploadMutasiBASTFiles);

// Pengaduan routes
router.get('/pengaduan/validate-token', validatePengaduanToken); // Public - no auth required
router.get('/pengaduan/doc-list', getPengaduanDocList);
router.get('/pengaduan/doc-detail', getPengaduanDocDetail);
router.get('/pengaduan/riwayat', riwayatPengaduan);
router.get('/pengaduan/riwayat/export-excel', exportRiwayatPengaduanExcel);
router.get('/pengaduan/riwayat/export-pdf', exportRiwayatPengaduanPdf);
router.get('/pengaduan/log-tiket', logTiketPengaduan);
router.get('/pengaduan/:id', getPengaduanById);
router.get('/pengaduan', listPengaduan);
router.post('/pengaduan/upload', upload.single('filedoc'), uploadPengaduanFile);
router.post('/pengaduan', createPengaduan);
router.post('/pengaduan/:id/approve-atasan', approveAtasanPengaduan);
router.post('/pengaduan/:id/reject-atasan', rejectAtasanPengaduan);
router.put('/pengaduan/:id/revise', revisePengaduan);
router.post('/pengaduan/:id/approve-legal-sh', approveLegalSHPengaduan);
router.post('/pengaduan/:id/reject-legal-sh', rejectLegalSHPengaduan);
router.post('/pengaduan/:id/approve-legal-dh', approveLegalDHPengaduan);
router.post('/pengaduan/:id/reject-legal-dh', rejectLegalDHPengaduan);
router.post('/pengaduan/:id/selesai', upload.single('filelampiran'), selesaiPengaduan);

// Log Tiket Pemusnahan & Mutasi (Public - No Auth Required)
router.get('/log-tiket-pemusnahan-mutasi', getLogByTicketNumber);
router.get('/log-tiket-pemusnahan-mutasi/export', exportLogToExcel);

// Rekapitulasi routes
router.get('/rekapitulasi/rekap-arsip', getRekapArsip);
router.get('/rekapitulasi/rekap-arsip-bulan', getRekapArsipBulan);
router.get('/rekapitulasi/rekap-arsip-dbc', getRekapArsipDbc);
router.get('/rekapitulasi/rekap-arsip-pertahun', getRekapArsipPertahun);
router.get('/rekapitulasi/perbandingan', getRekapPerbandingan);
router.get('/rekapitulasi/divisi', getRekapDivisi);
router.get('/rekapitulasi/kategori', getRekapKategori);

// Pengembalian & Perpanjangan routes
router.get('/pengembalian-perpanjangan/laporan', getLaporanPeminjaman);
router.get('/pengembalian-perpanjangan/log', getLogTiketPengembalian);
router.get('/pengembalian-perpanjangan/detail', getPengembalianByTiket);
router.get('/pengembalian-perpanjangan', listPengembalian);
router.post('/pengembalian-perpanjangan/pengembalian', upload.fields([
  { name: 'kembali_upload_file1', maxCount: 1 },
  { name: 'kembali_upload_file2', maxCount: 1 },
  { name: 'kembali_upload_file3', maxCount: 1 },
  { name: 'kembali_upload_file4', maxCount: 1 },
]), submitPengembalian);
router.post('/pengembalian-perpanjangan/pengembalian/approve', upload.fields([
  { name: 'kembali_upload_file5', maxCount: 1 },
]), approvePengembalian);
router.post('/pengembalian-perpanjangan/pengembalian/tolak', tolakPengembalian);
router.post('/pengembalian-perpanjangan/perpanjangan', upload.fields([
  { name: 'perpanjang_upload_file1', maxCount: 1 },
]), submitPerpanjangan);
router.post('/pengembalian-perpanjangan/perpanjangan/atasan-user/approve', approveAtasanUser);
router.post('/pengembalian-perpanjangan/perpanjangan/atasan-user/tolak', tolakAtasanUser);
router.post('/pengembalian-perpanjangan/perpanjangan/legal/approve', approveLegal);
router.post('/pengembalian-perpanjangan/perpanjangan/legal/tolak', tolakLegal);
router.post('/pengembalian-perpanjangan/perpanjangan/atasan-legal/approve', approveAtasanLegal);
router.post('/pengembalian-perpanjangan/perpanjangan/atasan-legal/tolak', tolakAtasanLegal);
router.post('/pengembalian-perpanjangan/perpanjangan/atasan-legal/revisi', revisiAtasanLegal);

// Document routes
router.get('/document/folders', getFolderTree);
router.post('/document/folders', createFolder);
router.post('/document/folders/rename', renameFolder);
router.post('/document/folders/delete', deleteFolder);
router.get('/document/folders/:id/permissions', getFolderPermissions);
router.post('/document/folders/:id/permissions', addFolderPermission);
router.put('/document/folders/permissions/:permId', updateFolderPermission);
router.delete('/document/folders/permissions/:permId', deleteFolderPermission);
router.get('/document/files', getFilesByFolder);
router.get('/document/files/:id', getDocumentById);
router.post('/document/files', upload.fields([{ name: 'filedoc', maxCount: 1 }, { name: 'kelengkapan_doc', maxCount: 10 }]), uploadDocument);
router.post('/document/files/:id/update', upload.single('filedoc'), updateDocument);
router.post('/document/files/:id/renew', upload.single('filedoc'), renewDocument);
router.post('/document/files/:id/delete', deleteDocument);
router.post('/document/files/:id/restore', restoreDocument);
router.get('/document/deleted-files', getDeletedDocuments);
router.get('/document/deleted-folders', getDeletedFolders);
router.post('/document/folders/:id/restore', restoreFolder);
router.get('/document/files/:id/log', getDocumentLog);

// Document feedback/update progress
import { getDocumentUpdates, postDocumentUpdate } from "../controllers/WJS/DocumentController.js";
router.get('/document/files/:id/updates', getDocumentUpdates);
router.post('/document/files/:id/updates', upload.single('filedoc'), postDocumentUpdate);
router.get('/document/files/:id/permissions', getFilePermissions);
router.post('/document/files/:id/permissions', addFilePermission);
router.put('/document/files/permissions/:permId', updateFilePermission);
router.delete('/document/files/permissions/:permId', deleteFilePermission);
router.get('/document/approval/validate', validateApprovalToken);
router.post('/document/approval/atasan', approveByAtasan);
router.post('/document/approval/arsiparis', approveByArsiparis);
router.post('/document/approval/revisi', upload.single('filedoc'), submitRevisi);
router.post('/document/keeper/confirm', confirmKeeper);
router.post('/document/keeper/reject', rejectKeeper);
router.post('/document/download-log', saveDownloadLog);
router.get('/document/download-log/check', checkDownloadLog);
router.post('/document/download-log/pinjam', saveDownloadLogPinjam);
router.get('/document/search', searchDocuments);
router.get('/document/report', getDMSReport);
router.post('/document/report/target', updateDMSTarget);
router.get('/document/report/renewable', getRenewableReport);
router.get('/document/report-renewable', getReportRenewableFull);
router.get('/document/report-renewable/export-excel', exportRenewableExcel);
router.get('/document/report-renewable/export-csv', exportRenewableCsv);
router.get('/document/report-renewable/export-pdf', exportRenewablePdf);
router.get('/document/report-compliance', getReportCompliance);
router.post('/document/report-compliance/target', updateReportComplianceTarget);
router.get('/document/sub-kategori', getSubKategori);
router.get('/document/check-doc', checkDocNumber);
router.get('/document/arsiparis-lokasi', getArsiparisLokasi);
router.get('/document/no-arsip', getNoArsip);
router.get('/document/recap', getDocumentRecap);
router.get('/document/lemari-lokasi', getLemariByLokasi);
router.get('/document/content-det', getContentDet);
router.post('/document/content-det', upload.single('plkp_file_pendukung'), saveFilePendukung);

export default router;

//end route defition

