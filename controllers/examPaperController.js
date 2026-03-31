const ExamPaper = require('../models/ExamPaper');
const Document = require('../models/Document');
const Usage = require('../models/Usage');
const { generateExamPaperFromText } = require('../services/claudeService');
const { extractTextFromFile } = require('../services/documentService');
const { isValidObjectId, MAX_SOURCE_TEXT_LEN, MAX_DOC_CONTEXT } = require('../validators/schemas');
const { getCachedUsage, invalidateUsageCache } = require('../utils/cache');

const MIN_QUESTIONS = 3;
const MAX_QUESTIONS = 30;

const clampQuestions = (raw, def = 10) =>
  Math.min(Math.max(parseInt(raw, 10) || def, MIN_QUESTIONS), MAX_QUESTIONS);

// ── Token-limit preflight ────────────────────────────────────────────────────
const checkTokenLimit = async (userId) => {
  const usage = await getCachedUsage(userId);
  if (usage && usage.totalTokens >= usage.tokenLimit) {
    return {
      blocked: true,
      payload: {
        message: 'You have reached your token limit. Upgrade your plan to continue.',
        upgradeRequired: true,
        tokenCount: usage.totalTokens,
        tokenLimit: usage.tokenLimit,
      },
    };
  }
  return { blocked: false };
};

// ── POST /api/exam-papers/generate ──────────────────────────────────────────
// Generate exam paper from raw text
exports.generateExamPaper = async (req, res, next) => {
  try {
    const {
      sourceText,
      title,
      subject = '',
      difficulty = 'medium',
      numQuestions: _rawQ = 10,
      duration = 60,
    } = req.body;

    const userId = req.user._id;
    const numQuestions = clampQuestions(_rawQ);

    if (!sourceText) {
      return res.status(400).json({ message: 'sourceText is required' });
    }
    if (sourceText.length > MAX_SOURCE_TEXT_LEN) {
      return res.status(400).json({
        message: `sourceText must be ${MAX_SOURCE_TEXT_LEN} characters or fewer`,
      });
    }

    const gate = await checkTokenLimit(userId);
    if (gate.blocked) return res.status(429).json(gate.payload);

    console.log('📝 Generating exam paper from text...', { numQuestions, difficulty });

    const { instructions, questions, totalMarks, inputTokens, outputTokens } =
      await generateExamPaperFromText(sourceText, numQuestions, difficulty, subject);

    const exam = new ExamPaper({
      userId,
      title: title || `Exam Paper – ${new Date().toLocaleDateString()}`,
      subject,
      instructions,
      totalMarks,
      duration,
      difficulty,
      sourceText,
      questions,
    });

    await exam.save();

    // Update usage
    const usageDoc = await Usage.findOne({ userId });
    if (usageDoc) {
      usageDoc.inputTokens += inputTokens;
      usageDoc.outputTokens += outputTokens;
      usageDoc.totalTokens = usageDoc.inputTokens + usageDoc.outputTokens;
      const featureUsage = usageDoc.usageBreakdown.find((u) => u.featureName === 'examPapers');
      if (featureUsage) {
        featureUsage.inputTokens += inputTokens;
        featureUsage.outputTokens += outputTokens;
        featureUsage.count += 1;
      } else {
        usageDoc.usageBreakdown.push({ featureName: 'examPapers', inputTokens, outputTokens, count: 1 });
      }
      await usageDoc.save();
      await invalidateUsageCache(userId.toString());
    }

    console.log('✅ Exam paper generated:', { examId: exam._id, count: questions.length, totalMarks });

    res.status(201).json({
      success: true,
      examId: exam._id,
      title: exam.title,
      subject: exam.subject,
      instructions: exam.instructions,
      totalMarks: exam.totalMarks,
      duration: exam.duration,
      difficulty: exam.difficulty,
      questions: exam.questions,
      totalTokens: inputTokens + outputTokens,
    });
  } catch (error) {
    console.error('❌ Exam paper generation error:', error.message);
    next(error);
  }
};

// ── POST /api/exam-papers/generate-from-document ────────────────────────────
// Generate exam paper from a previously-uploaded document
exports.generateExamPaperFromDocument = async (req, res, next) => {
  try {
    const {
      documentId,
      title,
      subject = '',
      difficulty = 'medium',
      numQuestions: _rawQ = 10,
      duration = 60,
    } = req.body;

    const userId = req.user._id;
    const numQuestions = clampQuestions(_rawQ);

    if (!documentId || !isValidObjectId(documentId)) {
      return res.status(400).json({ message: 'Valid documentId is required' });
    }

    const document = await Document.findById(documentId);
    if (!document || document.userId.toString() !== userId.toString()) {
      return res.status(403).json({ message: 'Unauthorized access to document' });
    }

    const gate = await checkTokenLimit(userId);
    if (gate.blocked) return res.status(429).json(gate.payload);

    const docText = document.textContent.substring(0, MAX_DOC_CONTEXT);
    console.log('📝 Generating exam paper from document...', { documentId, numQuestions, difficulty });

    const { instructions, questions, totalMarks, inputTokens, outputTokens } =
      await generateExamPaperFromText(docText, numQuestions, difficulty, subject);

    const exam = new ExamPaper({
      userId,
      documentId,
      title: title || `Exam – ${document.title}`,
      subject,
      instructions,
      totalMarks,
      duration,
      difficulty,
      sourceText: docText,
      questions,
    });

    await exam.save();

    // Update usage
    const usageDoc = await Usage.findOne({ userId });
    if (usageDoc) {
      usageDoc.inputTokens += inputTokens;
      usageDoc.outputTokens += outputTokens;
      usageDoc.totalTokens = usageDoc.inputTokens + usageDoc.outputTokens;
      const featureUsage = usageDoc.usageBreakdown.find((u) => u.featureName === 'examPapers');
      if (featureUsage) {
        featureUsage.inputTokens += inputTokens;
        featureUsage.outputTokens += outputTokens;
        featureUsage.count += 1;
      } else {
        usageDoc.usageBreakdown.push({ featureName: 'examPapers', inputTokens, outputTokens, count: 1 });
      }
      await usageDoc.save();
      await invalidateUsageCache(userId.toString());
    }

    console.log('✅ Exam paper from document generated:', { examId: exam._id });

    res.status(201).json({
      success: true,
      examId: exam._id,
      title: exam.title,
      subject: exam.subject,
      instructions: exam.instructions,
      totalMarks: exam.totalMarks,
      duration: exam.duration,
      difficulty: exam.difficulty,
      questions: exam.questions,
      totalTokens: inputTokens + outputTokens,
    });
  } catch (error) {
    console.error('❌ Exam paper from document error:', error.message);
    next(error);
  }
};

