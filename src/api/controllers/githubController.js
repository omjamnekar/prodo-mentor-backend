import { registerGitHubWebhook } from "../services/githubWebhookService.js";
// POST /api/github/webhook/event
export async function githubWebhookEventController(req, res) {
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
      // You can now fetch these files from GitHub API for indexing
      // TODO: Call file-fetching service and RAG indexing here
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
            process.env.RAG_PATH + "/rag/index" ||
              "http://0.0.0.0:8002/rag/index",
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
import axios from "axios";
import Repository from "../../../models/Repository.js";

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
    const User = (await import("../../../models/User.js")).default;
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
