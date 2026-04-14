import cron from 'node-cron';
import axios from 'axios';
import { logger } from './logger.js';

const API_BASE = process.env.FRONTEND_URL || 'http://localhost:3104';

// Schedule employee sync from Portal
// Runs every day at 2:00 AM
export const scheduleEmployeeSync = () => {
  cron.schedule('0 2 * * *', async () => {
    try {
      logger({ message: 'Starting scheduled employee sync from Portal' }, 'Scheduler');
      
      const response = await axios.post(`${API_BASE}/wjs/syncEmployeesFromPortal`, {}, {
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      logger(response.data, 'Employee sync completed');
    } catch (error) {
      logger(error, 'Employee sync failed', { scheduled: true });
    }
  });
  
  console.log('✓ Employee sync scheduler initialized (runs daily at 2:00 AM)');
};

// You can add more scheduled jobs here
export const initializeSchedulers = () => {
  scheduleEmployeeSync();
  // Add more schedulers as needed
};
