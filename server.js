const express = require('express');
const session = require('express-session');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcrypt');
const fs = require('fs'); // Ensure this is included
const app = express();
require('dotenv').config();
const nodemailer = require('nodemailer');
const cors = require('cors');
const axios = require('axios');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session and Passport setup (before routes)
app.use(session({
  secret: 'crypto-biz-2025',
  resave: false,
  saveUninitialized: false
}));
app.use(passport.initialize());
app.use(passport.session());

const users = [];
const addUser = (username, password) => {
  const hashedPassword = bcrypt.hashSync(password, 10);
  users.push({ id: users.length + 1, username, password: hashedPassword });
};
addUser('admin', 'password123');

passport.use(new LocalStrategy(
  (username, password, done) => {
    const user = users.find(u => u.username === username);
    if (!user) return done(null, false);
    if (!bcrypt.compareSync(password, user.password)) return done(null, false);
    return done(null, user);
  }
));

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser((id, done) => {
  const user = users.find(u => u.id === id);
  done(null, user);
});

// Define routes
app.get('/', (req, res) => {
  if (req.isAuthenticated()) {
    res.sendFile(__dirname + '/index.html');
  } else {
    res.redirect('/login');
  }
});

app.get('/login', (req, res) => {
  console.log('Hit /login route, attempting to serve login.html from:', __dirname + '/login.html');
  if (fs.existsSync(__dirname + '/login.html')) {
    console.log('File exists, sending...');
    res.sendFile(__dirname + '/login.html', (err) => {
      if (err) console.error('Error sending file:', err.message);
      else console.log('File sent successfully');
    });
  } else {
    console.log('File not found!');
    res.status(404).send('Login page not found');
  }
});

app.post('/login',
  passport.authenticate('local', { failureRedirect: '/login' }),
  (req, res) => res.redirect('/')); // Redirect to homepage after login

app.get('/logout', (req, res) => {
  req.logout(() => res.redirect('/login'));
});

app.get('/trade', (req, res) => {
  if (!req.isAuthenticated()) return res.redirect('/login');
  res.sendFile(__dirname + '/trade.html');
});

app.get('/redeem', (req, res) => {
  if (!req.isAuthenticated()) return res.redirect('/login');
  res.sendFile(__dirname + '/redeem.html');
});

// API routes
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
      const cryptoAmount = tradeAmount * price;
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

// Static middleware
app.use(express.static('.'));

app.listen(process.env.PORT || 3000, () => console.log(`Server running at http://localhost:${process.env.PORT || 3000}`));