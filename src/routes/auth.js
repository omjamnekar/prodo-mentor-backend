import express from "express";
import {
  githubCallbackCtrl,
  githubInitCtrl,
  googleCallBackCtrl,
  googleInitCtrl,
  loginCtrl,
  registerCtrl,
  tokenCtrl,
} from "../controllers/auth.js";

const router = express.Router();

// New endpoint: Return JWT token after successful GitHub integration
router.get("/github/token", tokenCtrl);

// Google OAuth: Step 1 - Redirect to Google
router.get("/google/init", googleInitCtrl);

// Google OAuth: Step 2 - Callback
router.get("/google/callback", googleCallBackCtrl);

// Register (email/password)
router.post("/register", registerCtrl);

// Login (email/password)
router.post("/login", loginCtrl);

// Auth middleware

// GitHub OAuth: Step 1 - Redirect to GitHub
router.get("/github/init", githubInitCtrl);

// GitHub OAuth: Step 2 - Callback
router.get("/github/callback", githubCallbackCtrl);

export default router;
