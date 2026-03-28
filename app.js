// ─── MARKETLENS APP ENGINE ───────────────────────────────────────────────────

const App = (() => {
  // State
  let allData    = [];
  let filtered   = [];
  let view       = 'cards';
  let activeIdx  = 'all';
  let running    = false;
  let customList = [];

  // ── Helpers ──────────────────────────────────────────────────────────────
  const avg = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

  function calcRSI(closes, period = 14) {
    if (closes.length < period + 1) return 50;
    let gains = 0, losses = 0;
    for (let i = closes.length - period; i < closes.length; i++) {
      const d = closes[i] - closes[i - 1];
      if (d > 0) gains += d; else losses -= d;
    }
    const rs = gains / (losses || 0.0001);
    return 100 - 100 / (1 + rs);
  }

  function calcEMAAt(arr, period) {
    if (arr.length < period) return avg(arr);
    const k = 2 / (period + 1);
    let ema = avg(arr.slice(0, period));
    for (let i = period; i < arr.length; i++) ema = arr[i] * k + ema * (1 - k);
    return ema;
  }

  function calcMACD(closes) {
    if (closes.length < 26) return { macd: 0, sig: 0 };
    const line = closes.map((_, i) =>
      i < 25 ? 0 : calcEMAAt(closes.slice(0, i + 1), 12) - calcEMAAt(closes.slice(0, i + 1), 26)
    );
    const nz = line.filter(v => v !== 0);
    return { macd: line[line.length - 1], sig: nz.length >= 9 ? calcEMAAt(nz, 9) : 0 };
  }

  function calcBB(closes, period = 20) {
    const sl = closes.slice(-period);
    const m  = avg(sl);
    const std = Math.sqrt(sl.reduce((a, b) => a + (b - m) ** 2, 0) / period);
    return { upper: m + 2 * std, middle: m, lower: m - 2 * std };
  }

  function calcStoch(closes, highs, lows, period = 14) {
    const hh = Math.max(...highs.slice(-period));
    const ll = Math.min(...lows.slice(-period));
    return ((closes[closes.length - 1] - ll) / (hh - ll + 0.0001)) * 100;
  }

  function calcADX(closes, highs, lows, period = 14) {
    if (closes.length < period + 1) return 25;
    let s = 0;
    for (let i = closes.length - period; i < closes.length; i++) {
      s += Math.abs(highs[i] - highs[i - 1]);
    }
    return Math.min(100, s / period * 10);
  }

  // Sparkline SVG
  function sparkline(prices, color) {
    if (!prices || prices.length < 2) return '';
    const w = 64, h = 24;
    const mn = Math.min(...prices), mx = Math.max(...prices), rng = mx - mn || 1;
    const pts = prices.map((p, i) => {
      const x = (i / (prices.length - 1)) * w;
      const y = h - ((p - mn) / rng) * (h - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    return `<svg width="${w}" height="${h}" class="sparkline"><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }

  // ── Analysis Engine ──────────────────────────────────────────────────────
  function analyze(si, closes, vols, highs, lows, price, change, volRatio) {
    const n   = closes.length;
    const sma20  = avg(closes.slice(-20));
    const sma50  = avg(closes.slice(-Math.min(50, n)));
    const sma200 = avg(closes.slice(-Math.min(200, n)));
    const rsi    = calcRSI(closes, 14);
    const { macd, sig: macdSig } = calcMACD(closes);
    const bb     = calcBB(closes, 20);
    const stoch  = calcStoch(closes, highs, lows, 14);
    const adx    = calcADX(closes, highs, lows, 14);

    let bull = 0, bear = 0;
    const signals = [], tags = [];

    // Moving averages
    const addMA = (label, cond) => {
      if (cond) { bull += 10; signals.push({ n: label, v: 'Bullish', c: 'bull' }); }
      else       { bear += 10; signals.push({ n: label, v: 'Bearish', c: 'bear' }); }
    };
    addMA('Price > SMA20',  price > sma20);
    addMA('Price > SMA50',  price > sma50);
    addMA('Price > SMA200', price > sma200);
    addMA('SMA20 > SMA50',  sma20 > sma50);

    // RSI
    signals.push({ n: 'RSI (14)', v: rsi.toFixed(1), c: rsi > 70 ? 'bear' : rsi < 30 ? 'bull' : 'neu' });
    if      (rsi < 30) { bull += 15; tags.push({ t: 'RSI Oversold',   c: 'bull' }); }
    else if (rsi > 70) { bear += 15; tags.push({ t: 'RSI Overbought', c: 'bear' }); }
    else if (rsi > 50)   bull += 8;
    else                 bear += 8;

    // MACD
    if (macd > macdSig) { bull += 12; signals.push({ n: 'MACD', v: 'Bullish Cross', c: 'bull' }); tags.push({ t: 'MACD Bullish', c: 'bull' }); }
    else                { bear += 12; signals.push({ n: 'MACD', v: 'Bearish Cross', c: 'bear' }); tags.push({ t: 'MACD Bearish', c: 'bear' }); }

    // Bollinger Bands
    const bbStatus = price < bb.lower ? 'Below Lower Band' : price > bb.upper ? 'Above Upper Band' : 'Within Bands';
    signals.push({ n: 'Bollinger Bands', v: bbStatus, c: price < bb.lower ? 'bull' : price > bb.upper ? 'bear' : 'neu' });
    if      (price < bb.lower) { bull += 10; tags.push({ t: 'BB Oversold',   c: 'bull' }); }
    else if (price > bb.upper) { bear += 10; tags.push({ t: 'BB Overbought', c: 'bear' }); }

    // Stochastic
    signals.push({ n: 'Stochastic %K', v: stoch.toFixed(1), c: stoch < 20 ? 'bull' : stoch > 80 ? 'bear' : 'neu' });
    if      (stoch < 20) { bull += 8; tags.push({ t: 'Stoch Oversold',   c: 'bull' }); }
    else if (stoch > 80) { bear += 8; tags.push({ t: 'Stoch Overbought', c: 'bear' }); }

    // ADX
    signals.push({ n: 'ADX', v: `${adx.toFixed(1)} ${adx > 25 ? '(Trending)' : '(Weak Trend)'}`, c: adx > 25 ? 'bull' : 'neu' });

    // Volume
    if (volRatio > 3)  tags.push({ t: 'Vol Breakout',  c: 'warn' });
    else if (volRatio > 2) tags.push({ t: 'High Volume',   c: 'warn' });

    // Trend reversal detection
    if (closes.length >= 10) {
      const prev5 = closes.slice(-10, -5);
      const last5 = closes.slice(-5);
      const prevTrend = prev5[4] - prev5[0];
      const curTrend  = last5[4] - last5[0];
      if (prevTrend < 0 && curTrend > 0) { bull += 8; tags.push({ t: 'Bullish Reversal', c: 'bull' }); }
      if (prevTrend > 0 && curTrend < 0) { bear += 8; tags.push({ t: 'Bearish Reversal', c: 'bear' }); }
    }

    // Golden / Death Cross
    if (sma50 > sma200) { bull += 5; tags.push({ t: 'Golden Cross Zone', c: 'bull' }); }
    else                { bear += 5; tags.push({ t: 'Death Cross Zone',  c: 'bear' }); }

    // Day's move
    if (Math.abs(change) > 5) tags.push({ t: change > 0 ? 'Big Green Day' : 'Big Red Day', c: change > 0 ? 'bull' : 'bear' });

    // Score & recommendation
    const total   = bull + bear || 1;
    const bullPct = Math.round(bull / total * 100);
    const bearPct = 100 - bullPct;

    let rec = 'Hold';
    if      (bullPct >= 75)                     rec = 'Strong Buy';
    else if (bullPct >= 60)                     rec = 'Buy';
    else if (bearPct >= 75)                     rec = 'Strong Sell';
    else if (bearPct >= 60)                     rec = 'Sell';
    else if (volRatio > 2 && change < -2)       rec = 'Sell';
    else if (volRatio > 2 && change >  2)       rec = 'Buy';
    else if (Math.abs(change) > 3)              rec = 'Watch';

    return { rec, signals, tags, bullPct, bearPct, sma20, sma50, sma200, rsi, macd, macdSig, bb, stoch, adx };
  }

  // ── Data fetching ─────────────────────────────────────────────────────────
  async function fetchStock(si) {
    try {
      const url = `https://cors-anywhere.herokuapp.com/https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(si.t)}?interval=1d&range=6mo`;
      const res = await fetch(url);
      if (!res.ok) return;
      const json = await res.json();
      const result = json.chart?.result?.[0];
      if (!result) return;

      const meta   = result.meta;
      const q      = result.indicators.quote[0];
      const closes = q.close.filter(v => v != null);
      const vols   = q.volume.filter(v => v != null);
      const highs  = q.high.filter(v => v != null);
      const lows   = q.low.filter(v => v != null);
      if (closes.length < 10) return;

      const price    = meta.regularMarketPrice;
      const prev     = meta.previousClose || meta.chartPreviousClose;
      const change   = ((price - prev) / prev) * 100;
      const avgVol   = avg(vols.slice(-20)) || 1;
      const curVol   = vols[vols.length - 1] || avgVol;
      const volRatio = curVol / avgVol;

      const an = analyze(si, closes, vols, highs, lows, price, change, volRatio);

      allData.push({
        ...si, price, prev, change, curVol, avgVol, volRatio, closes,
        mktcap: meta.marketCap,
        hi52: meta.fiftyTwoWeekHigh,
        lo52: meta.fiftyTwoWeekLow,
        ...an
      });
    } catch (_) { /* silently skip */ }
  }

  // ── Load orchestrator ─────────────────────────────────────────────────────
  async function startLoad() {
    if (running) return;
    running = true;
    allData = [];

    document.getElementById('loadBtn').disabled = true;
    document.getElementById('stopBtn').style.display = '';
    document.getElementById('progressWrap').classList.add('show');
    document.getElementById('main').innerHTML = '<div class="loading-state"><div class="spinner"></div><span id="loadMsg">Starting…</span></div>';

    const list    = getStockList();
    const total   = list.length;
    const BATCH   = 5;

    for (let i = 0; i < list.length && running; i += BATCH) {
      await Promise.all(list.slice(i, i + BATCH).map(s => fetchStock(s)));
      const done = Math.min(i + BATCH, total);
      const pct  = Math.round(done / total * 100);
      document.getElementById('progressFill').style.width = pct + '%';
      document.getElementById('progressText').textContent = `Loading ${done} / ${total} stocks…`;
      document.getElementById('progressPct').textContent  = pct + '%';
      const lm = document.getElementById('loadMsg');
      if (lm) lm.textContent = `Loaded ${allData.length} stocks…`;
    }

    running = false;
    document.getElementById('loadBtn').disabled = false;
    document.getElementById('stopBtn').style.display = 'none';
    document.getElementById('progressWrap').classList.remove('show');
    document.getElementById('lastUpd').textContent = `Updated ${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;

    populateSectorDropdown();
    updateSummary();
    applyFilters();
  }

  function stopLoad() {
    running = false;
    document.getElementById('stopBtn').style.display = 'none';
    document.getElementById('loadBtn').disabled = false;
    document.getElementById('progressWrap').classList.remove('show');
    if (allData.length) { populateSectorDropdown(); updateSummary(); applyFilters(); }
  }

  function getStockList() {
    let list = activeIdx === 'all'
      ? [...window.STOCK_UNIVERSE]
      : window.STOCK_UNIVERSE.filter(s => s.idx.includes(activeIdx));
    customList.forEach(c => { if (!list.find(s => s.t === c.t)) list.push(c); });
    return list;
  }

  // ── Filters & Sort ────────────────────────────────────────────────────────
  function applyFilters() {
    const sig    = document.getElementById('sigFilter').value;
    const sec    = document.getElementById('secFilter').value;
    const sort   = document.getElementById('sortSel').value;
    const search = document.getElementById('searchBox').value.toLowerCase();

    filtered = allData.filter(s => {
      if (sig !== 'all' && s.rec !== sig) return false;
      if (sec !== 'all' && s.s  !== sec)  return false;
      if (search && !s.t.toLowerCase().includes(search) &&
          !s.n.toLowerCase().includes(search) &&
          !s.s.toLowerCase().includes(search)) return false;
      return true;
    });

    filtered.sort((a, b) => {
      if (sort === 'change')  return (b.change  || 0) - (a.change  || 0);
      if (sort === 'volume')  return (b.volRatio || 0) - (a.volRatio || 0);
      if (sort === 'price')   return (b.price    || 0) - (a.price    || 0);
      if (sort === 'mktcap')  return (b.mktcap   || 0) - (a.mktcap   || 0);
      return (b.bullPct || 0) - (a.bullPct || 0);
    });

    document.getElementById('countPill').textContent = `${filtered.length} stocks`;
    render();
  }

  function updateSummary() {
    const n = allData.length;
    document.getElementById('sTot').textContent  = n;
    document.getElementById('sSB').textContent   = allData.filter(s => s.rec === 'Strong Buy').length;
    document.getElementById('sBuy').textContent  = allData.filter(s => s.rec === 'Buy').length;
    document.getElementById('sSell').textContent = allData.filter(s => ['Sell', 'Strong Sell'].includes(s.rec)).length;
    document.getElementById('sVol').textContent  = allData.filter(s => s.volRatio > 2).length;
    document.getElementById('sRev').textContent  = allData.filter(s => s.tags?.some(t => t.t.includes('Reversal'))).length;

    const changes = allData.map(s => s.change).filter(c => c != null);
    const avgChg  = changes.length ? changes.reduce((a, b) => a + b, 0) / changes.length : 0;
    const avgEl   = document.getElementById('sAvg');
    avgEl.textContent = (avgChg >= 0 ? '+' : '') + avgChg.toFixed(2) + '%';
    avgEl.className   = 'stat-num ' + (avgChg >= 0 ? 'green' : 'red');
  }

  function populateSectorDropdown() {
    const secs = [...new Set(allData.map(s => s.s))].sort();
    const el   = document.getElementById('secFilter');
    el.innerHTML = '<option value="all">All Sectors</option>';
    secs.forEach(s => {
      const o = document.createElement('option');
      o.value = o.textContent = s;
      el.appendChild(o);
    });
  }

  // ── Index filter ──────────────────────────────────────────────────────────
  function setIdx(idx, el) {
    activeIdx = idx;
    document.querySelectorAll('.idx-btn').forEach(b => b.classList.remove('active'));
    el.classList.add('active');
  }

  // ── View switching ────────────────────────────────────────────────────────
  function switchView(v, el) {
    view = v;
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    el.classList.add('active');
    render();
  }

  function render() {
    const mc = document.getElementById('main');
    if (!allData.length) { renderWelcome(mc); return; }
    if (!filtered.length) { mc.innerHTML = '<div class="empty-state"><p>No stocks match the current filters.</p></div>'; return; }
    if (view === 'cards')   renderCards(mc);
    else if (view === 'table')   renderTable(mc);
    else                         renderSectors(mc);
  }

  // ── Rec CSS helpers ───────────────────────────────────────────────────────
  function recCls(r) {
    return { 'Strong Buy': 'rec-sb', Buy: 'rec-b', Sell: 'rec-s', 'Strong Sell': 'rec-ss', Watch: 'rec-w' }[r] || 'rec-h';
  }
  function cardCls(r) {
    return ['Strong Buy', 'Buy'].includes(r) ? 'bull' : ['Sell', 'Strong Sell'].includes(r) ? 'bear' : 'neu';
  }
  function glowCls(r) {
    return ['Strong Buy', 'Buy'].includes(r) ? 'green' : ['Sell', 'Strong Sell'].includes(r) ? 'red' : '';
  }

  // ── Render: Welcome ───────────────────────────────────────────────────────
  function renderWelcome(mc) {
    mc.innerHTML = `
    <div class="welcome">
      <div class="welcome-title">NSE &amp; BSE Stock Screener</div>
      <div class="welcome-sub">
        Screen 250+ stocks across Nifty 50, 100, 200, BSE 100, Midcap &amp; Smallcap indices using 8+ technical indicators.<br>
        Select an index group above then click <strong style="color:var(--blue)">↻ Load &amp; Screen</strong> to begin.
      </div>
      <div class="welcome-grid">
        <div class="feature-card"><div class="feature-icon">📈</div><div class="feature-title">Bullish Indicators</div><div class="feature-desc">RSI, MACD, Bollinger Bands, SMA crossovers, Stochastic — all combined into a single Bull Score.</div></div>
        <div class="feature-card"><div class="feature-icon">📉</div><div class="feature-title">Bearish Indicators</div><div class="feature-desc">Detects overbought conditions, death crosses, MACD bearish divergence, and more.</div></div>
        <div class="feature-card"><div class="feature-icon">🔄</div><div class="feature-title">Trend Reversals</div><div class="feature-desc">Identifies stocks flipping from bearish to bullish or vice versa using 5-day momentum analysis.</div></div>
        <div class="feature-card"><div class="feature-icon">🔊</div><div class="feature-title">Volume Breakouts</div><div class="feature-desc">Flags stocks trading at 2× or 3× their 20-day average volume — a key signal for strong moves.</div></div>
        <div class="feature-card"><div class="feature-icon">🏭</div><div class="feature-title">Sector Overview</div><div class="feature-desc">Compare sectors by average return, bull/bear counts, and relative strength.</div></div>
        <div class="feature-card"><div class="feature-icon">🎯</div><div class="feature-title">AI Deep Analysis</div><div class="feature-desc">Click any stock to get entry/exit levels, stop loss, and trade plan generated by AI.</div></div>
      </div>
      <div class="add-custom-row">
        <strong style="font-size:12px;color:var(--text2)">Add custom ticker:</strong>
        <input class="custom-input" id="customInput" placeholder="e.g. ZOMATO.NS or 500325.BO" onkeydown="if(event.key==='Enter')App.addCustom()">
        <button class="btn btn-primary" onclick="App.addCustom()">+ Add Ticker</button>
        <span style="font-size:11px;color:var(--text3)">Appends to next load batch</span>
      </div>
    </div>`;
  }

  // ── Render: Cards ─────────────────────────────────────────────────────────
  function renderCards(mc) {
    const bull = filtered.filter(s => ['Strong Buy', 'Buy'].includes(s.rec));
    const neu  = filtered.filter(s => !['Strong Buy', 'Buy', 'Sell', 'Strong Sell'].includes(s.rec));
    const bear = filtered.filter(s => ['Sell', 'Strong Sell'].includes(s.rec));

    let html = '';
    if (bull.length) html += section('bull', `Bullish — ${bull.length} stocks`, bull);
    if (neu.length)  html += section('gray', `Neutral / Watch — ${neu.length} stocks`, neu);
    if (bear.length) html += section('red',  `Bearish — ${bear.length} stocks`, bear);

    mc.innerHTML = html;
  }

  function section(dotCls, label, stocks) {
    return `<div class="section-head"><span class="dot dot-${dotCls}"></span>${label}</div>
    <div class="cards-grid">${stocks.map(cardHTML).join('')}</div>`;
  }

  function cardHTML(s) {
    const lbl    = s.t.replace('.NS', '').replace('.BO', '');
    const cc     = s.change >= 0 ? 'up' : 'dn';
    const cs     = s.change >= 0 ? '+' : '';
    const topTags = (s.tags || []).slice(0, 3).map(t => `<span class="tag tag-${t.c}">${t.t}</span>`).join('');
    const spark  = sparkline(s.closes?.slice(-30), s.change >= 0 ? '#4ade80' : '#f87171');
    const vColor = s.volRatio > 2 ? ' hi' : '';
    return `
    <div class="stock-card ${cardCls(s.rec)}" onclick="App.openDetail('${s.t}')">
      <div class="card-glow ${glowCls(s.rec)}"></div>
      <div class="card-top">
        <div>
          <div class="ticker">${lbl}<span class="ticker-ex">${s.e}</span></div>
          <div class="company-name">${s.n}</div>
        </div>
        <div class="price-block">
          ${spark}
          <div class="price">₹${s.price ? s.price.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '—'}</div>
          <div class="change ${cc}">${cs}${(s.change || 0).toFixed(2)}%</div>
        </div>
      </div>
      <div class="card-tags">
        <span class="rec-badge ${recCls(s.rec)}">${s.rec}</span>
        ${topTags}
      </div>
      <div class="card-metrics">
        <div><div class="metric-lbl">RSI</div><div class="metric-val">${(s.rsi || 0).toFixed(0)}</div></div>
        <div><div class="metric-lbl">Bull %</div><div class="metric-val">${s.bullPct || 0}%</div></div>
        <div><div class="metric-lbl">Vol Ratio</div><div class="metric-val${vColor}">${(s.volRatio || 0).toFixed(1)}x</div></div>
      </div>
    </div>`;
  }

  // ── Render: Table ─────────────────────────────────────────────────────────
  function renderTable(mc) {
    const rows = filtered.map(s => {
      const lbl  = s.t.replace('.NS', '').replace('.BO', '');
      const cc   = s.change >= 0 ? 'up' : 'dn';
      const tags = (s.tags || []).slice(0, 2).map(t => `<span class="tag tag-${t.c}">${t.t}</span>`).join(' ');
      const mc2  = s.mktcap ? `₹${(s.mktcap / 1e9).toFixed(0)}B` : '—';
      return `
      <tr onclick="App.openDetail('${s.t}')">
        <td><div class="td-ticker">${lbl}</div><div class="td-ex">${s.e}</div></td>
        <td class="td-name">${s.n}</td>
        <td>${s.s}</td>
        <td>₹${s.price ? s.price.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '—'}</td>
        <td class="change ${cc}">${s.change >= 0 ? '+' : ''}${(s.change || 0).toFixed(2)}%</td>
        <td><span class="rec-badge ${recCls(s.rec)}">${s.rec}</span></td>
        <td>${(s.rsi || 0).toFixed(1)}</td>
        <td style="font-weight:600;color:${s.bullPct > 60 ? 'var(--green)' : s.bullPct < 40 ? 'var(--red)' : 'var(--text2)'}">${s.bullPct || 0}%</td>
        <td style="color:${s.volRatio > 2 ? 'var(--amber)' : 'var(--text2)'}">${(s.volRatio || 0).toFixed(1)}x</td>
        <td>${mc2}</td>
        <td style="font-size:10px;color:var(--text3)">${(s.idx || [''])[0]}</td>
        <td>${tags}</td>
      </tr>`;
    }).join('');

    mc.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Ticker</th><th>Name</th><th>Sector</th><th>Price</th>
          <th>Change%</th><th>Signal</th><th>RSI</th><th>Bull%</th>
          <th>Vol Ratio</th><th>Mkt Cap</th><th>Index</th><th>Tags</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  }

  // ── Render: Sectors ───────────────────────────────────────────────────────
  function renderSectors(mc) {
    const map = {};
    allData.forEach(s => {
      if (!map[s.s]) map[s.s] = { stocks: [], chgSum: 0, bull: 0, bear: 0 };
      map[s.s].stocks.push(s);
      map[s.s].chgSum += s.change || 0;
      if (['Buy', 'Strong Buy'].includes(s.rec))   map[s.s].bull++;
      if (['Sell', 'Strong Sell'].includes(s.rec)) map[s.s].bear++;
    });

    const cards = Object.entries(map)
      .sort((a, b) => b[1].stocks.length - a[1].stocks.length)
      .map(([name, d]) => {
        const avgChg = d.chgSum / d.stocks.length;
        const color  = avgChg >= 0 ? 'var(--green)' : 'var(--red)';
        const barClr = avgChg >= 0 ? '#4ade80' : '#f87171';
        const barW   = Math.min(100, Math.abs(avgChg) * 15);
        return `
        <div class="sector-card" onclick="App.filterSector('${name}')">
          <div class="sector-name">${name}</div>
          <div class="sector-count">${d.stocks.length} stocks</div>
          <div class="sector-change" style="color:${color}">${avgChg >= 0 ? '+' : ''}${avgChg.toFixed(2)}%</div>
          <div class="sector-stats">${d.bull} buy · ${d.bear} sell</div>
          <div class="sector-bar-wrap">
            <div class="sector-bar-fill" style="width:${barW}%;background:${barClr}"></div>
          </div>
        </div>`;
      }).join('');

    mc.innerHTML = `
    <div class="section-head" style="margin-bottom:12px">Sector Overview — click to filter by sector</div>
    <div class="sectors-grid">${cards}</div>`;
  }

  // ── Detail Panel ──────────────────────────────────────────────────────────
  function openDetail(ticker) {
    const s = allData.find(x => x.t === ticker);
    if (!s) return;

    const lbl = s.t.replace('.NS', '').replace('.BO', '');
    const cc  = s.change >= 0 ? 'up' : 'dn';
    const cs  = s.change >= 0 ? '+' : '';
    const bp  = s.bullPct || 50;
    const bcFill = bp > 60 ? 'var(--green)' : bp < 40 ? 'var(--red)' : 'var(--text3)';

    document.getElementById('panelTicker').textContent = lbl;
    document.getElementById('panelName').textContent   = `${s.n} · ${s.s} · ${s.e}`;
    document.getElementById('panelPrice').textContent  = s.price ? `₹${s.price.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : '—';
    document.getElementById('panelChange').textContent = `${cs}${(s.change || 0).toFixed(2)}%`;
    document.getElementById('panelChange').className   = `change ${cc}`;
    const recEl = document.getElementById('panelRec');
    recEl.textContent = s.rec;
    recEl.className   = `rec-badge ${recCls(s.rec)}`;

    const allTags    = (s.tags    || []).map(t => `<span class="tag tag-${t.c}">${t.t}</span>`).join(' ');
    const sigRows    = (s.signals || []).map(sg =>
      `<div class="signal-row"><span class="signal-name">${sg.n}</span><span class="signal-val ${sg.c}">${sg.v}</span></div>`
    ).join('');

    const prompt = `Give me a detailed trade plan for ${lbl} (${s.n}). Current price ₹${s.price ? s.price.toFixed(2) : 'N/A'}, RSI ${(s.rsi || 0).toFixed(1)}, Bull Score ${bp}%, Signal: ${s.rec}, Sector: ${s.s}. Include: entry price recommendation, stop-loss, target 1, target 2, risk/reward ratio, position sizing advice, and your overall sector outlook.`;

    document.getElementById('panelBody').innerHTML = `
    <div class="panel-section">
      <div class="panel-section-title">Tags &amp; Signals</div>
      <div style="display:flex;flex-wrap:wrap;gap:4px">${allTags}</div>
    </div>

    <div class="panel-section">
      <div class="panel-section-title">Bull / Bear Score</div>
      <div class="score-wrap">
        <div class="score-labels">
          <span style="color:var(--green)">Bull ${bp}%</span>
          <span style="color:var(--red)">Bear ${100 - bp}%</span>
        </div>
        <div class="score-bar"><div class="score-fill" style="width:${bp}%;background:${bcFill}"></div></div>
      </div>
    </div>

    <div class="panel-section">
      <div class="panel-section-title">Technical Signals</div>
      ${sigRows}
    </div>

    <div class="panel-section">
      <div class="panel-section-title">Key Levels</div>
      <div class="kv-grid">
        <div class="kv-item"><div class="kv-label">SMA 20</div><div class="kv-value">₹${(s.sma20 || 0).toFixed(2)}</div></div>
        <div class="kv-item"><div class="kv-label">SMA 50</div><div class="kv-value">₹${(s.sma50 || 0).toFixed(2)}</div></div>
        <div class="kv-item"><div class="kv-label">SMA 200</div><div class="kv-value">₹${(s.sma200 || 0).toFixed(2)}</div></div>
        <div class="kv-item"><div class="kv-label">52W High</div><div class="kv-value">₹${(s.hi52 || 0).toFixed(2)}</div></div>
        <div class="kv-item"><div class="kv-label">52W Low</div><div class="kv-value">₹${(s.lo52 || 0).toFixed(2)}</div></div>
        <div class="kv-item"><div class="kv-label">BB Upper</div><div class="kv-value">₹${(s.bb?.upper || 0).toFixed(2)}</div></div>
        <div class="kv-item"><div class="kv-label">BB Lower</div><div class="kv-value">₹${(s.bb?.lower || 0).toFixed(2)}</div></div>
        <div class="kv-item"><div class="kv-label">Stochastic</div><div class="kv-value">${(s.stoch || 0).toFixed(1)}</div></div>
        <div class="kv-item"><div class="kv-label">ADX</div><div class="kv-value">${(s.adx || 0).toFixed(1)}</div></div>
        <div class="kv-item"><div class="kv-label">Vol Ratio</div><div class="kv-value" style="color:${s.volRatio > 2 ? 'var(--amber)' : 'inherit'}">${(s.volRatio || 0).toFixed(2)}×</div></div>
        ${s.mktcap ? `<div class="kv-item"><div class="kv-label">Market Cap</div><div class="kv-value">₹${(s.mktcap / 1e9).toFixed(0)}B</div></div>` : ''}
        <div class="kv-item"><div class="kv-label">MACD</div><div class="kv-value" style="color:${s.macd > s.macdSig ? 'var(--green)' : 'var(--red)'}">${s.macd > s.macdSig ? 'Bull' : 'Bear'}</div></div>
      </div>
    </div>

    <div class="panel-section">
      <button class="panel-action-btn" onclick="App.aiAnalysis('${s.t}', \`${prompt.replace(/`/g, "'")}\`)">
        🤖 AI Deep Trade Analysis ↗
      </button>
      <button class="panel-action-btn" style="margin-top:6px;background:var(--purple-bg);color:var(--purple);border-color:rgba(167,139,250,0.3)" onclick="App.aiAnalysis('${s.t}', 'What is the current market sentiment and recent news for ${lbl} (${s.n})? Give me the top 3 catalysts to watch for this stock.')">
        📰 News &amp; Sentiment ↗
      </button>
    </div>`;

    document.getElementById('detailPanel').classList.add('open');
    document.getElementById('overlay').classList.add('show');
  }

  function closePanel() {
    document.getElementById('detailPanel').classList.remove('open');
    document.getElementById('overlay').classList.remove('show');
  }

  function aiAnalysis(ticker, prompt) {
    closePanel();
    if (typeof sendPrompt === 'function') sendPrompt(prompt);
    else alert('AI Analysis:\n\n' + prompt);
  }

  function filterSector(sector) {
    document.getElementById('secFilter').value = sector;
    switchView('cards', document.querySelectorAll('.tab')[0]);
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab')[0].classList.add('active');
    applyFilters();
  }

  function addCustom() {
    const input = document.getElementById('customInput');
    if (!input) return;
    const raw = input.value.trim().toUpperCase();
    if (!raw) return;
    const t = raw.includes('.') ? raw : raw + '.NS';
    if (customList.find(c => c.t === t) || window.STOCK_UNIVERSE.find(s => s.t === t)) {
      alert(t + ' is already in the stock list.'); return;
    }
    customList.push({ t, n: t.replace('.NS', '').replace('.BO', ''), s: 'Custom', e: t.includes('.BO') ? 'BSE' : 'NSE', idx: ['custom'] });
    input.value = '';
    document.getElementById('lastUpd').textContent = `Custom ticker ${t} added — click Load & Screen`;
  }

  // Init
  function init() {
    renderWelcome(document.getElementById('main'));
  }

  return { startLoad, stopLoad, setIdx, switchView, applyFilters, openDetail, closePanel, filterSector, addCustom, aiAnalysis };
})();

// Global wiring
function startLoad()  { App.startLoad(); }
function stopLoad()   { App.stopLoad(); }
function switchView(v, el) { App.switchView(v, el); }
function setIdx(i, el)     { App.setIdx(i, el); }
function applyFilters()    { App.applyFilters(); }

// Boot
document.addEventListener('DOMContentLoaded', () => {
  App.applyFilters && App.applyFilters();
  // Show welcome state
  const mc = document.getElementById('main');
  if (mc) {
    mc.innerHTML = `
    <div class="welcome">
      <div class="welcome-title">NSE &amp; BSE Stock Screener</div>
      <div class="welcome-sub">
        Screen 250+ stocks across Nifty 50, 100, 200, BSE 100, Midcap &amp; Smallcap using 8 technical indicators.<br>
        Select an index group then click <strong style="color:var(--blue)">↻ Load &amp; Screen</strong> to begin.
      </div>
      <div class="welcome-grid">
        <div class="feature-card"><div class="feature-icon">📈</div><div class="feature-title">Bullish Indicators</div><div class="feature-desc">RSI, MACD, Bollinger Bands, SMA crossovers, Stochastic combined into a Bull Score.</div></div>
        <div class="feature-card"><div class="feature-icon">📉</div><div class="feature-title">Bearish Indicators</div><div class="feature-desc">Overbought signals, death crosses, MACD divergence, and trend exhaustion.</div></div>
        <div class="feature-card"><div class="feature-icon">🔄</div><div class="feature-title">Trend Reversals</div><div class="feature-desc">Identifies stocks flipping from bearish to bullish using 5-day momentum.</div></div>
        <div class="feature-card"><div class="feature-icon">🔊</div><div class="feature-title">Volume Breakouts</div><div class="feature-desc">Flags stocks at 2× or 3× their 20-day average volume.</div></div>
        <div class="feature-card"><div class="feature-icon">🏭</div><div class="feature-title">Sector Analysis</div><div class="feature-desc">Compare sectors by avg return, bullish/bearish counts, and relative strength.</div></div>
        <div class="feature-card"><div class="feature-icon">🎯</div><div class="feature-title">AI Trade Plans</div><div class="feature-desc">Click any stock for AI-generated entry/exit levels, stop loss, and trade plan.</div></div>
      </div>
      <div class="add-custom-row">
        <strong style="font-size:12px;color:var(--text2)">Add custom ticker:</strong>
        <input class="custom-input" id="customInput" placeholder="e.g. ZOMATO.NS or 500325.BO" onkeydown="if(event.key==='Enter')App.addCustom()">
        <button class="btn btn-primary" onclick="App.addCustom()">+ Add Ticker</button>
        <span style="font-size:11px;color:var(--text3)">Added to next load batch</span>
      </div>
    </div>`;
  }
});
