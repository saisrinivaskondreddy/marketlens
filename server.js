const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Alpha Vantage API key - get free at https://www.alphavantage.co/api/
// https://www.alphavantage.co registered with saisrinivas.chowdary email
const ALPHA_VANTAGE_KEY = 'KYAW2VA5NA669G2S'; // Replace with your key

// Middleware
app.use(cors());
app.use(express.static(path.join(__dirname)));

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'MarketLens server is running!' });
});

// Proxy endpoint for real stock data from Alpha Vantage
app.get('/api/chart/:ticker', async (req, res) => {
    const ticker = req.params.ticker;
    try {
        // Alpha Vantage API - Real data, free tier
        const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${encodeURIComponent(ticker)}&outputsize=full&apikey=${ALPHA_VANTAGE_KEY}`;
        
        const response = await fetch(url);
        const data = await response.json();
        
        if (data['Error Message'] || !data['Time Series (Daily)']) {
            return res.status(400).json({ error: 'Invalid ticker or API limit reached' });
        }
        
        // Transform Alpha Vantage format to Yahoo Finance format
        const timeSeries = data['Time Series (Daily)'];
        const dates = Object.keys(timeSeries).slice(0, 120).reverse(); // Last 120 days
        
        const closes = dates.map(d => parseFloat(timeSeries[d]['4. close']));
        const highs = dates.map(d => parseFloat(timeSeries[d]['2. high']));
        const lows = dates.map(d => parseFloat(timeSeries[d]['3. low']));
        const volumes = dates.map(d => parseInt(timeSeries[d]['5. volume']));
        
        const transformed = {
            chart: {
                result: [{
                    meta: {
                        regularMarketPrice: closes[closes.length - 1],
                        previousClose: closes[closes.length - 2],
                        marketCap: null,
                        fiftyTwoWeekHigh: Math.max(...closes),
                        fiftyTwoWeekLow: Math.min(...closes),
                    },
                    indicators: {
                        quote: [{
                            close: closes,
                            high: highs,
                            low: lows,
                            volume: volumes,
                        }]
                    }
                }],
                error: null
            }
        };
        
        res.json(transformed);
    } catch (error) {
        console.error(`Error fetching ${ticker}:`, error.message);
        res.status(500).json({ error: 'Failed to fetch stock data' });
    }
});

// Serve index.html for all other routes (SPA fallback)
app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Error handler
app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
});

app.listen(PORT, () => {
    console.log(`✓ MarketLens Server running on http://localhost:${PORT}`);
    console.log(`✓ Open browser and visit http://localhost:${PORT}`);
});
