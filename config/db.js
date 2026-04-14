import knex from "knex";
import { attachPaginate } from "knex-paginate";
import * as dotenv from 'dotenv' 
dotenv.config()
attachPaginate();

export const dbMaster = knex({
  client: "mssql",
  connection: {
    host: process.env.DB4_HOST,
    port: process.env.DB4_PORT,
    user: process.env.DB4_USERNAME,
    password: process.env.DB4_PASSWORD,
    timezone: "Asia/Jakarta",
    options: {
      instanceName: process.env.DB4_INSTANCE,
      database: process.env.DB4_DATABASE,
      debug: {
        packet: false,
        payload: false,
        token: false,
        data: false,
      },
    },
  },
  pool: {
    min: 2,
    max: 10,
    acquireTimeoutMillis: 30000,
    createTimeoutMillis: 30000,
    destroyTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    reapIntervalMillis: 1000,
    createRetryIntervalMillis: 100,
  },
});

 export const dbHris = knex({
  client: "mssql",
  connection: {
    host: process.env.DB1_HOST,
    port: process.env.DB1_PORT,
    user: process.env.DB1_USERNAME,
    password: process.env.DB1_PASSWORD,
    timezone: "Asia/Jakarta",
    options: {
      instanceName: process.env.DB1_INSTANCE,
      database: process.env.DB1_DATABASE,
      debug: {
        packet: false,
        payload: false,
        token: false,
        data: false,
      },
    },
  },
  pool: {
    min: 2,
    max: 10,
    acquireTimeoutMillis: 30000,
    createTimeoutMillis: 30000,
    destroyTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    reapIntervalMillis: 1000,
    createRetryIntervalMillis: 100,
  },
}); 

export const db = knex({
  client: "mssql",
  connection: {
    host: process.env.DB3_HOST,
    port: 1433,
    user: process.env.DB3_USERNAME,
    password: process.env.DB3_PASSWORD,
    timezone: "Asia/Jakarta",
    options: {
      instanceName: process.env.DB3_INSTANCE,
      database: process.env.DB3_DATABASE,
      debug: {
        packet: false,
        payload: false,
        token: false,
        data: false,
      },
    },
  },
  pool: {
    min: 2,
    max: 10,
    acquireTimeoutMillis: 30000,
    createTimeoutMillis: 30000,
    destroyTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    reapIntervalMillis: 1000,
    createRetryIntervalMillis: 100,
  },
}); 


export const dbHDS = knex({
  client: "mssql",
  connection: {
    host: process.env.DB5_HOST,
    port: process.env.DB5_PORT,
    user: process.env.DB5_USERNAME,
    password: process.env.DB5_PASSWORD,
    timezone: "Asia/Jakarta",
    options: {
      instanceName: process.env.DB5_INSTANCE,
      database: process.env.DB5_DATABASE,
      debug: {
        packet: false,
        payload: false,
        token: false,
        data: false,
      },
    },
  },
  pool: {
    min: 2,
    max: 10,
    acquireTimeoutMillis: 30000,
    createTimeoutMillis: 30000,
    destroyTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    reapIntervalMillis: 1000,
    createRetryIntervalMillis: 100,
  },
}); 


export const dbDMS = knex({
  client: "mssql",
  connection: {
    host: process.env.DB_HOST,
    port: 1433,
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    timezone: "Asia/Jakarta",
    options: {
      instanceName: process.env.DB_INSTANCE,
      database: process.env.DB_DATABASE,
      debug: {
        packet: false,
        payload: false,
        token: false,
        data: false,
      },
    },
  },
  pool: {
    min: 2,
    max: 10,
    acquireTimeoutMillis: 30000,
    createTimeoutMillis: 30000,
    destroyTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    reapIntervalMillis: 1000,
    createRetryIntervalMillis: 100,
  },
}); 

// WJS database (alias for dbDMS for WJS project)
export const dbWJS = dbDMS;

// Portal database (alias for dbHris for portal authentication)
export const dbPortal = dbHris; 

// CTS Database
export const dbCTS = knex({
  client: "mssql",
  connection: {
    host: process.env.DB_CTS_HOST,
    port: parseInt(process.env.DB_CTS_PORT) || 1433,
    user: process.env.DB_CTS_USERNAME,
    password: process.env.DB_CTS_PASSWORD,
    timezone: "Asia/Jakarta",
    options: {
      instanceName: process.env.DB_CTS_INSTANCE || undefined,
      database: process.env.DB_CTS_DATABASE,
      debug: {
        packet: false,
        payload: false,
        token: false,
        data: false,
      },
    },
  },
  pool: {
    min: 2,
    max: 10,
    acquireTimeoutMillis: 30000,
    createTimeoutMillis: 30000,
    destroyTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    reapIntervalMillis: 1000,
    createRetryIntervalMillis: 100,
  },
});

// SPK Database
export const dbSPK = knex({
  client: "mssql",
  connection: {
    host: process.env.DB_SPK_HOST,
    port: parseInt(process.env.DB_SPK_PORT) || 1433,
    user: process.env.DB_SPK_USERNAME,
    password: process.env.DB_SPK_PASSWORD,
    timezone: "Asia/Jakarta",
    options: {
      instanceName: process.env.DB_SPK_INSTANCE || undefined,
      database: process.env.DB_SPK_DATABASE,
      debug: {
        packet: false,
        payload: false,
        token: false,
        data: false,
      },
    },
  },
  pool: {
    min: 2,
    max: 10,
    acquireTimeoutMillis: 30000,
    createTimeoutMillis: 30000,
    destroyTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    reapIntervalMillis: 1000,
    createRetryIntervalMillis: 100,
  },
});
