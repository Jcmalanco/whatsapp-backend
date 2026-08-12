const crypto = require('crypto');
const env = require('../config/env');
const supabase = require('../config/supabase');

async function saveBuffer(buffer, filename, contentType = 'application/octet-stream') {
  return uploadToSupabase(buffer, filename, contentType);
}

async function saveUploadedFile(file) {
  return uploadToSupabase(file.buffer, file.originalname, file.mimetype);
}

async function uploadToSupabase(buffer, filename, contentType) {
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');

  const key = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}-${safeName}`;

  const { error } = await supabase.storage
    .from(env.supabase.storageBucket)
    .upload(key, buffer, {
      contentType,
      upsert: false
    });

  if (error) {
    throw new Error(`Supabase Storage upload failed: ${error.message}`);
  }

  // IMPORTANTE:
  // Guardamos la ruta, NO la signed URL.
  return key;
}

module.exports = { saveBuffer, saveUploadedFile };
