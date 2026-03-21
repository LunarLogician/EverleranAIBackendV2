const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema(
  {
    id: String,
    type: {
      type: String,
      enum: ['mcq', 'short', 'long', 'true_false'],
      required: true,
    },
    question: { type: String, required: true },
    // MCQ & true_false
    options: [String],      // ["Option A", "Option B", "Option C", "Option D"] for mcq
    correctAnswer: String,  // "A"/"B"/"C"/"D" for mcq | "true"/"false" for true_false
    // Short & long answer
    sampleAnswer: String,
    marks: { type: Number, default: 1 },
    explanation: String,
  },
  { _id: false }
);

const examPaperSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    documentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Document',
      required: false,
    },
    title: { type: String, required: true },
    subject: { type: String, default: '' },
    instructions: { type: String, default: '' },
    totalMarks: { type: Number, default: 0 },
    duration: { type: Number, default: 60 }, // minutes
    difficulty: {
      type: String,
      enum: ['easy', 'medium', 'hard'],
      default: 'medium',
    },
    sourceText: { type: String, required: true },
    questions: [questionSchema],
  },
  { timestamps: true }
);

module.exports = mongoose.model('ExamPaper', examPaperSchema);
