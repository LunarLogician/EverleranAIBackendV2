const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    fileName: {
      type: String,
      required: true,
    },
    fileType: {
      type: String,
      enum: ['PDF', 'PPTX', 'DOCX', 'JPG', 'PNG', 'TXT'],
      required: true,
    },
    cloudinaryUrl: {
      type: String,
      required: true,
    },
    cloudinaryPublicId: {
      type: String,
      required: true,
    },
    textContent: {
      type: String, // Extracted text from document
    },
    chunks: [
      {
        chunkId: String,
        content: String,
        embedding: [Number], // For future vector search
      },
    ],
    pageCount: {
      type: Number,
    },
    fileSize: {
      type: Number, // in bytes
    },
    processingStatus: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed'],
      default: 'pending',
    },
    chunkCount: {
      type: Number,
      default: 0,
    },
    chats: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Chat',
      },
    ],
  },
  { timestamps: true }
);

// Add indexes for faster queries
documentSchema.index({ userId: 1, createdAt: -1 });  // Fast user document listing
documentSchema.index({ processingStatus: 1 });       // Fast status queries
documentSchema.index({ userId: 1, processingStatus: 1 });  // Combined for uploads

module.exports = mongoose.model('Document', documentSchema);
