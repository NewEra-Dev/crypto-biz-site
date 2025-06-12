const express = require('express');
const app = express();

app.get('/', (req, res) => {
  res.send('Server is running!');
});

console.log('App started successfully');
app.listen(process.env.PORT, () => console.log(`Server running on port ${process.env.PORT}`));