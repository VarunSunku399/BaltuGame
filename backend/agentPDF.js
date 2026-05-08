const pdfParse = require('pdf-parse');

/**
 * Extracts text from a PDF buffer and chunks it into smaller semantic pieces.
 * @param {Buffer} dataBuffer - The PDF data
 * @returns {Promise<Array<{chunk_id: number, text: string, topic_hint: string}>>}
 */
async function processPDF(dataBuffer) {
  try {
    const data = await pdfParse(dataBuffer);
    const fullText = data.text;
    
    // Antigravity standard simple semantic chunking by paragraphs/newlines
    const rawChunks = fullText.split(/\n\s*\n/).map(c => c.trim()).filter(c => c.length > 50);
    
    // Group small chunks together so each chunk is roughly 300-800 characters
    const optimizedChunks = [];
    let currentChunk = "";
    let chunkId = 1;
    
    for (const chunk of rawChunks) {
      if (currentChunk.length + chunk.length > 800 && currentChunk.length > 0) {
        // Derive a naive topic hint from the first few words of the chunk
        const hint = currentChunk.split(' ').slice(0, 5).join(' ').replace(/[^a-zA-Z0-9 ]/g, '') || "General Topic";
        optimizedChunks.push({
          chunk_id: chunkId++,
          text: currentChunk,
          topic_hint: hint
        });
        currentChunk = chunk;
      } else {
        currentChunk += (currentChunk ? " " : "") + chunk;
      }
    }
    
    if (currentChunk.length > 20) {
      const hint = currentChunk.split(' ').slice(0, 5).join(' ').replace(/[^a-zA-Z0-9 ]/g, '') || "General Topic";
      optimizedChunks.push({
        chunk_id: chunkId,
        text: currentChunk,
        topic_hint: hint
      });
    }

    return optimizedChunks;
  } catch (err) {
    console.error("PDF Processing Error:", err);
    throw err;
  }
}

module.exports = {
  processPDF
};
