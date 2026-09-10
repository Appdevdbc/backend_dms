import dotenv from "dotenv";
dotenv.config();

/**
 * Nama cookie token, dibaca dari ENV (default: 'token').
 */
export const getCookieName = () => process.env.COOKIE_NAME || "token";

/**
 * Opsi cookie untuk token httpOnly.
 * - httpOnly: true         → tidak bisa diakses JS di browser
 * - sameSite: 'lax'
 * - secure: hanya di PRODUCTION (butuh HTTPS)
 * - path: '/'
 * - maxAge: idle time (ms)
 * @param {number} maxAge - masa berlaku cookie dalam milidetik
 */
export const getCookieOptions = (maxAge) => ({
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.ENVIRONMENT === "PRODUCTION",
  path: "/",
  maxAge,
});

/**
 * Opsi untuk clearCookie — harus cocok dengan atribut saat set
 * (path, sameSite, secure) agar browser menghapus cookie dengan benar.
 */
export const getClearCookieOptions = () => ({
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.ENVIRONMENT === "PRODUCTION",
  path: "/",
});

/**
 * Fungsi MURNI untuk mengekstrak token dari berbagai sumber, dengan prioritas:
 *   1. cookies[COOKIE_NAME]                          (utama)
 *   2. accept === 'text/event-stream' → query.token  (untuk SSE / EventSource)
 *   3. Authorization: Bearer <token>                 (backward compatible)
 *
 * @param {Object} args
 * @param {Object} [args.cookies]        - req.cookies (dari cookie-parser)
 * @param {string} [args.accept]         - req.headers['accept']
 * @param {string} [args.authorization]  - req.headers.authorization
 * @param {Object} [args.query]          - req.query
 * @returns {string|null} token atau null bila tidak ditemukan
 */
export const resolveToken = ({ cookies, accept, authorization, query } = {}) => {
  const cookieName = getCookieName();

  // 1. Cookie (utama)
  const cookieToken = cookies?.[cookieName];
  if (cookieToken) return cookieToken;

  // 2. SSE via query param
  if (accept === "text/event-stream" && query?.token) {
    return query.token;
  }

  // 3. Authorization: Bearer <token> (backward compatible)
  if (typeof authorization === "string") {
    const parts = authorization.split(" ");
    if (parts.length === 2 && parts[0] === "Bearer" && parts[1]) {
      return parts[1];
    }
  }

  return null;
};
