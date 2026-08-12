const express = require('express');
const multer = require('multer');
const pool = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');
const { auditLog } = require('../utils/audit');
const { saveUploadedFile, getSignedUrl } = require('../services/mediaStorage');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }
});

router.use(requireAuth);

router.get('/', asyncHandler(async (req, res) => {
  const profile = await getOrCreateProfile(req.user.id, req.user.name);

  if (profile.avatar_url) {
    profile.avatar_url = await getSignedUrl(profile.avatar_url);
  }

  res.json({ profile });
}));

router.put('/', asyncHandler(async (req, res) => {
  const { displayName, phone, jobTitle, department, bio } = req.body;

  if (!displayName) throw new HttpError(400, 'displayName requerido');

  const [rows] = await pool.execute(
    `INSERT INTO user_profiles
      (user_id, display_name, phone, job_title, department, bio)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (user_id)
     DO UPDATE SET
       display_name = EXCLUDED.display_name,
       phone = EXCLUDED.phone,
       job_title = EXCLUDED.job_title,
       department = EXCLUDED.department,
       bio = EXCLUDED.bio
     RETURNING *`,
    [
      req.user.id,
      displayName,
      phone || null,
      jobTitle || null,
      department || null,
      bio || null
    ]
  );

  await pool.execute('UPDATE users SET name = ? WHERE id = ?', [displayName, req.user.id]);
  await auditLog(req, 'update_own_profile', 'user_profile', rows[0].id);

  if (rows[0].avatar_url) {
    rows[0].avatar_url = await getSignedUrl(rows[0].avatar_url);
  }

  res.json({ profile: rows[0] });
}));

router.post('/avatar', upload.single('avatar'), asyncHandler(async (req, res) => {
  if (!req.file) throw new HttpError(400, 'avatar requerido');
  if (!req.file.mimetype.startsWith('image/')) throw new HttpError(400, 'El avatar debe ser imagen');

  const avatarPath = await saveUploadedFile(req.file);

  const [rows] = await pool.execute(
    `INSERT INTO user_profiles (user_id, display_name, avatar_url)
     VALUES (?, ?, ?)
     ON CONFLICT (user_id)
     DO UPDATE SET avatar_url = EXCLUDED.avatar_url
     RETURNING *`,
    [req.user.id, req.user.name, avatarPath]
  );

  await auditLog(req, 'update_profile_avatar', 'user_profile', rows[0].id, { avatarPath });

  rows[0].avatar_url = await getSignedUrl(avatarPath);

  res.json({ profile: rows[0] });
}));

router.get('/users', requireRole('admin', 'supervisor'), asyncHandler(async (req, res) => {
  const [rows] = await pool.execute(
    `SELECT
       u.id AS user_id,
       u.name,
       u.email,
       u.role,
       u.status,
       p.id AS profile_id,
       p.display_name,
       p.phone,
       p.job_title,
       p.department,
       p.avatar_url,
       p.bio,
       p.updated_at AS profile_updated_at
     FROM users u
     LEFT JOIN user_profiles p ON p.user_id = u.id
     ORDER BY u.name`
  );

  for (const profile of rows) {
    if (profile.avatar_url) {
      profile.avatar_url = await getSignedUrl(profile.avatar_url);
    }
  }

  res.json({ profiles: rows });
}));

async function getOrCreateProfile(userId, fallbackName) {
  const [existing] = await pool.execute(
    'SELECT * FROM user_profiles WHERE user_id = ? LIMIT 1',
    [userId]
  );

  if (existing[0]) return existing[0];

  const [created] = await pool.execute(
    `INSERT INTO user_profiles (user_id, display_name)
     VALUES (?, ?)
     RETURNING *`,
    [userId, fallbackName]
  );

  return created[0];
}

module.exports = router;