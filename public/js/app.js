/**
 * HYPE MINER — Frontend Application
 * Telegram Mini App client
 */
(function () {
  'use strict';

  const API = '/api';
  let token = localStorage.getItem('hype_token') || null;
  let user = null;
  let mineStatus = null;
  let cooldownTimer = null;

  // Telegram WebApp
  const tg = window.Telegram?.WebApp;
  if (tg) {
    tg.ready();
    tg.expand();
    tg.setHeaderColor('#060a12');
    tg.setBackgroundColor('#060a12');
  }

  // Helpers
  function $(sel) { return document.querySelector(sel); }
  function $$(sel) { return document.querySelectorAll(sel); }

  function toast(msg, type = '') {
    const el = $('#toast');
    el.textContent = msg;
    el.className = 'toast show ' + type;
    setTimeout(() => el.classList.remove('show'), 3200);
  }

  async function api(path, opts = {}) {
    const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    if (tg?.initData) headers['X-Telegram-Init-Data'] = tg.initData;

    const res = await fetch(API + path, {
      ...opts,
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || data.message || 'Request failed');
    return data;
  }

  // Auth
  async function authenticate() {
    // Existing token
    if (token) {
      try {
        const { user: u } = await api('/auth/me');
        user = u;
        return true;
      } catch (_) {
        token = null;
        localStorage.removeItem('hype_token');
      }
    }

    // Real Telegram Mini App
    if (tg?.initData) {
      try {
        const data = await api('/auth/telegram', {
          method: 'POST',
          body: { initData: tg.initData }
        });
        token = data.token;
        user = data.user;
        localStorage.setItem('hype_token', token);
        return true;
      } catch (err) {
        console.error(err);
        toast(err.message, 'error');
        return false;
      }
    }

    // Local preview session (Telegram open preferred)
    try {
      let clientId = localStorage.getItem('hype_client_id');
      if (!clientId) {
        clientId = 'c' + Math.random().toString(36).slice(2) + Date.now().toString(36);
        localStorage.setItem('hype_client_id', clientId);
      }
      const data = await api('/auth/session', {
        method: 'POST',
        body: { name: 'Miner', clientId }
      });
      token = data.token;
      user = data.user;
      localStorage.setItem('hype_token', token);
      return true;
    } catch (err) {
      $('#loading-screen .loading-text').textContent = 'Open HYPE Miner from Telegram';
      console.error(err);
      return false;
    }
  }

  // UI Updates
  function updateHeader() {
    if (!user) return;
    const name = user.firstName || user.username || 'Miner';
    $('#header-username').textContent = name;
    $('#header-level').textContent = 'Lvl ' + user.minerLevel;
    const av = $('#user-avatar');
    if (user.photoUrl) {
      av.innerHTML = `<img src="${user.photoUrl}" alt="" />`;
    } else {
      av.textContent = (name[0] || 'H').toUpperCase();
    }
  }

  function updateMineUI(status) {
    mineStatus = status;
    $('#balance').textContent = status.balance.toFixed(4);
    $('#holding').textContent = status.holdingBalance.toFixed(4);
    $('#mine-reward').textContent = '+' + status.settings.rate.toFixed(4);
    $('#token-symbol').textContent = status.settings.tokenSymbol;
    $('#mine-level').textContent = status.minerLevel;
    $('#mine-level-text').textContent = status.minerLevel;
    $('#energy-text').textContent = `${status.energy} / ${status.maxEnergy}`;
    const pct = Math.min(100, (status.energy / status.maxEnergy) * 100);
    $('#energy-fill').style.width = pct + '%';

    const btn = $('#mine-btn');
    if (status.canMine) {
      btn.disabled = false;
      $('#cooldown').textContent = 'Ready';
    } else {
      btn.disabled = true;
      if (status.cooldownRemaining > 0) {
        $('#cooldown').textContent = status.cooldownRemaining + 's';
        startCooldown(status.cooldownRemaining);
      } else if (status.energy < status.settings.energyCost) {
        $('#cooldown').textContent = 'Low energy';
      } else {
        $('#cooldown').textContent = 'Daily limit';
      }
    }

    if (status.holdingBalance > 0.01) {
      $('#claim-holding-btn').style.display = 'block';
    } else {
      $('#claim-holding-btn').style.display = 'none';
    }
  }

  function startCooldown(seconds) {
    if (cooldownTimer) clearInterval(cooldownTimer);
    let left = seconds;
    cooldownTimer = setInterval(() => {
      left--;
      if (left <= 0) {
        clearInterval(cooldownTimer);
        loadMineStatus();
      } else {
        $('#cooldown').textContent = left + 's';
      }
    }, 1000);
  }

  // Pages
  function showPage(name) {
    $$('.page').forEach(p => p.classList.remove('active'));
    $$('.nav-item').forEach(n => n.classList.remove('active'));
    const page = $('#page-' + name);
    if (page) page.classList.add('active');
    const nav = document.querySelector(`.nav-item[data-page="${name}"]`);
    if (nav) nav.classList.add('active');

    if (name === 'tasks') loadTasks();
    if (name === 'squad') loadSquad();
    if (name === 'market') loadMarket();
    if (name === 'profile') loadProfile();
    if (name === 'mine') loadMineStatus();
  }

  // Mine
  async function loadMineStatus() {
    try {
      const status = await api('/mine/status');
      updateMineUI(status);
      if (user) {
        user.balance = status.balance;
        user.holdingBalance = status.holdingBalance;
        user.minerLevel = status.minerLevel;
        user.energy = status.energy;
      }
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function doMine() {
    const btn = $('#mine-btn');
    if (btn.disabled) return;
    btn.classList.add('tapped');
    setTimeout(() => btn.classList.remove('tapped'), 200);

    try {
      const result = await api('/mine/tap', { method: 'POST' });
      toast(`+${result.reward.toFixed(4)} HYPE mined!`, 'success');
      // Haptic
      if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred('medium');
      await loadMineStatus();
    } catch (err) {
      toast(err.message, 'error');
      await loadMineStatus();
    }
  }

  async function claimHolding() {
    try {
      const result = await api('/mine/claim-holding', { method: 'POST' });
      toast(`Unlocked ${result.unlocked} HYPE`, 'success');
      await loadMineStatus();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  // Tasks
  async function loadTasks() {
    const list = $('#tasks-list');
    list.innerHTML = '<div class="empty-state">Loading…</div>';
    try {
      const { tasks } = await api('/tasks');
      if (!tasks.length) {
        list.innerHTML = '<div class="empty-state">No tasks available</div>';
        return;
      }
      list.innerHTML = tasks.map(t => {
        let action = '';
        if (t.status === 'claimed') {
          action = '<button class="btn secondary" disabled>Claimed</button>';
        } else if (t.status === 'completed') {
          action = `<button class="btn primary" data-claim="${t.id}">Claim</button>`;
        } else {
          action = `<button class="btn primary" data-complete="${t.id}">Go</button>`;
        }
        const icon = t.type === 'channel' ? '📢' : t.type === 'twitter' ? '𝕏' : t.type === 'ad' ? '▶' : '✓';
        return `
          <div class="task-item">
            <div class="task-icon">${icon}</div>
            <div class="task-body">
              <h4>${escapeHtml(t.title)}</h4>
              <p>${escapeHtml(t.description || '')}</p>
              <div class="task-reward">+${t.reward} HYPE</div>
            </div>
            <div class="task-action">${action}</div>
          </div>`;
      }).join('');

      list.querySelectorAll('[data-complete]').forEach(btn => {
        btn.addEventListener('click', () => completeTask(btn.dataset.complete));
      });
      list.querySelectorAll('[data-claim]').forEach(btn => {
        btn.addEventListener('click', () => claimTask(btn.dataset.claim));
      });
    } catch (err) {
      list.innerHTML = `<div class="empty-state">${escapeHtml(err.message)}</div>`;
    }
  }

  async function completeTask(id) {
    try {
      // For external links open them
      const { tasks } = await api('/tasks');
      const task = tasks.find(t => String(t.id) === String(id));
      if (task?.targetUrl) {
        if (tg?.openTelegramLink) tg.openTelegramLink(task.targetUrl);
        else if (tg?.openLink) tg.openLink(task.targetUrl);
        else window.open(task.targetUrl, '_blank');
      }
      await api(`/tasks/${id}/complete`, { method: 'POST' });
      toast('Task marked complete. Claim reward!', 'success');
      loadTasks();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function claimTask(id) {
    try {
      const result = await api(`/tasks/${id}/claim`, { method: 'POST' });
      toast(`+${result.reward} HYPE claimed!`, 'success');
      loadTasks();
      loadMineStatus();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  // Squad
  async function loadSquad() {
    try {
      const data = await api('/referral');
      $('#friends-count').textContent = data.friendsCount;
      $('#bonus-amount').textContent = '+' + data.bonusPerInvite;
      $('#commission-pct').textContent = data.commissionPct + '%';
      $('#invite-link').value = data.inviteLink;

      const list = $('#squad-list');
      if (!data.friends.length) {
        list.innerHTML = '<div class="empty-state">No friends yet. Share your link!</div>';
      } else {
        list.innerHTML = data.friends.map(f => `
          <div class="squad-member">
            <span>${escapeHtml(f.firstName || f.username || 'Miner')} · Lvl ${f.level}</span>
            <span style="color:var(--cyan)">+${f.commissionEarned}</span>
          </div>
        `).join('');
      }
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  // Market
  async function loadMarket() {
    const el = $('#market-content');
    try {
      const data = await api('/market');
      const n = data.network || {};
      const pct = n.minedPercent || 0;
      let priceBlock = '';
      if (data.price != null) {
        priceBlock = `
          <div class="stats-row" style="margin-bottom:16px">
            <div class="stat"><span class="stat-label">Live Price</span><span class="stat-value">$${escapeHtml(String(data.price))}</span></div>
            <div class="stat"><span class="stat-label">24h</span><span class="stat-value">${data.change24h != null ? data.change24h + '%' : '—'}</span></div>
            <div class="stat"><span class="stat-label">Volume</span><span class="stat-value">${data.volume24h != null ? escapeHtml(String(data.volume24h)) : '—'}</span></div>
          </div>`;
      }
      el.innerHTML = `
        <div class="pool-header">
          <div class="pool-title">
            <span class="live-dot"></span>
            <strong>${escapeHtml(data.symbol || 'HYPE')} Mining Pool</strong>
          </div>
          <span class="pool-badge">GLOBAL</span>
        </div>
        ${priceBlock}
        <div class="pool-cap">
          <div class="pool-row">
            <span>Community mined</span>
            <span class="cyan">${Number(n.totalMined || 0).toLocaleString()} ${escapeHtml(data.symbol || 'HYPE')}</span>
          </div>
          <div class="pool-bar"><div class="pool-fill" style="width:${pct}%"></div></div>
          <div class="pool-row muted-row">
            <span>${pct.toFixed(2)}% mined</span>
            <span>Target ${Number(n.targetCap || 0).toLocaleString()}</span>
          </div>
        </div>
        <div class="stats-row" style="margin-top:16px">
          <div class="stat">
            <span class="stat-label">Remaining</span>
            <span class="stat-value">${Number(n.remaining || 0).toLocaleString()}</span>
          </div>
          <div class="stat">
            <span class="stat-label">Miners</span>
            <span class="stat-value">${Number(n.activeMiners || 0).toLocaleString()}</span>
          </div>
          <div class="stat">
            <span class="stat-label">Status</span>
            <span class="stat-value">Live</span>
          </div>
        </div>`;
    } catch (err) {
      el.innerHTML = `<div class="empty-state">${escapeHtml(err.message)}</div>`;
    }
  }

  // Profile
  async function loadProfile() {
    try {
      const data = await api('/profile');
      const u = data.user;
      user = u;
      updateHeader();
      const name = u.firstName || u.username || 'Miner';
      $('#profile-name').textContent = name;
      $('#profile-id').textContent = 'ID ' + u.telegramId;
      $('#profile-balance').textContent = u.balance.toFixed(4);
      $('#profile-total').textContent = u.totalMined.toFixed(4);
      $('#profile-refs').textContent = data.referralCount;
      $('#profile-level').textContent = u.minerLevel;

      const av = $('#profile-avatar');
      if (u.photoUrl) av.innerHTML = `<img src="${u.photoUrl}" alt="" />`;
      else av.textContent = (name[0] || 'H').toUpperCase();

      if (u.walletAddress) {
        $('#wallet-status').textContent = 'Connected: ' + u.walletAddress.slice(0, 8) + '…' + u.walletAddress.slice(-6);
        $('#connect-wallet-btn').textContent = 'Update Wallet';
      } else {
        $('#wallet-status').textContent = 'Not connected';
        $('#connect-wallet-btn').textContent = 'Add / Update Wallet';
      }

      // Wallet overview (balances, deposit address, rates)
      try {
        const w = await api('/wallet/overview');
        const b = w.balances || {};
        if ($('#bal-hype')) $('#bal-hype').textContent = b.hype;
        if ($('#bal-ton')) $('#bal-ton').textContent = b.ton;
        if ($('#bal-gram')) $('#bal-gram').textContent = b.gram;
        if ($('#bal-usdt')) $('#bal-usdt').textContent = b.usdtCredited;
        if ($('#dep-min')) $('#dep-min').textContent = w.minUsdtDeposit;
        if ($('#deposit-address')) $('#deposit-address').value = w.deposit?.address || '';
        if ($('#deposit-network')) $('#deposit-network').textContent = 'Network: ' + (w.deposit?.network || '—');
        if ($('#unlock-status')) {
          $('#unlock-status').textContent = w.withdrawUnlocked
            ? 'Withdrawals unlocked'
            : 'Deposit ' + w.minUsdtDeposit + ' USDT to unlock withdrawals';
          $('#unlock-status').style.color = w.withdrawUnlocked ? 'var(--success)' : 'var(--muted)';
        }
      } catch (_) {}

      try {
        const rates = await api('/swap/rates');
        if ($('#swap-rates')) {
          $('#swap-rates').textContent =
            '1 HYPE = ' + rates.hypeToTon + ' TON · ' + rates.hypeToGram + ' GRAM (min ' + rates.minHype + ')';
        }
      } catch (_) {}
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  // Wallet connect (simple address prompt – real TON Connect can be added)
  function connectWallet() {
    const address = prompt('Enter your TON wallet address\n(EQ… or UQ… format)\n\nOnly the public address is stored.');
    if (!address) return;
    api('/wallet/address', { method: 'POST', body: { address: address.trim() } })
      .then(() => {
        toast('Wallet saved', 'success');
        loadProfile();
      })
      .catch(err => toast(err.message, 'error'));
  }

  function requestWithdraw() {
    const amount = parseFloat($('#withdraw-amount')?.value || 0);
    const asset = $('#withdraw-asset')?.value || 'TON';
    if (!amount) return toast('Enter amount', 'error');
    api('/wallet/withdraw', { method: 'POST', body: { amount, asset } })
      .then(data => {
        toast(data.message || 'Withdrawal submitted', 'success');
        loadProfile();
      })
      .catch(err => toast(err.message, 'error'));
  }

  async function doSwap(to) {
    const amount = parseFloat($('#swap-amount')?.value || 0);
    if (!amount) return toast('Enter HYPE amount', 'error');
    try {
      const r = await api('/swap', { method: 'POST', body: { amount, to } });
      toast(`Swapped ${r.swapped} HYPE → ${r.received} ${r.asset}`, 'success');
      loadProfile();
      loadMineStatus();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function submitDeposit() {
    const txHash = ($('#deposit-tx')?.value || '').trim();
    try {
      const r = await api('/wallet/deposit', { method: 'POST', body: { txHash } });
      toast(r.message || 'Deposit submitted', 'success');
      loadProfile();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // Events
  function bindEvents() {
    $$('.nav-item').forEach(btn => {
      btn.addEventListener('click', () => showPage(btn.dataset.page));
    });
    $('#mine-btn').addEventListener('click', doMine);
    $('#claim-holding-btn').addEventListener('click', claimHolding);
    $('#btn-refresh').addEventListener('click', () => {
      loadMineStatus();
      toast('Refreshed');
    });
    $('#copy-link').addEventListener('click', () => {
      const input = $('#invite-link');
      input.select();
      navigator.clipboard?.writeText(input.value).then(() => toast('Link copied!', 'success'));
    });
    $('#share-link').addEventListener('click', () => {
      const link = $('#invite-link').value;
      if (tg?.openTelegramLink) {
        tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent('Join HYPE MINER and earn with me!')}`);
      } else {
        navigator.share?.({ url: link, title: 'HYPE MINER' }).catch(() => {});
      }
    });
    $('#connect-wallet-btn').addEventListener('click', connectWallet);
    $('#withdraw-btn').addEventListener('click', requestWithdraw);
    const st = $('#swap-ton-btn'); if (st) st.addEventListener('click', () => doSwap('TON'));
    const sg = $('#swap-gram-btn'); if (sg) sg.addEventListener('click', () => doSwap('GRAM'));
    const sd = $('#submit-deposit-btn'); if (sd) sd.addEventListener('click', submitDeposit);
    const cd = $('#copy-deposit');
    if (cd) cd.addEventListener('click', () => {
      const v = $('#deposit-address')?.value;
      if (v) navigator.clipboard?.writeText(v).then(() => toast('Address copied', 'success'));
    });
  }

  // Boot
  async function init() {
    bindEvents();
    const ok = await authenticate();
    if (!ok) {
      // Keep loading screen with message
      return;
    }
    updateHeader();
    await loadMineStatus();
    $('#loading-screen').classList.remove('active');
    $('#main-app').classList.add('active');
  }

  init();
})();
