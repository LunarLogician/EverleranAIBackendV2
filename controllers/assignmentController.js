const Assignment = require('../models/Assignment');
const { callClaude } = require('../services/claudeService');
const { extractTextFromFile } = require('../services/documentService');

// ─────────────────────────────────────────────
// ENDPOINT 1: Generate humanized assignment
// POST /api/assignments/generate
// Option A — JSON body: { topic, subject, wordCount, tone }
// Option B — form-data: { file, subject, wordCount, tone }
// ─────────────────────────────────────────────
exports.generateAssignment = async (req, res, next) => {
  try {
    const { message } = req.body;
    const userId = req.user._id;
    
    // Handle both req.file (from .single()) and req.files (from .any())
    const file = req.file || (req.files && req.files.length > 0 ? req.files[0] : null);

    if (!message) {
      return res.status(400).json({
        success: false,
        message: 'message is required',
      });
    }

    let fileContext = '';

    if (file) {
      try {
        const { text } = await extractTextFromFile(file);
        fileContext = `
The student also attached a document. Use it as source material:
"""
${text}
"""`;
      } catch (extractError) {
        console.warn(`⚠️  File extraction warning: ${extractError.message}`);
        // Continue without the document if extraction fails
        fileContext = '';
      }
    }

    const prompt = `You're a university student who needs to write an assignment. Sound exactly like a real student - casual but smart, not formal or robotic.

The assignment topic: "${message}"
${fileContext}

Write the assignment following these rules:

SOUND NATURAL:
- Use conversational language with some contractions (don't, can't, it's)
- Mix short sentences with longer ones - don't be too uniform
- Sound like you're actually explaining something to a friend, not presenting to a professor
- Include some phrases like "basically," "kind of," "I think," "pretty much" 
- Make it personal - reference "we," "our," or "I" sometimes
- Don't sound like a Wikipedia article or textbook

WHAT TO AVOID:
- Anything that sounds robotic or AI-like (hereby, thus, moreover, notwithstanding)
- These words especially: delve, crucial, paramount, multifaceted, synergy, leverage, utilize
- Starting paragraphs with "It is worth noting that" or "In conclusion"
- Using "Furthermore" or "In addition to" repeatedly
- Making everything perfectly parallel or structured

FORMATTING:
- Use normal paragraphs, not bullet points (unless absolutely necessary)
- Maybe add a simple intro and conclusion, but keep them natural
- Don't add headings unless the topic really needs them
- Keep similar length to what a real student would write (around 500-700 words)

Just write the assignment directly - no intro like "Here's your assignment" or "This is about..."
Make it sound like YOU wrote it, not like an AI wrote it.`;

    const messages = [{ role: 'user', content: prompt }];
    const response = await callClaude(messages, 'assignment_generate', 2048);

    const assignment = await Assignment.create({
      userId,
      type: 'generated',
      topic: message,
      generatedContent: response.content,
    });

    res.status(201).json({
      success: true,
      assignment: {
        id: assignment._id,
        content: response.content,
        tokensUsed: response.outputTokens,
      },
    });
  } catch (error) {
    next(error);
  }
};
// ─────────────────────────────────────────────
// ENDPOINT 2: Rewrite uploaded assignment
// POST /api/assignments/rewrite
// form-data: { file, studentName, enrollmentId }
// ─────────────────────────────────────────────
exports.rewriteAssignment = async (req, res, next) => {
  try {
    const { studentName, enrollmentId } = req.body;
    const userId = req.user._id;
    
    // Handle both req.file (from .single()) and req.files (from .any())
    const file = req.file || (req.files && req.files.length > 0 ? req.files[0] : null);

    if (!file) {
      return res.status(400).json({
        success: false,
        message: 'Please upload a PDF, DOC, DOCX, or PPTX file',
      });
    }

    if (!studentName || !enrollmentId) {
      return res.status(400).json({
        success: false,
        message: 'studentName and enrollmentId are required',
      });
    }

    try {
      const { text: originalContent, fileUrl, fileName } =
        await extractTextFromFile(file);

      if (!originalContent || originalContent.trim().length < 50) {
        return res.status(400).json({
          success: false,
          message: 'Could not extract text from file. Please check the file.',
        });
      }
      

      const prompt = `Rewrite this assignment so it sounds like a different student wrote it. Sound natural and casual - like a real person, not an AI or textbook.

Student info:
Name: ${studentName}
Enrollment: ${enrollmentId}

Original assignment to rewrite:
"""
${originalContent}
"""

Rewriting rules:

1. REPHRASE EVERYTHING - Change how every sentence is written. Use different words, different sentence structure, but keep the same main ideas and arguments.

2. KEEP THE CORE - Don't change the topic or main points. Just make it sound like someone else wrote it.

3. ADD THE STUDENT NAME - If there's no name/enrollment number in the original, add it at the top like:
   Name: ${studentName}
   Enrollment: ${enrollmentId}

4. SOUND LIKE A REAL STUDENT:
   - Use casual language sometimes (contractions, "kind of," "basically")
   - Mix sentence lengths - don't make everything the same length
   - Sound like you're explaining to someone, not lecturing
   - Be conversational

5. AVOID THESE WORDS:
   - Delve, crucial, utilize, furthermore, encompassing, leverage
   - "In conclusion," "It is worth noting," "Thus," "Hence"
   - Overly formal academic language

6. KEEP IT SIMILAR - Same length, same number of paragraphs, same general structure as the original

Just output the rewritten assignment - no intro or explanation. Make it sound like ${studentName} wrote it naturally.`;

      const messages = [{ role: 'user', content: prompt }];
      const response = await callClaude(messages, 'assignment_rewrite', 3000);

      const assignment = await Assignment.create({
        userId,
        type: 'rewritten',
        studentName,
        enrollmentId,
        originalFile: {
          url: fileUrl,
          fileName,
          fileType: file.mimetype,
        },
        originalContent,
        rewrittenContent: response.content,
      });

      res.status(200).json({
        success: true,
        assignment: {
          id: assignment._id,
          studentName,
          enrollmentId,
          originalFileName: fileName,
          rewrittenContent: response.content,
          tokensUsed: response.outputTokens,
        },
      });
    } catch (extractError) {
      return res.status(400).json({
        success: false,
        message: `Failed to process file: ${extractError.message}`,
      });
    }
  } catch (error) {
    next(error);
  }
};