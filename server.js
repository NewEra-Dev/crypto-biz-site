const express = require('express');
const session = require('express-session');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcrypt');
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

// Initialize the admin user
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

passport.serializeUser((user, done) => {
  console.log('Serializing user with _id:', user._id.toString());
  done(null, user._id.toString());
});
passport.deserializeUser((id, done) => {
  console.log('Deserializing user with id:', id);
  User.findById(id.toString())
    .then(user => {
      if (!user) console.log('User not found in DB:', id);
      done(null, user);
    })
    .catch(err => done(err));
});

app.use(express.static('.'));

app.get('/', (req, res) => {
  console.log('Checking authentication for / route, isAuthenticated:', req.isAuthenticated());
  if (req.isAuthenticated()) {
    res.send('Logged in successfully!');
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
  (req, res) => {
    console.log('Login successful, redirecting to /');
    res.redirect('/');
  }
);

console.log('App started successfully');
app.listen(process.env.PORT, () => console.log(`Server running on port ${process.env.PORT}`));