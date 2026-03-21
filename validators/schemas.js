const mongoose = require('mongoose');

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

// Max input sizes to prevent abuse / token burning
const MAX_MESSAGE_LEN    = 1000;    // chat message / assignment prompt
const MAX_SOURCE_TEXT_LEN = 1000;  // MCQ sourceText field
const MAX_TOPIC_LEN       = 1000;   // flashcard/quiz topic string
const MAX_DOC_CONTEXT     = 1000;  // chars of document text passed to Claude (~5k tokens)

// Bounds for AI-generated item counts
const MIN_GENERATED = 1;
const MAX_GENERATED = 50;

const VALID_DIFFICULTIES = ['easy', 'intermediate', 'hard'];

module.exports = {
  isValidObjectId,
  MAX_MESSAGE_LEN,
  MAX_SOURCE_TEXT_LEN,
  MAX_TOPIC_LEN,
  MAX_DOC_CONTEXT,
  MIN_GENERATED,
  MAX_GENERATED,
  VALID_DIFFICULTIES,
};
