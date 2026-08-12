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

  // Guardamos solamente la ruta del archivo.
  return key;
}

async function getSignedUrl(path) {
  if (!path) return null;

  const { data, error } = await supabase.storage
    .from(env.supabase.storageBucket)
    .createSignedUrl(path, 60 * 60 * 24 * 7);

  if (error) {
    throw new Error(`Supabase signed URL failed: ${error.message}`);
  }

  return data.signedUrl;
}

module.exports = { saveBuffer, saveUploadedFile, getSignedUrl };