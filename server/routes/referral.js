const express = require('express');
const router = express.Router();
const { db, getSetting } = require('../db');
const { requireAuth } = require('../middleware/auth');

/**
 * GET /api/referral
 * Squad stats + invite link
 */
router.get('/', requireAuth, (req, res) => {
  const user = req.user;
  const botUsername = process.env.BOT_USERNAME || 'HypeMinerBot';

  const friends = db.prepare(`
    SELECT u.id, u.username, u.first_name, u.miner_level, u.total_mined, r.created_at, r.commission_earned
    FROM referrals r
    JOIN users u ON u.id = r.referred_id
    WHERE r.referrer_id = ?
    ORDER BY r.created_at DESC
  `).all(user.id);

  const stats = db.prepare(`
    SELECT COUNT(*) as count, COALESCE(SUM(commission_earned), 0) as total_commission
    FROM referrals WHERE referrer_id = ?
  `).get(user.id);

  const inviteLink = `https://t.me/${botUsername}?startapp=${user.referral_code}`;

  res.json({
    referralCode: user.referral_code,
    inviteLink,
    friendsCount: stats.count,
    totalCommission: Number(stats.total_commission.toFixed(4)),
    bonusPerInvite: parseFloat(getSetting('referral_bonus', '25')),
    commissionPct: parseFloat(getSetting('referral_commission_pct', '5')),
    friends: friends.map(f => ({
      id: f.id,
      username: f.username,
      firstName: f.first_name,
      level: f.miner_level,
      totalMined: Number(f.total_mined.toFixed(2)),
      joinedAt: f.created_at,
      commissionEarned: Number(f.commission_earned.toFixed(4))
    }))
  });
});

module.exports = router;