// ── POST /api/exam-papers/generate-from-file ────────────────────────────────
// Generate exam paper from an uploaded file (PDF, DOCX, etc.)
exports.generateExamPaperFromFile = async (req, res, next) => {
  try {
    const {
      title,
      subject = '',
      difficulty = 'medium',
      numQuestions: _rawQ = 10,
      duration = 60,
    } = req.body;

    const userId = req.user._id;
    const file = req.file;
    const numQuestions = clampQuestions(_rawQ);

    if (!file) {
      return res.status(400).json({
        success: false,
        message: 'Please upload a file (PDF, DOCX, DOC, or PPTX)',
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
        message: 'File has insufficient content to generate an exam paper',
      });
    }

    const gate = await checkTokenLimit(userId);
    if (gate.blocked) return res.status(429).json(gate.payload);

    console.log('📝 Generating exam paper from file...', { numQuestions, difficulty });

    const { instructions, questions, totalMarks, inputTokens, outputTokens } =
      await generateExamPaperFromText(
        fileContent.substring(0, MAX_DOC_CONTEXT),
        numQuestions,
        difficulty,
        subject
      );

    const exam = new ExamPaper({
      userId,
      title: title || `Exam – ${file.originalname || 'Uploaded File'}`,
      subject,
      instructions,
      totalMarks,
      duration,
      difficulty,
      sourceText: fileContent,
      questions,
    });

    await exam.save();

    // Update usage
    const usageDoc = await Usage.findOne({ userId });
    if (usageDoc) {
      usageDoc.inputTokens += inputTokens;
      usageDoc.outputTokens += outputTokens;
      usageDoc.totalTokens = usageDoc.inputTokens + usageDoc.outputTokens;
      const featureUsage = usageDoc.usageBreakdown.find((u) => u.featureName === 'examPapers');
      if (featureUsage) {
        featureUsage.inputTokens += inputTokens;
        featureUsage.outputTokens += outputTokens;
        featureUsage.count += 1;
      } else {
        usageDoc.usageBreakdown.push({ featureName: 'examPapers', inputTokens, outputTokens, count: 1 });
      }
      await usageDoc.save();
      await invalidateUsageCache(userId.toString());
    }

    console.log('✅ Exam paper from file generated:', { examId: exam._id });

    res.status(201).json({
      success: true,
      examId: exam._id,
      title: exam.title,
      subject: exam.subject,
      instructions: exam.instructions,
      totalMarks: exam.totalMarks,
      duration: exam.duration,
      difficulty: exam.difficulty,
      questions: exam.questions,
      totalTokens: inputTokens + outputTokens,
    });
  } catch (error) {
    console.error('❌ Exam paper from file error:', error.message);
    next(error);
  }
};

// ── GET /api/exam-papers/list ────────────────────────────────────────────────
exports.getExamPapers = async (req, res, next) => {
  try {
    const userId = req.user._id;

    const exams = await ExamPaper.find({ userId })
      .select('_id title subject totalMarks duration difficulty createdAt')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      exams,
      total: exams.length,
    });
  } catch (error) {
    console.error('❌ Get exam papers error:', error.message);
    next(error);
  }
};

// ── GET /api/exam-papers/:examId ─────────────────────────────────────────────
exports.getExamPaper = async (req, res, next) => {
  try {
    const { examId } = req.params;
    const userId = req.user._id;

    const exam = await ExamPaper.findById(examId);
    if (!exam) {
      return res.status(404).json({ message: 'Exam paper not found' });
    }
    if (exam.userId.toString() !== userId.toString()) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    res.json({ success: true, exam });
  } catch (error) {
    console.error('❌ Get exam paper error:', error.message);
    next(error);
  }
};

// ── DELETE /api/exam-papers/:examId ──────────────────────────────────────────
exports.deleteExamPaper = async (req, res, next) => {
  try {
    const { examId } = req.params;
    const userId = req.user._id;

    const exam = await ExamPaper.findById(examId);
    if (!exam) {
      return res.status(404).json({ message: 'Exam paper not found' });
    }
    if (exam.userId.toString() !== userId.toString()) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    await ExamPaper.deleteOne({ _id: examId });

    console.log('✅ Exam paper deleted:', examId);

    res.json({ success: true, message: 'Exam paper deleted' });
  } catch (error) {
    console.error('❌ Delete exam paper error:', error.message);
    next(error);
  }
};
