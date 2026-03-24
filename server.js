const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS
app.use(cors());

// Route to fetch Yahoo Finance data
app.get('/finance/:ticker', async (req, res) => {
    const ticker = req.params.ticker;
    try {
        const response = await axios.get(`https://finance.yahoo.com/quote/${ticker}`);
        res.json(response.data);
    } catch (error) {
        console.error(error);
        res.status(500).send('Error fetching data');
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
