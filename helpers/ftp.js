import * as ftp from "basic-ftp";
import * as dotenv from "dotenv";
dotenv.config();

export const uploadFile = async (sourceFolder,destinationFolder,filename) => {
  const client = new ftp.Client();
  client.ftp.verbose = true;
  try {
    await client.access({
      host: process.env.FTP_HOST,
      user: process.env.FTP_USER,
      password: process.env.FTP_PASS,
      port: process.env.FTP_PORT,
    });
    await client.uploadFrom(`${sourceFolder}/${filename}`, `${destinationFolder}/${filename}`);
  } catch (error) {
    client.close()
    throw error;
  }
  client.close()
};


export const removeFile = async (sourceFolder,filename) => {
  const client = new ftp.Client();
  client.ftp.verbose = true;
  try {
    await client.access({
      host: process.env.FTP_HOST,
      user: process.env.FTP_USER,
      password: process.env.FTP_PASS,
      port: process.env.FTP_PORT,
    });
    await client.remove(`${sourceFolder}/${filename}`);
  } catch (error) {
    throw error;

  }
  client.close()
};

export const removeLocalFile = async (filepath) => {
  console.log(filepath)
  const fs = await import('fs/promises');
  try {
    await fs.unlink(`${filepath}`);
  } catch (error) {
    throw error;
  }
};
