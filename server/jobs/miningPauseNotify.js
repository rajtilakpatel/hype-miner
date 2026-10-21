/**
 * Mining pause notifier — DIGGO-style
 * If a user has not mined for N hours (default 8), send one Telegram reminder
 * with Open HYPE Miner + Join Community buttons. Re-arms after they mine again.
 */
const { getStore, saveStore, getSetting } = require('../db');
const { sendBotMessage, buildMiningPauseKeyboard } = require('../utils/telegram');

const DEFAULT_HOURS = 8;
const BATCH_LIMIT = 40; // avoid flooding Telegram rate limits per tick

function hoursMs(h) {
  return h * 60 * 60 * 1000;
}

function isRealTelegramUser(u) {
  if (!u || !u.telegram_id) return false;
  const id = String(u.telegram_id);
  if (id.startsWith('web_')) return false;
  // Telegram user ids are numeric
  return /^\d+$/.test(id);
}

async function runMiningPauseNotify() {
  const enabled = getSetting('mining_pause_notify_enabled', 'true');
  if (enabled === 'false' || enabled === '0') return { skipped: true, reason: 'disabled' };

  if (!process.env.BOT_TOKEN) {
    return { skipped: true, reason: 'no BOT_TOKEN' };
  }

  const hours = parseFloat(getSetting('mining_pause_hours', String(DEFAULT_HOURS))) || DEFAULT_HOURS;
  const cutoff = Date.now() - hoursMs(hours);
  const store = getStore();
  const candidates = [];

  for (const u of store.users || []) {
    if (u.is_banned) continue;
    if (!isRealTelegramUser(u)) continue;
    if (!u.last_mine_at) continue; // never mined — no pause message

    const last = new Date(u.last_mine_at).getTime();
    if (Number.isNaN(last) || last > cutoff) continue;

    // already notified for this idle stretch?
    if (u.mining_pause_notified_at) {
      const notified = new Date(u.mining_pause_notified_at).getTime();
      // only skip if we notified after their last mine (same idle period)
      if (!Number.isNaN(notified) && notified >= last) continue;
    }

    candidates.push(u);
  }

  // oldest idle first
  candidates.sort((a, b) => new Date(a.last_mine_at) - new Date(b.last_mine_at));
  const batch = candidates.slice(0, BATCH_LIMIT);

  const appName = getSetting('app_name', 'HYPE MINER');
  const text =
    `💎 Your <b>HYPE</b> is ready to claim!\n\n` +
    `⏸ Mining has paused after <b>${hours} hours</b>. ` +
    `Collect your rewards to start mining again.\n\n` +
    `Open <b>${appName}</b> and keep earning.`;

  const keyboard = buildMiningPauseKeyboard();
  let sent = 0;
  let failed = 0;

  for (const u of batch) {
    const result = await sendBotMessage(u.telegram_id, text, keyboard);
    if (result && result.ok) {
      u.mining_pause_notified_at = new Date().toISOString();
      sent++;
    } else {
      failed++;
      // mark blocked users so we don't retry forever on 403
      const desc = (result && result.description) || '';
      if (/blocked|deactivated|chat not found/i.test(desc)) {
        u.mining_pause_notified_at = new Date().toISOString();
      }
    }
    // gentle pacing ~25 msg/sec max is Telegram limit for bulk; stay safer
    await new Promise(r => setTimeout(r, 50));
  }

  if (sent > 0 || failed > 0) {
    saveStore();
    console.log(`[mining-pause] notified=${sent} failed=${failed} candidates=${candidates.length}`);
  }

  return { sent, failed, candidates: candidates.length, hours };
}

function startMiningPauseScheduler(intervalMs) {
  const ms = intervalMs || 10 * 60 * 1000; // every 10 minutes
  // first run after short delay so server is fully up
  setTimeout(() => {
    runMiningPauseNotify().catch(err => console.warn('[mining-pause]', err.message));
  }, 45 * 1000);
  setInterval(() => {
    runMiningPauseNotify().catch(err => console.warn('[mining-pause]', err.message));
  }, ms);
  console.log(`[mining-pause] scheduler started (every ${Math.round(ms / 60000)} min, threshold ${DEFAULT_HOURS}h)`);
}

module.exports = { runMiningPauseNotify, startMiningPauseScheduler };
