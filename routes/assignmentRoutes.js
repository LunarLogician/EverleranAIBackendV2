const express = require('express');
const multer = require('multer');
const { generateAssignment, rewriteAssignment } = require('../controllers/assignmentController');
const auth = require('../middleware/auth');

const router = express.Router();

// Simpler multer configuration that accepts all file types
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

router.use(auth);

// POST /api/assignments/generate - accepts optional file and message
router.post('/generate', upload.single('file'), generateAssignment);

// POST /api/assignments/rewrite - accepts file, studentName, enrollmentId
router.post('/rewrite', upload.single('file'), rewriteAssignment);

module.exports = router;