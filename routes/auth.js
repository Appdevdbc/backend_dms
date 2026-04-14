import express from 'express';
import * as AuthController from '../controllers/auth/AuthController.js';
import { cekToken } from '../middleware/verifyToken.js';

const router = express.Router();

// Public routes
router.post('/login', AuthController.login);

// Protected routes (use existing cekToken middleware)
router.get('/verify', cekToken, AuthController.verify);
router.post('/logout', cekToken, AuthController.logout);
router.get('/me', cekToken, AuthController.getCurrentUser);
router.post('/refresh', cekToken, AuthController.refreshToken);

export default router;
