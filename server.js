const express = require('express');
const app = express();

app.use(express.static('.'));

app.get('/', (req, res) => {
  res.send('Server is running with static files!');
});

console.log('App started successfully');
app.listen(process.env.PORT, () => console.log(`Server running on port ${process.env.PORT}`));