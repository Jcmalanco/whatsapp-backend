const axios = require('axios');
const env = require('../config/env');

function client() {
  return axios.create({
    baseURL: `https://graph.facebook.com/${env.whatsapp.apiVersion}`,
    headers: {
      Authorization: `Bearer ${env.whatsapp.accessToken}`
    }
  });
}

async function sendText(to, body) {
  const response = await client().post(`/${env.whatsapp.phoneNumberId}/messages`, {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    text: { preview_url: false, body }
  });
  return response.data;
}

async function sendMedia(to, type, mediaUrl, caption, filename) {
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type,
    [type]: {
      link: mediaUrl
    }
  };

  if (caption && ['image', 'video', 'document'].includes(type)) {
    payload[type].caption = caption;
  }
  if (filename && type === 'document') {
    payload.document.filename = filename;
  }

  const response = await client().post(`/${env.whatsapp.phoneNumberId}/messages`, payload);
  return response.data;
}

async function getMediaMeta(mediaId) {
  const response = await client().get(`/${mediaId}`);
  return response.data;
}

async function downloadMedia(mediaId) {
  const meta = await getMediaMeta(mediaId);
  const response = await axios.get(meta.url, {
    responseType: 'arraybuffer',
    headers: {
      Authorization: `Bearer ${env.whatsapp.accessToken}`
    }
  });
  return {
    buffer: Buffer.from(response.data),
    mimeType: meta.mime_type,
    sha256: meta.sha256,
    id: mediaId
  };
}

module.exports = { sendText, sendMedia, downloadMedia };
