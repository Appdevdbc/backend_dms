import express from "express";
import multer from "multer";
import {
  listAdjustment,
  listAdjustmentBySPK,
  getAdjustment,
  storeAdjustment,
} from "../controllers/WJS/MachiningProsesController.js";
import {
  getList as getOrderPartList,
  getJobTypes,
  store as storeOrderPart,
} from "../controllers/WJS/OrderPartController.js";
import {
  getDashboardPerformance,
  getSpkMonitor,
} from "../controllers/WJS/DashboardController.js";
import {
  getLogByTicketNumber,
  exportLogToExcel
} from "../controllers/WJS/LogTiketController.js";
import {
  listTerimaSPK,
  createTerimaSPK,
  getTerimaSPK,
  updateTerimaSPK,
  deleteTerimaSPK,
  prosesStore,
  prosesStore2,
  getDuedate,
  updateDuedate,
  listMachining,
  createMachining,
  updateMachining,
  deleteMachining,
  getTemplateMachining,
  listMasterMachining,
  listProsesSPK,
  updateTarget,
  getDetailStatus,
  listCloseSPK,
  reopenSPK,
  cetakSPK,
} from "../controllers/WJS/TerimaSPKController.js";

// Route definition
const router = express.Router();

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
  if (file.fieldname === "fimage") {
    if (
      file.mimetype === 'image/png' ||
      file.mimetype === 'image/jpg' ||
      file.mimetype === 'image/jpeg'
    ) {
        cb(null, true);
    }
  } else {
      cb(null, true);
  }
}

const upload = multer({ 
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB limit 
});

// ─── Adjustment (MachiningProses) routes ─────────────────────────────────────
router.get('/adjustment/list', listAdjustment);
router.get('/adjusment/list/:spk/:pic', listAdjustmentBySPK); // PHP compatibility route
router.get('/adjustment/by-spk', listAdjustmentBySPK); // Alternative query param route
router.get('/adjustment/detail', getAdjustment);
router.post('/adjustment/store', storeAdjustment);

// ─── OrderPart routes ─────────────────────────────────────────────────────────
router.get('/orderPart/list', getOrderPartList);
router.get('/orderPart/job-types', getJobTypes);
router.post('/orderPart/store', storeOrderPart);

// ─── Dashboard routes ─────────────────────────────────────────────────────────
router.get('/dashboard/performance', getDashboardPerformance);
router.get('/dashboard/spk-monitor', getSpkMonitor);

// ─── TerimaSPK routes ─────────────────────────────────────────────────────────
// List & CRUD
router.get('/terimaSPK/list', listTerimaSPK);
router.get('/terimaSPK/:id', getTerimaSPK);
router.post('/terimaSPK/create', createTerimaSPK);
router.put('/terimaSPK/update/:id', updateTerimaSPK);
router.post('/terimaSPK/delete', deleteTerimaSPK);

// Status
router.post('/terimaSPK/prosesStore', prosesStore);
router.post('/terimaSPK/prosesStore2', prosesStore2);

// Due Date
router.get('/terimaSPK/duedate/:id', getDuedate);
router.put('/terimaSPK/duedate/:id', updateDuedate);

// Machining
router.get('/terimaSPK/machining/master', listMasterMachining);
router.get('/terimaSPK/machining/template', getTemplateMachining);
router.get('/terimaSPK/machining/list', listMachining);
router.post('/terimaSPK/machining/create', createMachining);
router.put('/terimaSPK/machining/update/:id', updateMachining);
router.post('/terimaSPK/machining/delete', deleteMachining);

// Proses
router.get('/terimaSPK/proses/list', listProsesSPK);
router.put('/terimaSPK/proses/target', updateTarget);
router.get('/terimaSPK/proses/detail-status', getDetailStatus);

// Close
router.get('/terimaSPK/close/list', listCloseSPK);
router.post('/terimaSPK/close/reopen', reopenSPK);

// Cetak
router.get('/terimaSPK/cetak/:id', cetakSPK);

// Log Tiket (Public - No Auth Required)
router.get('/log-tiket', getLogByTicketNumber);
router.get('/log-tiket/export', exportLogToExcel);

export default router;
