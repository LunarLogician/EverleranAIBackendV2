const mongoose = require('mongoose');

const mcqSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    documentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Document',
      required: false,  // Optional - only when generated from document
    },
    title: {
      type: String,
      required: true,
    },
    sourceText: {
      type: String,
      required: true,
    },
    questions: [
      {
        id: String,
        question: String,
        options: [String], // [A, B, C, D]
        correctAnswer: String, // "A", "B", "C", or "D"
        explanation: String,
      },
    ],
    attempts: [
      {
        userAnswers: [String], // User's selected options
        score: Number,
        totalQuestions: Number,
        percentage: Number,
        attemptedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    bestScore: {
      type: Number,
      default: 0,
    },
    totalAttempts: {
      type: Number,
      default: 0,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('MCQ', mcqSchema);
