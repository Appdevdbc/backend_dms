import { readdirSync, readFileSync, existsSync, statSync } from 'fs';
import { join } from 'path';
import { gunzipSync } from 'zlib';
import dayjs from 'dayjs';
import { getErrorResponse } from '../../helpers/utils.js';
import { logger } from '../../helpers/logger.js';

export const listLogFiles = async (req, res) => {
  // #swagger.tags = ['Logs']
  /* #swagger.security = [{
          "bearerAuth": []
  }] */
  // #swagger.description = 'Get list of available log files'
  try {
    const logsDir = join(process.cwd(), 'logs');
    if (!existsSync(logsDir)) {
      return res.status(200).json([]);
    }

    const files = readdirSync(logsDir)
      .filter(file => file.endsWith('.log') || file.endsWith('.gz'))
      .map(file => ({
        name: file,
        date: file.includes('error-') ? file.match(/error-(\d{4}-\d{2}-\d{2})/)?.[1] : 'current',
        size: statSync(join(logsDir, file)).size
      }))
      .sort((a, b) => b.date.localeCompare(a.date));

    res.status(200).json(files);
  } catch (error) {
    console.log(error)
    logger(error, 'GET /listLogFiles', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};

export const getLogContent = async (req, res) => {
  // #swagger.tags = ['Logs']
  /* #swagger.security = [{
          "bearerAuth": []
  }] */
  // #swagger.description = 'Get content of a specific log file with optional line range (from-to) or recent lines count'
  try {
    const { filename, lines = 100, from, to } = req.query;
    
    if (!filename) {
      return res.status(400).json({ type: 'error', message: 'Filename parameter is required' });
    }
    
    const logsDir = join(process.cwd(), 'logs');
    const filePath = join(logsDir, filename);

    if (!existsSync(filePath) || !filename.match(/^error(-\d{4}-\d{2}-\d{2})?\.log(\.gz)?$/)) {
      return res.status(404).json({ type: 'error', message: 'Log file not found' });
    }

    let content;
    if (filename.endsWith('.gz')) {
      const compressed = readFileSync(filePath);
      content = gunzipSync(compressed).toString();
    } else {
      content = readFileSync(filePath, 'utf8');
    }

    const logLines = content.split('\n').filter(line => line.trim());
    let selectedLines;
    
    if (from !== undefined && to !== undefined) {
      const startIdx = Math.max(0, parseInt(from) - 1);
      const endIdx = Math.min(logLines.length, parseInt(to));
      selectedLines = logLines.slice(startIdx, endIdx).reverse();
    } else {
      selectedLines = logLines.slice(-parseInt(lines)).reverse();
    }

    res.status(200).json({
      filename,
      totalLines: logLines.length,
      from: from ? parseInt(from) : logLines.length - parseInt(lines) + 1,
      to: to ? parseInt(to) : logLines.length,
      lines: selectedLines
    });
  } catch (error) {
    console.log(error)
    logger(error, 'GET /getLogContent', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};