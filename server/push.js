'use strict';
const webpush = require('web-push');
const { query } = require('./db');

let ready = null;

// VAPID keys come from env, or are generated once and stored in the database.
async function init() {
  if (ready) return ready;
  ready = (async () => {
    let pub = process.env.VAPID_PUBLIC_KEY;
    let priv = process.env.VAPID_PRIVATE_KEY;
    if (!pub || !priv) {
      const { rows } = await query(`SELECT value FROM app_config WHERE key = 'vapid'`);
      if (rows[0]) ({ publicKey: pub, privateKey: priv } = rows[0].value);
      else {
        const keys = webpush.generateVAPIDKeys();
        await query(`INSERT INTO app_config (key, value) VALUES ('vapid', $1) ON CONFLICT (key) DO NOTHING`, [keys]);
        const again = await query(`SELECT value FROM app_config WHERE key = 'vapid'`);
        ({ publicKey: pub, privateKey: priv } = again.rows[0].value);
      }
    }
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:hello@mylittlepomodoro.app', pub, priv);
    return pub;
  })();
  return ready;
}

async function publicKey() { return init(); }

async function sendToUser(userId, payload) {
  await init();
  const { rows } = await query('SELECT endpoint, keys FROM push_subscriptions WHERE user_id = $1', [userId]);
  let sent = 0;
  for (const s of rows) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, JSON.stringify(payload), { TTL: 60 * 60 * 12 });
      sent++;
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) await query('DELETE FROM push_subscriptions WHERE endpoint = $1', [s.endpoint]);
      else console.error('[push] failed', e.statusCode || e.message);
    }
  }
  return sent;
}

module.exports = { publicKey, sendToUser };
