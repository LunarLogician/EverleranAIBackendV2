const mongoose = require('mongoose');

const usageSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    currentMonth: {
      type: Date,
      default: () => {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth(), 1);
      },
    },
    inputTokens: {
      type: Number,
      default: 0,
    },
    outputTokens: {
      type: Number,
      default: 0,
    },
    totalTokens: {
      type: Number,
      default: 0,
    },
    tokenLimit: {
      type: Number,
      default: 10000, // Free tier
    },
    usageBreakdown: [
      {
        featureName: String, // 'docQA', 'summaryGeneration', 'flashcards', 'quiz'
        inputTokens: Number,
        outputTokens: Number,
        count: Number, // number of times this feature was used
      },
    ],
    abuseAttempts: {
      type: Number,
      default: 0,
    },
    blockedUntil: Date, // For soft cap abuse detection
  },
  { timestamps: true }
);

module.exports = mongoose.model('Usage', usageSchema);
