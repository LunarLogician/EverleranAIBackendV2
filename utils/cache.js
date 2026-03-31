const redis = require('../config/redis');
const Usage = require('../models/Usage');

const USAGE_TTL = 60; // 1 minute

/**
 * Get usage doc from cache (Redis) or DB, then cache it.
 * Only caches { totalTokens, tokenLimit } — the read-only preflight fields.
 * Full Mongoose doc returned from DB so callers can mutate & save it.
 */
async function getCachedUsage(userId) {
  if (redis) {
    try {
      const cached = await redis.get(`usage:${userId}`);
      if (cached) return JSON.parse(cached);
    } catch (_) { /* cache miss — fall through */ }
  }
  const doc = await Usage.findOne({ userId });
  if (doc && redis) {
    try {
      await redis.set(
        `usage:${userId}`,
        JSON.stringify({ totalTokens: doc.totalTokens, tokenLimit: doc.tokenLimit }),
        'EX',
        USAGE_TTL
      );
    } catch (_) { /* non-fatal */ }
  }
  return doc;
}

/**
 * Delete the cached usage for a user.
 * Call this after any operation that mutates totalTokens.
 */
async function invalidateUsageCache(userId) {
  if (redis) {
    try { await redis.del(`usage:${userId}`); } catch (_) { /* non-fatal */ }
  }
}

module.exports = { getCachedUsage, invalidateUsageCache };
