const express = require('express');
const router = express.Router();
const { db, getSetting, transaction, ensureUserBalances, getStore, saveStore, nextId } = require('../db');
const { requireAuth } = require('../middleware/auth');

/**
 * GET /api/wallet/overview
 */
router.get('/overview', requireAuth, (req, res) => {
  const user = ensureUserBalances(db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id));
  const minUsdt = parseFloat(getSetting('min_usdt_deposit', '0.5'));
  res.json({
    walletAddress: user.wallet_address || null,
    isVerified: !!user.is_verified,
    balances: {
      hype: Number((user.balance || 0).toFixed(4)),
      holding: Number((user.holding_balance || 0).toFixed(4)),
      ton: Number((user.ton_balance || 0).toFixed(6)),
      gram: Number((user.gram_balance || 0).toFixed(4)),
      usdtCredited: Number((user.usdt_credited || 0).toFixed(4))
    },
    withdrawUnlocked: !!user.withdraw_unlocked || (user.usdt_credited || 0) >= minUsdt,
    minUsdtDeposit: minUsdt,
    deposit: {
      enabled: getSetting('deposit_enabled', 'true') === 'true',
      address: getSetting('usdt_deposit_address', '') || '',
      network: getSetting('usdt_deposit_network', 'BEP20'),
      amount: minUsdt
    },
    withdrawalsEnabled: getSetting('withdrawals_enabled', 'false') === 'true',
    minWithdraw: parseFloat(getSetting('min_withdraw', '1'))
  });
});

/**
 * POST /api/wallet/address
 * Save / update TON withdrawal wallet
 */
router.post('/address', requireAuth, (req, res) => {
  const { address } = req.body;
  if (!address || typeof address !== 'string' || address.length < 10) {
    return res.status(400).json({ error: 'Valid TON address required' });
  }
  const clean = address.trim();
  if (!/^[EUeu]Q[A-Za-z0-9_-]{46}$/.test(clean) && !/^0:[a-fA-F0-9]{64}$/.test(clean)) {
    return res.status(400).json({ error: 'Invalid TON address format' });
  }

  const store = getStore();
  const user = store.users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  user.wallet_address = clean;
  user.is_verified = 1;
  user.updated_at = new Date().toISOString();
  saveStore();

  res.json({ success: true, walletAddress: clean });
});

/**
 * POST /api/wallet/deposit
 * User submits USDT deposit claim (0.5 USDT to admin address)
 * Body: { txHash?: string, amount?: number }
 */
router.post('/deposit', requireAuth, (req, res) => {
  if (getSetting('deposit_enabled', 'true') !== 'true') {
    return res.status(503).json({ error: 'Deposits are temporarily closed' });
  }

  const depositAddress = getSetting('usdt_deposit_address', '');
  if (!depositAddress) {
    return res.status(503).json({ error: 'Deposit address not configured yet' });
  }

  const minUsdt = parseFloat(getSetting('min_usdt_deposit', '0.5'));
  const amount = parseFloat(req.body.amount) || minUsdt;
  if (amount < minUsdt) {
    return res.status(400).json({ error: `Minimum deposit is ${minUsdt} USDT` });
  }

  const txHash = (req.body.txHash || '').trim().slice(0, 128);

  const store = getStore();
  // prevent spam pending
  const pending = (store.deposits || []).find(d => d.user_id === req.user.id && d.status === 'pending');
  if (pending) {
    return res.status(400).json({ error: 'You already have a pending deposit. Wait for confirmation.' });
  }

  const id = nextId('deposits');
  const row = {
    id,
    user_id: req.user.id,
    amount,
    network: getSetting('usdt_deposit_network', 'BEP20'),
    to_address: depositAddress,
    tx_hash: txHash || null,
    status: 'pending',
    created_at: new Date().toISOString(),
    confirmed_at: null
  };
  store.deposits = store.deposits || [];
  store.deposits.push(row);
  saveStore();

  res.json({
    success: true,
    depositId: id,
    status: 'pending',
    message: 'Deposit submitted. It will be credited after verification.'
  });
});

/**
 * GET /api/wallet/deposits
 */
router.get('/deposits', requireAuth, (req, res) => {
  const store = getStore();
  const list = (store.deposits || [])
    .filter(d => d.user_id === req.user.id)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 30);
  res.json({ deposits: list });
});

/**
 * POST /api/wallet/withdraw
 * Withdraw TON or GRAM to linked wallet.
 * Requires: wallet linked + (usdt deposit unlocked OR admin force) + withdrawals_enabled
 */
router.post('/withdraw', requireAuth, (req, res) => {
  const withdrawalsEnabled = getSetting('withdrawals_enabled', 'false') === 'true';
  const minWithdraw = parseFloat(getSetting('min_withdraw', '1'));
  const minUsdt = parseFloat(getSetting('min_usdt_deposit', '0.5'));

  if (!withdrawalsEnabled) {
    return res.status(503).json({
      error: 'Withdrawals temporarily unavailable',
      message: 'The withdrawal window is currently closed. Check back when network payouts reopen.'
    });
  }

  const user = ensureUserBalances(db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id));
  if (!user.wallet_address) {
    return res.status(400).json({ error: 'Add your TON wallet first' });
  }

  const unlocked = !!user.withdraw_unlocked || (user.usdt_credited || 0) >= minUsdt;
  if (!unlocked) {
    return res.status(403).json({
      error: 'Deposit required',
      message: `Deposit ${minUsdt} USDT to unlock withdrawals`
    });
  }

  const asset = String(req.body.asset || 'TON').toUpperCase();
  if (!['TON', 'GRAM', 'HYPE'].includes(asset)) {
    return res.status(400).json({ error: 'Asset must be TON, GRAM or HYPE' });
  }

  const amount = parseFloat(req.body.amount);
  if (!amount || amount <= 0) {
    return res.status(400).json({ error: 'Invalid amount' });
  }

  const balKey = asset === 'TON' ? 'ton_balance' : asset === 'GRAM' ? 'gram_balance' : 'balance';
  const available = user[balKey] || 0;
  if (available < amount) {
    return res.status(400).json({ error: `Insufficient ${asset} balance` });
  }
  if (asset === 'HYPE' && amount < minWithdraw) {
    return res.status(400).json({ error: `Minimum HYPE withdrawal is ${minWithdraw}` });
  }

  try {
    const result = transaction(() => {
      const store = getStore();
      const u = store.users.find(x => x.id === user.id);
      if (!u || (u[balKey] || 0) < amount) throw new Error('Insufficient balance');

      u[balKey] = Number(((u[balKey] || 0) - amount).toFixed(8));
      u.updated_at = new Date().toISOString();

      const id = nextId('withdrawals');
      store.withdrawals.push({
        id,
        user_id: u.id,
        amount,
        asset,
        wallet_address: u.wallet_address,
        status: 'pending',
        tx_hash: null,
        admin_note: null,
        created_at: new Date().toISOString(),
        processed_at: null
      });
      saveStore();

      return { requestId: id, amount, asset, status: 'pending' };
    });

    res.json({
      success: true,
      ...result,
      message: 'Withdrawal request submitted. Processing after network confirmation.'
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * GET /api/wallet/history
 */
router.get('/history', requireAuth, (req, res) => {
  const store = getStore();
  const withdrawals = (store.withdrawals || [])
    .filter(w => w.user_id === req.user.id)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 50);
  res.json({ withdrawals });
});

module.exports = router;
