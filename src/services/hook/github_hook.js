import axios from "axios";

/**
 * Registers a webhook for a GitHub repository to notify backend on push/merge events.
 * @param {string} repoFullName - e.g. "owner/repo"
 * @param {string} accessToken - GitHub personal access token
 * @param {string} webhookUrl - The backend endpoint to receive webhook events
 * @returns {Promise<object>} - GitHub webhook API response
 */
export async function registerGitHubWebhook(
  repoFullName,
  accessToken,
  webhookUrl
) {
  const url = `https://api.github.com/repos/${repoFullName}/hooks`;
  const config = {
    headers: {
      Authorization: `token ${accessToken}`,
      Accept: "application/vnd.github.v3+json",
    },
  };
  const data = {
    name: "web",
    active: true,
    events: ["push", "pull_request"],
    config: {
      url: webhookUrl,
      content_type: "json",
      insecure_ssl: "0",
    },
  };
  const response = await axios.post(url, data, config);
  return response.data;
}

/**
 * Fetches the content of a list of files from a GitHub repository.
 * @param {string} repoFullName - e.g. "owner/repo"
 * @param {string} accessToken - GitHub personal access token
 * @param {string[]} filePaths - Array of file paths to fetch
 * @returns {Promise<Array<{filename: string, content: string}>>}
 */
export async function fetchChangedFiles(repoFullName, accessToken, filePaths) {
  const files = [];
  for (const path of filePaths) {
    const url = `https://api.github.com/repos/${repoFullName}/contents/${path}`;
    try {
      const res = await axios.get(url, {
        headers: {
          Authorization: `token ${accessToken}`,
          Accept: "application/vnd.github.v3+json",
        },
      });
      if (res.data && res.data.type === "file") {
        // Download file content
        const fileRes = await axios.get(res.data.download_url);
        files.push({ filename: path, content: fileRes.data });
      }
    } catch (err) {
      console.error(`Error fetching file ${path}:`, err.message);
    }
  }
  return files;
}

/**
 * Removes all webhooks for a GitHub repository that point to the backend webhook URL.
 * @param {string} repoFullName - e.g. "owner/repo"
 * @param {string} accessToken - GitHub personal access token
 * @param {string} webhookUrl - The backend endpoint to receive webhook events
 * @returns {Promise<void>}
 */
export async function removeGitHubWebhook(
  repoFullName,
  accessToken,
  webhookUrl
) {
  const url = `https://api.github.com/repos/${repoFullName}/hooks`;
  const config = {
    headers: {
      Authorization: `token ${accessToken}`,
      Accept: "application/vnd.github.v3+json",
    },
  };
  // Get all webhooks
  const response = await axios.get(url, config);
  const hooks = response.data;
  for (const hook of hooks) {
    if (hook.config && hook.config.url === webhookUrl) {
      // Delete this webhook
      await axios.delete(`${url}/${hook.id}`, config);
    }
  }
}
