const express = require('express');
const session = require('express-session');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcrypt');
const fs = require('fs'); // Ensure this is included
const app = express();
app.use(express.urlencoded({ extended: true })); // Add this to parse form data
require('dotenv').config();
console.log('MONGO_URI:', process.env.MONGO_URI); // Debug line
const nodemailer = require('nodemailer');
const cors = require('cors');
const axios = require('axios');
const mongoose = require('mongoose');
const MongoStore = require('connect-mongo');

// Connect to MongoDB
console.log('MONGO_URI from env:', process.env.MONGO_URI);
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/myDatabase')
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// Session setup with MongoDB store
const store = MongoStore.create({
  mongoUrl: process.env.MONGO_URI,
  ttl: 14 * 24 * 60 * 60, // Session TTL: 14 days
  autoRemove: 'native', // Automatically remove expired sessions
  crypto: {
    secret: 'crypto-biz-2025' // Use the same secret as session
  }
}).on('error', (error) => {
  console.error('MongoStore error:', error);
});

store.on('connected', () => {
  console.log('Connected to MongoStore, clearing old sessions');
  store.client.db().collection('sessions').deleteMany({}).then(() => console.log('Old sessions cleared'));
});

app.use(session({
  secret: 'crypto-biz-2025',
  resave: false,
  saveUninitialized: false,
  store: store
}));
app.use(passport.initialize());
app.use(passport.session());

// Persist Users in MongoDB
const userSchema = new mongoose.Schema({
  username: String,
  email: String,
  password: String
});
const User = mongoose.model('User', userSchema);

const addUser = async (username, email, password) => {
  const hashedPassword = bcrypt.hashSync(password, 10);
  const user = new User({ username, email, password: hashedPassword });
  await user.save();
  return user;
};

// Initialize the admin user with debug logging
addUser('admin', 'admin@example.com', 'password123')
  .then(() => console.log('Admin user created'))
  .catch(err => console.error('Admin user creation error:', err));

// Update LocalStrategy
passport.use(new LocalStrategy(
  (username, password, done) => {
    console.log('Attempting login with username:', username, 'password:', password);
    User.findOne({ $or: [{ username }, { email: username }] })
      .then(user => {
        if (!user || !bcrypt.compareSync(password, user.password)) return done(null, false);
        return done(null, user);
      })
      .catch(err => done(err));
  }
));

passport.serializeUser((user, done) => done(null, user._id.toString())); // Convert _id to string
passport.deserializeUser((id, done) => {
  console.log('Deserializing user with id:', id);
  User.findById(id)
    .then(user => {
      if (!user) console.log('User not found in DB:', id);
      done(null, user);
    })
    .catch(err => done(err));
});

// Define routes
app.get('/', (req, res) => {
  console.log('Checking authentication for / route, isAuthenticated:', req.isAuthenticated());
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

app.get('/signup', (req, res) => {
  console.log('Hit /signup route, attempting to serve signup.html from:', __dirname + '/signup.html');
  if (fs.existsSync(__dirname + '/signup.html')) {
    console.log('File exists, sending...');
    res.sendFile(__dirname + '/signup.html', (err) => {
      if (err) console.error('Error sending file:', err.message);
      else console.log('File sent successfully');
    });
  } else {
    console.log('File not found!');
    res.status(404).send('Signup page not found');
  }
});

app.post('/signup', (req, res) => {
  console.log('Signup attempt with body:', req.body);
  const { username, email, password } = req.body;
  if (!username || !email || !password) {
    return res.status(400).send('Username, email, and password are required');
  }
  User.findOne({ $or: [{ username }, { email }] })
    .then(existingUser => {
      if (existingUser) {
        return res.status(400).send('Username or email already exists');
      }
      addUser(username, email, password)
        .then(() => res.redirect('/login'))
        .catch(err => {
          console.error('Error adding user:', err);
          res.status(500).send('Failed to sign up');
        });
    })
    .catch(err => {
      console.error('Error checking user:', err);
      res.status(500).send('Failed to sign up');
    });
});

app.get('/forgot-password', (req, res) => {
  console.log('Hit /forgot-password route, attempting to serve forgot-password.html from:', __dirname + '/forgot-password.html');
  if (fs.existsSync(__dirname + '/forgot-password.html')) {
    console.log('File exists, sending...');
    res.sendFile(__dirname + '/forgot-password.html', (err) => {
      if (err) console.error('Error sending file:', err.message);
      else console.log('File sent successfully');
    });
  } else {
    console.log('File not found!');
    res.status(404).send('Forgot password page not found');
  }
});

app.post('/forgot-password', (req, res) => {
  const { username } = req.body;
  if (!username) {
    return res.status(400).send('Username is required');
  }
  User.findOne({ $or: [{ username }, { email: username }] })
    .then(user => {
      if (!user) {
        return res.status(404).send('Username or email not found');
      }
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: process.env.EMAIL_ADDRESS, pass: process.env.EMAIL_PASSWORD },
      });
      const mailOptions = {
        from: process.env.EMAIL_ADDRESS,
        to: user.email,
        subject: 'Password Reset Request',
        text: `Hi ${username}, a password reset has been requested for your account. For security, please contact support to reset your password. Reply to this email or reach us at +2348144261207 (WhatsApp).`,
      };
      transporter.sendMail(mailOptions, (error) => {
        if (error) {
          console.error('Error sending reset email:', error);
          return res.status(500).send('Failed to send reset email');
        }
        console.log('Reset email sent successfully');
        res.send('Password reset email sent. Please check your email or contact support.');
      });
    })
    .catch(err => {
      console.error('Error finding user:', err);
      res.status(500).send('Failed to process request');
    });
});

