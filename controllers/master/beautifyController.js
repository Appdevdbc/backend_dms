import dayjs from "dayjs";
import { db, dbDMS } from "../../config/db.js";
import { removeFile, uploadFile } from "../../helpers/ftp.js";
import { decrypt, getErrorResponse, objectToString } from "../../helpers/utils.js";
import { unlink } from "fs";
import * as dotenv from "dotenv";
import { logger } from "../../helpers/logger.js";
dotenv.config();

export const uploadProfileImage = async (req, res) => {
  // #swagger.tags = ['Beautify']
  /* #swagger.security = [{
          "bearerAuth": []
  }] */
  // #swagger.description = 'Fungsi untuk simpan data beautify'
  const trx = await dbDMS.transaction();
  try {
    if (req.file.size / 1000 > 10000) {
      throw { message: "Ukuran file terlalu besar" };
    }
    
    const filename = req.file.filename;
    const { type, empid: encryptedEmpid } = req.body;
    const now = dayjs().format("YYYY-MM-DD HH:mm:ss");
    const empid =  decrypt(encryptedEmpid);
    
    // Determine FTP folder based on environment
    const isProduction = process.env.ENVIRONMENT === 'PRODUCTION';
    const ftpFolder = isProduction ? 'wjs/background' : 'wjsdev/background';
    
    const existData = await trx('background_user')
      .where('bg_user_id', empid)
      .where('bg_type', type)
      .first();
    
    await uploadFile('file', ftpFolder, filename);
    
    let action, dataString;
    if (existData) {
      const updateData = { bg_filename: filename, updated_at: now, updated_by: empid };
      await trx('background_user')
        .where('bg_user_id', empid)
        .where('bg_type', type)
        .update(updateData);
      
      // Remove old file from FTP
      if (existData.bg_filename) {
        await removeFile(ftpFolder, existData.bg_filename);
      }
      
      dataString = objectToString(updateData);
      action = 'update';
    } else {
      const insertData = { bg_user_id: empid, bg_type: type, bg_filename: filename, created_at: now, created_by: empid };
      await trx('background_user').insert(insertData);
      dataString = objectToString(insertData);
      action = 'insert';
    }
    
    unlink(`file/${filename}`, (err) => {
      if (err) console.log('Failed to delete local file:', err.message);
    });
    
    await trx.commit();
    return res.json({imageUrl:`${process.env.LINK_DOWNLOAD}/${ftpFolder}/${filename}`});
  } catch (error) {
    await trx.rollback();
    logger(error, 'POST /uploadProfileImage', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};

export const getProfileImages = async (req, res) => {
  // #swagger.tags = ['Beautify']
  /* #swagger.security = [{
          "bearerAuth": []
  }] */
  // #swagger.description = 'Fungsi untuk get data beautify'
  try {
    const { empid: encryptedEmpid } = req.query;
    const empid =  decrypt(encryptedEmpid);
    
    // Determine FTP folder based on environment
    const isProduction = process.env.ENVIRONMENT === 'PRODUCTION';
    const ftpFolder = isProduction ? 'wjs/background' : 'wjsdev/background';
    
    const [background, avatar] = await Promise.all([
      dbDMS("background_user")
        .where('bg_user_id', empid)
        .where('bg_type', 'background')
        .first(),
      dbDMS("background_user")
        .where('bg_user_id', empid)
        .where('bg_type', 'avatar')
        .first(),
    ]);
    
    return res.json({
      backgroundImage: background ? `${process.env.LINK_DOWNLOAD}/${ftpFolder}/${background.bg_filename || background.bg_file}` : null,
      avatarImage: avatar ? `${process.env.LINK_DOWNLOAD}/${ftpFolder}/${avatar.bg_filename || avatar.bg_file}` : null
    });
  } catch (error) {
    logger(error, 'GET /getProfileImages', req.query);
    return res.status(406).json(getErrorResponse(error));
  }
};


export const removeProfileImage = async (req, res) => {
  // #swagger.tags = ['Beautify']
  /* #swagger.security = [{
          "bearerAuth": []
  }] */
  // #swagger.description = 'Fungsi untuk remove data beautify'
  const trx = await dbDMS.transaction();
  try {
    const { type,empid: encryptedEmpid } = req.body;
    const empid =  decrypt(encryptedEmpid);
    
    // Determine FTP folder based on environment
    const isProduction = process.env.ENVIRONMENT === 'PRODUCTION';
    const ftpFolder = isProduction ? 'wjs/background' : 'wjsdev/background';
    
    const existData = await trx('background_user')
      .where('bg_user_id', empid)
      .where('bg_type', type)
      .first();
      
    if (!existData) {
      throw { message: "Data tidak ditemukan" };
    }
    
    await trx('background_user')
        .where('bg_user_id', empid)
        .where('bg_type', type)
        .delete();
        
    if (existData.bg_filename) {
      await removeFile(ftpFolder, existData.bg_filename);
    }
    
    const dataString = objectToString({ bg_filename: empid, bg_type: type});
    const action = 'delete';

    await trx.commit();
    return res.json({ message: "Gambar berhasil dihapus" });
  } catch (error) {
    await trx.rollback();
    logger(error, 'DELETE /removeProfileImage', req.body);
    return res.status(406).json(getErrorResponse(error));
  }
};
