import express from "express";
import User from "../../models/User.js";
import { requireAuth } from "./auth.js";

const router = express.Router();

// Get current user's profile
router.get("/profile", requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select("-password");
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({ success: true, user });
  } catch (error) {
    res
      .status(500)
      .json({ error: "Failed to fetch profile", message: error.message });
  }
});

// Update current user's profile
router.put("/profile", requireAuth, async (req, res) => {
  try {
    const updates = req.body;
    const user = await User.findByIdAndUpdate(req.userId, updates, {
      new: true,
      runValidators: true,
    }).select("-password");
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({ success: true, user });
  } catch (error) {
    res
      .status(500)
      .json({ error: "Failed to update profile", message: error.message });
  }
});

export default router;
// Get GitHub connection status and cached repos
router.get("/github-status", requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select("github");
    if (!user) return res.status(404).json({ error: "User not found" });
    const github = user.github || {};
    res.json({
      success: true,
      connected: !!github.accessToken,
      username: github.username || null,
      avatarUrl: github.avatarUrl || null,
      repos: github.repos || [],
    });
  } catch (error) {
    res
      .status(500)
      .json({ error: "Failed to fetch GitHub status", message: error.message });
  }
});
