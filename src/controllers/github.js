import axios from "axios";
import Repository from "../models/Repository.js";
import { fetchChangedFiles } from "../services/hook/github_hook.js";
import { registerGitHubWebhook } from "../services/hook/github_hook.js";

export async function githubWebhookEventCtrl(req, res) {
  try {
    // GitHub sends events as JSON in req.body
    const event = req.body;
    console.log("[Webhook] Event received:", JSON.stringify(event, null, 2));
    // Only handle push and pull_request events
    if (event.commits) {
      // Push event: collect changed/added files from all commits
      const changedFiles = new Set();
      for (const commit of event.commits) {
        (commit.added || []).forEach((f) => changedFiles.add(f));
        (commit.modified || []).forEach((f) => changedFiles.add(f));
      }
      // Fetch repo info and access token from your DB (example assumes repoFullName and accessToken are available)
      const repoFullName = event.repository?.full_name;
      // TODO: Lookup accessToken securely from your DB using repo info
      const accessToken = process.env.GITHUB_ACCESS_TOKEN; // Replace with DB lookup
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
            (process.env.RAG_PATH || "http://0.0.0.0:8002") + "/rag/index",
            payload
          );
        } catch (err) {
          console.error("Error sending files to RAG service:", err.message);
        }
      }
      res.json({ success: true, indexedFiles: files.length });
    } else if (event.pull_request) {
      // Pull request event: can fetch changed files from PR API
      // TODO: Implement PR file change extraction
      res.json({ success: true, message: "PR event received" });
    } else {
      res.json({ success: true, message: "Event ignored (not push/PR)" });
    }
  } catch (error) {
    console.error("Webhook event error:", error);
    res.status(500).json({
      error: "Failed to process webhook event",
      message: error.message,
    });
  }
}

// POST /api/github/webhook/register
export async function registerWebhookController(req, res) {
  try {
    const { repoFullName, accessToken } = req.body;
    if (!repoFullName || !accessToken) {
      return res
        .status(400)
        .json({ error: "repoFullName and accessToken required" });
    }
    // The backend endpoint to receive webhook events
    const webhookUrl =
      process.env.WEBHOOK_RECEIVER_URL ||
      "http://your-backend-domain/api/github/webhook/event";
    const result = await registerGitHubWebhook(
      repoFullName,
      accessToken,
      webhookUrl
    );
    res.json({ success: true, webhook: result });
  } catch (error) {
    console.error("Webhook registration error:", error);
    res
      .status(500)
      .json({ error: "Failed to register webhook", message: error.message });
  }
}

