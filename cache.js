const NodeCache = require('node-cache');
const cache = new NodeCache({ stdTTL: 3600 }); // 1-hour TTL

function getCachedReels(username, limit) {
  const key = `${username}_${limit}`;
  
  return cache.get(key);
}

function setCachedReels(username, limit, reels) {
  const key = `${username}_${limit}`;
  cache.set(key, reels);
}

module.exports = { getCachedReels, setCachedReels };