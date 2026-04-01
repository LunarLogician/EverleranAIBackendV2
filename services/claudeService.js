const axios = require('axios');

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';

const claudeClient = axios.create({
  baseURL: CLAUDE_API_URL,
  timeout: 120000,
  headers: {
    'x-api-key': process.env.CLAUDE_API_KEY,
    'anthropic-version': '2023-06-01',
    'content-type': 'application/json',
  },
});

// Model selection based on use case
const selectModel = (useCase) => {
  // Using Claude Haiku 4.5 for all tasks (fast and cost-effective)
  const modelMap = {
    qa: 'claude-haiku-4-5-20251001',
    summary: 'claude-haiku-4-5-20251001',
    flashcards: 'claude-haiku-4-5-20251001',
    quiz: 'claude-haiku-4-5-20251001',
    analysis: 'claude-haiku-4-5-20251001',
  };
  return modelMap[useCase] || 'claude-haiku-4-5-20251001';
};

// Call Claude API and track tokens
// messages: array of { role, content } where content can be a string or array of content blocks
// systemPrompt: optional system message string
const callClaude = async (messages, useCase = 'qa', maxTokens = 1024, systemPrompt = null) => {
  try {
    const model = selectModel(useCase);
    const body = { model, max_tokens: maxTokens, messages };
    if (systemPrompt) body.system = systemPrompt;

    const response = await claudeClient.post('/', body);

    return {
      content: response.data.content[0].text,
      inputTokens: response.data.usage.input_tokens,
      outputTokens: response.data.usage.output_tokens,
      model,
    };
  } catch (error) {
    console.error('Claude API Error:', error.response?.data || error.message);
    throw new Error(`Claude API call failed: ${error.message}`);
  }
};

// Generate MCQs from text
// numQuestions: 3-10 questions
const generateMCQsFromText = async (sourceText, numQuestions = 5, difficulty = 'medium') => {
  try {
    if (!sourceText || sourceText.trim().length === 0) {
      throw new Error('Source text cannot be empty');
    }

    // Clamp to 1-50 (controller already validates)
    numQuestions = Math.min(Math.max(parseInt(numQuestions, 10) || 5, 1), 50);
    const difficultyLevel = ['easy', 'medium', 'hard'].includes(difficulty) ? difficulty : 'medium';

    const difficultyGuide = {
      easy: 'straightforward questions testing basic recall and simple understanding',
      medium: 'questions that require comprehension and application of concepts',
      hard: 'challenging questions requiring analysis, evaluation, and deep understanding; include tricky distractors',
    }[difficultyLevel];

    const prompt = `Generate exactly ${numQuestions} multiple-choice questions (difficulty: ${difficultyLevel.toUpperCase()}) from the following text.
Difficulty guide: ${difficultyGuide}.
For each question:
1. The question must be clear and test understanding of the material at the specified difficulty
2. Provide exactly 4 options labeled A, B, C, D
3. Mark the correct answer
4. Provide a brief explanation for why it's correct

Format the response as a JSON array with this structure:
[
  {
    "id": "1",
    "question": "Question text here?",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correctAnswer": "A",
    "explanation": "Explanation of why A is correct"
  }
]

Text to create questions from:
${sourceText}

Return ONLY valid JSON, no markdown formatting or code blocks.`;

    // Scale max_tokens based on number of questions (~250 tokens per MCQ)
    const maxTokens = Math.min(Math.max(numQuestions * 250, 2048), 8192);

    const response = await callClaude(
      [{ role: 'user', content: prompt }],
      'quiz',
      maxTokens
    );

    // Parse the JSON response (handle markdown code blocks)
    let jsonContent = response.content.trim();
    if (jsonContent.startsWith('```json')) {
      jsonContent = jsonContent.replace(/^```json\n?/, '').replace(/\n?```$/, '');
    } else if (jsonContent.startsWith('```')) {
      jsonContent = jsonContent.replace(/^```\n?/, '').replace(/\n?```$/, '');
    }

    let questions;
    try {
      questions = JSON.parse(jsonContent);
    } catch (parseError) {
      console.error('JSON parse failed, attempting repair. Raw length:', jsonContent.length);
      // Try to extract valid JSON array from truncated response
      const lastValidClose = jsonContent.lastIndexOf('}');
      if (lastValidClose !== -1) {
        const trimmed = jsonContent.substring(0, lastValidClose + 1);
        // Find last complete object and close the array
        try {
          questions = JSON.parse(trimmed + ']');
        } catch {
          // Try finding the last complete MCQ object boundary
          const lastObjStart = trimmed.lastIndexOf('{"id"');
          if (lastObjStart > 0) {
            const beforeLastObj = trimmed.substring(0, lastObjStart).replace(/,\s*$/, '');
            try {
              questions = JSON.parse(beforeLastObj + ']');
            } catch {
              throw parseError; // Give up, throw original error
            }
          } else {
            throw parseError;
          }
        }
      } else {
        throw parseError;
      }
      console.log(`JSON repair succeeded: recovered ${questions.length} questions`);
    }

    // Validate and ensure we have the required fields
    questions = questions.map((q, idx) => ({
      id: String(idx + 1),
      question: q.question,
      options: q.options,
      correctAnswer: q.correctAnswer,
      explanation: q.explanation,
    }));

    return {
      questions,
      inputTokens: response.inputTokens,
      outputTokens: response.outputTokens,
    };
  } catch (error) {
    console.error('MCQ Generation Error:', error.message);
    throw new Error(`Failed to generate MCQs: ${error.message}`);
  }
};

