const env = require('../config/env');

function errorHandler(error, req, res, next) {
  const status = error.status || 500;
  const message = status === 500 ? 'Error interno del servidor' : error.message;

  if (status === 500) {
    console.error(error);
  }

  res.status(status).json({
    error: message,
    detail: env.nodeEnv === 'development' ? error.message : undefined
  });
}

module.exports = errorHandler;
