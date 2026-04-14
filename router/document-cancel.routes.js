import express from 'express';
import { cancelDocument } from '../controllers/WJS/DocumentCancelController.js';
import { cekToken } from '../middleware/verifyToken.js';

const router = express.Router();

// Apply authentication middleware
router.use(cekToken);

// Cancel document
router.post('/cancel', cancelDocument);

export default router;

