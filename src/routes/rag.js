import express from "express";
import { queryRAG } from "../../utils/ragClient.js";
import Repository from "../../models/Repository.js";

const router = express.Router();

// POST /api/rag/query
// Body: { repoId, prompt }
router.post("/query", async (req, res) => {
  try {
    const { repoId, prompt } = req.body;
    if (!repoId || !prompt) {
      return res.status(400).json({ error: "repoId and prompt required" });
    }
    // Fetch repo files from DB (assume files are stored as [{filename, content}])
    const repo = await Repository.findById(repoId);
    if (!repo || !repo.files) {
      return res.status(404).json({ error: "Repository or files not found" });
    }
    // Call RAG service
    const ragResponse = await queryRAG(repo.files, prompt, { repoId });
    res.json({ success: true, rag: ragResponse });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
