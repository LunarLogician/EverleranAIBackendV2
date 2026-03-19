const axios = require('axios');

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';

const claudeClient = axios.create({
  baseURL: CLAUDE_API_URL,
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
const generateMCQsFromText = async (sourceText, numQuestions = 5) => {
  try {
    if (!sourceText || sourceText.trim().length === 0) {
      throw new Error('Source text cannot be empty');
    }

    if (numQuestions < 3 || numQuestions > 10) {
      numQuestions = 5; // Default to 5
    }

    const prompt = `Generate exactly ${numQuestions} multiple-choice questions from the following text. For each question:
1. The question must be clear and test understanding of the material
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

    const response = await callClaude(
      [{ role: 'user', content: prompt }],
      'quiz',
      2048
    );

    // Parse the JSON response (handle markdown code blocks)
    let jsonContent = response.content.trim();
    if (jsonContent.startsWith('```json')) {
      jsonContent = jsonContent.replace(/^```json\n?/, '').replace(/\n?```$/, '');
    } else if (jsonContent.startsWith('```')) {
      jsonContent = jsonContent.replace(/^```\n?/, '').replace(/\n?```$/, '');
    }
    let questions = JSON.parse(jsonContent);

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

module.exports = {
  callClaude,
  selectModel,
  generateMCQsFromText,
};
