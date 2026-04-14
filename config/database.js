import { Sequelize } from "sequelize";
import * as dotenv from 'dotenv' 
dotenv.config()


Sequelize.DATE.prototype._stringify = function _stringify(date, options) {
  date = this._applyTimezone(date, options);
  return date.format('YYYY-MM-DD HH:mm:ss');
}; 

export const sequelize = new Sequelize(process.env.DB_DATABASE, process.env.DB_USERNAME, process.env.DB_PASSWORD, {
  dialect: "mssql",
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  dialectOptions: {
    options: {
      instanceName: process.env.DB_INSTANCE,
      requestTimeout: 300000,
      useUTC: false,
      encrypt: false,
    },
  },
  timezone: 'Asia/Jakarta',
  logging: false
}); 
