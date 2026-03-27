const express = require('express');
const router = express.Router();
const multer = require('multer');
const chatController = require('../controllers/chatController');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});


router.get('/history', chatController.getHistory); // <-- This must come first!
router.get('/count', chatController.getChatCount); // <-- Add this before /:chatId
router.post('/direct', upload.single('file'), chatController.directChat);
router.post('/', chatController.createChat);
router.get('/:chatId/summary', chatController.generateSummary);
router.get('/:chatId', chatController.getChatHistory);
router.post('/:chatId/message', chatController.sendMessage);
router.delete('/all', chatController.deleteAllChats);
router.delete('/:chatId', chatController.deleteChat);

module.exports = router;