app.post('/login',
  passport.authenticate('local', { failureRedirect: '/login' }),
  (req, res) => res.redirect('/')
);

app.get('/logout', (req, res) => {
  req.logout((err) => {
    if (err) console.error('Logout error:', err);
    res.redirect('/login');
  });
});

app.get('/trade', (req, res) => {
  if (!req.isAuthenticated()) return res.redirect('/login');
  res.sendFile(__dirname + '/trade.html');
});

app.get('/redeem', (req, res) => {
  if (!req.isAuthenticated()) return res.redirect('/login');
  res.sendFile(__dirname + '/redeem.html');
});

app.get('/dashboard', (req, res) => {
  if (!req.isAuthenticated()) return res.redirect('/login');
  res.sendFile(__dirname + '/dashboard.html');
});

// API routes with cache to handle 429 and price change detection
let priceCache = null;
let lastFetch = 0;
const CACHE_DURATION = 60000; // 1 minute cache
let lastPrices = null; // Track previous prices for change detection

app.get('/api/prices', async (req, res) => {
  const now = Date.now();
  if (priceCache && (now - lastFetch < CACHE_DURATION)) {
    return res.json(priceCache);
  }
  try {
    const response = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,tether&vs_currencies=usd', {
      headers: { 'accept': 'application/json' }
    });
    priceCache = response.data;
    lastFetch = now;

    // Detect price changes (5% threshold)
    if (lastPrices) {
      const changes = {};
      for (let crypto of ['bitcoin', 'ethereum', 'tether']) {
        const oldPrice = lastPrices[crypto]?.usd || priceCache[crypto].usd;
        const newPrice = priceCache[crypto].usd;
        const percentageChange = ((newPrice - oldPrice) / oldPrice) * 100;
        if (Math.abs(percentageChange) >= 5) {
          changes[crypto] = { old: oldPrice, new: newPrice, change: percentageChange.toFixed(2) };
        }
      }
      if (Object.keys(changes).length > 0) {
        console.log('Significant price changes detected:', changes);
        // In a real app, you might push this to WebSocket or save for notifications
      }
    }
    lastPrices = { ...priceCache };
    res.json(priceCache);
  } catch (error) {
    console.error('Error fetching prices:', error.response?.status, error.response?.statusText);
    if (priceCache) {
      res.json(priceCache); // Return cached data on error
    } else if (error.response?.status === 429) {
      res.status(429).json({ error: 'Rate limit exceeded. Using cached data if available.' });
    } else {
      res.status(500).json({ error: 'Failed to fetch prices.' });
    }
  }
});

app.get('/api/notifications', (req, res) => {
  if (!lastPrices || !priceCache) {
    return res.json({ notifications: [] });
  }
  const changes = {};
  for (let crypto of ['bitcoin', 'ethereum', 'tether']) {
    const oldPrice = lastPrices[crypto]?.usd || priceCache[crypto].usd;
    const newPrice = priceCache[crypto].usd;
    const percentageChange = ((newPrice - oldPrice) / oldPrice) * 100;
    if (Math.abs(percentageChange) >= 5) {
      changes[crypto] = { old: oldPrice, new: newPrice, change: percentageChange.toFixed(2) };
    }
  }
  const notifications = Object.keys(changes).map(crypto => ({
    message: `${crypto.toUpperCase()} price changed by ${changes[crypto].change}% ($${changes[crypto].old} to $${changes[crypto].new})`,
    timestamp: new Date().toISOString()
  }));
  res.json({ notifications });
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
    if (priceCache) {
      const price = priceCache[cryptoType].usd;
      let resultMessage;
      if (tradeType === 'buy') {
        const cryptoAmount = tradeAmount / price;
        resultMessage = `Bought ${cryptoAmount.toFixed(6)} ${cryptoType.toUpperCase()} for $${tradeAmount}! (Using cached price)`;
      } else if (tradeType === 'sell') {
        const cryptoAmount = tradeAmount * price;
        resultMessage = `Sold ${tradeAmount} ${cryptoType.toUpperCase()} for $${cryptoAmount.toFixed(2)}! (Using cached price)`;
      }
      res.json({ success: true, message: resultMessage });
    } else if (error.response?.status === 429) {
      res.status(429).json({ error: 'Rate limit exceeded. Using cached data if available.' });
    } else {
      res.status(500).json({ error: 'Failed to process trade.' });
    }
  }
});

// Static middleware
app.use(express.static('.'));

// Global error handler
app.use((err, req, res, next) => {
  console.error('Global error handler:', err.stack);
  res.status(500).send('Something went wrong!');
});

console.log('App started successfully');
app.listen(process.env.PORT, () => console.log(`Server running on port ${process.env.PORT}`));