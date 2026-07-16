import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone.js";
import utc from "dayjs/plugin/utc.js";
import customParseFormat from 'dayjs/plugin/customParseFormat.js';
import { dbHris, db } from "../config/db.js";
import crypto from "crypto";
import soap from "strong-soap";
import * as dotenv from 'dotenv' ;
import nodemailer from "nodemailer";
import numeral from "numeral";
import { fileURLToPath } from 'url';
import fs from 'fs';
import path from 'path'
import axios from "axios";

dotenv.config();
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);

const secretKey = crypto.createHash('sha256').update(process.env.ENCRYPTION_KEY || 'nest0425').digest();


export const getWSA = async (url, name, args) => {
  const soapWsa = soap.soap;
  return new Promise((resolve, reject) => {
    var options = {};
    soapWsa.createClient(url, options, function (err, client) {
      var method = client[name];
      method(args, function (err, result, envelope, soapHeader) {
        // Extract oid_ld_det values from raw XML envelope to preserve precision
        if (result.xxtmpstok?.xxtmpstokRow && envelope) {
          const oidMatches = envelope.match(/<oid_ld_det>([^<]+)<\/oid_ld_det>/g);
          if (oidMatches) {
            const oidValues = oidMatches.map(match => match.replace(/<\/?oid_ld_det>/g, ''));
            result.xxtmpstok.xxtmpstokRow = result.xxtmpstok.xxtmpstokRow.map((item, index) => ({
              ...item,
              oid_ld_det: oidValues[index] || String(item.oid_ld_det)
            }));
          }
        }
        resolve(result);
      });
    });
  });
};

export const formatDateTime = (datetime) => {
  if (!datetime) {
    return null;
  }
  return dayjs(datetime).tz("UTC").format("YYYY-MM-DD HH:mm:ss");
};


export const formatDateTimeCustom = (datetime,format_old,format_new) => {
  if (!datetime) {
    return null;
  }
  return dayjs(datetime,`${format_old}`).format(`${format_new}`);
};

export const formatDate = (datetime) => {
  return dayjs(datetime).tz("UTC").format("YYYY-MM-DD");
};

export const formatBulan = (index) => {
  const bulan = ["Januari", "Februari", "Maret","April","Mei",
  "Juni","Juli","Agustus","September","Oktober","November","Desember"];
  
  return bulan[index-1];
};

export const getEmailSender = async () => {
  return await dbHris("portal.dbo.ptl_apps")
    .join("ptl_mail_sender", "ptl_apps.apps_sender", "ptl_mail_sender.id")
    .select("ms_name","ms_pass","ms_host")
    .where("apps_name", process.env.APP_NAME)
    .first();
};

export const mySimpleCrypt = async (tobe) => {
  
    const secretKey = 'Djabesmen2018';
    //creating hash object 
    var hash = crypto.createHash('sha256');
    //passing the data to be hashed
    let dataKey = hash.update(secretKey, 'utf-8');
    //Creating the hash in the required format
    let basedKey= dataKey.digest('hex');
    let aesKey = basedKey.substring(0,32);
    let aesIv = basedKey.substring(0,16);

    const cipher = crypto.createCipheriv('aes-256-cbc', aesKey, aesIv);
    var encrypted = cipher.update(tobe, 'utf-8', 'base64');
    encrypted += cipher.final('base64');
    encrypted = Buffer.from(encrypted, 'utf-8').toString('base64');
     
    return encrypted;
};

export const encryptString = async (autonumber, idAtasan, domain, modul ) => {
  return btoa(autonumber + "," + idAtasan + "," + domain + "," + modul);
}

