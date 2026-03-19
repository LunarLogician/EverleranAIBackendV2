const Document = require('../models/Document');
const DocumentChunk = require('../models/DocumentChunk');
const { uploadToCloudinary, extractTextFromDocument } = require('../services/documentService');
const { splitIntoChunks, estimateTokens } = require('../utils/chunkText');

// Upload document
exports.uploadDocument = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const { title } = req.body;
    const userId = req.user._id;

    // Determine file type
    const fileExtension = req.file.originalname.split('.').pop().toUpperCase();
    const fileType =
      {
        pdf: 'PDF',
        pptx: 'PPTX',
        docx: 'DOCX',
        jpg: 'JPG',
        jpeg: 'JPG',
        png: 'PNG',
        txt: 'TXT',
      }[fileExtension.toLowerCase()] || 'TXT';

    // Upload to Cloudinary (fast)
    const { url, publicId, fileSize } = await uploadToCloudinary(
      req.file.path,
      req.file.originalname,
      fileType
    );

    // Create document record with "processing" status
    const document = new Document({
      userId,
      title: title || req.file.originalname,
      fileName: req.file.originalname,
      fileType,
      cloudinaryUrl: url,
      cloudinaryPublicId: publicId,
      textContent: null,  // Will be filled by background job
      chunks: [],         // Will be filled by background job
      fileSize,
      processingStatus: 'processing',  // Mark as processing
      chunkCount: 0,
    });

    await document.save();

    // Return immediately (don't wait for extraction)
    res.status(201).json({
      success: true,
      document: {
        id: document._id,
        title: document.title,
        fileType: document.fileType,
        uploadedAt: document.createdAt,
        processingStatus: 'processing',
        message: 'Document uploaded, extracting text in background...'
      },
    });

    console.log(`📁 Document ${document._id} uploaded. Starting background extraction...`);
    console.log(`📄 File: ${req.file.originalname}, Type: ${fileType}`);

    // Start background extraction (async, don't await)
    const fs = require('fs');
    extractAndChunkDocument(document._id, req.file.path, fileType)
      .catch(err => console.error('Background extraction failed:', err))
      .finally(() => {
        // Clean up temp file after extraction completes
        fs.unlink(req.file.path, (err) => {
          if (err) console.warn(`Warning: Could not delete temp file: ${req.file.path}`);
        });
      });

  } catch (error) {
    next(error);
  }
};

// Background job: Extract text and create chunks
async function extractAndChunkDocument(documentId, filePath, fileType) {
  try {
    console.log(`\n⏳ [${new Date().toISOString()}] Starting extraction for document ${documentId}...`);
    console.log(`   File Path: ${filePath}`);
    console.log(`   File Type: ${fileType}\n`);

    // Extract text
    let text = null;
    try {
      console.log(`🔄 Calling extractTextFromDocument...`);
      const extractResult = await extractTextFromDocument(null, fileType, 1, filePath);
      console.log(`📋 Full Extract Result:`, extractResult);
      console.log(`   Result.text type: ${typeof extractResult?.text}`);
      console.log(`   Result.text length: ${extractResult?.text?.length || 'N/A'}`);
      console.log(`   Result.text value: "${extractResult?.text}"`);
      
      if (extractResult.text && !extractResult.text.startsWith('[Error') && !extractResult.text.startsWith('[Failed')) {
        text = extractResult.text;
        console.log(`✅ Text extracted successfully: ${text.length} characters`);
        console.log(`   First 200 chars: "${text.substring(0, 200)}"`);
      } else {
        // If extraction returned an error message or empty, use placeholder
        console.warn(`⚠️  Extraction returned error or empty`);
        console.warn(`   Condition check: text=${!!extractResult?.text}, startsWithError=${extractResult?.text?.startsWith('[Error')}, startsWithFailed=${extractResult?.text?.startsWith('[Failed')}`);
        text = '[Document extraction unavailable. This may be an image-based PDF. You can still generate flashcards and quizzes.]';
        console.warn(`📝 Using placeholder text (${text.length} chars)`);
      }
    } catch (extractError) {
      console.error(`❌ Extraction threw error:`, extractError.message);
      console.error(`   Stack:`, extractError.stack);
      text = '[Document content extraction failed. Text content not available. You can still generate flashcards and quizzes.]';
    }

    console.log(`\n🔍 Text variable after extraction logic:`);
    console.log(`   Type: ${typeof text}`);
    console.log(`   Length: ${text?.length || 'N/A'}`);
    console.log(`   Value: "${text}"`);


    // Split into chunks
    console.log(`📂 Splitting text into chunks...`);
    const chunks = splitIntoChunks(text, 2000);
    console.log(`✅ Created ${chunks.length} chunks`);

    // Save chunks to DocumentChunk collection
    console.log(`💾 Saving chunks to DocumentChunk collection...`);
    const chunkDocs = chunks.map((content, index) => ({
      documentId,
      chunkIndex: index,
      content,
      tokenCount: estimateTokens(content),
    }));

    if (chunks.length > 0) {
      await DocumentChunk.insertMany(chunkDocs);
      console.log(`✅ Chunks saved to database`);
    }

    // Update Document: mark complete, save full text, set chunk count
    console.log(`🔄 Updating document status to "completed"...`);
    const updateResult = await Document.findByIdAndUpdate(documentId, {
      textContent: text,
      processingStatus: 'completed',
      chunkCount: chunks.length,
    }, { new: true });
    console.log(`✅ Document updated: status=${updateResult.processingStatus}, chunks=${updateResult.chunkCount}, textLength=${updateResult.textContent.length}`);

    console.log(`\n✅✅✅ Document ${documentId} extraction complete! ✅✅✅\n`);

  } catch (error) {
    console.error(`\n❌❌❌ Extraction failed for ${documentId}: ${error.message}`);
    console.error(`Stack: ${error.stack}\n`);

    // Update Document: mark as failed
    try {
      await Document.findByIdAndUpdate(documentId, {
        processingStatus: 'failed',
        textContent: '[Document extraction failed. Please try uploading again.]',
      });
      console.log(`Document marked as failed in database`);
    } catch (updateError) {
      console.error(`Failed to update document as failed:`, updateError.message);
    }
  }
}

// Get user's documents
exports.getUserDocuments = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const documents = await Document.find({ userId }).select(
      'title fileType totalChats processingStatus createdAt'
    );

    res.status(200).json({
      success: true,
      documents,
    });
  } catch (error) {
    next(error);
  }
};

// Get document details
exports.getDocumentDetails = async (req, res, next) => {
  try {
    const { documentId } = req.params;
    const document = await Document.findById(documentId);

    if (!document) {
      return res.status(404).json({ message: 'Document not found' });
    }

    if (document.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Unauthorized access' });
    }

    res.status(200).json({
      success: true,
      document,
    });
  } catch (error) {
    next(error);
  }
};

// Delete document
exports.deleteDocument = async (req, res, next) => {
  try {
    const { documentId } = req.params;
    const document = await Document.findById(documentId);

    if (!document) {
      return res.status(404).json({ message: 'Document not found' });
    }

    if (document.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Unauthorized access' });
    }

    // Delete from Cloudinary
    // await cloudinary.uploader.destroy(document.cloudinaryPublicId);

    await Document.findByIdAndDelete(documentId);

    res.status(200).json({
      success: true,
      message: 'Document deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};
