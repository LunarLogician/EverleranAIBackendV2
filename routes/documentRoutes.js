const express = require('express');
const router = express.Router();
const multer = require('multer');
const documentController = require('../controllers/documentController');
const authMiddleware = require('../middleware/auth');

// Setup multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  },
});

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // docx
  'application/msword',                                                        // doc
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', // pptx
  'image/jpeg',
  'image/png',
  'text/plain',
];

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      const err = new Error('Unsupported file type. Please upload PDF, DOCX, PPTX, JPG, PNG, or TXT.');
      err.status = 400;
      cb(err, false);
    }
  },
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
});

const requirePlan = require('../middleware/requirePlan');

// ⚠️ CRITICAL: These routes MUST be defined BEFORE parameterized routes
// POST upload - requires basic plan
router.post('/upload', authMiddleware, upload.single('file'), documentController.uploadDocument);

// GET list - exact path match
router.get('/', authMiddleware, documentController.getUserDocuments);

// ONLY THEN parameterized routes
// GET details - matches /:documentId
router.get('/:documentId', authMiddleware, documentController.getDocumentDetails);

// DELETE - matches /:documentId
router.delete('/:documentId', authMiddleware, documentController.deleteDocument);

module.exports = router;
