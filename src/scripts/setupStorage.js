const env = require('../config/env');
const supabase = require('../config/supabase');

async function ensureStorageBucket() {
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (listError) {
    throw new Error(`Cannot list Supabase buckets: ${listError.message}`);
  }

  const exists = buckets.some((bucket) => bucket.name === env.supabase.storageBucket);
  if (exists) {
    return env.supabase.storageBucket;
  }

  const { error } = await supabase.storage.createBucket(env.supabase.storageBucket, {
    public: env.supabase.storagePublic,
    fileSizeLimit: 1024 * 1024 * 100,
    allowedMimeTypes: [
      'image/jpeg',
      'image/png',
      'image/webp',
      'video/mp4',
      'application/pdf',
      'audio/ogg'
    ]
  });

  if (error) {
    throw new Error(`Cannot create Supabase bucket: ${error.message}`);
  }

  return env.supabase.storageBucket;
}

module.exports = { ensureStorageBucket };

if (require.main === module) {
  ensureStorageBucket()
    .then((bucket) => {
      console.log(`Supabase storage bucket ready: ${bucket}`);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
