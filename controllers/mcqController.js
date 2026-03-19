const MCQ = require('../models/MCQ');
const Document = require('../models/Document');
const { generateMCQsFromText } = require('../services/claudeService');
const { extractTextFromFile } = require('../services/documentService');

// ── Helper: normalize correctAnswer to letter (A/B/C/D) ──
const getCorrectLabel = (q) => {
  const ca = q.correctAnswer;
  if (!ca) return null;
  const upper = ca.trim().toUpperCase();
  if (['A', 'B', 'C', 'D'].includes(upper)) return upper;
  const idx = q.options.findIndex(o =>
    o.trim().toLowerCase() === ca.trim().toLowerCase()
  );
  return idx >= 0 ? String.fromCharCode(65 + idx) : null;
};

// Generate MCQs from source text
exports.generateMCQs = async (req, res, next) => {
  try {
    const { sourceText, title, numQuestions = 5 } = req.body;
    const userId = req.user._id;

    if (!sourceText) {
      return res.status(400).json({ message: 'Source text is required' });
    }

    console.log('🎯 Generating MCQs...', { numQuestions });

    const { questions, inputTokens, outputTokens } = await generateMCQsFromText(
      sourceText,
      numQuestions
    );

    const mcq = new MCQ({
      userId,
      title: title || `MCQ Set - ${new Date().toLocaleDateString()}`,
      sourceText,
      questions,
    });

    await mcq.save();

    console.log('✅ MCQs generated:', { mcqId: mcq._id, count: questions.length });

    res.status(201).json({
      success: true,
      mcqId: mcq._id,
      title: mcq.title,
      questions: questions.map((q) => ({
        id: q.id,
        question: q.question,
        options: q.options,
      })),
      totalTokens: inputTokens + outputTokens,
    });
  } catch (error) {
    console.error('❌ MCQ Generation error:', error.message);
    next(error);
  }
};

// Generate MCQs from document
exports.generateMCQsFromDocument = async (req, res, next) => {
  try {
    const { documentId, numQuestions = 5, title } = req.body;
    const userId = req.user._id;

    const document = await Document.findById(documentId);
    if (!document || document.userId.toString() !== userId.toString()) {
      return res.status(403).json({ message: 'Unauthorized access to document' });
    }

    console.log('🎯 Generating MCQs from document...', { documentId, numQuestions });

    const { questions, inputTokens, outputTokens } = await generateMCQsFromText(
      document.textContent,
      numQuestions
    );

    const mcq = new MCQ({
      userId,
      documentId,
      title: title || `MCQ from ${document.title}`,
      sourceText: document.textContent,
      questions,
    });

    await mcq.save();

    console.log('✅ MCQs from document generated:', { mcqId: mcq._id, count: questions.length });

    res.status(201).json({
      success: true,
      mcqId: mcq._id,
      title: mcq.title,
      questions: questions.map((q) => ({
        id: q.id,
        question: q.question,
        options: q.options,
      })),
      totalTokens: inputTokens + outputTokens,
    });
  } catch (error) {
    console.error('❌ MCQ from Document Generation error:', error.message);
    next(error);
  }
};

// Generate MCQs from uploaded file
exports.generateMCQsFromFile = async (req, res, next) => {
  try {
    const { numQuestions = 5, title } = req.body;
    const userId = req.user._id;
    const file = req.file;

    if (!file) {
      return res.status(400).json({
        success: false,
        message: 'Please upload a file (PDF, DOCX, DOC, or PPTX)',
      });
    }

    if (numQuestions < 1 || numQuestions > 50) {
      return res.status(400).json({
        success: false,
        message: 'numQuestions must be between 1 and 50',
      });
    }

    let fileContent = '';
    try {
      const extracted = await extractTextFromFile(file);
      fileContent = extracted.text;
    } catch (extractError) {
      return res.status(400).json({
        success: false,
        message: `Failed to extract text from file: ${extractError.message}`,
      });
    }

    if (!fileContent || fileContent.trim().length < 50) {
      return res.status(400).json({
        success: false,
        message: 'File has insufficient content to generate MCQs',
      });
    }

    console.log('🎯 Generating MCQs from file...', { numQuestions });

    const { questions, inputTokens, outputTokens } = await generateMCQsFromText(
      fileContent,
      numQuestions
    );

    const mcq = new MCQ({
      userId,
      title: title || `MCQ from ${file.originalname || 'File'}`,
      sourceText: fileContent,
      questions,
    });

    await mcq.save();

    console.log('✅ MCQs from file generated:', { mcqId: mcq._id, count: questions.length });

    res.status(201).json({
      success: true,
      mcqId: mcq._id,
      title: mcq.title,
      questions: questions.map((q) => ({
        id: q.id,
        question: q.question,
        options: q.options,
      })),
      totalTokens: inputTokens + outputTokens,
    });
  } catch (error) {
    console.error('❌ MCQ from File Generation error:', error.message);
    next(error);
  }
};

