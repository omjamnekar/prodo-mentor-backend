// RAG Client: Node.js utility to communicate with Python FastAPI RAG service
import axios from "axios";
import { fetchChangedFiles } from "./github_hook";

const RAG_API_URL = process.env.RAG_API_URL || "http://localhost:8000";

/**
 * Send repo files and user prompt to RAG service
 * @param {Array<{filename: string, content: string}>} files - Array of repo files
 * @param {string} prompt - User question or prompt
 * @param {object} [metadata] - Optional metadata
 * @returns {Promise<object>} - RAG response
 */
export const queryRAG = async (files, prompt, metadata = {}) => {
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
};

export const indexFileController = async (event, repoFullName, accessToken) => {
  // Collect changed/added files from all commits
  const changedFiles = new Set();
  for (const commit of event.commits) {
    (commit.added || []).forEach((f) => changedFiles.add(f));
    (commit.modified || []).forEach((f) => changedFiles.add(f));
  }
  // Fetch changed files
  const files = await fetchChangedFiles(
    repoFullName,
    accessToken,
    Array.from(changedFiles)
  );
  // Send files to RAG service for indexing
  if (files.length > 0) {
    const flatMetadata = {
      githubId: String(event.repository?.id),
      name: String(event.repository?.name),
    };
    const payload = {
      repoId: String(event.repository?.id),
      files,
      metadata: flatMetadata,
    };
    try {
      await axios.post(
        process.env.RAG_PATH + "/rag/index" || "http://0.0.0.0:8002/rag/index",
        payload
      );
    } catch (err) {
      console.error("Error sending files to RAG service:", err.message);
    }
  }
  return files.length;
};
