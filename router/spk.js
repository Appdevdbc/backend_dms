import express from "express";
import { listSPKProses, getSPKDetailStatus, closeSPK, editTargetSelesai } from "../controllers/SPK/prosesController.js";
import { listSPKClose, reopenSPK } from "../controllers/SPK/closeController.js";

const router = express.Router();

// SPK Proses routes
router.get('/listSPKProses', listSPKProses);
router.post('/getSPKDetailStatus', getSPKDetailStatus);
router.post('/closeSPK', closeSPK);
router.post('/editTargetSelesai', editTargetSelesai);

// SPK Close routes
router.get('/listSPKClose', listSPKClose);
router.post('/reopenSPK', reopenSPK);

export default router;