export async function saveIntegrationController(req, res) {
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

    let existingRepo = await Repository.findOne({ githubId: repository.id });
    const User = (await import("../../models/User.js")).default;
    let user = await User.findById(req.userId);

    let repoId;
    if (existingRepo) {
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
      repoId = existingRepo._id;
      if (user) {
        user.github = user.github || {};
        user.github.accessToken = accessToken;
        user.github.repos = user.github.repos || [];
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
    } else {
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
      repoId = newRepo._id;
      if (user) {
        user.github = user.github || {};
        user.github.accessToken = accessToken;
        user.github.repos = user.github.repos || [];
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
    }
    // Automatically register webhook after repo is saved
    try {
      const { registerGitHubWebhook } = await import(
        "../services/githubWebhookService.js"
      );
      const webhookUrl =
        process.env.WEBHOOK_RECEIVER_URL ||
        "http://your-backend-domain/api/github/webhook/event";
      await registerGitHubWebhook(repository.fullName, accessToken, webhookUrl);
    } catch (err) {
      console.error("Error registering webhook:", err.message);
    }

    // Recursively fetch all code/text files from the repo
    const allowedExtensions = [
      "js",
      "ts",
      "py",
      "md",
      "jsx",
      "tsx",
      "json",
      "txt",
      "java",
      "go",
      "rb",
      "c",
      "cpp",
      "cs",
      "html",
      "css",
      "yml",
      "yaml",
      "xml",
      "sh",
      "bat",
      "dockerfile",
    ];
    const maxFileSize = 1024 * 1024; // 1MB
    let files = [];

    async function fetchFilesRecursively(path = "") {
      const url = `https://api.github.com/repos/${
        repository.fullName
      }/contents${path ? `/${path}` : ""}`;
      try {
        const res = await axios.get(url, {
          headers: {
            Authorization: `token ${accessToken}`,
            Accept: "application/vnd.github.v3+json",
          },
        });
        const items = res.data;
        for (const item of items) {
          if (item.type === "file") {
            const extMatch = item.name.match(/\.([a-zA-Z0-9]+)$/);
            const ext = extMatch
              ? extMatch[1].toLowerCase()
              : item.name.toLowerCase();
            if (allowedExtensions.includes(ext) && item.size <= maxFileSize) {
              try {
                const fileRes = await axios.get(item.download_url);
                files.push({
                  filename: path ? `${path}/${item.name}` : item.name,
                  content: fileRes.data,
                });
              } catch (err) {
                console.error(`Error fetching file ${item.name}:`, err.message);
              }
            }
          } else if (item.type === "dir") {
            await fetchFilesRecursively(
              path ? `${path}/${item.name}` : item.name
            );
          }
        }
      } catch (err) {
        console.error(`Error fetching contents for path ${path}:`, err.message);
      }
    }
    await fetchFilesRecursively("");
    // Send files to RAG service for indexing
    try {
      if (files.length > 0) {
        // Flatten metadata values to strings
        const flatMetadata = {
          githubId: String(repository.id),
          name: String(repository.name),
        };
        const payload = {
          repoId: String(repoId),
          files,
          metadata: flatMetadata,
        };
        console.log(
          "Payload sent to RAG:",
          JSON.stringify(payload.repoId, null, 2),
          JSON.stringify(payload.files[0], null, 2),
          JSON.stringify(payload.metadata, null, 2)
        );
        await axios.post(
          process.env.RAG_PATH + "/rag/index" ||
            "http://0.0.0.0:8002/rag/index",
          payload
        );
      }
    } catch (err) {
      console.error("Error sending files to RAG service:", err.message);
    }
    res.json({
      success: true,
      message: existingRepo
        ? "Repository integration updated successfully"
        : "Repository integration created successfully",
      repository: await Repository.findById(repoId).select("-accessToken"),
      ragIndexed: files.length,
    });
  } catch (error) {
    console.error("Save integration error:", error);
    res.status(500).json({
      error: "Failed to save integration",
      message: error.message,
    });
  }
}

// initial
// ///////////////////

export const githubStatusCtrl = async (req, res) => {
  try {
    const User = (await import("../../models/User.js")).default;
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    const github = user.github || {};
    res.json({
      connected: !!github.accessToken,
      accessToken: github.accessToken || null,
      githubUser: github.user || null,
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to fetch GitHub status",
      message: error.message,
    });
  }
};

export const storedRepoCtrl = async (req, res) => {
  try {
    const User = (await import("../../models/User.js")).default;
    const user = await User.findById(req.userId);
    if (!user || !user.github || !Array.isArray(user.github.repos)) {
      return res.status(404).json({ error: "No stored repositories found" });
    }
    res.json({ repositories: user.github.repos });
  } catch (error) {
    res.status(500).json({
      error: "Failed to fetch stored repositories",
      message: error.message,
    });
  }
};

export const delteRepoCtrl = async (req, res) => {
  try {
    const repoId = req.params.id;
    const User = (await import("../../models/User.js")).default;
    const Repository = (await import("../../models/Repository.js")).default;
    // Find repo info before deleting
    const repo = await Repository.findById(repoId);
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
    // Remove webhook if repo info is available
    if (repo && repo.fullName && repo.accessToken) {
      try {
        const { removeGitHubWebhook } = await import(
          "../api/services/githubWebhookRemoveService.js"
        );
        const webhookUrl =
          process.env.WEBHOOK_RECEIVER_URL ||
          "http://your-backend-domain/api/github/webhook/event";
        await removeGitHubWebhook(repo.fullName, repo.accessToken, webhookUrl);
      } catch (err) {
        console.error("Error removing webhook:", err.message);
      }
    }
    // Remove RAG vectors for this repo
    if (repo && repo._id) {
      try {
        await axios.delete(
          (process.env.RAG_PATH || "http://0.0.0.0:8002") + "/rag/delete",
          { params: { repoId: String(repo._id) } }
        );
      } catch (err) {
        console.error("Error deleting RAG vectors:", err.message);
      }
    }
    res.json({ success: true });
  } catch (error) {
    res
      .status(500)
      .json({ error: "Failed to delete repository", message: error.message });
  }
};

export const oauthInitCtrl = (req, res) => {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const redirectUri =
    process.env.GITHUB_REDIRECT_URI ||
    `${req.protocol}://${req.get("host")}/api/github/oauth/callback`;
  const scope = "repo,read:org,read:user,user:email";
  const state = Math.random().toString(36).substring(7);

  const authUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(
    redirectUri
  )}&scope=${encodeURIComponent(scope)}&state=${state}`;

  res.json({
    success: true,

    authUrl,
    state,
  });
};

export const oauthCallBackCtrl = async (req, res) => {
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
    const User = (await import("../../models/User.js")).default;
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
      `${
        process.env.CORS_ORIGIN
      }/analysis?github_connected=true&user=${encodeURIComponent(
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
};

export const getRepository = async (req, res) => {
  try {
    const { accessToken } = req.userId;

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
};

export const saveInitgrationCtrl = async (req, res) => {
  try {
    await saveIntegrationController(req, res);
  } catch (error) {
    console.error("Save integration error:", error);
    res.status(500).json({
      error: "Failed to save integration",
      message: error.message,
    });
  }
};