export const encodeForUrl = (message) => {
  return message.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

export const decodeFromUrl = (ciphertext) => {
  let restoredCiphertext = ciphertext.replace(/-/g, '+').replace(/_/g, '/');
  const mod4 = restoredCiphertext.length % 4;
  if (mod4 > 0) {
    restoredCiphertext += '===='.slice(mod4);
  }
  return restoredCiphertext;
}

export const encrypt = (message) => {
  // Convert to string and handle null/undefined
  const str = message != null ? String(message) : '';
  if (!str) {
    throw new Error('Invalid message to encrypt');
  }
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', secretKey, iv);
  const encrypted = Buffer.concat([cipher.update(str, 'utf8'), cipher.final()]);
  
  // Add HMAC for authentication
  const hmac = crypto.createHmac('sha256', secretKey);
  hmac.update(Buffer.concat([iv, encrypted]));
  const tag = hmac.digest();
  
  const combined = Buffer.concat([tag, iv, encrypted]);
  return encodeForUrl(combined.toString('base64'));
}

export const decrypt = (ciphertext) => {
  // If ciphertext is already decrypted/plain text (e.g. employee ID, NIK, or numeric ID)
  if (ciphertext && ciphertext.length < 20 && (/^[A-Za-z]+\d+$/.test(ciphertext) || /^\d+$/.test(ciphertext))) {
    return ciphertext;
  }

  try {
    if (!ciphertext || typeof ciphertext !== 'string') {
      throw new Error('Invalid ciphertext');
    }
    
    const combined = Buffer.from(decodeFromUrl(ciphertext), 'base64');
    
    // Try new format first (with HMAC)
    if (combined.length >= 49) {
      try {
        const tag = combined.subarray(0, 32);
        const iv = combined.subarray(32, 48);
        const encrypted = combined.subarray(48);
        
        // Verify HMAC
        const hmac = crypto.createHmac('sha256', secretKey);
        hmac.update(Buffer.concat([iv, encrypted]));
        const expectedTag = hmac.digest();
        
        if (crypto.timingSafeEqual(tag, expectedTag)) {
          const decipher = crypto.createDecipheriv('aes-256-cbc', secretKey, iv);
          const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
          return decrypted.toString('utf8');
        }
      } catch (e) {
        // HMAC failed, try old format
      }
    }
    
    // Try old format (without HMAC) - backward compatibility
    if (combined.length >= 17) {
      try {
        const iv = combined.subarray(0, 16);
        const encrypted = combined.subarray(16);
        const decipher = crypto.createDecipheriv('aes-256-cbc', secretKey, iv);
        const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
        return decrypted.toString('utf8');
      } catch (e) {
        // Old format also failed
        throw new Error('Corrupted or invalid encrypted data');
      }
    }
    
    throw new Error('Invalid ciphertext format');
  } catch (error) {
    console.error('Decryption error:', error.message, 'Input:', ciphertext?.substring(0, 30));
    throw new Error('Failed to decrypt data: ' + error.message);
  }
}

export const getMonthName = (monthNumber) => {
  const monthNames = [
      "January",    
      "February",   
      "March",      
      "April",      
      "May",        
      "June",       
      "July",       
      "August",     
      "September",  
      "October", 
      "November",
      "December" 
  ];

  if (monthNumber < 1 || monthNumber > 12) {
      return "Invalid month number";
  }

  return monthNames[monthNumber - 1];
}

export const roundToTwoDecimalPlaces = (num) => {  
  if(typeof num === 'number'){
    const shiftedNum = num * 100;  
    const integerPart = Math.floor(shiftedNum);    
    const decimalPart = shiftedNum - integerPart;
    
    const thirdDecimalPlace = Math.floor(decimalPart * 10);
    
    if (thirdDecimalPlace > 5) {
        return (integerPart + 1) / 100;
    } else {
        return integerPart / 100;
    }
  } else {
    return num;
  }  
}  

export const getRandomDarkColor=()=> {
  const getRandomValue = () => Math.floor(Math.random() * 128); // Values from 0 to 127
  const r = getRandomValue();
  const g = getRandomValue();
  const b = getRandomValue();
  
  // Convert to hexadecimal and pad with zeroes if necessary
  const toHex = (value) => value.toString(16).padStart(2, '0');
  
  const color = `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  
  return color;
}

export const DMYtoYMD = (value) => {
  if (value){
    const data= value.split('-');
    return `${data[2]}-${data[1]}-${data[0]}`;
  }else {
    return null
  }
};

export const isValidDateDDMMYYY = (dateString) => {
  return dayjs(dateString, 'DD-MM-YYYY', true).isValid();
};
export const setRequest = (value) => {
  return value != null && value != '' ? value:null ;
};

export const isValidDateFormat = (dateString,dateFormat) => {
  return dayjs(dateString, dateFormat, true).isValid();
};

export const DMYHMtoYMDHM = (excelDate) => {
  if (!excelDate) return null;
  
  const date = new Date(excelDate);
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

export const validateIsNumber = (value) => {
  if (value == null) return false;
  if (/^-?\d+(\.\d+)?$/.test(value.toString())) {
    return true;
  }else{
    return false;
  }
}

export const roundValue = (value) => {
  const num = parseFloat(value ?? 0);
  const trimmed = Math.floor(num * 1000) / 1000; 
  const rounded = Math.round(trimmed * 100) / 100;

  return rounded.toFixed(2);
};

export const roundValue3Dec = (value) => {
  const num = parseFloat(value ?? 0);
  const trimmed = Math.floor(num * 10000) / 10000;
  const rounded = Math.round(trimmed * 1000) / 1000;

  return rounded.toFixed(3);
};

export const formatSmartNumber = (value) => {
   return Number(value) % 1 === 0? 
   numeral(value).format('0')         // No decimals
   : numeral(value).format('0.00');     // 2 decimal places
}

export const getErrorResponse = (error) => ({
  type: 'error',
  message: process.env.DEBUG == 1 ? error.message : 'Aplikasi sedang mengalami gangguan, silahkan hubungi tim IT'
});

export const deletePDFFile = async () => {
    try {
      const todayStart = dayjs().startOf('day');
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);
      let filePath = path.join(__dirname);
      const fileArray = filePath.split('helpers');
      const basePath = fileArray[0] + 'file\\';
      
      // Clean file/ root (multer temp files)
      cleanOldFiles(basePath, todayStart);
      
      // Clean file/pdf/ (generated PDFs)
      const pdfPath = basePath + 'pdf\\';
      if (fs.existsSync(pdfPath)) {
        cleanOldFiles(pdfPath, todayStart);
      }

      console.log('scheduler del pdf jalan')
      return 'sukses'
    } catch (error) {
      console.log(error);
    }
  };

const cleanOldFiles = (dirPath, todayStart) => {
  fs.readdir(dirPath, (err, files) => {
    if (err) { console.error('Error reading directory:', err); return; }
    files.forEach(file => {
      const filePath = path.join(dirPath, file);
      fs.stat(filePath, (err, stats) => {
        if (err) { console.error('Error getting file stats:', err); return; }
        // Skip directories
        if (stats.isDirectory()) return;
        const fileModified = dayjs(stats.mtime).startOf('day');
        if (!fileModified.isSame(todayStart)) {
          fs.unlink(filePath, err => {
            if (err) { console.error('Error deleting file:', err); return; }
            console.log(`Deleted: ${file}`);
          });
        }
      });
    });
  });
};

// Universal chunked insert helper that adjusts by field count
export const insertInChunks = async (table, data, fieldCount) => {
  if (!data || data.length === 0) return;
  
  const maxParams = 2000;
  const chunkSize = Math.floor(maxParams / fieldCount);
  
  for (let i = 0; i < data.length; i += chunkSize) {
    const chunk = data.slice(i, i + chunkSize);
    await table.insert(chunk);
  }
};

// Convert object to string representation
export const objectToString = (obj) => {
  if (!obj || typeof obj !== 'object') return '';
  return Object.entries(obj)
    .map(([key, value]) => `${key}: ${value}`)
    .join('; ');
};

export const msgError = (error) => {
  let errResponse = {} // code: 500 
  let errReal = {}
  if(error['errors'] != undefined){
      errResponse.message = error['errors'][0].message
      errReal.message = error['errors'][0].message
  }
  else{
      if(error.message.includes('Invalid object name')){
          errResponse.message = "Nama table tidak ditemukan!"
      }
      else if(error.message.includes('Invalid column name')){
          errResponse.message = "Ada nama column tidak ditemukan!"
      }
      else if(error.message.includes('duplicate')){
          errResponse.message = "Mapping ["+item+"]-["+jenis+"] sudah tersedia!"
      }
      else if(error.message.includes('String or binary data would be truncated')){ 
          errResponse.message = "Data yang diinput melebihi maksimal panjang field!"
      }
      else if(error.message.includes('Cannot insert the value NULL into column')){ 
          errResponse.message = "Data yang diinput tidak boleh nulls!"
      }
      else if(error.message.includes('overflowed an int column')){
          errResponse.message = "Ada kolom int yang digunakan melebihi batas maksimal "
      }
      else{
          errResponse.message = error.message
      }
      errReal.message = error.message
  }
  console.log(errReal)
  return ({
    type:'error',
    message: process.env.DEBUG == 1 ? errResponse.message : `Aplikasi sedang mengalami gangguan, silahkan hubungi tim IT`,
  });
};

export const calculateStartWorkday = async(date) => {
    let target_start = date;
    while (true) {
        const checkDate = target_start.format('YYYY-MM-DD');
        const isHoliday = await db('vw_hds_hari_libur')
            .where('tgl', checkDate)
            .first();
        
        if (!isHoliday) break;
        target_start = target_start.add(1, 'day');
    }
    return target_start;
}

export const calculateEndWorkday = async(date, mandaysNeeded) => {
    let workingDaysCount = 0
    let target_end = date;
    while (workingDaysCount < mandaysNeeded) {
        const checkDate = target_end.format('YYYY-MM-DD');
        const isHoliday = await db('vw_hds_hari_libur')
            .where('tgl', checkDate)
            .first();
        
        if (!isHoliday) {
            workingDaysCount++;
        }
        
        if (workingDaysCount < mandaysNeeded) {
            target_end = target_end.add(1, 'day');
        }
    } 
    return target_end;
}

export const randomString = async (length) => {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    const charactersLength = characters.length;

    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }

    return result;
};

export const getDesignTabStatus = async (route) => {
  const flag = await db('mst_code').select('code_varchar01')
    .where('code_field', 'design_tab_status').where('code_value', route).first();
  return flag.code_varchar01.split(';');
}

export const datetimeNow = async () => {
  return dayjs().format("YYYY-MM-DD HH:mm:ss");
}

/**
 * Generate random token for approval links
 * @param {number} length - Token length (default: 40)
 * @returns {string} Random alphanumeric token with @ symbol
 */
export const generateToken = (length = 40) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@';
  let token = '';
  for (let i = 0; i < length; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
};

/**
 * Safely extract array from SQL Server raw query result
 * SQL Server's knex raw queries can return results in different formats:
 * - Direct array: [{ col: 'val' }, ...]
 * - Nested array: [[{ col: 'val' }, ...]]
 * - Recordset object: { recordset: [{ col: 'val' }, ...], ... }
 * 
 * @param {*} result - Raw query result from dbDMS.raw() or dbHris.raw()
 * @returns {Array} - Extracted array, or empty array if extraction fails
 * 
 * @example
 * const result = await dbDMS.raw('SELECT * FROM table WHERE id = ?', [id]);
 * const items = extractArrayFromRaw(result);
 * const filtered = items.filter(item => item.status === 'active');
 */
export const extractArrayFromRaw = (result) => {
  // Direct array
  if (Array.isArray(result) && result.length > 0 && typeof result[0] === 'object' && !Array.isArray(result[0])) {
    return result;
  }
  
  // Nested array (most common for SQL Server)
  if (result && Array.isArray(result[0])) {
    return result[0];
  }
  
  // Recordset object (alternative SQL Server format)
  if (result && result.recordset && Array.isArray(result.recordset)) {
    return result.recordset;
  }
  
  // Fallback: empty array
  return [];
};

/**
 * Safely extract single object from SQL Server raw query result
 * Used for queries that return a single row (e.g., COUNT, aggregates)
 * 
 * @param {*} result - Raw query result from dbDMS.raw() or dbHris.raw()
 * @param {Object} defaultValue - Default object to return if extraction fails
 * @returns {Object} - Extracted object, or defaultValue
 * 
 * @example
 * const result = await dbDMS.raw('SELECT COUNT(*) as total FROM table');
 * const stats = extractObjectFromRaw(result, { total: 0 });
 * console.log(stats.total);
 */
export const extractObjectFromRaw = (result, defaultValue = {}) => {
  const array = extractArrayFromRaw(result);
  return array.length > 0 ? array[0] : defaultValue;
};
