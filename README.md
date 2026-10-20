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

Admin UI: `/admin.html`

## Deploy (Render)

1. Web Service · Build `npm install` · Start `npm start`
2. Environment variables from `.env.example`
3. Optional disk: `DB_PATH=/data/hype.json`
4. Set BotFather Web App URL to the service HTTPS URL

## Notes

- Withdrawals stay closed until `WITHDRAWALS_ENABLED=true` and secure TON signing is configured on the server.
- Never store seed phrases or private keys.
- Mining rates, cooldowns, and rewards are editable from the admin settings API / panel.

## License

MIT
