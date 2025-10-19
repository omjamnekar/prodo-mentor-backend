// RAG Client: Node.js utility to communicate with Python FastAPI RAG service
import axios from "axios";

const RAG_API_URL = process.env.RAG_API_URL || "http://localhost:8000";

/**
 * Send repo files and user prompt to RAG service
 * @param {Array<{filename: string, content: string}>} files - Array of repo files
 * @param {string} prompt - User question or prompt
 * @param {object} [metadata] - Optional metadata
 * @returns {Promise<object>} - RAG response
 */
export async function queryRAG(files, prompt, metadata = {}) {
  try {
    const response = await axios.post(`${RAG_API_URL}/rag/query`, {
      files,
      prompt,
      metadata,
    });
    return response.data;
  } catch (error) {
    console.error("RAG query error:", error.response?.data || error.message);
    throw error;
  }
}
