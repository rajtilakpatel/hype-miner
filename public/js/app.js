/**
 * HYPE MINER — Telegram Mini App client
 */
(function () {
  'use strict';

  const API = '/api';
  let token = localStorage.getItem('hype_token') || null;
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
        const icon = t.type === 'channel' ? '📢' : t.type === 'twitter' ? '𝕏' : '✓';
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
        if (tg?.openTelegramLink) tg.openTelegramLink(task.targetUrl);
        else if (tg?.openLink) tg.openLink(task.targetUrl);
        else window.open(task.targetUrl, '_blank');
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
        if ($('#verify-label')) {
          $('#verify-label').textContent = 'VERIFIED';
          $('#verify-label').style.color = 'var(--green)';
        }
      } else {
        $('#wallet-status').textContent = 'Wallet not connected';
        const btn = $('#connect-wallet-btn');
        if (btn) {
          btn.innerHTML = '<img src="/assets/ton.svg" alt="" class="btn-logo" /> CONNECT WALLET';
        }
      }

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

  function connectWallet() {
    const address = prompt(
      'Connect wallet\n\nPaste your TON address from:\n• Tonkeeper\n• Telegram Wallet\n• MyTonWallet\n\nAddress starts with EQ… or UQ…'
    );
    if (!address) return;
    const trimmed = address.trim();
    if (!/^(EQ|UQ)[A-Za-z0-9_-]{46}$/.test(trimmed) && !/^(EQ|UQ)[A-Za-z0-9_-]{48}$/.test(trimmed)) {
      // soft check — still allow if looks like TON address
      if (!trimmed.startsWith('EQ') && !trimmed.startsWith('UQ')) {
        return toast('Enter a valid TON address (EQ… or UQ…)', 'error');
      }
    }
    api('/wallet/address', { method: 'POST', body: { address: trimmed } })
      .then(() => { toast('Wallet connected', 'success'); loadProfile(); })
      .catch(err => toast(err.message, 'error'));
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
    try {
      const r = await api('/wallet/deposit', { method: 'POST', body: { txHash } });
      toast(r.message || 'Submitted', 'success');
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
    const cd = $('#copy-deposit');
    if (cd) cd.addEventListener('click', () => {
      const v = $('#deposit-address')?.value;
      if (v) navigator.clipboard?.writeText(v).then(() => toast('Address copied', 'success'));
    });
    const jc = $('#btn-connect-wallet-jump');
    if (jc) jc.addEventListener('click', () => {
      showPage('profile');
      setTimeout(() => {
        const box = document.getElementById('verify-box');
        if (box) box.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 80);
    });
    const jw = $('#btn-withdraw-jump');
    if (jw) jw.addEventListener('click', () => showPage('profile'));
    $$('#tf-row button').forEach(b => {
      b.addEventListener('click', () => {
        $$('#tf-row button').forEach(x => x.classList.remove('on'));
        b.classList.add('on');
        chartTf = b.dataset.tf;
        drawChart(window.__hypePrice);
      });
    });
  }

  async function bootApp() {
    updateHeader();
    try {
      await loadMineStatus();
    } catch (err) {
      console.warn('mine status', err);
    }
    const loading = $('#loading-screen');
    const main = $('#main-app');
    if (loading) loading.classList.remove('active');
    if (main) main.classList.add('active');
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
