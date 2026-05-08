const { GoogleGenerativeAI } = require('@google/generative-ai');

/**
 * Takes a text chunk, uses Gemini to generate 3 game-ready questions and returns structured JSON
 * @param {Object} chunk - { chunk_id, text, topic_hint }
 * @returns {Promise<Array<Object>>}
 */
async function generateQuestionsFromChunk(chunk) {
  // Read key lazily so dotenv has already populated process.env by the time this runs
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('[Question Agent] GEMINI_API_KEY is not set in .env!');
    return [fallback()];
  }
  const genAI = new GoogleGenerativeAI(apiKey);

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    // We explicitly tell it to output raw JSON so we can parse it reliably.
    const prompt = `
For the following text chunk, generate exactly 3 game-ready questions.
Return ONLY a structured JSON array containing 3 objects with NO markdown formatting, NO backticks.
Each object MUST include:
- "question": string (keep it short for real-time gameplay)
- "choices": array of 4 strings (for MCQ)
- "answer": string (must exactly match one of the choices)
- "difficulty": integer between 1 and 3
- "type": "mcq"
The question length should be between 5 and 10 words.
For each option choice length should be between 1 and 5 words.

Text Chunk ID: ${chunk.chunk_id}
Topic Hint: ${chunk.topic_hint}
Text:
${chunk.text}
`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    let textOut = response.text().trim();

    // Strip markdown formatting if the model still includes it
    if (textOut.startsWith('\`\`\`json')) {
      textOut = textOut.replace(/^\`\`\`json\n/, '').replace(/\n\`\`\`$/, '');
    } else if (textOut.startsWith('\`\`\`')) {
      textOut = textOut.replace(/^\`\`\`\n/, '').replace(/\n\`\`\`$/, '');
    }

    const parsedJson = JSON.parse(textOut);
    return Array.isArray(parsedJson) ? parsedJson : [];

  } catch (err) {
    console.error("[Question Agent] Error for chunk_id " + chunk.chunk_id, err.message);
    return [fallback()];
  }
}

function fallback() {
  return {
    question: "Fallback: What is 2 + 2?",
    choices: ["3", "4", "5", "6"],
    answer: "4",
    difficulty: 1,
    type: "mcq"
  };
}

module.exports = { generateQuestionsFromChunk };

