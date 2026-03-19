const express = require('express');
const multer = require('multer');
const router = express.Router();
const flashcardController = require('../controllers/flashcardController');
const authMiddleware = require('../middleware/auth');
const requirePlan = require('../middleware/requirePlan');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

router.use(authMiddleware);

// All flashcard generation requires pro plan
router.post('/generate', requirePlan('pro'), flashcardController.generateFlashcards);
router.post('/generate-from-text', requirePlan('pro'), flashcardController.generateFlashcardsFromText);
router.post('/generate-from-file', requirePlan('pro'), upload.single('file'), flashcardController.generateFlashcardsFromFile);
router.get('/', flashcardController.getUserFlashcards);
router.get('/:flashcardId', flashcardController.getFlashcardSet);
router.put('/:flashcardId/progress', flashcardController.updateFlashcardProgress);
router.delete('/:flashcardId', flashcardController.deleteFlashcardSet);

module.exports = router;
