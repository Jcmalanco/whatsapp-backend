const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');
const baileys = require('../services/whatsappService');

const router = express.Router();

router.use(requireAuth);

router.get('/status', asyncHandler(async (req, res) => {
  res.json({ status: baileys.getStatus() });
}));

router.post('/start', requireRole('admin', 'supervisor'), asyncHandler(async (req, res) => {
  const status = await baileys.start();
  res.json({ status });
}));

router.post('/restart', requireRole('admin'), asyncHandler(async (req, res) => {
  const status = await baileys.restart();
  res.json({ status });
}));

module.exports = router;
