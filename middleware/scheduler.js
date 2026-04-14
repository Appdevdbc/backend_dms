import * as dotenv from 'dotenv' ;
import cron from "node-cron"
import dayjs from "dayjs";
import { deletePDFFile } from '../helpers/utils.js';

dotenv.config();

const safeTaskRunner = (task) => {
    return async() => {  // ✅ Make sure this returns a function
      task().catch((error) => {
        console.error(`[${new Date().toLocaleString()}] Scheduled task failed:`, error);
      });
    };
};

export const executeCron= async () => {
    cron.schedule("15 23 * * *",()=>{
        safeTaskRunner(deletePDFFile())
      },{
        scheduled: true, 
        timezone: "Asia/Bangkok"
    });
}