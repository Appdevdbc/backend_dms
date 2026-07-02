import { Client } from 'basic-ftp';
import fs from 'fs';
import * as dotenv from 'dotenv';
import { logger } from './logger.js';
dotenv.config();

/**
 * Upload file to FTP server
 * @param {string} localFilePath - Path to local file
 * @param {string} remoteFilePath - Path on FTP server
 * @returns {Promise<boolean>}
 */
export const uploadToFTP = async (localFilePath, remoteFilePath) => {
  const client = new Client();
  client.ftp.verbose = process.env.FTP_DEBUG === 'true';

  try {
    // Connect to FTP server
    await client.access({
      host: process.env.FTP_HOST,
      port: parseInt(process.env.FTP_PORT) || 21,
      user: process.env.FTP_USER,
      password: process.env.FTP_PASS,
      secure: false, // Set to true for FTPS
    });

    // Upload file
    await client.uploadFrom(localFilePath, remoteFilePath);

    console.log('localFilePath : ' + localFilePath);
    console.log('remoteFilePath : ' + remoteFilePath);
    
    logger({ message: 'File uploaded successfully', localPath: localFilePath, remotePath: remoteFilePath }, 'FTP Upload', {});
    return true;
  } catch (error) {
    logger(error, 'FTP Upload Error', { localPath: localFilePath, remotePath: remoteFilePath });
    throw error;
  } finally {
    client.close();
  }
};

/**
 * Download file from FTP server
 * @param {string} remoteFilePath - Path on FTP server
 * @param {string} localFilePath - Path to save local file
 * @returns {Promise<boolean>}
 */
export const downloadFromFTP = async (remoteFilePath, localFilePath) => {
  const client = new Client();
  client.ftp.verbose = process.env.FTP_DEBUG === 'true';

  try {
    // Connect to FTP server
    await client.access({
      host: process.env.FTP_HOST,
      port: parseInt(process.env.FTP_PORT) || 21,
      user: process.env.FTP_USER,
      password: process.env.FTP_PASSWORD,
      secure: false,
    });

    // Download file
    await client.downloadTo(localFilePath, remoteFilePath);
    
    logger({ message: 'File downloaded successfully', remotePath: remoteFilePath, localPath: localFilePath }, 'FTP Download', {});
    return true;
  } catch (error) {
    logger(error, 'FTP Download Error', { remotePath: remoteFilePath, localPath: localFilePath });
    throw error;
  } finally {
    client.close();
  }
};

/**
 * Check if file exists on FTP server
 * @param {string} remoteFilePath - Path on FTP server
 * @returns {Promise<boolean>}
 */
export const ftpFileExists = async (remoteFilePath) => {
  const client = new Client();
  client.ftp.verbose = false;

  try {
    await client.access({
      host: process.env.FTP_HOST,
      port: parseInt(process.env.FTP_PORT) || 21,
      user: process.env.FTP_USER,
      password: process.env.FTP_PASSWORD,
      secure: false,
    });

    const size = await client.size(remoteFilePath);
    return size >= 0;
  } catch (error) {
    return false;
  } finally {
    client.close();
  }
};

/**
 * Delete file from FTP server
 * @param {string} remoteFilePath - Path on FTP server
 * @returns {Promise<boolean>}
 */
export const deleteFromFTP = async (remoteFilePath) => {
  const client = new Client();
  client.ftp.verbose = process.env.FTP_DEBUG === 'true';

  try {
    await client.access({
      host: process.env.FTP_HOST,
      port: parseInt(process.env.FTP_PORT) || 21,
      user: process.env.FTP_USER,
      password: process.env.FTP_PASSWORD,
      secure: false,
    });

    await client.remove(remoteFilePath);
    
    logger({ message: 'File deleted successfully', remotePath: remoteFilePath }, 'FTP Delete', {});
    return true;
  } catch (error) {
    logger(error, 'FTP Delete Error', { remotePath: remoteFilePath });
    throw error;
  } finally {
    client.close();
  }
};

/**
 * Create directory on FTP server
 * @param {string} remoteDirPath - Directory path on FTP server
 * @returns {Promise<boolean>}
 */
export const createFTPDirectory = async (remoteDirPath) => {
  const client = new Client();
  client.ftp.verbose = process.env.FTP_DEBUG === 'true';

  try {
    await client.access({
      host: process.env.FTP_HOST,
      port: parseInt(process.env.FTP_PORT) || 21,
      user: process.env.FTP_USER,
      password: process.env.FTP_PASSWORD,
      secure: false,
    });

    await client.ensureDir(remoteDirPath);
    
    logger({ message: 'Directory created successfully', remotePath: remoteDirPath }, 'FTP Directory', {});
    return true;
  } catch (error) {
    logger(error, 'FTP Create Directory Error', { remotePath: remoteDirPath });
    throw error;
  } finally {
    client.close();
  }
};
