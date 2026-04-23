import express from "express";
import { getRoles, syncUsers, validateApiKey } from "../controllers/sync/PortalSyncController.js";

const router = express.Router();

router.get("/roles",      validateApiKey("API_KEY_ROLE"), getRoles);
router.post("/sync-users", validateApiKey("API_KEY_SYNC"), syncUsers);

export default router;
