const cron = require('node-cron');
const Usage = require('../models/Usage');

/**
 * Runs on the 1st of every month at 00:00 UTC.
 * Resets each user's token counters so the monthly allowance renews.
 */
const startMonthlyReset = () => {
  cron.schedule('0 0 1 * *', async () => {
    try {
      const now = new Date();
      const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      const result = await Usage.updateMany(
        {},
        {
          $set: {
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            usageBreakdown: [],
            currentMonth,
          },
        }
      );

      console.log(`✅ Monthly token reset complete — ${result.modifiedCount} usage records cleared (${currentMonth.toISOString().slice(0, 7)})`);
    } catch (err) {
      console.error('❌ Monthly token reset failed:', err.message);
    }
  }, { timezone: 'UTC' });

  console.log('🗓️  Monthly token-reset cron job scheduled (1st of each month, 00:00 UTC)');
};

module.exports = { startMonthlyReset };
