const HttpError = require('../utils/httpError');

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(new HttpError(403, 'Permisos insuficientes'));
    }
    next();
  };
}

module.exports = { requireRole };
