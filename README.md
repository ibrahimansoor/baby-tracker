# 🍅 My Little Pomodoro

A modern, Italian-inspired baby tracker for the whole family. Log every feed, nap, diaper, photo and milestone. Everyone you invite sees it on their own phone, in real time.

## What it does

**Daily logging (two taps, one hand)**
- **Breastfeed**: a live Left/Right timer that syncs to the family (Mom starts it, Dad sees it running). It suggests which side to start on next.
- **Formula / bottle**: formula or breast milk, in ml or oz, with presets.
- **Pee & poop**: optional colour and texture, with a gentle warning for colours that need a pediatrician.
- **Sleep**: a live timer or a past nap.
- **More**: pumping, solids (with reactions), medicine, temperature (fever warning for babies under 3 months), notes.
- Every entry can be edited, or deleted with undo. Each entry shows who logged it.

**Growth & health**
- **Checkups**: weight, length, head size, doctor, notes, and the next appointment.
- **WHO growth charts**: percentile curves for weight, length and head size. The data comes from the WHO's official [`anthro`](https://github.com/WorldHealthOrganization/anthro) tables and is checked against published values in the tests.
- **Vaccine record**: tick vaccines on a checkup or add them on their own.

**Memories**
- **A photo for every day**: today's-photo prompt, a monthly album, and photos added for any past day. Any photo can be the baby's profile picture.
- **Milestones**: first smile, rolling over, first steps… each with the date and the baby's age.

**Family**
- Accounts with email and password, plus password reset.
- **Invite family members** with a private link. Each person gets a role: **Admin**, **Can add & edit** or **View only**. Admins can change roles or remove people.
- Multiple babies (siblings, twins) and multiple families (e.g. a nanny for two families).

**Reminders**
- **Push notifications**:
  - birthdays, plus a heads-up the day before
  - "3 months old today" monthly milestones, and weekly ones in the first month
  - checkups: the evening before and that morning
- **Add to calendar**: the birthday as a yearly event and appointments as .ics files, which sync with iCloud or Google Calendar.
- In-app banners on special days.

**Nothing gets lost**
- Everything is saved **on the phone first** (IndexedDB), so the app works fully offline. Changes sync to the server automatically when there's signal.
- The **server database is the family's master copy**. Photos are stored in it too, so database backups cover everything.
- **Save a backup to Files / iCloud Drive** from the share sheet, and **export a CSV** for the pediatrician.
- An existing log from the original single-phone version can be imported in one tap.

**Design**
- Six themes: Pomodoro, Positano, Limone, Milano, Toscana and Gelato. Each has its own fonts, palette and pattern.
- Light, dark or auto mode.
- Built for phones: installable to the home screen as an app.

## Deploy on Railway

1. **New Project → Deploy from GitHub repo** and pick this repository. Railway detects Node and runs `npm start` (see `railway.json`).
2. In the project: **New → Database → PostgreSQL**.
3. Open the app service → **Variables** and add:
   - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}`
   - `NODE_ENV` = `production`
   - `APP_URL` = your public URL, e.g. `https://my-little-pomodoro.up.railway.app` (used in invite and reset links; defaults to Railway's generated domain)
4. **Settings → Networking → Generate Domain** (or add your own domain).
5. **Turn on database backups**: Postgres service → **Backups** → schedule daily backups (available on Railway plans with volume backups). Families can also save their own copy from **More → Backup**.

Tables are created automatically on first boot. Push notification keys are generated and stored in the database the first time they're needed.

**Optional:**

| Variable | What it's for |
| --- | --- |
| `RESEND_API_KEY`, `MAIL_FROM` | Sends password-reset emails through [Resend](https://resend.com). Without these, reset links are written to the Railway logs. |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Your own push keys, instead of the auto-generated ones. |
| `DATABASE_SSL=true` | Only needed when connecting through Postgres' public TLS proxy. |

### Notifications on iPhone
Apple only allows web push for apps added to the Home Screen (iOS 16.4+). Open the site in Safari, tap **Share → Add to Home Screen**, open the app from the home screen, then go to **More → Reminders → Turn on**. Android and desktop Chrome work straight from the browser. Calendar events work everywhere.

## Run locally

```bash
npm install
# Postgres running locally (see .env.example for DATABASE_URL)
npm run dev        # http://localhost:3000
npm test           # API integration tests + growth/birthday maths (needs a throwaway TEST_DATABASE_URL)
```

## How it's built

| Part | Files |
| --- | --- |
| Server: Express + Postgres, sessions in httpOnly cookies, bcrypt passwords, CSRF guard, rate limits | `server/` |
| API: auth, families, invites, roles, sync, photos, push | `server/api.js` |
| Reminder scheduler (runs inside the server every 10 minutes) | `server/reminders.js` |
| Offline-first store: IndexedDB copy, outbox, batched sync, 20-second pull | `public/js/store.js` |
| Screens | `public/js/views/` |
| WHO LMS percentiles | `public/js/growth.js`, `public/data/who-growth.json` |
| Theme engine (6 skins × light/dark) | `public/style.css`, `public/js/theme.js` |

> The guide and health warnings are general information, not medical advice. Always follow your pediatrician.
