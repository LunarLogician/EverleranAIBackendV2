const Subscription = require('../models/Subscription');
const redis = require('../config/redis');

const PLAN_LEVEL = { free: 0, basic: 1, pro: 2 };
const SUB_CACHE_TTL = 300; // 5 minutes

/**
 * Middleware factory — requires the user to be on at least `minPlan`.
 * Must be used AFTER authMiddleware (req.user must be set).
 *
 * Usage:
 *   router.post('/generate', requirePlan('basic'), handler);
 *   router.post('/quiz',     requirePlan('pro'),   handler);
 */
const requirePlan = (minPlan) => async (req, res, next) => {
  try {
    const userId = req.user._id.toString();
    const cacheKey = `sub:${userId}`;

    let currentPlan, currentStatus;

    // Try cache first
    if (redis) {
      try {
        const cached = await redis.get(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          currentPlan = parsed.plan;
          currentStatus = parsed.status;
        }
      } catch (_) { /* cache miss — fall through to DB */ }
    }

    if (!currentPlan) {
      const subscription = await Subscription.findOne({ userId: req.user._id });
      currentPlan = subscription?.plan || 'free';
      currentStatus = subscription?.status || 'inactive';
      // Store in cache
      if (redis) {
        try {
          await redis.set(cacheKey, JSON.stringify({ plan: currentPlan, status: currentStatus }), 'EX', SUB_CACHE_TTL);
        } catch (_) { /* non-fatal */ }
      }
    }

    if (
      PLAN_LEVEL[currentPlan] === undefined ||
      PLAN_LEVEL[currentPlan] < PLAN_LEVEL[minPlan] ||
      (currentPlan !== 'free' && currentStatus !== 'active')
    ) {
      return res.status(403).json({
        message: `This feature requires the ${minPlan} plan or higher.`,
        requiredPlan: minPlan,
        currentPlan,
        upgradeRequired: true,
      });
    }

    next();
  } catch (error) {
    next(error);
  }
};

module.exports = requirePlan;
