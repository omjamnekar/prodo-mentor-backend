import express from "express";
import { requireAuth } from "../middlewares/required_token.js";

import {
  delteRepoCtrl,
  getRepository,
  githubStatusCtrl,
  githubWebhookEventCtrl,
  oauthCallBackCtrl,
  oauthInitCtrl,
  saveInitgrationCtrl,
  storedRepoCtrl,
} from "../controllers/github.js";

const router = express.Router();

// Get GitHub connection status for current user
router.get("/status", requireAuth, githubStatusCtrl);

// Get user's stored GitHub repositories
router.get("/stored-repositories", requireAuth, storedRepoCtrl);

// Delete a repository integration
router.delete("/repository/:id", requireAuth, delteRepoCtrl);

// Initiate GitHub OAuth flow
router.get("/oauth/init", requireAuth, oauthInitCtrl);

// GitHub OAuth callback handler (for server-side flow)
router.get("/oauth/callback", oauthCallBackCtrl);

// Get user repositories using stored access token
router.post("/repositories", requireAuth, getRepository);

// Save repository integration
router.post("/save-integration", requireAuth, saveInitgrationCtrl);

// Register GitHub webhook for repo
router.post("/webhook/register", requireAuth, githubWebhookEventCtrl);

// GitHub webhook event receiver
router.post("/webhook/event", githubWebhookEventCtrl);

export default router;
