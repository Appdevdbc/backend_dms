import express from "express";
import { listLogFiles, getLogContent } from "../controllers/master/logController.js";

const router = express.Router();

router.get("/files", listLogFiles);
router.get("/content", getLogContent);

export default router;