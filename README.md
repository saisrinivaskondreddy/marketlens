# MarketLens — NSE/BSE Stock Screener

A real-time stock screener for NSE and BSE markets with 250+ stocks, 8 technical indicators, and an interactive dashboard.

## Files
```
marketlens/
├── index.html   — Main application UI
├── stocks.js    — 250+ stock universe (NSE + BSE)
├── app.js       — Analysis engine + rendering logic
└── README.md    — This file
```

## Features
- **250+ stocks**: Nifty 50, 100, 200 · BSE 100 · Midcap · Smallcap
- **8 indicators**: RSI · MACD · Bollinger Bands · SMA 20/50/200 · Stochastic · ADX
- **Signals**: Strong Buy · Buy · Hold · Watch · Sell · Strong Sell
- **Trend Reversals**: Auto-detected using 5-day momentum
- **Volume Breakouts**: 2× and 3× average volume flags
- **Sector View**: Average change, bull/bear counts per sector
- **Sparklines**: 30-day mini charts on each card
- **Detail Panel**: All signals, key levels, AI trade plan button
- **Custom Tickers**: Add any Yahoo Finance symbol

---

## Deployment Options

### Option 1 — Static Hosting (Recommended, Free)

#### Netlify (Drag & Drop — easiest)
1. Go to https://netlify.com → Sign up free
2. Drag the `marketlens/` folder onto the Netlify dashboard
3. Your app is live at `https://random-name.netlify.app` instantly
4. Optional: set a custom domain in Netlify settings

#### Vercel
1. Go to https://vercel.com → Sign up free
2. Install Vercel CLI: `npm i -g vercel`
3. In the `marketlens/` folder: run `vercel`
4. Follow prompts → live in 30 seconds

#### GitHub Pages
1. Create a GitHub repo
2. Push all 3 files (`index.html`, `stocks.js`, `app.js`) to the repo root
3. Go to Settings → Pages → Source: main branch / root
4. Live at `https://yourusername.github.io/repo-name`

#### AWS S3 + CloudFront
1. Create S3 bucket → enable Static Website Hosting
2. Upload all 3 files
3. Set `index.html` as the index document
4. (Optional) Add CloudFront for HTTPS and CDN

---

### Option 2 — Local Development

Just open `index.html` directly in a browser:
```bash
open index.html
# or on Linux:
xdg-open index.html
```

For a local server (avoids any CORS issues):
```bash
# Python
python3 -m http.server 8080

# Node.js
npx serve .

# Then open http://localhost:8080
```

---

## Data Source
Live data is fetched from **Yahoo Finance** public API:
```
https://query1.finance.yahoo.com/v8/finance/chart/{TICKER}?interval=1d&range=6mo
```
- No API key required
- Free to use for personal/demo purposes
- Rate limited: ~5 requests per second (app batches in groups of 5)

## Adding More Stocks
Edit `stocks.js` and add entries to the `STOCK_UNIVERSE` array:
```js
{t:'TICKER.NS', n:'Company Name', s:'Sector', e:'NSE', idx:['nifty200']},
```
Supported index values: `nifty50`, `nifty100`, `nifty200`, `bse100`, `midcap`, `smallcap`

## Technical Indicators Used
| Indicator | Bullish Condition | Bearish Condition |
|-----------|-------------------|-------------------|
| SMA 20/50/200 | Price above MA | Price below MA |
| MACD | MACD > Signal | MACD < Signal |
| RSI (14) | RSI < 30 (oversold) | RSI > 70 (overbought) |
| Bollinger Bands | Price < Lower Band | Price > Upper Band |
| Stochastic | %K < 20 | %K > 80 |
| ADX | ADX > 25 (strong trend) | ADX < 25 (weak) |
| Volume | 2×/3× avg vol breakout | — |
| Momentum | 5-day reversal up | 5-day reversal down |

---
Built with vanilla HTML/CSS/JS — no frameworks, no build step needed.