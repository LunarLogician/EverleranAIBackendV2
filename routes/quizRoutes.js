const express = require('express');
const router = express.Router();
const quizController = require('../controllers/quizController');
const authMiddleware = require('../middleware/auth');
const multer = require('multer');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

router.use(authMiddleware);

router.post('/generate', quizController.generateQuiz);
router.post('/generate-from-text', quizController.generateQuizFromText);
router.post('/generate-from-file', upload.single('file'), quizController.generateQuizFromFile);
router.get('/', quizController.getUserQuizzes);
router.get('/:quizId', quizController.getQuizDetails);
router.post('/:quizId/submit', quizController.submitQuizAttempt);
router.delete('/:quizId', quizController.deleteQuiz);

module.exports = router;
