'use strict';
const path = require('path');
const express = require('express');
const { migrate } = require('./db');
const { loadUser, csrfGuard, HttpError } = require('./auth');
const { router } = require('./api');
const reminders = require('./reminders');

function createApp() {
  const app = express();
  app.set('trust proxy', 1); // Railway terminates TLS in front of us
  app.disable('x-powered-by');

  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-Frame-Options': 'DENY',
      'Permissions-Policy': 'camera=(self), geolocation=()'
    });
    if (req.secure) res.set('Strict-Transport-Security', 'max-age=31536000');
    next();
  });

  app.get('/healthz', (_req, res) => res.json({ ok: true }));
  app.use('/api', loadUser, csrfGuard, router);
  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Not found')));

  const pub = path.join(__dirname, '..', 'public');
  app.use(express.static(pub, {
    setHeaders(res, file) {
      // HTML, the service worker and the manifest must always revalidate so updates ship instantly.
      if (/\.(html|webmanifest)$|sw\.js$/.test(file)) res.set('Cache-Control', 'no-cache');
    }
  }));
  app.get('*', (_req, res) => res.sendFile(path.join(pub, 'index.html'), { headers: { 'Cache-Control': 'no-cache' } }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    const status = err.status || (err.type === 'entity.too.large' ? 413 : 500);
    if (status >= 500) console.error(err);
    res.status(status).json({ error: status >= 500 ? 'Something went wrong on our side' : err.message });
  });
  return app;
}

if (require.main === module) {
  (async () => {
    await migrate();
    const port = process.env.PORT || 3000;
    createApp().listen(port, () => console.log(`🍅 My Little Pomodoro on :${port}`));
    reminders.start();
  })().catch((e) => { console.error('Failed to start', e); process.exit(1); });
}

module.exports = { createApp };
