# HYPE MINER — HYPE ECOSYSTEM

Production-ready **Telegram Mini App** for HYPE mining on the TON ecosystem.

## Features

- Telegram WebApp authentication (`initData` HMAC validation)
- Persistent mining (energy, cooldown, daily limits, levels)
- Tasks with claim flow
- Referral squad (invite links, bonus, commission)
- Profile + TON wallet linking (public address only)
- Live mining pool / network stats
- Admin panel (users, rates, tasks, withdrawals)
- Rate limiting and transactional balance updates

## Setup

```bash
npm install
cp .env.example .env
# Set BOT_TOKEN, JWT_SECRET, ADMIN_PASSWORD
npm start
```

Open the Mini App from Telegram (BotFather → Web App URL → your HTTPS host).

### Admin panel (browser only — not inside Mini App)

Open in Chrome/Safari:

- `https://YOUR-APP.onrender.com/hq-control`
- or `https://YOUR-APP.onrender.com/admin`

Login: `ADMIN_USERNAME` / `ADMIN_PASSWORD` (from Render env).

### 8-hour mining pause messages (DIGGO-style)

If a user does not mine for **8 hours**, the bot sends one reminder:

- Text: *Mining has paused after 8 hours. Collect your rewards…*
- Buttons: **Open HYPE Miner** + **Join Community**

Set on Render:

- `BOT_TOKEN`
- `WEBAPP_URL` = your Mini App HTTPS URL
- `COMMUNITY_CHANNEL_URL` = your Telegram channel (e.g. `https://t.me/YourChannel`)

Hours / on-off also in Admin → Settings.

## Deploy (Render)

1. Web Service · Build `npm install` · Start `npm start`
2. Environment variables from `.env.example`
3. Optional disk: `DB_PATH=/data/hype.json`
4. Set BotFather Web App URL to the service HTTPS URL
5. Set `WEBAPP_URL` + `COMMUNITY_CHANNEL_URL` for bot buttons

## Notes

- Withdrawals stay closed until `WITHDRAWALS_ENABLED=true` and secure TON signing is configured on the server.
- Never store seed phrases or private keys.
- Mining rates, cooldowns, and rewards are editable from the admin settings API / panel.

## License

MIT
