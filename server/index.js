const express = require('express');
const fetch = require('node-fetch');
const nodemailer = require('nodemailer');
const app = express();

const OMDB_KEY = 'afb6a35d'; // apni OMDb API key

app.get('/api/omdb', async (req, res) => {
  const title = req.query.title;
  if (!title) return res.status(400).json({ error: 'Title required' });

  try {
    const url = `https://www.omdbapi.com/?t=${encodeURIComponent(title)}&apikey=${OMDB_KEY}`;
    const r = await fetch(url);
    const data = await r.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'OMDb fetch failed' });
  }
});

app.listen(4000, () => console.log('✅ Server running on http://localhost:4000'));// Nodemailer configuration
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'csoutlier@gmail.com', // Yahan apni Gmail ID daalo
        pass: 'myvk mkxb cxem owss' // Yahan Google App Password daalo
    }
});
exports.transporter = transporter;

