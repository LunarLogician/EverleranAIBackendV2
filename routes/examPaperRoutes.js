const express = require('express');
const multer = require('multer');
const router = express.Router();
const examPaperController = require('../controllers/examPaperController');
const auth = require('../middleware/auth');
const requirePlan = require('../middleware/requirePlan');

// File upload configuration (matches MCQ / other routes)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

// All routes require authentication
router.use(auth);

// Generate exam paper from raw text
router.post('/generate', examPaperController.generateExamPaper);

// Generate exam paper from a previously-uploaded document
router.post('/generate-from-document', examPaperController.generateExamPaperFromDocument);

// Generate exam paper from an uploaded file
router.post('/generate-from-file', upload.single('file'), examPaperController.generateExamPaperFromFile);

// Get all exam papers for the authenticated user
router.get('/list', examPaperController.getExamPapers);

// Get a single exam paper by ID
router.get('/:examId', examPaperController.getExamPaper);

// Delete an exam paper
router.delete('/:examId', examPaperController.deleteExamPaper);

module.exports = router;
