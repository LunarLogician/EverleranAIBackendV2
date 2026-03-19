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

const upload = multer({ storage });

const requirePlan = require('../middleware/requirePlan');

// ⚠️ CRITICAL: These routes MUST be defined BEFORE parameterized routes
// POST upload - requires basic plan
router.post('/upload', authMiddleware, requirePlan('basic'), upload.single('file'), documentController.uploadDocument);

// GET list - exact path match
router.get('/', authMiddleware, documentController.getUserDocuments);

// ONLY THEN parameterized routes
// GET details - matches /:documentId
router.get('/:documentId', authMiddleware, documentController.getDocumentDetails);

// DELETE - matches /:documentId
router.delete('/:documentId', authMiddleware, documentController.deleteDocument);

module.exports = router;
