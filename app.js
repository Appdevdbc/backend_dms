import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import router from "./router/index.js";
import swaggerUi from "swagger-ui-express";
import * as dotenv from 'dotenv'; 
dotenv.config()
import cookieParser from "cookie-parser";
import { cekToken } from "./middleware/verifyToken.js";
import sqlSanitizeMiddleware from "./middleware/sanitizeRequest.js"; 
import { executeCron } from "./middleware/scheduler.js";
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();
const port = process.env.PORT;
const fe = process.env.FE_PORT;

/* app.use((req, res, next) => {
  const referringDomain = req.get('Referer');
  // Check if the referring domain is a specific domain
  if (referringDomain && referringDomain.includes('dbc.co.id')) {
    res.setHeader('Referer-Policy', 'strict-origin');
  } else {
    res.setHeader('Referer-Policy', 'same-origin');
  }
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,PATCH,POST,HEAD, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, Content-Type, X-Auth-Token');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  next();
}); */

app.disable("x-powered-by");
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, 'file')));

// CORS: credentials WAJIB true agar cookie httpOnly terkirim.
// Origin WAJIB eksplisit (dilarang wildcard '*' bersama credentials).
if (process.env.ENVIRONMENT === 'UAT' || process.env.ENVIRONMENT === 'PRODUCTION') {
  app.use(cors({
    credentials: true,
    origin: (origin, callback) => {
      if (!origin || /\.dbc\.co\.id$/.test(origin)) {
        console.log(`CORS allowed for origin: ${origin}`);
        callback(null, true);
      } else {
        console.log(`CORS blocked for origin: ${origin}`);
        callback(new Error('Not allowed by CORS'));
      }
    }
  }));
} else {
  // Development: daftar origin eksplisit (FE dev server port 7060)
  const devOrigins = [
    process.env.FRONTEND_URL,
    'http://localhost:7060',
    'http://127.0.0.1:7060',
  ].filter(Boolean);

  app.use(cors({
    credentials: true,
    origin: (origin, callback) => {
      // izinkan request tanpa origin (curl/Postman) dan origin dev yang terdaftar
      if (!origin || devOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.log(`CORS blocked for origin: ${origin}`);
        callback(new Error('Not allowed by CORS'));
      }
    }
  }));
}

executeCron();

//app.options('*', cors());
import swaggerDocument from "./swagger-output.json" assert { type: "json" };
app.use("/doc", swaggerUi.serve, swaggerUi.setup(swaggerDocument));
app.use(cookieParser());
app.use(cekToken);
app.use(sqlSanitizeMiddleware);
app.use("/", router);

app.use((req, res) => {
  res.status(404).json({ message: "Not found" });
});

app.listen(port, () => {
  console.log(`WJS Backend listening on port ${port}`);
});


