import express from "express";
import axios from "axios";
import Repository from "../models/Repository.js";
import { requireAuth } from "./auth.js";

const router = express.Router();
// Delete a repository integration
router.delete("/repository/:id", requireAuth, async (req, res) => {
  try {
    const repoId = req.params.id;
    const User = (await import("../models/User.js")).default;
    const Repository = (await import("../models/Repository.js")).default;
    // Remove from Repository collection
    await Repository.deleteOne({ _id: repoId });
    // Remove from user's github.repos array
    const user = await User.findById(req.userId);
    if (user && user.github && Array.isArray(user.github.repos)) {
      user.github.repos = user.github.repos.filter(
        (r) => String(r._id) !== String(repoId)
      );
      await user.save();
    }
    res.json({ success: true });
  } catch (error) {
    res
      .status(500)
      .json({ error: "Failed to delete repository", message: error.message });
  }
});

// Initiate GitHub OAuth flow
router.get("/oauth/init", (req, res) => {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const redirectUri =
    process.env.GITHUB_REDIRECT_URI ||
    `${req.protocol}://${req.get("host")}/api/github/oauth/callback`;
  const scope = "repo,read:org,read:user,user:email";
  const state = Math.random().toString(36).substring(7);

  const authUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&state=${state}`;

  res.json({
    success: true,
    authUrl,
    state,
  });
});

// GitHub OAuth callback handler (for server-side flow)
router.get("/oauth/callback", async (req, res) => {
  try {
    const { code, state } = req.query;

    if (!code) {
      return res.redirect(`${process.env.CORS_ORIGIN}?error=no_code`);
    }

    // Exchange code for access token
    const tokenResponse = await axios.post(
      "https://github.com/login/oauth/access_token",
      {
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code: code,
      },
      {
        headers: {
          Accept: "application/json",
        },
      }
    );

    const accessToken = tokenResponse.data.access_token;

    if (!accessToken) {
      return res.redirect(`${process.env.CORS_ORIGIN}?error=no_token`);
    }

    // Get user information
    const userResponse = await axios.get("https://api.github.com/user", {
      headers: {
        Authorization: `token ${accessToken}`,
        Accept: "application/vnd.github.v3+json",
      },
    });
    const userData = userResponse.data;

    // Get user's repositories
    const reposResponse = await axios.get("https://api.github.com/user/repos", {
      headers: {
        Authorization: `token ${accessToken}`,
        Accept: "application/vnd.github.v3+json",
      },
      params: {
        per_page: 100,
        sort: "updated",
        type: "all",
      },
    });
    const repositories = reposResponse.data.map((repo) => ({
      id: repo.id,
      name: repo.name,
      fullName: repo.full_name,
      description: repo.description,
      htmlUrl: repo.html_url,
      language: repo.language,
      stargazersCount: repo.stargazers_count,
      forksCount: repo.forks_count,
      openIssuesCount: repo.open_issues_count,
      isPrivate: repo.private,
      owner: {
        login: repo.owner.login,
        id: repo.owner.id,
        avatarUrl: repo.owner.avatar_url,
        htmlUrl: repo.owner.html_url,
      },
      status: "active",
      lastSynced: new Date(),
    }));

    // Try to get userId from JWT (Authorization header or query param)
    let user = null;
    const User = (await import("../models/User.js")).default;
    let userId = null;
    // Try Authorization header
    if (req.headers.authorization) {
      try {
        const jwt = require("jsonwebtoken");
        const token = req.headers.authorization.replace("Bearer ", "");
        const decoded = jwt.verify(
          token,
          process.env.JWT_SECRET || "supersecret"
        );
        userId = decoded.userId;
      } catch {}
    }
    // Try query param
    if (!userId && req.query.token) {
      try {
        const jwt = require("jsonwebtoken");
        const decoded = jwt.verify(
          req.query.token,
          process.env.JWT_SECRET || "supersecret"
        );
        userId = decoded.userId;
      } catch {}
    }
    if (userId) {
      user = await User.findById(userId);
    } else {
      // Fallback to email if not authenticated
      const email =
        userData.email || (userData.emails && userData.emails[0]?.email);
      user = email ? await User.findOne({ email }) : null;
    }
    if (user) {
      user.github = {
        accessToken,
        username: userData.login,
        avatarUrl: userData.avatar_url,
        profileUrl: userData.html_url,
        bio: userData.bio,
        location: userData.location,
        repos: repositories,
      };
      await user.save();
    }

    // Redirect back to frontend with success
    res.redirect(
      `${process.env.CORS_ORIGIN}/analysis?github_connected=true&user=${encodeURIComponent(
        JSON.stringify({
          id: userData.id,
          login: userData.login,
          name: userData.name,
          avatarUrl: userData.avatar_url,
        })
      )}&token=${encodeURIComponent(accessToken)}`
    );
  } catch (error) {
    console.error("GitHub OAuth callback error:", error);
    res.redirect(`${process.env.CORS_ORIGIN}?error=oauth_failed`);
  }
});

// Get user repositories using stored access token
router.post("/repositories", async (req, res) => {
  try {
    const { accessToken } = req.body;

    if (!accessToken) {
      return res.status(400).json({ error: "Access token is required" });
    }

    // Get user's repositories
    const reposResponse = await axios.get("https://api.github.com/user/repos", {
      headers: {
        Authorization: `token ${accessToken}`,
        Accept: "application/vnd.github.v3+json",
      },
      params: {
        per_page: 100,
        sort: "updated",
        type: "all",
      },
    });

    const repositories = reposResponse.data;

    res.json({
      success: true,
      repositories: repositories.map((repo) => ({
        id: repo.id,
        name: repo.name,
        fullName: repo.full_name,
        description: repo.description,
        htmlUrl: repo.html_url,
        language: repo.language,
        size: repo.size,
        stargazersCount: repo.stargazers_count,
        forksCount: repo.forks_count,
        openIssuesCount: repo.open_issues_count,
        isPrivate: repo.private,
        owner: {
          login: repo.owner.login,
          id: repo.owner.id,
          avatarUrl: repo.owner.avatar_url,
          htmlUrl: repo.owner.html_url,
        },
      })),
    });
  } catch (error) {
    console.error("GitHub repositories error:", error);
    res.status(500).json({
      error: "Failed to fetch repositories",
      message: error.response?.data?.message || error.message,
    });
  }
});

// Save repository integration
router.post("/save-integration", requireAuth, async (req, res) => {
  try {
    const {
      repository,
      integrationSettings,
      notificationSettings,
      accessToken,
    } = req.body;

    if (!repository || !accessToken) {
      return res
        .status(400)
        .json({ error: "Repository data and access token are required" });
    }

    // Check if repository already exists
    let existingRepo = await Repository.findOne({ githubId: repository.id });

    // Find user by req.userId (from JWT)
    const User = (await import("../models/User.js")).default;
    let user = await User.findById(req.userId);

    if (existingRepo) {
      // Update existing repository
      existingRepo.integrationSettings = {
        ...existingRepo.integrationSettings,
        ...integrationSettings,
      };
      if (notificationSettings) {
        existingRepo.notificationSettings = {
          ...existingRepo.notificationSettings,
          ...notificationSettings,
        };
      }
      existingRepo.accessToken = accessToken;
      existingRepo.lastSynced = new Date();
      existingRepo.status = "active";
      await existingRepo.save();

      // Update user's github field
      if (user) {
        user.github = user.github || {};
        user.github.accessToken = accessToken;
        user.github.repos = user.github.repos || [];
        // Remove any previous repo with same id
        user.github.repos = user.github.repos.filter(
          (r) => r.id !== repository.id
        );
        user.github.repos.push({
          ...repository,
          integrationSettings,
          notificationSettings,
          status: "active",
          lastSynced: new Date(),
        });
        await user.save();
      }

      res.json({
        success: true,
        message: "Repository integration updated successfully",
        repository: await Repository.findById(existingRepo._id).select(
          "-accessToken"
        ),
      });
    } else {
      // Create new repository record
      const newRepo = new Repository({
        githubId: repository.id,
        name: repository.name,
        fullName: repository.fullName,
        description: repository.description,
        htmlUrl: repository.htmlUrl,
        language: repository.language,
        size: repository.size,
        stargazersCount: repository.stargazersCount,
        forksCount: repository.forksCount,
        openIssuesCount: repository.openIssuesCount,
        isPrivate: repository.isPrivate,
        owner: repository.owner,
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
        accessToken: accessToken,
        status: "active",
      });

      await newRepo.save();

      // Update user's github field
      if (user) {
        user.github = user.github || {};
        user.github.accessToken = accessToken;
        user.github.repos = user.github.repos || [];
        // Remove any previous repo with same id
        user.github.repos = user.github.repos.filter(
          (r) => r.id !== repository.id
        );
        user.github.repos.push({
          ...repository,
          integrationSettings,
          notificationSettings,
          status: "active",
          lastSynced: new Date(),
        });
        await user.save();
      }

      res.json({
        success: true,
        message: "Repository integration created successfully",
        repository: await Repository.findById(newRepo._id).select(
          "-accessToken"
        ),
      });
    }
  } catch (error) {
    console.error("Save integration error:", error);
    res.status(500).json({
      error: "Failed to save integration",
      message: error.message,
    });
  }
});

export default router;
