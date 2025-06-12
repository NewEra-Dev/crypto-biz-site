const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const mongoose = require('mongoose');
require('dotenv').config();
const app = express();

console.log('MONGO_URI:', process.env.MONGO_URI);
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/myDatabase')
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

const store = MongoStore.create({
  mongoUrl: process.env.MONGO_URI,
  ttl: 14 * 24 * 60 * 60, // Session TTL: 14 days
  autoRemove: 'native',
  crypto: {
    secret: 'crypto-biz-2025'
  }
}).on('error', (error) => {
  console.error('MongoStore error:', error);
}).on('connected', async () => {
  console.log('Connected to MongoStore, clearing all sessions');
  await store.client.db().collection('sessions').deleteMany({});
  console.log('All sessions cleared, starting fresh');
});

app.use(session({
  secret: 'crypto-biz-2025',
  resave: false,
  saveUninitialized: false,
  store: store
}));

app.use(express.static('.'));

app.get('/', (req, res) => {
  res.send('Server is running with static files and sessions!');
});

console.log('App started successfully');
app.listen(process.env.PORT, () => console.log(`Server running on port ${process.env.PORT}`));