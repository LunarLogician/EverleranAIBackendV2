const express = require('express');
const multer = require('multer');
const router = express.Router();
const mcqController = require('../controllers/mcqController');
const auth = require('../middleware/auth');

// File upload configuration
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

// All routes require authentication
router.use(auth);

// Generate MCQs from source text
router.post('/generate', mcqController.generateMCQs);

// Generate MCQs from document
router.post('/generate-from-document', mcqController.generateMCQsFromDocument);

// Generate MCQs from uploaded file
router.post('/generate-from-file', upload.single('file'), mcqController.generateMCQsFromFile);

// Submit answers and get results
router.post('/submit', mcqController.submitAnswers);

// Get all MCQs for user
router.get('/list', mcqController.getMCQs);

// Get single MCQ with questions
router.get('/:mcqId', mcqController.getMCQ);

// Get MCQ attempt history
router.get('/:mcqId/history', mcqController.getMCQHistory);

// Delete MCQ
router.delete('/:mcqId', mcqController.deleteMCQ);

module.exports = router;
