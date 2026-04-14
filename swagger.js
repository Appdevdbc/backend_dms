import swaggerAutogen from "swagger-autogen";
import * as dotenv from "dotenv";
dotenv.config();
const doc = {
  info: {
    title: "Portal Report Finance dan Accounting - OpenAPI 3.0",
    description: "Dokumentasi API Portal Report Finance dan Acc dengan Nodejs (Express)",
    // termsOfService: "https://app-hds.dbc.co.id",
    contact: {
      email: "arga.sandi@dbc.co.id",
    },
    // license: {
    //   name: "Apache 2.0",
    //   url: `http://localhost`,
    // },
    // version: "1.0.11",
  },
  securityDefinitions: {
    bearerAuth: {
      type: "http",
      scheme: "bearer",
      bearerFormat: "JWT",
    },
  },
  servers: [
    {
      url: `http://localhost:${process.env.PORT}`,
    },
  ],
  tags: [
    {
      name: "User",
      description: "List fungsi yang berhungan dengan user",
    },
    {
      name: "Domain",
      description: "List fungsi yang berhubungan dengan domain",
    },
    {
      name: "General",
      description: "List fungsi general",
    },
    {
      name: "PSAK General",
      description: "List fungsi general untuk project PSAK",
    },
    {
      name: "PSAK Master Account",
      description: "List fungsi master account untuk project PSAK",
    },
    {
      name: "PSAK Aset",
      description: "List fungsi aset untuk project PSAK",
    },
    /*{
      name: "Revisi",
      description: "Endpoints",
    },
    {
      name: "Approval",
      description: "Endpoints",
    },
    {
      name: "Approval PIC Pooling",
      description: "Endpoints",
    },
    {
      name: "Proses Purchasing",
      description: "Endpoints",
    },
    {
      name: "Approval Purchasing",
      description: "Endpoints",
    },
    {
      name: "Proses Accounting",
      description: "Endpoints",
    },
    {
      name: "Approval Accounting",
      description: "Endpoints",
    },
    {
      name: "History VIB",
      description: "Endpoints",
    },
    {
      name: "Master User",
      description: "Endpoints",
    },
    {
      name: "Master Item",
      description: "Endpoints",
    },
    {
      name: "Master Item",
      description: "Endpoints",
    },
    {
      name: "Lain-Lain",
      description: "Endpoints",
    },
    {
      name: "Scheduler",
      description: "Endpoints",
    },*/
  ],
  security: undefined, // Ignore authorization parameter,
  // securityDefinitions: {
  //   apiKeyAuth: {
  //     type: "apiKey",
  //     in: "header", // can be "header", "query" or "cookie"
  //     name: "X-API-KEY", // name of the header, query parameter or cookie
  //     description: "any description...",
  //   },
  // },
};

const outputFile = "./swagger-output.json";
const endpointsFiles = ["./router/index.js"];

swaggerAutogen({ openapi: "3.0.0" })(outputFile, endpointsFiles, doc);
