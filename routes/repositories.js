import express from "express";
import Repository from "../models/Repository.js";
import User from "../models/User.js";
import { requireAuth } from "./auth.js";

const router = express.Router();

// Get all connected repositories for the logged-in user
router.get("/", requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(401).json({ error: "User not found" });
    // Only return user's connected GitHub repos
    const repositories = user.github?.repos || [];
    res.json({
      success: true,
      repositories,
      count: repositories.length,
    });
  } catch (error) {
    console.error("Get repositories error:", error);
    res.status(500).json({
      error: "Failed to fetch repositories",
      message: error.message,
    });
  }
});

// Connect a new repository
router.post("/", async (req, res) => {
  try {
    const {
      githubId,
      name,
      fullName,
      description,
      htmlUrl,
      language,
      isPrivate,
      owner,
      githubToken,
      integrationSettings,
      notificationSettings,
    } = req.body;

    // Check if repository already exists
    const existingRepo = await Repository.findOne({ githubId });
    if (existingRepo) {
      if (existingRepo.status === "active") {
        return res.status(400).json({
          error: "Repository already connected",
          repository: existingRepo,
        });
      } else {
        // Reactivate existing repository
        existingRepo.status = "active";
        existingRepo.accessToken = githubToken;
        existingRepo.integrationSettings =
          integrationSettings || existingRepo.integrationSettings;
        existingRepo.notificationSettings =
          notificationSettings || existingRepo.notificationSettings;
        existingRepo.lastSynced = new Date();

        await existingRepo.save();

        return res.json({
          success: true,
          message: "Repository reconnected successfully",
          repository: await Repository.findById(existingRepo._id).select(
            "-accessToken"
          ),
        });
      }
    }

    // Create new repository
    const repository = new Repository({
      githubId,
      name,
      fullName,
      description: description || "",
      htmlUrl,
      language: language || "Unknown",
      isPrivate: isPrivate || false,
      owner: {
        login: owner.login,
        id: owner.id,
        avatarUrl: owner.avatarUrl,
        htmlUrl: owner.htmlUrl,
      },
      accessToken: githubToken,
      integrationSettings: integrationSettings || {
        autoCreateIssues: true,
        assignToUsers: [],
        issueLabels: ["ai-mentor", "improvement"],
        issuePriority: "medium",
        createPRComments: true,
      },
      notificationSettings: notificationSettings || {
        emailNotifications: true,
      },
      status: "active",
    });

    await repository.save();

    res.status(201).json({
      success: true,
      message: "Repository connected successfully",
      repository: await Repository.findById(repository._id).select(
        "-accessToken"
      ),
    });
  } catch (error) {
    console.error("Connect repository error:", error);
    res.status(500).json({
      error: "Failed to connect repository",
      message: error.message,
    });
  }
});

// Get repository by ID
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const repository = await Repository.findById(id).select("-accessToken");

    if (!repository) {
      return res.status(404).json({ error: "Repository not found" });
    }

    res.json({
      success: true,
      repository,
    });
  } catch (error) {
    console.error("Get repository error:", error);
    res.status(500).json({
      error: "Failed to fetch repository",
      message: error.message,
    });
  }
});

// Get repository by GitHub ID
router.get("/github/:githubId", async (req, res) => {
  try {
    const { githubId } = req.params;
    const repository = await Repository.findByGithubId(
      parseInt(githubId)
    ).select("-accessToken");

    if (!repository) {
      return res.status(404).json({ error: "Repository not found" });
    }

    res.json({
      success: true,
      repository,
    });
  } catch (error) {
    console.error("Get repository by GitHub ID error:", error);
    res.status(500).json({
      error: "Failed to fetch repository",
      message: error.message,
    });
  }
});

// Update repository integration settings
router.put("/:id/settings", async (req, res) => {
  try {
    const { id } = req.params;
    const { integrationSettings } = req.body;

    const repository = await Repository.findById(id);
    if (!repository) {
      return res.status(404).json({ error: "Repository not found" });
    }

    repository.integrationSettings = {
      ...repository.integrationSettings,
      ...integrationSettings,
    };

    await repository.save();

    res.json({
      success: true,
      message: "Repository settings updated successfully",
      repository: await Repository.findById(id).select("-accessToken"),
    });
  } catch (error) {
    console.error("Update repository settings error:", error);
    res.status(500).json({
      error: "Failed to update repository settings",
      message: error.message,
    });
  }
});

// Add analysis record to repository
router.post("/:id/analysis", async (req, res) => {
  try {
    const { id } = req.params;
    const analysisData = req.body;

    const repository = await Repository.findById(id);
    if (!repository) {
      return res.status(404).json({ error: "Repository not found" });
    }

    await repository.addAnalysisRecord({
      analysisId: analysisData.analysisId || new Date().getTime().toString(),
      overallScore: analysisData.overallScore,
      issuesFound: analysisData.issuesFound,
      issuesCreated: analysisData.issuesCreated || 0,
    });

    res.json({
      success: true,
      message: "Analysis record added successfully",
      repository: await Repository.findById(id).select("-accessToken"),
    });
  } catch (error) {
    console.error("Add analysis record error:", error);
    res.status(500).json({
      error: "Failed to add analysis record",
      message: error.message,
    });
  }
});

// Get repository analysis history
router.get("/:id/analysis-history", async (req, res) => {
  try {
    const { id } = req.params;
    const repository = await Repository.findById(id).select(
      "analysisHistory name fullName"
    );

    if (!repository) {
      return res.status(404).json({ error: "Repository not found" });
    }

    res.json({
      success: true,
      repository: {
        name: repository.name,
        fullName: repository.fullName,
        analysisHistory: repository.analysisHistory.sort(
          (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
        ),
      },
    });
  } catch (error) {
    console.error("Get analysis history error:", error);
    res.status(500).json({
      error: "Failed to fetch analysis history",
      message: error.message,
    });
  }
});

// Delete repository (soft delete - set status to inactive)
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const repository = await Repository.findById(id);
    if (!repository) {
      return res.status(404).json({ error: "Repository not found" });
    }

    repository.status = "inactive";
    await repository.save();

    res.json({
      success: true,
      message: "Repository disconnected successfully",
    });
  } catch (error) {
    console.error("Delete repository error:", error);
    res.status(500).json({
      error: "Failed to disconnect repository",
      message: error.message,
    });
  }
});

// Sync repository data with GitHub
router.post("/:id/sync", async (req, res) => {
  try {
    const { id } = req.params;

    const repository = await Repository.findById(id);
    if (!repository) {
      return res.status(404).json({ error: "Repository not found" });
    }

    // Here you would typically sync with GitHub API
    // For now, just update the lastSynced timestamp
    await repository.updateLastSynced();

    res.json({
      success: true,
      message: "Repository synced successfully",
      repository: await Repository.findById(id).select("-accessToken"),
    });
  } catch (error) {
    console.error("Sync repository error:", error);
    res.status(500).json({
      error: "Failed to sync repository",
      message: error.message,
    });
  }
});

export default router;
