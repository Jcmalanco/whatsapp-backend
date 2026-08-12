const crypto = require('crypto');
const env = require('../config/env');
const supabase = require('../config/supabase');

async function saveBuffer(
  buffer,
  filename,
  contentType = 'application/octet-stream'
) {
  return uploadToSupabase(buffer, filename, contentType);
}

async function saveUploadedFile(file) {
  return uploadToSupabase(
    file.buffer,
    file.originalname,
    file.mimetype
  );
}

async function uploadToSupabase(buffer, filename, contentType) {
  const safeName = filename.replace(/[^a-zA-Z0-9.*-]/g, '*');

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

  // Solo devuelve el path del archivo.
  // Ejemplo:
  // 2026-08-12/uuid-Scorched_Girl_Sprite.png
  return key;
}

async function createSignedMediaUrl(path, expiresIn = 60 * 60) {
  if (!path) return null;

  const { data, error } = await supabase.storage
    .from(env.supabase.storageBucket)
    .createSignedUrl(path, expiresIn);

  if (error) {
    throw new Error(`Supabase signed URL failed: ${error.message}`);
  }

  return data.signedUrl;
}

module.exports = {
  saveBuffer,
  saveUploadedFile,
  createSignedMediaUrl
};