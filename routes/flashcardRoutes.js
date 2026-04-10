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

// All features open — token limits gate usage per plan
router.post('/generate', flashcardController.generateFlashcards);
router.post('/generate-from-text', flashcardController.generateFlashcardsFromText);
router.post('/generate-from-file', upload.single('file'), flashcardController.generateFlashcardsFromFile);
router.get('/', flashcardController.getUserFlashcards);
router.get('/:flashcardId', flashcardController.getFlashcardSet);
router.put('/:flashcardId/progress', flashcardController.updateFlashcardProgress);
router.delete('/:flashcardId', flashcardController.deleteFlashcardSet);

module.exports = router;
