const crypto = require('crypto');
const Subscription = require('../models/Subscription');
const Usage = require('../models/Usage');

const LS_API = 'https://api.lemonsqueezy.com/v1';
const VARIANT_IDS = {
  basic: process.env.LEMONSQUEEZY_BASIC_VARIANT_ID,
  pro:   process.env.LEMONSQUEEZY_PRO_VARIANT_ID,
};

const PLAN_CONFIG = {
  free:  { price: 0,    tokenLimit: 200,   features: ['chat'] },
  basic: { price: 999,  tokenLimit: 100000,  features: ['chat', 'assignments', 'documents'] },
  pro:   { price: 1999, tokenLimit: 500000,  features: ['chat', 'assignments', 'documents', 'quiz', 'flashcards'] },
};

// Get available plans (public — no auth needed)
exports.getPlans = (req, res) => {
  res.json({ success: true, plans: PLAN_CONFIG });
};

// Get user's subscription
exports.getUserSubscription = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const subscription = await Subscription.findOne({ userId });

    if (!subscription) {
      return res.status(404).json({ message: 'Subscription not found' });
    }

    const usage = await Usage.findOne({ userId });

    res.status(200).json({
      success: true,
      subscription,
      usage: {
        totalTokens: usage?.totalTokens || 0,
        tokenLimit: usage?.tokenLimit || 200,
        remainingTokens: (usage?.tokenLimit || 200) - (usage?.totalTokens || 0),
      },
    });
  } catch (error) {
    next(error);
  }
};

// Upgrade subscription (placeholder for payment gateway integration)
exports.upgradeSubscription = async (req, res, next) => {
  try {
    const { plan } = req.body; // 'basic' or 'pro'
    const userId = req.user._id;

    const config = PLAN_CONFIG[plan];
    if (!config || plan === 'free') {
      return res.status(400).json({ message: 'Invalid plan' });
    }

    // TODO: Integrate with PGTW/JazzCash payment gateway
    // For now, return placeholder response

    const subscription = await Subscription.findOneAndUpdate(
      { userId },
      {
        plan,
        price: config.price,
        tokenLimit: config.tokenLimit,
        features: config.features,
        status: 'active',
        renewalDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      },
      { new: true }
    );

    // Update usage token limit
    await Usage.findOneAndUpdate(
      { userId },
      { tokenLimit: config.tokenLimit }
    );

    res.status(200).json({
      success: true,
      message: `Subscription upgraded to ${plan} plan`,
      subscription,
      paymentRequired: true,
      redirectUrl: '/checkout', // Placeholder
    });
  } catch (error) {
    next(error);
  }
};

// Cancel subscription
exports.cancelSubscription = async (req, res, next) => {
  try {
    const userId = req.user._id;

    const subscription = await Subscription.findOneAndUpdate(
      { userId },
      {
        plan: 'free',
        status: 'cancelled',
        tokenLimit: 200,
        features: ['docQA', 'summaryGeneration'],
      },
      { new: true }
    );

    await Usage.findOneAndUpdate(
      { userId },
      { tokenLimit: 200 }
    );

    res.status(200).json({
      success: true,
      message: 'Subscription cancelled',
      subscription,
    });
  } catch (error) {
    next(error);
  }
};

// Create Lemon Squeezy checkout session
exports.createCheckout = async (req, res, next) => {
  try {
    const { plan } = req.body;
    const variantId = VARIANT_IDS[plan];
    console.log('🛒 Checkout request:', { plan, variantId, storeId: process.env.LEMONSQUEEZY_STORE_ID });
    
    if (!variantId) return res.status(400).json({ message: 'Invalid plan' });

    const requestBody = {
      data: {
        type: 'checkouts',
        attributes: {
          checkout_data: {
            email: req.user.email,
            name: req.user.name,
            custom: {
              user_id: req.user._id.toString(),
              plan,
            },
          },
          product_options: {
            redirect_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard?upgraded=true`,
          },
        },
        relationships: {
          store: { data: { type: 'stores', id: String(process.env.LEMONSQUEEZY_STORE_ID) } },
          variant: { data: { type: 'variants', id: String(variantId) } },
        },
      },
    };
    console.log('📦 Sending to LS API:', JSON.stringify(requestBody, null, 2));

    const response = await fetch(`${LS_API}/checkouts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.LEMONSQUEEZY_API_KEY}`,
        'Content-Type': 'application/vnd.api+json',
        Accept: 'application/vnd.api+json',
      },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();
    console.log('✅ LS Response:', { status: response.status, data });
    
    if (!response.ok) {
      console.error('❌ LS checkout error:', JSON.stringify(data, null, 2));
      return res.status(500).json({ message: 'Failed to create checkout session', error: data });
    }

    res.json({ success: true, checkoutUrl: data.data.attributes.url });
  } catch (error) {
    console.error('💥 Checkout error:', error);
    next(error);
  }
};

// Lemon Squeezy webhook — upgrades/cancels plan based on subscription events
exports.paymentWebhook = async (req, res, next) => {
  try {
    const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
    const signature = req.headers['x-signature'];

    if (secret && signature) {
      const hmac = crypto.createHmac('sha256', secret).update(req.rawBody).digest('hex');
      if (hmac !== signature) {
        console.warn('⚠️  Invalid LS webhook signature');
        return res.status(401).json({ message: 'Invalid signature' });
      }
    }

    const event = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const eventName = event?.meta?.event_name;
    const userId    = event?.meta?.custom_data?.user_id;
    const plan      = event?.meta?.custom_data?.plan;
    const lsSubId   = event?.data?.id;

    console.log(`📦 LS Webhook: ${eventName}`, { userId, plan });

    if (!userId) return res.status(200).json({ received: true });

    if (eventName === 'subscription_created' || eventName === 'subscription_updated') {
      const config = PLAN_CONFIG[plan] || PLAN_CONFIG.basic;
      await Subscription.findOneAndUpdate(
        { userId },
        {
          plan: plan || 'basic',
          price: config.price,
          tokenLimit: config.tokenLimit,
          features: config.features,
          status: 'active',
          paymentMethod: 'lemonsqueezy',
          paymentId: lsSubId,
          renewalDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
        { new: true }
      );
      await Usage.findOneAndUpdate({ userId }, { tokenLimit: config.tokenLimit });
      console.log(`✅ Plan activated: ${plan} for user ${userId}`);
    } else if (eventName === 'subscription_cancelled' || eventName === 'subscription_expired') {
      await Subscription.findOneAndUpdate(
        { userId },
        { plan: 'free', status: 'cancelled', tokenLimit: 200, features: PLAN_CONFIG.free.features }
      );
      await Usage.findOneAndUpdate({ userId }, { tokenLimit: 200 });
      console.log(`🔴 Plan cancelled for user ${userId}`);
    }

    res.status(200).json({ received: true });
  } catch (error) {
    next(error);
  }
};
