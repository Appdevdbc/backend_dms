import { appendFileSync, existsSync, readdirSync, unlinkSync, createReadStream, createWriteStream, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { createGzip } from 'zlib';
import dayjs from 'dayjs';

const cleanupOldLogs = (logsDir) => {
  try {
    const files = readdirSync(logsDir).filter(f => f.endsWith('.gz'));
    const cutoffDate = dayjs().subtract(30, 'days').format('YYYY-MM-DD');
    
    files.forEach(file => {
      const dateMatch = file.match(/error-(\d{4}-\d{2}-\d{2})\.log\.gz/);
      if (dateMatch && dateMatch[1] < cutoffDate) {
        unlinkSync(join(logsDir, file));
      }
    });
  } catch (error) {
    console.error('Failed to cleanup old logs:', error);
  }
};

const zipPreviousLog = (logPath, date) => {
  try {
    const gzipPath = logPath.replace('.log', `-${date}.log.gz`);
    const readStream = createReadStream(logPath);
    const writeStream = createWriteStream(gzipPath);
    const gzip = createGzip();
    
    readStream.pipe(gzip).pipe(writeStream);
    writeStream.on('finish', () => unlinkSync(logPath));
  } catch (error) {
    console.error('Failed to zip log file:', error);
  }
};

export const logger = (error, route, params = {}) => {
  const today = dayjs().format('YYYY-MM-DD');
  const timestamp = dayjs().format('YYYY-MM-DD HH:mm:ss');
  const logEntry = `[${timestamp}] Route: ${route} | Error: ${error.message || error} | Params: ${JSON.stringify(params)}\n`;
  
  try {
    const logsDir = join(process.cwd(), 'logs');
    const logPath = join(logsDir, 'error.log');
    const lastLogPath = join(logsDir, 'last-log-date.txt');
    
    let lastLogDate = '';
    if (existsSync(lastLogPath)) {
      lastLogDate = readFileSync(lastLogPath, 'utf8').trim();
    }
    
    if (lastLogDate && lastLogDate !== today && existsSync(logPath)) {
      zipPreviousLog(logPath, lastLogDate);
      cleanupOldLogs(logsDir);
    }
    
    appendFileSync(logPath, logEntry);
    writeFileSync(lastLogPath, today);
  } catch (writeError) {
    console.error('Failed to write to log file:', writeError);
  }
};