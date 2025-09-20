const express = require('express');
const cors = require('cors'); 
const { fetchReels } = require('./scraper');
const { getCachedReels, setCachedReels } = require('./cache');
const logger = require('./logger');

const app = express();
const PORT =  3002;

app.use(express.json());


app.use(cors({
  origin: ['http://localhost:3000','http://localhost:3002'], 
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type'],
}));

async function scrapeHandler(req, res) {
  const { username, limit = 30 } = req.method === 'POST' ? req.body : req.query;

  if (!username) {
    return res.status(400).json({ error: 'Username required' });
  }

  try {
    let reels = getCachedReels(username, limit);
    console.log("reels from cache", reels);

    if (!reels) {
      reels = await fetchReels(username, parseInt(limit, 10));
      console.log("fetched reels", reels);
      setCachedReels(username, limit, reels);
    }

    res.json({ reels, count: reels.length });
    logger.info(`Served ${reels.length} Reels for ${username}`);
  } catch (error) {
    logger.error(`API error for ${username}: ${error.message}`);

    if (error.message.includes('not found') || error.message.includes('Private')) {
      return res.status(404).json({ error: error.message });
    }
    if (error.message.includes('Rate limited')) {
      return res.status(429).json({ error: error.message });
    }

    res.status(500).json({ error: 'Internal server error' });
  }
}

app.get('/scrape', scrapeHandler);
app.post('/scrape', scrapeHandler);

app.listen(PORT, () => {
  logger.info(`API running on port ${PORT}`);
});
