/**
 * HYPE MINER — Telegram Mini App client
 */
(function () {
  'use strict';

  const API = '/api';
  let token = localStorage.getItem('hype_token') || null;
  let adminToken = localStorage.getItem('hype_admin_token') || null;
  let user = null;
  let mineStatus = null;
  let cooldownTimer = null;
  let chartTf = '1h';
  let chartTimer = null;

  const tg = window.Telegram?.WebApp;
  if (tg) {
    tg.ready();
    tg.expand();
    try { tg.setHeaderColor('#050810'); tg.setBackgroundColor('#050810'); } catch (_) {}
  }

  function $(sel) { return document.querySelector(sel); }
  function $$(sel) { return document.querySelectorAll(sel); }

  function toast(msg, type = '') {
    const el = $('#toast');
    el.textContent = msg;
    el.className = 'toast show ' + type;
    setTimeout(() => el.classList.remove('show'), 3000);
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

  function setLoadingMessage(main, sub, showRetry) {
    const t = $('#loading-text') || $('#loading-screen .loading-text');
    const s = $('#loading-sub');
    const screen = $('#loading-screen');
    if (t) t.textContent = main || 'Initializing HYPE Miner…';
    if (s) s.textContent = sub || '';
    if (screen) {
      if (showRetry) screen.classList.add('show-retry');
      else screen.classList.remove('show-retry');
    }
  }

  async function authenticate() {
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
    if (tg?.initData) {
      try {
        const data = await api('/auth/telegram', { method: 'POST', body: { initData: tg.initData } });
        token = data.token;
        user = data.user;
        localStorage.setItem('hype_token', token);
        return true;
      } catch (err) {
        setLoadingMessage('Login failed', err.message || 'Telegram auth error', true);
        return false;
      }
    }
    try {
      let clientId = localStorage.getItem('hype_client_id');
      if (!clientId) {
        clientId = 'c' + Math.random().toString(36).slice(2) + Date.now().toString(36);
        localStorage.setItem('hype_client_id', clientId);
      }
      const data = await api('/auth/session', { method: 'POST', body: { name: 'Miner', clientId } });
      token = data.token;
      user = data.user;
      localStorage.setItem('hype_token', token);
      return true;
    } catch (err) {
      const msg = (err && err.message) || '';
      if (msg.includes('Telegram') || msg.includes('403') || msg.includes('Open HYPE')) {
        setLoadingMessage(
          'Open from Telegram',
          'This app only works inside Telegram. Open the bot link and launch HYPE Miner from there.',
          true
        );
      } else {
        setLoadingMessage(
          'Connection error',
          msg || 'Cannot reach server. Check network and try again.',
          true
        );
      }
      return false;
    }
  }

  function updateHeader() {
    if (!user) return;
    const name = user.firstName || user.username || 'Miner';
    $('#header-username').textContent = name;
    $('#header-level').textContent = 'Lvl ' + (user.minerLevel || 1);
    const av = $('#user-avatar');
    if (user.photoUrl) av.innerHTML = `<img src="${user.photoUrl}" alt="" />`;
    else av.textContent = (name[0] || 'H').toUpperCase();
  }

  function updateMineUI(status) {
    mineStatus = status;
    const bal = status.balance;
    const hold = status.holdingBalance;
    $('#balance').textContent = bal.toFixed(4);
    $('#holding').textContent = hold.toFixed(4) + ' HYPE';
    $('#mine-reward').textContent = '+' + status.settings.rate.toFixed(4);
    $('#tier-level').textContent = 'Level ' + status.minerLevel + ' / 1000';
    if ($('#mine-level')) $('#mine-level').textContent = status.minerLevel;
    if ($('#mine-level-text')) $('#mine-level-text').textContent = status.minerLevel;
    $('#energy-text').textContent = status.energy + ' / ' + status.maxEnergy;
    $('#energy-fill').style.width = Math.min(100, (status.energy / status.maxEnergy) * 100) + '%';
    $('#today-pnl').textContent = '+' + (status.dailyMined * status.settings.rate || 0).toFixed(4) + ' HYPE';
    // approx USD if market price available later
    const px = window.__hypePrice;
    if (px && $('#usd-approx')) {
      $('#usd-approx').textContent = '≈ $' + (bal * px).toFixed(4) + ' USD';
    }

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
    $('#claim-holding-btn').style.display = hold > 0.01 ? 'block' : 'none';
  }

  function startCooldown(seconds) {
    if (cooldownTimer) clearInterval(cooldownTimer);
    let left = seconds;
    cooldownTimer = setInterval(() => {
      left--;
      if (left <= 0) {
        clearInterval(cooldownTimer);
        loadMineStatus();
      } else $('#cooldown').textContent = left + 's';
    }, 1000);
  }

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
    if (name === 'admin') refreshAdminUI();
  }

  async function loadMineStatus() {
    try {
      const status = await api('/mine/status');
      updateMineUI(status);
      if (user) {
        user.balance = status.balance;
        user.holdingBalance = status.holdingBalance;
        user.minerLevel = status.minerLevel;
      }
    } catch (err) { toast(err.message, 'error'); }
  }

  async function doMine() {
    const btn = $('#mine-btn');
    if (btn.disabled) return;
    btn.classList.add('tapped');
    setTimeout(() => btn.classList.remove('tapped'), 180);
    try {
      const result = await api('/mine/tap', { method: 'POST' });
      toast('+' + result.reward.toFixed(4) + ' HYPE', 'success');
      if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred('medium');
      await loadMineStatus();
    } catch (err) {
      toast(err.message, 'error');
      await loadMineStatus();
    }
  }

  async function claimHolding() {
    try {
      const r = await api('/mine/claim-holding', { method: 'POST' });
      toast('Unlocked ' + r.unlocked + ' HYPE', 'success');
      await loadMineStatus();
    } catch (err) { toast(err.message, 'error'); }
  }

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
        if (t.status === 'claimed') action = '<button class="btn secondary" disabled>Done</button>';
        else if (t.status === 'completed') action = `<button class="btn primary" data-claim="${t.id}">Claim</button>`;
        else action = `<button class="btn primary" data-complete="${t.id}">Go</button>`;
        const icon =
          t.type === 'channel' ? '📢' :
          t.type === 'youtube' ? '▶' :
          t.type === 'twitter' ? '𝕏' :
          t.type === 'ad' ? '📺' : '✓';
        return `<div class="task-item">
          <div class="task-icon">${icon}</div>
          <div class="task-body"><h4>${esc(t.title)}</h4><p>${esc(t.description || '')}</p>
          <div class="task-reward">+${t.reward} HYPE</div></div>
          <div class="task-action">${action}</div></div>`;
      }).join('');
      list.querySelectorAll('[data-complete]').forEach(b => b.addEventListener('click', () => completeTask(b.dataset.complete)));
      list.querySelectorAll('[data-claim]').forEach(b => b.addEventListener('click', () => claimTask(b.dataset.claim)));
    } catch (err) {
      list.innerHTML = `<div class="empty-state">${esc(err.message)}</div>`;
    }
  }

  async function completeTask(id) {
    try {
      const { tasks } = await api('/tasks');
      const task = tasks.find(t => String(t.id) === String(id));
      if (task?.targetUrl) {
        const url = task.targetUrl;
        const isTg = /t\.me\//i.test(url) || url.startsWith('tg://');
        if (isTg && tg?.openTelegramLink) tg.openTelegramLink(url);
        else if (tg?.openLink) tg.openLink(url);
        else window.open(url, '_blank');
      }
      await api('/tasks/' + id + '/complete', { method: 'POST' });
      toast('Task complete — claim reward', 'success');
      loadTasks();
    } catch (err) { toast(err.message, 'error'); }
  }

  async function claimTask(id) {
    try {
      const r = await api('/tasks/' + id + '/claim', { method: 'POST' });
      toast('+' + r.reward + ' HYPE', 'success');
      loadTasks();
      loadMineStatus();
    } catch (err) { toast(err.message, 'error'); }
  }

  async function loadSquad() {
    try {
      const data = await api('/referral');
      $('#friends-count').textContent = data.friendsCount;
      $('#bonus-amount').textContent = '+' + data.bonusPerInvite;
      $('#commission-pct').textContent = data.commissionPct + '%';
      $('#invite-link').value = data.inviteLink;
      if ($('#squad-miners')) $('#squad-miners').textContent = data.friendsCount + ' miners';
      const list = $('#squad-list');
      if (!data.friends.length) {
        list.innerHTML = '<div class="empty-state">No friends yet. Share your link!</div>';
      } else {
        list.innerHTML = data.friends.map(f =>
          `<div class="squad-member"><span>${esc(f.firstName || f.username || 'Miner')} · Lvl ${f.level}</span>
           <span style="color:var(--cyan)">+${f.commissionEarned}</span></div>`
        ).join('');
      }
    } catch (err) { toast(err.message, 'error'); }
  }

  /** Live-looking HYPE chart (visual). Uses API price when available. */
  function drawChart(seedPrice) {
    const canvas = $('#hype-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 360;
    const h = 160;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const points = 48;
    const base = seedPrice || 0.024;
    const data = [];
    let v = base * (0.92 + Math.random() * 0.08);
    const t = Date.now() / 1000;
    for (let i = 0; i < points; i++) {
      const wave = Math.sin((i + t / 8) * 0.35) * 0.0015 + Math.sin((i + t / 5) * 0.12) * 0.001;
      v = Math.max(0.01, v + wave + (Math.random() - 0.48) * 0.0008);
      data.push(v);
    }
    const min = Math.min(...data) * 0.995;
    const max = Math.max(...data) * 1.005;
    const range = max - min || 0.001;

    // grid
    ctx.strokeStyle = 'rgba(0,232,255,0.06)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
      const y = (h / 4) * i;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    // area fill
    const path = new Path2D();
    data.forEach((p, i) => {
      const x = (i / (points - 1)) * w;
      const y = h - ((p - min) / range) * (h - 16) - 8;
      if (i === 0) path.moveTo(x, y);
      else path.lineTo(x, y);
    });
    const lastX = w;
    const lastY = h - ((data[data.length - 1] - min) / range) * (h - 16) - 8;
    ctx.beginPath();
    data.forEach((p, i) => {
      const x = (i / (points - 1)) * w;
      const y = h - ((p - min) / range) * (h - 16) - 8;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.lineTo(lastX, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(0,232,255,0.28)');
    grad.addColorStop(1, 'rgba(0,232,255,0.01)');
    ctx.fillStyle = grad;
    ctx.fill();

    // line
    ctx.beginPath();
    data.forEach((p, i) => {
      const x = (i / (points - 1)) * w;
      const y = h - ((p - min) / range) * (h - 16) - 8;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = '#00e8ff';
    ctx.lineWidth = 2.2;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // end dot
    ctx.beginPath();
    ctx.arc(lastX - 2, lastY, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#00e8ff';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,232,255,0.4)';
    ctx.lineWidth = 6;
    ctx.stroke();

    return data[data.length - 1];
  }

  async function loadMarket() {
    try {
      const data = await api('/market');
      const n = data.network || {};
      let price = data.price != null ? Number(data.price) : null;
      // visual live price derived from pool activity when no external feed
      if (price == null) {
        const base = 0.022 + Math.min(0.02, (n.minedPercent || 0) / 5000);
        price = base;
      }
      window.__hypePrice = price;
      const change = data.change24h != null ? data.change24h : (Math.random() * 4 - 1).toFixed(2);
      const high = (price * 1.04).toFixed(4);
      const low = (price * 0.92).toFixed(4);
      const cap = data.marketCap != null ? data.marketCap : Math.round((n.targetCap || 2e6) * price);
      const vol = data.volume24h != null ? data.volume24h : Math.round(cap * 0.2);

      if ($('#m-price')) {
        $('#m-price').innerHTML = '$' + price.toFixed(4) +
          ' <span style="color:var(--green);font-size:12px">+' + change + '%</span>';
      }
      if ($('#m-cap')) $('#m-cap').textContent = '$' + Number(cap).toLocaleString();
      if ($('#m-vol')) $('#m-vol').textContent = '$' + Number(vol).toLocaleString();
      if ($('#m-hl')) $('#m-hl').innerHTML = '$' + high + ' / <span style="color:#ff6b6b">$' + low + '</span>';

      if ($('#pool-mini')) {
        $('#pool-mini').textContent =
          'Pool ' + (n.minedPercent || 0).toFixed(2) + '% mined · ' +
          Number(n.totalMined || 0).toLocaleString() + ' HYPE · ' +
          (n.activeMiners || 0) + ' miners';
      }

      drawChart(price);
      if (chartTimer) clearInterval(chartTimer);
      chartTimer = setInterval(() => drawChart(window.__hypePrice || price), 2500);
    } catch (err) {
      if ($('#pool-mini')) $('#pool-mini').textContent = err.message;
    }
  }

  async function loadProfile() {
    try {
      const data = await api('/profile');
      const u = data.user;
      user = u;
      updateHeader();
      const name = u.firstName || u.username || 'Miner';
      $('#profile-name').textContent = name;
      $('#profile-id').textContent = '@' + (u.username || 'miner') + ' · ID ' + u.telegramId;
      $('#profile-balance').textContent = u.balance.toFixed(4);
      if ($('#profile-holding')) $('#profile-holding').textContent = (u.holdingBalance || 0).toFixed(4) + ' HYPE';
      $('#profile-total').textContent = u.totalMined.toFixed(4);
      if ($('#mine-level')) $('#mine-level').textContent = u.minerLevel;
      if ($('#mine-level-text')) $('#mine-level-text').textContent = u.minerLevel;
      const av = $('#profile-avatar');
      if (u.photoUrl) av.innerHTML = `<img src="${u.photoUrl}" alt="" />`;
      else av.textContent = (name[0] || 'H').toUpperCase();

      if (u.walletAddress) {
        $('#wallet-status').textContent = 'Connected: ' + u.walletAddress.slice(0, 8) + '…' + u.walletAddress.slice(-6);
        const btn = $('#connect-wallet-btn');
        if (btn) {
          btn.innerHTML = '<img src="/assets/ton.svg" alt="" class="btn-logo" /> UPDATE WALLET';
        }
      } else {
        $('#wallet-status').textContent = 'Wallet not connected';
        const btn = $('#connect-wallet-btn');
        if (btn) {
          btn.innerHTML = '<img src="/assets/ton.svg" alt="" class="btn-logo" /> CONNECT WALLET';
        }
      }

      if ($('#verify-label')) {
        if (u.isVerified) {
          $('#verify-label').textContent = 'VERIFIED';
          $('#verify-label').style.color = 'var(--green)';
        } else {
          $('#verify-label').textContent = 'NOT VERIFIED';
          $('#verify-label').style.color = '';
        }
      }

      try {
        const w = await api('/wallet/overview');
        const b = w.balances || {};
        if ($('#bal-hype')) $('#bal-hype').textContent = b.hype;
        if ($('#bal-ton')) $('#bal-ton').textContent = b.ton;
        if ($('#bal-gram')) $('#bal-gram').textContent = b.gram;
        if ($('#bal-usdt')) $('#bal-usdt').textContent = b.usdtCredited;

        // TON treasury — 0.1 TON verification
        const tv = w.tonVerify || {};
        if ($('#ton-treasury-address')) $('#ton-treasury-address').value = tv.address || '';
        if ($('#ton-verify-amt')) {
          $('#ton-verify-amt').textContent = (tv.amount != null ? tv.amount : 0.1) + ' TON';
        }
        if ($('#ton-verify-status')) {
          if (w.isVerified || u.isVerified) {
            $('#ton-verify-status').textContent = 'Verified ✓';
          } else if (!tv.address) {
            $('#ton-verify-status').textContent = 'TON treasury not set by admin yet';
          } else if (!u.walletAddress) {
            $('#ton-verify-status').textContent = 'Connect wallet first, then pay 0.1 TON';
          } else {
            $('#ton-verify-status').textContent = 'Send 0.1 TON to treasury, paste TX, wait for admin confirm';
          }
        }

        // USDT treasury — 0.5 USDT unlock withdrawals
        if ($('#dep-min')) $('#dep-min').textContent = w.minUsdtDeposit;
        if ($('#deposit-address')) $('#deposit-address').value = w.deposit?.address || '';
        if ($('#deposit-network')) {
          $('#deposit-network').textContent =
            'Network: ' + (w.deposit?.network || 'BEP20') + ' · USDT Treasury';
        }
        if ($('#deposit-amount-hint') && w.minUsdtDeposit != null) {
          $('#deposit-amount-hint').innerHTML =
            'Amount: <strong>' + w.minUsdtDeposit + ' USDT</strong> only';
        }
        if ($('#unlock-status')) {
          $('#unlock-status').textContent = w.withdrawUnlocked
            ? 'Withdrawals unlocked ✓'
            : 'Pay ' + w.minUsdtDeposit + ' USDT to USDT treasury after swap, then submit TX';
        }
      } catch (_) {}

      try {
        const rates = await api('/swap/rates');
        if ($('#swap-rates')) {
          $('#swap-rates').textContent =
            '1 HYPE = ' + rates.hypeToTon + ' TON · ' + rates.hypeToGram + ' HYPE GRAM';
        }
      } catch (_) {}
    } catch (err) { toast(err.message, 'error'); }
  }

  function openWalletModal() {
    const modal = $('#wallet-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    const manual = $('#wm-manual');
    if (manual) manual.classList.add('hidden');
  }

  function closeWalletModal() {
    const modal = $('#wallet-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
  }

  function saveWalletAddress(address) {
    const trimmed = (address || '').trim();
    if (!trimmed) return toast('Enter wallet address', 'error');
    if (!trimmed.startsWith('EQ') && !trimmed.startsWith('UQ') && !trimmed.startsWith('0:')) {
      return toast('TON address must start with EQ…, UQ… or 0:', 'error');
    }
    api('/wallet/address', { method: 'POST', body: { address: trimmed } })
      .then(() => {
        toast('Wallet connected', 'success');
        closeWalletModal();
        loadProfile();
      })
      .catch(err => toast(err.message, 'error'));
  }

  function connectWallet() {
    // TON Connect–style sheet instead of browser prompt
    openWalletModal();
  }

  function openExternalWallet(kind) {
    // Deep-links / guides — user returns and pastes address, or uses Telegram Wallet
    const links = {
      telegram: 'https://t.me/wallet',
      tonkeeper: 'https://tonkeeper.com',
      mytonwallet: 'https://mytonwallet.io'
    };
    if (kind === 'manual') {
      const manual = $('#wm-manual');
      if (manual) manual.classList.remove('hidden');
      const inp = $('#wm-address-input');
      if (inp) setTimeout(() => inp.focus(), 50);
      return;
    }
    const url = links[kind];
    if (url && tg?.openLink) {
      tg.openLink(url);
      toast('Open your wallet app, copy address, then tap Paste address', 'success');
    } else if (url) {
      window.open(url, '_blank');
      toast('Copy your TON address, then use Paste address', 'success');
    }
    const manual = $('#wm-manual');
    if (manual) manual.classList.remove('hidden');
  }

  function requestWithdraw() {
    const amount = parseFloat($('#withdraw-amount')?.value || 0);
    const asset = $('#withdraw-asset')?.value || 'TON';
    if (!amount) return toast('Enter amount', 'error');
    api('/wallet/withdraw', { method: 'POST', body: { amount, asset } })
      .then(data => { toast(data.message || 'Submitted', 'success'); loadProfile(); })
      .catch(err => toast(err.message, 'error'));
  }

  async function doSwap(to) {
    const amount = parseFloat($('#swap-amount')?.value || 0);
    if (!amount) return toast('Enter HYPE amount', 'error');
    try {
      const r = await api('/swap', { method: 'POST', body: { amount, to } });
      toast('Swapped ' + r.swapped + ' → ' + r.received + ' ' + r.asset, 'success');
      loadProfile();
      loadMineStatus();
    } catch (err) { toast(err.message, 'error'); }
  }

  async function submitDeposit() {
    const txHash = ($('#deposit-tx')?.value || '').trim();
    if (!txHash) return toast('Enter USDT transaction hash', 'error');
    try {
      const r = await api('/wallet/deposit', { method: 'POST', body: { txHash } });
      toast(r.message || 'USDT deposit submitted', 'success');
      loadProfile();
    } catch (err) { toast(err.message, 'error'); }
  }

  async function submitTonVerify() {
    const txHash = ($('#ton-verify-tx')?.value || '').trim();
    if (!txHash) return toast('Enter TON transaction hash', 'error');
    try {
      const r = await api('/wallet/verify-ton', { method: 'POST', body: { txHash } });
      toast(r.message || 'TON verification submitted', 'success');
      loadProfile();
    } catch (err) { toast(err.message, 'error'); }
  }

  function esc(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function bindEvents() {
    $$('.nav-item').forEach(btn => btn.addEventListener('click', () => showPage(btn.dataset.page)));
    $('#mine-btn').addEventListener('click', doMine);
    $('#claim-holding-btn').addEventListener('click', claimHolding);
    $('#copy-link').addEventListener('click', () => {
      const v = $('#invite-link').value;
      navigator.clipboard?.writeText(v).then(() => toast('Link copied', 'success'));
    });
    $('#share-link').addEventListener('click', () => {
      const link = $('#invite-link').value;
      if (tg?.openTelegramLink) {
        tg.openTelegramLink('https://t.me/share/url?url=' + encodeURIComponent(link) + '&text=' + encodeURIComponent('Join HYPE Miner'));
      }
    });
    $('#connect-wallet-btn').addEventListener('click', connectWallet);
    $('#withdraw-btn').addEventListener('click', requestWithdraw);
    const st = $('#swap-ton-btn'); if (st) st.addEventListener('click', () => doSwap('TON'));
    const sg = $('#swap-gram-btn'); if (sg) sg.addEventListener('click', () => doSwap('GRAM'));
    const sd = $('#submit-deposit-btn'); if (sd) sd.addEventListener('click', submitDeposit);
    const stv = $('#submit-ton-verify-btn'); if (stv) stv.addEventListener('click', submitTonVerify);
    const cd = $('#copy-deposit');
    if (cd) cd.addEventListener('click', () => {
      const v = $('#deposit-address')?.value;
      if (v) navigator.clipboard?.writeText(v).then(() => toast('USDT treasury copied', 'success'));
      else toast('USDT treasury not set by admin yet', 'error');
    });
    const ct = $('#copy-ton-treasury');
    if (ct) ct.addEventListener('click', () => {
      const v = $('#ton-treasury-address')?.value;
      if (v) navigator.clipboard?.writeText(v).then(() => toast('TON treasury copied', 'success'));
      else toast('TON treasury not set by admin yet', 'error');
    });
    const jc = $('#btn-connect-wallet-jump');
    if (jc) jc.addEventListener('click', () => {
      showPage('profile');
      setTimeout(() => openWalletModal(), 120);
    });
    const jw = $('#btn-withdraw-jump');
    if (jw) jw.addEventListener('click', () => showPage('profile'));

    // Wallet modal
    const wClose = $('#wallet-modal-close');
    if (wClose) wClose.addEventListener('click', closeWalletModal);
    const wBack = $('#wallet-modal-backdrop');
    if (wBack) wBack.addEventListener('click', closeWalletModal);
    const wTg = $('#wm-telegram');
    if (wTg) wTg.addEventListener('click', () => openExternalWallet('telegram'));
    $$('.wm-app').forEach(btn => {
      btn.addEventListener('click', () => openExternalWallet(btn.dataset.wallet));
    });
    const wSub = $('#wm-submit-address');
    if (wSub) wSub.addEventListener('click', () => saveWalletAddress($('#wm-address-input')?.value));

    $$('#tf-row button').forEach(b => {
      b.addEventListener('click', () => {
        $$('#tf-row button').forEach(x => x.classList.remove('on'));
        b.classList.add('on');
        chartTf = b.dataset.tf;
        drawChart(window.__hypePrice);
      });
    });

    // In-app Admin HQ
    const openAdmin = $('#btn-open-admin');
    if (openAdmin) openAdmin.addEventListener('click', () => showPage('admin'));
    const adminLoginBtn = $('#admin-login-btn');
    if (adminLoginBtn) adminLoginBtn.addEventListener('click', adminLogin);
    const adminLogoutBtn = $('#admin-logout-btn');
    if (adminLogoutBtn) adminLogoutBtn.addEventListener('click', adminLogout);
    $$('#admin-tabs .pill-btn[data-atab]').forEach(b => {
      b.addEventListener('click', () => showAdminTab(b.dataset.atab));
    });
    const saveSet = $('#admin-save-settings');
    if (saveSet) saveSet.addEventListener('click', saveAdminSettings);
    const addTaskBtn = $('#admin-add-task');
    if (addTaskBtn) addTaskBtn.addEventListener('click', adminAddTask);
    const userSearch = $('#admin-user-search');
    if (userSearch) {
      let t;
      userSearch.addEventListener('input', () => {
        clearTimeout(t);
        t = setTimeout(loadAdminUsers, 300);
      });
    }
    // deposit confirm/reject + withdrawal + task toggle (event delegation)
    document.addEventListener('click', async (ev) => {
      const t = ev.target;
      if (!(t instanceof HTMLElement)) return;
      const conf = t.getAttribute('data-confirm-dep');
      const rej = t.getAttribute('data-reject-dep');
      const wdOk = t.getAttribute('data-wd-ok');
      const wdNo = t.getAttribute('data-wd-no');
      const taskToggle = t.getAttribute('data-task-toggle');
      try {
        if (conf) {
          await adminApi('/deposits/' + conf, { method: 'PATCH', body: { status: 'confirmed' } });
          toast('Deposit confirmed', 'success');
          loadAdminDeposits();
          loadAdminStats();
        } else if (rej) {
          await adminApi('/deposits/' + rej, { method: 'PATCH', body: { status: 'rejected' } });
          toast('Deposit rejected', 'success');
          loadAdminDeposits();
        } else if (wdOk) {
          await adminApi('/withdrawals/' + wdOk, { method: 'PATCH', body: { status: 'completed' } });
          toast('Withdrawal marked paid', 'success');
          loadAdminWithdrawals();
          loadAdminStats();
        } else if (wdNo) {
          await adminApi('/withdrawals/' + wdNo, { method: 'PATCH', body: { status: 'rejected' } });
          toast('Withdrawal rejected', 'success');
          loadAdminWithdrawals();
        } else if (taskToggle) {
          const isActive = t.getAttribute('data-active') === '1';
          await adminApi('/tasks/' + taskToggle, { method: 'PUT', body: { isActive } });
          toast(isActive ? 'Task enabled' : 'Task disabled', 'success');
          loadAdminTasks();
        }
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  }

  async function bootApp() {
    updateHeader();
    try {
      await loadMineStatus();
    } catch (err) {
      console.warn('mine status', err);
    }
    // restore in-app admin session if token still valid
    if (adminToken) {
      try {
        await adminApi('/stats');
        setAdminLoggedIn(true);
      } catch (_) {
        adminToken = null;
        localStorage.removeItem('hype_admin_token');
        setAdminLoggedIn(false);
      }
    }
    const loading = $('#loading-screen');
    const main = $('#main-app');
    if (loading) loading.classList.remove('active');
    if (main) main.classList.add('active');
  }

  /* ========== In-app Admin HQ ========== */
  const ADMIN_SETTING_LABELS = {
    mining_rate: 'Mining rate (HYPE/tap)',
    mine_cooldown_seconds: 'Cooldown (sec)',
    energy_cost_per_mine: 'Energy per mine',
    energy_regen_per_hour: 'Energy regen / hour',
    daily_mine_limit: 'Daily mine limit',
    min_hype_swap: 'Min HYPE to swap',
    hype_to_ton_rate: 'HYPE → TON rate',
    hype_to_gram_rate: 'HYPE → GRAM rate',
    min_usdt_deposit: 'Min USDT unlock (0.5)',
    usdt_deposit_address: 'USDT treasury address',
    usdt_deposit_network: 'USDT network (BEP20/TRC20)',
    treasury_wallet: 'TON treasury (0.1 TON verify)',
    ton_verify_amount: 'TON verify amount (0.1)',
    ton_verify_enabled: 'TON verify open (true/false)',
    min_withdraw: 'Min HYPE withdraw',
    withdrawals_enabled: 'Withdrawals open (true/false)',
    swap_enabled: 'Swap open (true/false)',
    deposit_enabled: 'USDT deposits open (true/false)',
    referral_bonus: 'Referral bonus HYPE',
    referral_commission_pct: 'Referral %',
    target_cap: 'Pool target cap',
    token_symbol: 'Token symbol',
    app_name: 'App name',
    mining_pause_hours: 'Pause notify hours (8)',
    mining_pause_notify_enabled: 'Pause notify on (true/false)',
    community_channel_url: 'Join Community URL',
    webapp_url: 'Mini App URL'
  };

  async function adminApi(path, opts = {}) {
    const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
    if (adminToken) headers['Authorization'] = 'Bearer ' + adminToken;
    const res = await fetch(API + '/admin' + path, {
      ...opts,
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || data.message || 'Admin request failed');
    return data;
  }

  function setAdminLoggedIn(on) {
    const login = $('#admin-login-card');
    const panel = $('#admin-panel');
    const nav = $('#nav-admin');
    if (login) login.classList.toggle('hidden', !!on);
    if (panel) panel.classList.toggle('hidden', !on);
    if (nav) nav.classList.toggle('hidden', !on);
  }

  function refreshAdminUI() {
    if (!adminToken) {
      setAdminLoggedIn(false);
      return;
    }
    setAdminLoggedIn(true);
    const active = document.querySelector('#admin-tabs .pill-btn.on');
    const tab = active?.dataset?.atab || 'dash';
    showAdminTab(tab);
  }

  function showAdminTab(name) {
    $$('#admin-tabs .pill-btn[data-atab]').forEach(b => {
      b.classList.toggle('on', b.dataset.atab === name);
    });
    $$('.admin-tab').forEach(el => el.classList.add('hidden'));
    const pane = $('#atab-' + name);
    if (pane) pane.classList.remove('hidden');
    if (name === 'dash') loadAdminStats();
    if (name === 'settings') loadAdminSettings();
    if (name === 'tasks') loadAdminTasks();
    if (name === 'deposits') loadAdminDeposits();
    if (name === 'withdrawals') loadAdminWithdrawals();
    if (name === 'users') loadAdminUsers();
  }

  async function adminLogin() {
    const username = ($('#admin-user')?.value || '').trim();
    const password = $('#admin-pass')?.value || '';
    const msg = $('#admin-login-msg');
    if (!username || !password) {
      if (msg) msg.textContent = 'Enter username & password';
      return;
    }
    try {
      const res = await fetch(API + '/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Login failed');
      adminToken = data.token;
      localStorage.setItem('hype_admin_token', adminToken);
      if (msg) msg.textContent = '';
      setAdminLoggedIn(true);
      showAdminTab('dash');
      toast('HQ logged in', 'success');
    } catch (err) {
      if (msg) msg.textContent = err.message;
      toast(err.message, 'error');
    }
  }

  function adminLogout() {
    adminToken = null;
    localStorage.removeItem('hype_admin_token');
    setAdminLoggedIn(false);
    toast('HQ logged out', 'success');
  }

  async function loadAdminStats() {
    const el = $('#admin-stats');
    if (!el) return;
    try {
      const s = await adminApi('/stats');
      el.innerHTML =
        '<div class="admin-stat"><b>' + (s.users || 0) + '</b><span>Users</span></div>' +
        '<div class="admin-stat"><b>' + (s.totalMined || 0) + '</b><span>Total mined</span></div>' +
        '<div class="admin-stat"><b>' + (s.totalBalance || 0) + '</b><span>Balances</span></div>' +
        '<div class="admin-stat"><b>' + (s.pendingWithdrawals || 0) + '</b><span>Pending WD</span></div>';
    } catch (err) {
      el.textContent = err.message;
    }
  }

  async function loadAdminSettings() {
    const form = $('#admin-settings-form');
    if (!form) return;
    try {
      const { settings } = await adminApi('/settings');
      form.innerHTML = Object.keys(ADMIN_SETTING_LABELS).map(k => {
        const v = settings[k] != null ? String(settings[k]) : '';
        return '<div><label>' + ADMIN_SETTING_LABELS[k] + '</label>' +
          '<input data-key="' + k + '" value="' + esc(v) + '" /></div>';
      }).join('');
    } catch (err) {
      form.innerHTML = '<p class="muted">' + esc(err.message) + '</p>';
    }
  }

  async function saveAdminSettings() {
    const updates = {};
    $$('#admin-settings-form input').forEach(i => {
      updates[i.dataset.key] = i.value;
    });
    const msg = $('#admin-settings-msg');
    try {
      await adminApi('/settings', { method: 'PUT', body: updates });
      if (msg) msg.textContent = 'Saved ✓';
      toast('Settings saved', 'success');
    } catch (err) {
      if (msg) msg.textContent = err.message;
      toast(err.message, 'error');
    }
  }

  async function loadAdminDeposits() {
    const el = $('#admin-deposits-list');
    if (!el) return;
    try {
      const { deposits } = await adminApi('/deposits?status=pending');
      if (!deposits || !deposits.length) {
        el.innerHTML = '<p class="muted">No pending deposits</p>';
        return;
      }
      el.innerHTML = deposits.map(d => {
        const who = d.username || d.first_name || d.telegram_id || d.user_id;
        const asset = d.asset || 'USDT';
        const purpose = d.purpose || (asset === 'TON' ? 'verify' : 'unlock');
        return '<div class="admin-row" data-dep="' + d.id + '">' +
          '<div class="ar-top"><strong>#' + d.id + ' · ' + esc(String(who)) + '</strong>' +
          '<span>' + d.amount + ' ' + asset + '</span></div>' +
          '<div class="ar-meta">' + purpose + ' · ' + esc((d.tx_hash || '—').slice(0, 40)) +
          ' · ' + esc((d.created_at || '').slice(0, 16)) + '</div>' +
          '<div class="ar-actions">' +
          '<button type="button" class="btn ok" data-confirm-dep="' + d.id + '">Confirm</button>' +
          '<button type="button" class="btn bad" data-reject-dep="' + d.id + '">Reject</button>' +
          '</div></div>';
      }).join('');
    } catch (err) {
      el.innerHTML = '<p class="muted">' + esc(err.message) + '</p>';
    }
  }

  async function loadAdminWithdrawals() {
    const el = $('#admin-withdrawals-list');
    if (!el) return;
    try {
      const { withdrawals } = await adminApi('/withdrawals?status=pending');
      if (!withdrawals || !withdrawals.length) {
        el.innerHTML = '<p class="muted">No pending withdrawals</p>';
        return;
      }
      el.innerHTML = withdrawals.map(w => {
        const who = w.username || w.first_name || w.telegram_id || w.user_id;
        return '<div class="admin-row">' +
          '<div class="ar-top"><strong>#' + w.id + ' · ' + esc(String(who)) + '</strong>' +
          '<span>' + w.amount + ' ' + (w.asset || '') + '</span></div>' +
          '<div class="ar-meta">' + esc(w.wallet_address || '') + '</div>' +
          '<div class="ar-actions">' +
          '<button type="button" class="btn ok" data-wd-ok="' + w.id + '">Paid</button>' +
          '<button type="button" class="btn bad" data-wd-no="' + w.id + '">Reject</button>' +
          '</div></div>';
      }).join('');
    } catch (err) {
      el.innerHTML = '<p class="muted">' + esc(err.message) + '</p>';
    }
  }

  async function loadAdminUsers() {
    const el = $('#admin-users-list');
    if (!el) return;
    const q = ($('#admin-user-search')?.value || '').trim();
    try {
      const path = q ? '/users?q=' + encodeURIComponent(q) : '/users';
      const { users } = await adminApi(path);
      if (!users || !users.length) {
        el.innerHTML = '<p class="muted">No users</p>';
        return;
      }
      el.innerHTML = users.slice(0, 40).map(u => {
        return '<div class="admin-row">' +
          '<div class="ar-top"><strong>' + esc(u.username || u.first_name || 'user') + '</strong>' +
          '<span>' + Number(u.balance || 0).toFixed(2) + ' HYPE</span></div>' +
          '<div class="ar-meta">TG ' + esc(String(u.telegram_id || '')) +
          ' · Lvl ' + (u.miner_level || 1) +
          (u.is_verified ? ' · ✓' : '') +
          (u.is_banned ? ' · BANNED' : '') + '</div></div>';
      }).join('');
    } catch (err) {
      el.innerHTML = '<p class="muted">' + esc(err.message) + '</p>';
    }
  }

  async function loadAdminTasks() {
    const el = $('#admin-tasks-list');
    if (!el) return;
    try {
      const { tasks } = await adminApi('/tasks');
      if (!tasks || !tasks.length) {
        el.innerHTML = '<p class="muted">No tasks yet — add YouTube / channel above</p>';
        return;
      }
      el.innerHTML = tasks.map(t => {
        const active = t.is_active !== 0 && t.is_active !== false;
        return '<div class="admin-row">' +
          '<div class="ar-top"><strong>#' + t.id + ' · ' + esc(t.title) + '</strong>' +
          '<span>+' + t.reward + ' · ' + esc(t.type || '') + '</span></div>' +
          '<div class="ar-meta">' + esc(t.target_url || t.targetUrl || '—') +
          (active ? ' · ON' : ' · OFF') + '</div>' +
          '<div class="ar-actions">' +
          '<button type="button" class="btn ' + (active ? 'bad' : 'ok') + '" data-task-toggle="' + t.id + '" data-active="' + (active ? '0' : '1') + '">' +
          (active ? 'Disable' : 'Enable') + '</button>' +
          '</div></div>';
      }).join('');
    } catch (err) {
      el.innerHTML = '<p class="muted">' + esc(err.message) + '</p>';
    }
  }

  async function adminAddTask() {
    const title = ($('#atask-title')?.value || '').trim();
    const description = ($('#atask-desc')?.value || '').trim();
    const reward = parseFloat($('#atask-reward')?.value || '0');
    const type = $('#atask-type')?.value || 'youtube';
    const targetUrl = ($('#atask-url')?.value || '').trim();
    const channelId = ($('#atask-channel')?.value || '').trim() || null;
    if (!title || !reward) return toast('Title and reward required', 'error');
    if ((type === 'youtube' || type === 'channel' || type === 'twitter') && !targetUrl) {
      return toast('URL required for this task type', 'error');
    }
    try {
      await adminApi('/tasks', {
        method: 'POST',
        body: { title, description, reward, type, targetUrl, channelId, sortOrder: 10 }
      });
      toast('Task added', 'success');
      if ($('#atask-title')) $('#atask-title').value = '';
      if ($('#atask-desc')) $('#atask-desc').value = '';
      if ($('#atask-url')) $('#atask-url').value = '';
      loadAdminTasks();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  let eventsBound = false;
  let safetyTimer = null;

  async function tryAuthAndBoot() {
    if (safetyTimer) clearTimeout(safetyTimer);
    safetyTimer = setTimeout(() => {
      if ($('#loading-screen')?.classList.contains('active')) {
        setLoadingMessage(
          'Taking too long…',
          'Server may be starting. Tap Retry, or open from Telegram.',
          true
        );
      }
    }, 15000);

    try {
      const ok = await authenticate();
      clearTimeout(safetyTimer);
      if (!ok) return;
      await bootApp();
    } catch (err) {
      clearTimeout(safetyTimer);
      setLoadingMessage('Something went wrong', err.message || 'Unknown error', true);
    }
  }

  async function init() {
    if (!eventsBound) {
      bindEvents();
      eventsBound = true;
      const retryBtn = $('#loading-retry');
      if (retryBtn) {
        retryBtn.addEventListener('click', () => {
          setLoadingMessage('Initializing HYPE Miner…', '', false);
          tryAuthAndBoot();
        });
      }
    }
    await tryAuthAndBoot();
  }

  init();
})();
