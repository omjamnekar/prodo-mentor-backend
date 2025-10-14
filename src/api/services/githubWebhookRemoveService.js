import axios from "axios";

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
