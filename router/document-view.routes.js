import express from 'express';
import { listDocuments } from '../controllers/WJS/DocumentViewController.js';
import { cekToken } from '../middleware/verifyToken.js';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(cekToken);

// Document view routes
router.get('/list', listDocuments);

export default router;

