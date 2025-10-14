import axios from "axios";

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
