const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.static(path.join(__dirname)));

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'MarketLens server is running!' });
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
