import express from "express";
import User from "../../models/User.js";
import jwt from "jsonwebtoken";
import axios from "axios";

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || "supersecret";
// New endpoint: Return JWT token after successful GitHub integration
router.get("/github/token", async (req, res) => {
  try {
    // You may want to validate the user/session here
    // For demo, just return a token for a test user
    const user = await User.findOne({ email: "demo@example.com" });
    if (!user)
      return res.status(404).json({ success: false, error: "User not found" });
    const token = jwt.sign({ userId: user._id }, JWT_SECRET, {
      expiresIn: "7d",
    });
    res.json({ success: true, token });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Google OAuth: Step 1 - Redirect to Google
router.get("/google/init", (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI ||
    "http://localhost:3001/api/auth/google/callback";
  const scope = ["openid", "email", "profile"].join(" ");
  const state = Math.random().toString(36).substring(7);
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(
    redirectUri
  )}&response_type=code&scope=${encodeURIComponent(
    scope
  )}&state=${state}&access_type=offline&prompt=consent`;
  res.redirect(authUrl);
});

// Google OAuth: Step 2 - Callback
router.get("/google/callback", async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) return res.redirect("/auth/login?error=oauth_failed");

    // Exchange code for access token
    const tokenRes = await axios.post(
      "https://oauth2.googleapis.com/token",
      null,
      {
        params: {
          code,
          client_id: process.env.GOOGLE_CLIENT_ID,
          client_secret: process.env.GOOGLE_CLIENT_SECRET,
          redirect_uri:
            process.env.GOOGLE_REDIRECT_URI ||
            "http://localhost:3001/api/auth/google/callback",
          grant_type: "authorization_code",
        },
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      }
    );
    const accessToken = tokenRes.data.access_token;
    if (!accessToken) return res.redirect("/auth/login?error=no_token");

    // Get user info from Google
    const userRes = await axios.get(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
    const googleUser = userRes.data;

    // Find or create user
    let user = await User.findOne({ email: googleUser.email });
    if (!user) {
      user = new User({
        name: googleUser.name,
        email: googleUser.email,
        provider: "google",
        google: {
          accessToken,
          username: googleUser.email,
          avatarUrl: googleUser.picture,
        },
      });
    } else {
      user.provider = "google";
      user.google = {
        accessToken,
        username: googleUser.email,
        avatarUrl: googleUser.picture,
      };
    }
    await user.save();

    // Issue JWT and redirect to frontend
    const token = jwt.sign({ userId: user._id }, JWT_SECRET, {
      expiresIn: "7d",
    });
    res.redirect(`${process.env.CORS_ORIGIN}/auth/login?token=${token}`);
  } catch (err) {
    console.error("Google OAuth error:", err);
    res.redirect("/auth/login?error=oauth_failed");
  }
});

// Register (email/password)
router.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: "Email and password required" });
    const existing = await User.findOne({ email });
    if (existing)
      return res.status(400).json({ error: "Email already registered" });
    const user = new User({ name, email, password, provider: "local" });
    await user.save();
    const token = jwt.sign({ userId: user._id }, JWT_SECRET, {
      expiresIn: "7d",
    });
    res.json({
      success: true,
      token,
      user: { id: user._id, name: user.name, email: user.email },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Login (email/password)
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: "Invalid credentials" });

    const valid = await user.comparePassword(password);
    if (!valid) return res.status(400).json({ error: "Invalid credentials" });
    const token = jwt.sign({ userId: user._id }, JWT_SECRET, {
      expiresIn: "7d",
    });
    res.json({
      success: true,
      token,
      user: { id: user._id, name: user.name, email: user.email },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Auth middleware
export function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: "No token" });
  try {
    const decoded = jwt.verify(auth.replace("Bearer ", ""), JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

// GitHub OAuth: Step 1 - Redirect to GitHub
router.get("/github/init", (_, res) => {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const redirectUri =
    process.env.GITHUB_REDIRECT_URI ||
    "http://localhost:3001/api/auth/github/callback";
  const scope = "user:email,read:user,repo";
  const state = Math.random().toString(36).substring(7);

  const authUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(
    redirectUri
  )}&scope=${encodeURIComponent(scope)}&state=${state}`;
  res.redirect(authUrl);
});

// GitHub OAuth: Step 2 - Callback
router.get("/github/callback", async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) return res.redirect("/auth/login?error=oauth_failed");

    // Exchange code for access token
    const tokenRes = await axios.post(
      "https://github.com/login/oauth/access_token",
      {
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri:
          process.env.GITHUB_REDIRECT_URI ||
          "http://localhost:3001/api/auth/github/callback",
      },
      { headers: { Accept: "application/json" } }
    );
    const accessToken = tokenRes.data.access_token;
    if (!accessToken) return res.redirect("/auth/login?error=no_token");

    // Get user info from GitHub
    const userRes = await axios.get("https://api.github.com/user", {
      headers: { Authorization: `token ${accessToken}` },
    });
    const emailRes = await axios.get("https://api.github.com/user/emails", {
      headers: { Authorization: `token ${accessToken}` },
    });
    const githubUser = userRes.data;
    const primaryEmail =
      emailRes.data.find((e) => e.primary && e.verified)?.email ||
      githubUser.email;

    // Find or create user
    let user = await User.findOne({ email: primaryEmail });
    if (!user) {
      user = new User({
        name: githubUser.name || githubUser.login,
        email: primaryEmail,
        provider: "github",
        github: {
          accessToken,
          username: githubUser.login,
          avatarUrl: githubUser.avatar_url,
        },
      });
    } else {
      user.provider = "github";
      user.github = {
        accessToken,
        username: githubUser.login,
        avatarUrl: githubUser.avatar_url,
      };
    }
    await user.save();

    // Issue JWT and redirect to frontend
    const token = jwt.sign({ userId: user._id }, JWT_SECRET, {
      expiresIn: "7d",
    });
    res.redirect(`${process.env.CORS_ORIGIN}/auth/login?token=${token}`);
  } catch (err) {
    console.error("GitHub OAuth error:", err);
    res.redirect("/auth/login?error=oauth_failed");
  }
});

export default router;
