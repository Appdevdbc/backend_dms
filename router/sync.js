import express from "express";
import { getRoles, getBUs, syncUsers, validateRoleKey, validateSyncKey } from "../controllers/sync/PortalSyncController.js";

const router = express.Router();

router.get("/roles",      validateRoleKey, getRoles);
router.get("/bus",        validateRoleKey, getBUs);
router.post("/sync-users", validateSyncKey, syncUsers);

export default router;
