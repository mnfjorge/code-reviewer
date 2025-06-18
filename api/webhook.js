const { createAppAuth } = require('@octokit/auth-app');
const { Octokit } = require('@octokit/rest');
require('dotenv').config();

// Initialize Octokit with GitHub App credentials
const octokit = new Octokit({
  authStrategy: createAppAuth,
  auth: {
    appId: process.env.GITHUB_APP_ID,
    privateKey: process.env.GITHUB_PRIVATE_KEY,
    clientId: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
  },
});

async function getInstallationOctokit(installationId) {
  const { token } = await octokit.auth({
    type: 'installation',
    installationId,
  });

  return new Octokit({
    auth: token,
  });
}

async function reviewCode(octokit, owner, repo, pullNumber) {
  // Get the pull request details
  const { data: pr } = await octokit.pulls.get({
    owner,
    repo,
    pull_number: pullNumber,
  });

  // Get the files changed in the PR
  const { data: files } = await octokit.pulls.listFiles({
    owner,
    repo,
    pull_number: pullNumber,
  });

  // Simple code review logic - you can enhance this based on your needs
  const reviewComments = [];

  for (const file of files) {
    if (file.patch) {
      // Basic review: Check for large files
      if (file.changes > 300) {
        reviewComments.push({
          path: file.filename,
          position: 1,
          body: `⚠️ This file has a lot of changes (${file.changes} lines). Consider breaking it down into smaller, more manageable changes.`,
        });
      }

      // Check for TODO comments
      if (file.patch.includes('TODO')) {
        reviewComments.push({
          path: file.filename,
          position: 1,
          body: '⚠️ Found TODO comments in the code. Please ensure these are addressed before merging.',
        });
      }
    }
  }

  // Submit the review
  if (reviewComments.length > 0) {
    await octokit.pulls.createReview({
      owner,
      repo,
      pull_number: pullNumber,
      body: 'Code review completed. Please address the following comments:',
      comments: reviewComments,
      event: 'REQUEST_CHANGES',
    });
  } else {
    await octokit.pulls.createReview({
      owner,
      repo,
      pull_number: pullNumber,
      body: 'Code review completed. No issues found! 👍',
      event: 'APPROVE',
    });
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const event = req.headers['x-github-event'];
  const signature = req.headers['x-hub-signature-256'];

  // Verify webhook signature here if needed
  // For now, we'll skip signature verification for simplicity

  if (event === 'issue_comment') {
    const { action, comment, issue, repository, installation } = req.body;

    if (
      action === 'created' &&
      comment.body.toLowerCase().trim() === 'code review bot'
    ) {
      try {
        const installationOctokit = await getInstallationOctokit(
          installation.id
        );

        // Check if the comment is on a pull request
        if (issue.pull_request) {
          const pullNumber = issue.number;
          const [owner, repo] = repository.full_name.split('/');

          await reviewCode(installationOctokit, owner, repo, pullNumber);

          return res.status(200).json({ message: 'Code review completed' });
        }
      } catch (error) {
        console.error('Error processing webhook:', error);
        return res.status(500).json({ error: 'Internal server error' });
      }
    }
  }

  return res.status(200).json({ message: 'Event processed' });
};
