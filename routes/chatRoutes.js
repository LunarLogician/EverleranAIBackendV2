const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);


router.get('/history', chatController.getHistory); // <-- This must come first!
router.get('/count', chatController.getChatCount); // <-- Add this before /:chatId
router.post('/direct', chatController.directChat);
router.post('/', chatController.createChat);
router.get('/:chatId/summary', chatController.generateSummary);
router.get('/:chatId', chatController.getChatHistory);
router.post('/:chatId/message', chatController.sendMessage);

module.exports = router;
