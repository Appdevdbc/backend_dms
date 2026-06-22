import * as ftp from 'basic-ftp';
import path from 'path';
import fs from 'fs';
import { logger } from './logger.js';

/**
 * Upload file to FTP server
 * @param {Object} file - Multer file object
 * @returns {String|null} - Generated filename or null if failed
 */
export const uploadFileToFTP = async (file) => {
  const client = new ftp.Client();
  client.ftp.verbose = process.env.FTP_VERBOSE === 'true';
  
  try {
    // Connect to FTP
    await client.access({
      host: process.env.FTP_HOST,
      user: process.env.FTP_USER,
      password: process.env.FTP_PASS,
      secure: false
    });
    
    // Generate unique filename
    const ext = path.extname(file.originalname);
    const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
    const random = Math.floor(Math.random() * 900) + 100;
    const fileName = `FILE${timestamp}${random}${ext}`;
    
    // Set FTP directory
    const ftpDir = process.env.FTP_UPLOAD_DIR || '/uploads';
    await client.ensureDir(ftpDir);
    
    // Upload file
    const remotePath = `${ftpDir}/${fileName}`;
    await client.uploadFrom(file.path, remotePath);
    
    // Delete temporary file
    if (fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
    }
    
    return fileName;
    
  } catch (error) {
    logger(error, 'FTP Upload Error', { file: file.originalname });
    
    // Clean up temporary file on error
    if (file.path && fs.existsSync(file.path)) {
      try {
        fs.unlinkSync(file.path);
      } catch (unlinkError) {
        logger(unlinkError, 'Failed to delete temp file', { path: file.path });
      }
    }
    
    return null;
  } finally {
    client.close();
  }
};

/**
 * Delete file from FTP server
 * @param {String} fileName - Name of file to delete
 * @returns {Boolean} - Success status
 */
export const deleteFileFromFTP = async (fileName) => {
  const client = new ftp.Client();
  client.ftp.verbose = process.env.FTP_VERBOSE === 'true';
  
  try {
    // Connect to FTP
    await client.access({
      host: process.env.FTP_HOST,
      user: process.env.FTP_USER,
      password: process.env.FTP_PASS,
      secure: false
    });
    
    // Delete file
    const ftpDir = process.env.FTP_UPLOAD_DIR || '/uploads';
    const remotePath = `${ftpDir}/${fileName}`;
    await client.remove(remotePath);
    
    return true;
    
  } catch (error) {
    logger(error, 'FTP Delete Error', { fileName });
    return false;
  } finally {
    client.close();
  }
};

/**
 * Check if file exists on FTP
 * @param {String} fileName
 * @returns {Boolean}
 */
export const fileExistsOnFTP = async (fileName) => {
  const client = new ftp.Client();
  client.ftp.verbose = false;
  
  try {
    await client.access({
      host: process.env.FTP_HOST,
      user: process.env.FTP_USER,
      password: process.env.FTP_PASS,
      secure: false
    });
    
    const ftpDir = process.env.FTP_UPLOAD_DIR || '/uploads';
    const files = await client.list(ftpDir);
    
    return files.some(file => file.name === fileName);
    
  } catch (error) {
    logger(error, 'FTP File Check Error', { fileName });
    return false;
  } finally {
    client.close();
  }
};

/**
 * Get file download URL
 * @param {String} fileName
 * @returns {String}
 */
export const getFileDownloadURL = (fileName) => {
  const baseURL = process.env.FTP_DOWNLOAD_URL || 'http://legal.dbc.co.id/uploads';
  return `${baseURL}/${fileName}`;
};
