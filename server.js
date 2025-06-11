require('dotenv').config();
const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
const axios = require('axios'); // Ensure axios is installed: npm install axios

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('.'));

app.get('/redeem', (req, res) => res.sendFile(__dirname + '/redeem.html'));

// Fetch prices endpoint with retry logic
app.get('/api/prices', async (req, res) => {
  try {
    const response = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,tether&vs_currencies=usd', {
      headers: { 'accept': 'application/json' }
    });
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching prices:', error.response?.status, error.response?.statusText);
    if (error.response?.status === 429) {
      res.status(429).json({ error: 'Rate limit exceeded. Please try again later.' });
    } else {
      res.status(500).json({ error: 'Failed to fetch prices.' });
    }
  }
});

app.post('/api/redeem', (req, res) => {
  console.log('Received body:', req.body);
  const { giftCode } = req.body || {};
  const validCodes = {
    'GC123-XYZ789': { amount: 50, used: false },
    'GC456-ABC123': { amount: 25, used: false },
    'GC789-DEF456': { amount: 100, used: false },
    'GC101-JKL789': { amount: 75, used: false },
    'GC202-MNO123': { amount: 30, used: false },
    'GC303-PQR456': { amount: 150, used: false }
  };
  if (validCodes[giftCode]) {
    if (!validCodes[giftCode].used) {
      validCodes[giftCode].used = true;
      res.json({ success: true, message: `Redeemed $${validCodes[giftCode].amount}!` });
    } else {
      res.status(400).json({ success: false, error: 'Code already used.' });
    }
  } else {
    res.status(400).json({ success: false, error: 'Invalid gift card code.' });
  }
});

app.post('/api/contact', async (req, res) => {
  const { name, email, assetType, message } = req.body;
  if (!name || !email || !assetType || !message) {
    return res.status(400).json({ error: 'Please fill all fields' });
  }
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.EMAIL_ADDRESS, pass: process.env.EMAIL_PASSWORD },
  });
  const mailOptions = {
    from: email,
    to: 'odunayojohn62@gmail.com',
    subject: `New Contact: ${assetType}`,
    text: `Name: ${name}\nEmail: ${email}\nAsset Type: ${assetType}\nMessage: ${message}`,
  };
  try {
    await transporter.sendMail(mailOptions);
    res.status(200).json({ message: 'Message sent successfully' });
  } catch (error) {
    console.error('Error sending email:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

app.post('/api/trade', async (req, res) => {
  console.log('Received trade body:', req.body);
  const { tradeType, cryptoType, tradeAmount } = req.body || {};
  if (!tradeType || !cryptoType || !tradeAmount || tradeAmount <= 0) {
    return res.status(400).json({ error: 'Invalid trade details.' });
  }

  try {
    const priceResponse = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,tether&vs_currencies=usd', {
      headers: { 'accept': 'application/json' }
    });
    const prices = priceResponse.data;
    const price = prices[cryptoType].usd;

    let resultMessage;
    if (tradeType === 'buy') {
      const cryptoAmount = tradeAmount / price;
      resultMessage = `Bought ${cryptoAmount.toFixed(6)} ${cryptoType.toUpperCase()} for $${tradeAmount}!`;
    } else if (tradeType === 'sell') {
      const cryptoAmount = tradeAmount * price; // Assuming tradeAmount is in crypto units
      resultMessage = `Sold ${tradeAmount} ${cryptoType.toUpperCase()} for $${cryptoAmount.toFixed(2)}!`;
    }

    res.json({ success: true, message: resultMessage });
  } catch (error) {
    console.error('Error fetching prices or trading:', error.response?.status, error.response?.statusText);
    if (error.response?.status === 429) {
      res.status(429).json({ error: 'Rate limit exceeded. Please try again later.' });
    } else {
      res.status(500).json({ error: 'Failed to process trade.' });
    }
  }
});

app.listen(port, () => console.log(`Server running at http://localhost:${port}`));