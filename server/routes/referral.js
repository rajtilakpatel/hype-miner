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

  const list = Array.isArray(friends) ? friends : [];
  const count = (stats && stats.count != null) ? stats.count : list.length;
  const totalComm = (stats && stats.total_commission != null) ? Number(stats.total_commission) : 0;

  res.json({
    referralCode: user.referral_code || '',
    inviteLink,
    friendsCount: count,
    totalCommission: Number(totalComm.toFixed(4)),
    bonusPerInvite: parseFloat(getSetting('referral_bonus', '25')),
    commissionPct: parseFloat(getSetting('referral_commission_pct', '5')),
    friends: list.map(f => ({
      id: f.id,
      username: f.username,
      firstName: f.first_name,
      level: f.miner_level || 1,
      totalMined: Number((Number(f.total_mined) || 0).toFixed(2)),
      joinedAt: f.created_at,
      commissionEarned: Number((Number(f.commission_earned) || 0).toFixed(4))
    }))
  });
});

module.exports = router;
