const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    plan: {
      type: String,
      enum: ['free', 'basic', 'pro'],
      default: 'free',
    },
    price: {
      type: Number, // in PKR/Rupees
      default: 0,
    },
    tokenLimit: {
      type: Number,
      default: 10000, // Free: 10k, Basic: 200k, Pro: 750k
    },
    features: [String], // ['docQA', 'summaryGeneration', 'flashcards', 'quiz', 'advancedAnalysis']
    status: {
      type: String,
      enum: ['active', 'inactive', 'cancelled'],
      default: 'active',
    },
    startDate: {
      type: Date,
      default: Date.now,
    },
    endDate: Date,
    autoRenew: {
      type: Boolean,
      default: true,
    },
    paymentMethod: String, // 'jazzCash', 'pgtw', 'creditCard'
    paymentId: String, // External payment gateway reference
    renewalDate: Date,
  },
  { timestamps: true }
);

module.exports = mongoose.model('Subscription', subscriptionSchema);