// Submit answers and check results
exports.submitAnswers = async (req, res, next) => {
  try {
    const { mcqId, userAnswers } = req.body;
    const userId = req.user._id;

    if (!mcqId || !userAnswers || !Array.isArray(userAnswers)) {
      return res.status(400).json({ message: 'Invalid request' });
    }

    const mcq = await MCQ.findById(mcqId);
    if (!mcq) {
      return res.status(404).json({ message: 'MCQ not found' });
    }

    if (mcq.userId.toString() !== userId.toString()) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    // Check answers — normalize correctAnswer to letter first
        let score = 0;

    const results = mcq.questions.map((q, idx) => {
  const userAnswer = userAnswers[idx];
  const correctLabel = getCorrectLabel(q);
  const isCorrect = userAnswer?.toUpperCase() === correctLabel;
  
  // ADD THIS LOG
  console.log(`Q${idx+1} | stored: "${q.correctAnswer}" | label: "${correctLabel}" | user: "${userAnswer}" | correct: ${isCorrect}`);
  
  if (isCorrect) score++;

      return {
        questionId: q.id,
        question: q.question,
        options: q.options,
        userAnswer,
        correctAnswer: correctLabel,  // ← letter returned to frontend
        isCorrect,
        explanation: q.explanation,
      };
    });

    const percentage = Math.round((score / mcq.questions.length) * 100);

    mcq.attempts.push({
      userAnswers,
      score,
      totalQuestions: mcq.questions.length,
      percentage,
    });

    mcq.totalAttempts = mcq.attempts.length;
    mcq.bestScore = Math.max(mcq.bestScore, score);

    await mcq.save();

    console.log('✅ Answers submitted:', { score, percentage, mcqId });

    res.json({
      success: true,
      score,
      totalQuestions: mcq.questions.length,
      percentage,
      results,
      bestScore: mcq.bestScore,
      totalAttempts: mcq.totalAttempts,
    });
  } catch (error) {
    console.error('❌ Submit answers error:', error.message);
    next(error);
  }
};

// Get all MCQs for user
exports.getMCQs = async (req, res, next) => {
  try {
    const userId = req.user._id;

    const mcqs = await MCQ.find({ userId })
      .select('_id title bestScore totalAttempts createdAt')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      mcqs,
      total: mcqs.length,
    });
  } catch (error) {
    console.error('❌ Get MCQs error:', error.message);
    next(error);
  }
};

// Get single MCQ with questions
exports.getMCQ = async (req, res, next) => {
  try {
    const { mcqId } = req.params;
    const userId = req.user._id;

    const mcq = await MCQ.findById(mcqId);
    if (!mcq) {
      return res.status(404).json({ message: 'MCQ not found' });
    }

    if (mcq.userId.toString() !== userId.toString()) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    res.json({
      success: true,
      mcq: {
        _id: mcq._id,
        title: mcq.title,
        questions: mcq.questions.map((q) => ({
          id: q.id,
          question: q.question,
          options: q.options,
        })),
        bestScore: mcq.bestScore,
        totalAttempts: mcq.totalAttempts,
        createdAt: mcq.createdAt,
      },
    });
  } catch (error) {
    console.error('❌ Get MCQ error:', error.message);
    next(error);
  }
};

// Delete MCQ
exports.deleteMCQ = async (req, res, next) => {
  try {
    const { mcqId } = req.params;
    const userId = req.user._id;

    const mcq = await MCQ.findById(mcqId);
    if (!mcq) {
      return res.status(404).json({ message: 'MCQ not found' });
    }

    if (mcq.userId.toString() !== userId.toString()) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    await MCQ.deleteOne({ _id: mcqId });

    console.log('✅ MCQ deleted:', mcqId);

    res.json({
      success: true,
      message: 'MCQ deleted',
    });
  } catch (error) {
    console.error('❌ Delete MCQ error:', error.message);
    next(error);
  }
};

// Get MCQ history with all attempts
exports.getMCQHistory = async (req, res, next) => {
  try {
    const { mcqId } = req.params;
    const userId = req.user._id;

    const mcq = await MCQ.findById(mcqId);
    if (!mcq) {
      return res.status(404).json({ message: 'MCQ not found' });
    }

    if (mcq.userId.toString() !== userId.toString()) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    res.json({
      success: true,
      title: mcq.title,
      bestScore: mcq.bestScore,
      totalAttempts: mcq.totalAttempts,
      attempts: mcq.attempts.map((a) => ({
        score: a.score,
        totalQuestions: a.totalQuestions,
        percentage: a.percentage,
        attemptedAt: a.attemptedAt,
      })),
    });
  } catch (error) {
    console.error('❌ Get history error:', error.message);
    next(error);
  }
};