// Generate an exam paper from text
// numQuestions: number of questions (3-30)
// difficulty: 'easy' | 'medium' | 'hard'
// subject: optional subject label
const generateExamPaperFromText = async (sourceText, numQuestions = 10, difficulty = 'medium', subject = '') => {
  try {
    if (!sourceText || sourceText.trim().length === 0) {
      throw new Error('Source text cannot be empty');
    }

    const subjectNote = subject ? ` for the subject "${subject}"` : '';

    const shortCount = Math.ceil(numQuestions * 0.6);
    const longCount = numQuestions - shortCount;

    const prompt = `You are an expert academic examiner. Generate a formal written exam paper${subjectNote} based on the text below.

The paper must have exactly ${numQuestions} written questions (NO multiple choice, NO true/false):
- ${shortCount} "short" questions — require a concise written answer of 2-4 sentences. Marks: 3-5 each.
- ${longCount} "long" questions — require a detailed essay/paragraph answer. Marks: 8-15 each.

Questions should test understanding, analysis, and application — not just recall.
Difficulty level: ${difficulty}.

Return a JSON object with this exact structure:
{
  "instructions": "Time allowed: [duration] minutes. Attempt ALL questions. Write your answers clearly and in complete sentences. Begin each answer on a new page.",
  "questions": [
    {
      "id": "1",
      "type": "short",
      "question": "Short written question?",
      "sampleAnswer": "A concise 2-4 sentence model answer.",
      "marks": 4
    },
    {
      "id": "${shortCount + 1}",
      "type": "long",
      "question": "Detailed/essay question?",
      "sampleAnswer": "A structured outline of the expected full answer covering key points.",
      "marks": 10
    }
  ]
}

Text to base the exam on:
${sourceText}

Return ONLY valid JSON, no markdown or code blocks.`;

    const response = await callClaude(
      [{ role: 'user', content: prompt }],
      'quiz',
      4096
    );

    let jsonContent = response.content.trim();
    if (jsonContent.startsWith('```json')) {
      jsonContent = jsonContent.replace(/^```json\n?/, '').replace(/\n?```$/, '');
    } else if (jsonContent.startsWith('```')) {
      jsonContent = jsonContent.replace(/^```\n?/, '').replace(/\n?```$/, '');
    }

    const parsed = JSON.parse(jsonContent);
    const questions = (parsed.questions || []).map((q, idx) => ({
      id: String(idx + 1),
      type: q.type || 'mcq',
      question: q.question,
      options: q.options || [],
      correctAnswer: q.correctAnswer || '',
      sampleAnswer: q.sampleAnswer || '',
      marks: Number(q.marks) || 1,
      explanation: q.explanation || '',
    }));

    const totalMarks = questions.reduce((sum, q) => sum + q.marks, 0);

    return {
      instructions: parsed.instructions || 'Answer all questions. Write clearly and concisely.',
      questions,
      totalMarks,
      inputTokens: response.inputTokens,
      outputTokens: response.outputTokens,
    };
  } catch (error) {
    console.error('Exam Paper Generation Error:', error.message);
    throw new Error(`Failed to generate exam paper: ${error.message}`);
  }
};

// Streaming variant of callClaude.
// Calls Anthropic with stream:true, fires onChunk(text) for every token,
// and resolves with { inputTokens, outputTokens } when the stream ends.
const callClaudeStream = async (messages, useCase = 'qa', maxTokens = 3072, systemPrompt = null, onChunk) => {
  try {
    const model = selectModel(useCase);
    const body = { model, max_tokens: maxTokens, stream: true, messages };
    if (systemPrompt) body.system = systemPrompt;

    const response = await claudeClient.post('/', body, {
      responseType: 'stream',
      timeout: 120_000, // longer timeout for streaming generations
    });

    let inputTokens = 0;
    let outputTokens = 0;
    let buffer = '';

    return new Promise((resolve, reject) => {
      response.data.on('data', (chunk) => {
        buffer += chunk.toString('utf8');
        const lines = buffer.split('\n');
        buffer = lines.pop(); // keep last incomplete line in buffer

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (!raw || raw === '[DONE]') continue;
          try {
            const event = JSON.parse(raw);
            if (event.type === 'message_start') {
              inputTokens = event.message?.usage?.input_tokens ?? 0;
            } else if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
              onChunk(event.delta.text);
            } else if (event.type === 'message_delta') {
              outputTokens = event.usage?.output_tokens ?? 0;
            }
          } catch (_) {
            // skip malformed SSE lines
          }
        }
      });

      response.data.on('end', () => resolve({ inputTokens, outputTokens }));
      response.data.on('error', (err) => reject(new Error(`Claude stream error: ${err.message}`)));
    });
  } catch (error) {
    console.error('Claude Stream API Error:', error.response?.data || error.message);
    throw new Error(`Claude stream failed: ${error.message}`);
  }
};

module.exports = {
  callClaude,
  callClaudeStream,
  selectModel,
  generateMCQsFromText,
  generateExamPaperFromText,
};
