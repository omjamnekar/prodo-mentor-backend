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
        await axios.post(
          process.env.RAG_API_URL || "http://localhost:8000/rag/index",
          {
            repoId: String(repoId),
            files,
            metadata: { githubId: repository.id, name: repository.name },
          }
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
