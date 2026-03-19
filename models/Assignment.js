const mongoose = require('mongoose');

const assignmentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    type: {
      type: String,
      enum: ['generated', 'rewritten'],
      required: true,
    },

    // For GENERATED assignments
    topic: String,
    subject: String,
    wordCount: Number,
    tone: {
      type: String,
      enum: ['academic', 'casual', 'technical'],
      default: 'academic',
    },
    generatedContent: String,

    // For REWRITTEN assignments
    studentName: String,
    enrollmentId: String,
    originalFile: {
      url: String,
      fileName: String,
      fileType: String,
    },
    originalContent: String,
    rewrittenContent: String,
  },
  { timestamps: true }
);

module.exports = mongoose.model('Assignment', assignmentSchema);