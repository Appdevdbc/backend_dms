const sanitizeInput = (value) => {
  if (typeof value === "string") {
    return value.replace(/'/g, "''").replace(/--/g, "").replace(/;/g, "");
  }
  return value;
};

const sanitizeObject = (obj) => {
  if (!obj || typeof obj !== "object") return obj;

  const sanitized = {};
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      sanitized[key] = Array.isArray(obj[key])
        ? obj[key].map(sanitizeInput)
        : sanitizeInput(obj[key]);
    }
  }
  return sanitized;
};

const sqlSanitizeMiddleware = (req, res, next) => {
  req.query = sanitizeObject(req.query);
  req.body = sanitizeObject(req.body);
  req.params = sanitizeObject(req.params);

  next();
};

export default sqlSanitizeMiddleware;
