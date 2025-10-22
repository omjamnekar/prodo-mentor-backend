import express from "express";
import { ragQueryCtrl } from "../controllers/rag.js";
const router = express.Router();

// POST /api/rag/query
// Body: { repoId, prompt }
router.post("/query", ragQueryCtrl);

router.post("/index");

export default router;
