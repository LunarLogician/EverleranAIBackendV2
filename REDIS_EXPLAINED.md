# Redis in This Project — Explained Simply

## What is Redis?

Redis is a super-fast **in-memory database**. Unlike MongoDB which writes data to disk, Redis stores everything in RAM.

| | MongoDB | Redis |
|---|---|---|
| Storage | Disk | RAM |
| Speed | ~5ms per query | ~0.1ms per query |
| Data survives restart? | Yes | Configurable |
| Good for | Permanent data | Temporary/cached data |

RAM is roughly **50x faster** than disk. That's why Redis is used for caching — you store a copy of frequently-read data there so you don't have to hit MongoDB every time.

---

## The Problem Redis Solves Here

Before Redis, every single API request that needed to check:
- "Is this user on a paid plan?" → `Subscription.findOne()` → MongoDB hit
- "Has this user hit their token limit?" → `Usage.findOne()` → MongoDB hit

These two queries fired on **every request**, for every user. With 100 users making requests, that's 200 unnecessary MongoDB queries per second for data that almost never changes.

---

## How the Code Works

### 1. The Client — `config/redis.js`

```js
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
}

module.exports = client;
```

**What this does:**
- Creates one Redis connection for the whole app (shared across all files)
- `lazyConnect: true` — don't connect until the first command is actually run
- `maxRetriesPerRequest: 1` — if Redis is down, fail fast (don't hang)
- If `REDIS_URL` env var is missing, `client` stays `null` — the app works without Redis
- Exports the client so any file can `require` it

**Key concept — single instance:** You create the Redis client once and reuse it everywhere. Creating a new connection per request would be slow and wasteful.

---

### 2. The Cache Helpers — `utils/cache.js`

```js
async function getCachedUsage(userId) {
  // Step 1: Try Redis first
  if (redis) {
    const cached = await redis.get(`usage:${userId}`);
    if (cached) return JSON.parse(cached);  // Cache HIT — return immediately
  }

  // Step 2: Cache MISS — go to MongoDB
  const doc = await Usage.findOne({ userId });

  // Step 3: Store result in Redis for next time (expires in 60s)
  if (doc && redis) {
    await redis.set(
      `usage:${userId}`,
      JSON.stringify({ totalTokens: doc.totalTokens, tokenLimit: doc.tokenLimit }),
      'EX', 60  // EX = expire after N seconds
    );
  }

  return doc;
}
```

This pattern is called **"Cache-Aside"** (also called Lazy Loading):

```
Request comes in
      ↓
Check Redis first
      ↓
  Found? → Return it (fast, no DB)
      ↓
Not found? → Query MongoDB
      ↓
Store result in Redis
      ↓
Return result
```

**The key string `usage:{userId}`:**
Redis stores everything as key-value pairs. The key is just a string. We use `usage:64f3abc...` so:
- Each user has their own cache entry
- Keys don't collide with each other
- Easy to find and delete specific user's cache

---

### 3. Cache Invalidation — why it matters

```js
async function invalidateUsageCache(userId) {
  if (redis) {
    await redis.del(`usage:${userId}`);
  }
}
```

**The stale data problem:** If a user sends a chat message, their `totalTokens` increases in MongoDB. But Redis still has the old count cached. If we don't delete it, the next request reads stale data and thinks the user has fewer tokens than they actually do.

**Solution:** Every time we update usage in MongoDB, we immediately delete the Redis cache key. Next request → cache miss → fresh data fetched from MongoDB → cached again.

```
User sends message
      ↓
Claude responds, tokens used
      ↓
Save new token count to MongoDB
      ↓
Delete Redis cache key  ← invalidation
      ↓
Next request: cache miss → fresh DB query → re-cached
```

---

### 4. Subscription Cache — `middleware/requirePlan.js`

```js
const cacheKey = `sub:${userId}`;

// Try cache
const cached = await redis.get(cacheKey);
if (cached) {
  const parsed = JSON.parse(cached);
  currentPlan = parsed.plan;
  currentStatus = parsed.status;
}

// Cache miss — hit DB and store
if (!currentPlan) {
  const subscription = await Subscription.findOne({ userId });
  currentPlan = subscription?.plan || 'free';
  await redis.set(cacheKey, JSON.stringify({ plan: currentPlan, status: currentStatus }), 'EX', 300);
}
```

TTL is **300 seconds (5 minutes)** here instead of 60 seconds because:
- Subscription plan changes are rare (user has to go through a payment flow)
- We also manually invalidate this key in `subscriptionController.js` whenever a plan changes
- So worst case stale data = 5 minutes, but in practice it's instant because we delete on change

---

## TTL (Time To Live) — The Expiry System

Every cached value has an expiry set with `'EX', seconds`:

| Cache | TTL | Why |
|---|---|---|
| `usage:{userId}` | 60 seconds | Changes after every AI call |
| `sub:{userId}` | 300 seconds | Rarely changes, manual invalidation on change |

When TTL hits zero, Redis automatically deletes the key. This is a safety net — even if our manual invalidation missed something, stale data never lives longer than the TTL.

---

## The Fallback Pattern

Every Redis operation is wrapped in a check:

```js
if (redis) {
  try {
    await redis.set(...)
  } catch (_) { /* non-fatal — ignore */ }
}
```

This means:
- If `REDIS_URL` is not set → `redis` is `null` → skip all caching → app works normally
- If Redis goes down mid-operation → the `try/catch` swallows the error → app falls back to MongoDB
- **Redis is an enhancement, not a dependency** — the app never crashes because of Redis

---

## What Redis Commands We Use

| Command | What it does |
|---|---|
| `redis.get(key)` | Read a value by key. Returns `null` if not found |
| `redis.set(key, value, 'EX', seconds)` | Write a value with an expiry time |
| `redis.del(key)` | Delete a key immediately (cache invalidation) |

These are the only three commands needed for basic caching.

---

## Flow in Production

```
User hits /api/quiz/generate
         ↓
requirePlan middleware
  → redis.get("sub:userId")  → HIT → skip MongoDB
         ↓
quizController.generateQuiz
  → getCachedUsage(userId)   → HIT → skip MongoDB
  → call Claude API
  → save result to MongoDB
  → invalidateUsageCache()   → redis.del("usage:userId")
         ↓
Response sent
```

Two MongoDB queries eliminated from the hot path. At scale with many users, this is significant.
