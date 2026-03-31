const Redis = require('ioredis');

let client = null;

if (process.env.REDIS_URL) {
  client = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: 1,
    enableReadyCheck: false,
    lazyConnect: true,
  });
  client.on('connect', () => console.log('[Redis] connected'));
  client.on('error', (err) => console.error('[Redis] error:', err.message));
} else {
  console.warn('[Redis] REDIS_URL not set — caching disabled, falling back to DB');
}

module.exports = client;
