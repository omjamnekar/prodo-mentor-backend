import axios from "axios";
import { fetchChangedFiles } from "../../../src/api/services/githubFileService.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const event = req.body;
    console.log("[Webhook] Event received:", JSON.stringify(event, null, 2));
    if (event.commits) {
      // Push event: collect changed/added files from all commits
      const changedFiles = new Set();
      for (const commit of event.commits) {
        (commit.added || []).forEach((f) => changedFiles.add(f));
        (commit.modified || []).forEach((f) => changedFiles.add(f));
      }
      const repoFullName = event.repository?.full_name;
      // TODO: Lookup accessToken securely from your DB using repo info
      const accessToken = process.env.GITHUB_ACCESS_TOKEN;
      const files = await fetchChangedFiles(
        repoFullName,
        accessToken,
        Array.from(changedFiles)
      );
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
      return res.json({ success: true, indexedFiles: files.length });
    } else if (event.pull_request) {
      // Pull request event: can fetch changed files from PR API
      return res.json({ success: true, message: "PR event received" });
    } else {
      return res.json({
        success: true,
        message: "Event ignored (not push/PR)",
      });
    }
  } catch (error) {
    console.error("Webhook event error:", error);
    return res
      .status(500)
      .json({
        error: "Failed to process webhook event",
        message: error.message,
      });
  }
}
