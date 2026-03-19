const Subscription = require('../models/Subscription');

const PLAN_LEVEL = { free: 0, basic: 1, pro: 2 };

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
    const subscription = await Subscription.findOne({ userId: req.user._id });
    const currentPlan = subscription?.plan || 'free';
    const currentStatus = subscription?.status || 'inactive';

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
