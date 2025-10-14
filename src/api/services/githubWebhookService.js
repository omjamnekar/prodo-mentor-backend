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
