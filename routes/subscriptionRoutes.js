const express = require('express');
const router = express.Router();
const subscriptionController = require('../controllers/subscriptionController');
const authMiddleware = require('../middleware/auth');

// Public — no auth needed
router.get('/plans', subscriptionController.getPlans);

// Webhook — called by Lemon Squeezy servers (no user JWT)
router.post('/webhook', subscriptionController.paymentWebhook);

router.use(authMiddleware);

router.get('/', subscriptionController.getUserSubscription);
router.post('/checkout', subscriptionController.createCheckout);
router.post('/upgrade', subscriptionController.upgradeSubscription);
router.post('/cancel', subscriptionController.cancelSubscription);

module.exports = router;
