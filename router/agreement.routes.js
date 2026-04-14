import express from "express";
import { cekToken } from "../middleware/verifyToken.js";
import * as AgreementController from "../controllers/WJS/AgreementController.js";

const router = express.Router();

// Apply authentication middleware to protected routes
router.use(cekToken);

// Agreement Types (Protected)
router.get('/types', AgreementController.listAgreementTypes);
router.post('/types', AgreementController.createAgreementType);
router.put('/types/:id', AgreementController.updateAgreementType);
router.delete('/types/:id', AgreementController.deleteAgreementType);

// Document Number Request (Protected)
router.post('/preview', AgreementController.previewDocumentNumber);
router.post('/request', AgreementController.requestDocumentNumber);

// Validation (Protected)
router.get('/validate-spk/:spk', AgreementController.validateSPK);
router.get('/validate-user/:nik', AgreementController.validateUser);

// Approval (Public - token-based, no authentication)
// These routes are excluded from cekToken middleware via throw_mstr table
router.get('/approve/:token', AgreementController.getApprovalDetails);
router.post('/approve', AgreementController.approveDocumentNumber);

export default router;

