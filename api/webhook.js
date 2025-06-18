const { createAppAuth } = require('@octokit/auth-app');
const { Octokit } = require('@octokit/rest');
const { ClaudeCode } = require('@anthropic-ai/claude-code');
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

// Initialize Claude Code client
const claudeCode = new ClaudeCode({
  apiKey: process.env.CLAUDE_API_KEY,
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

async function getFileContent(octokit, owner, repo, path, ref) {
  try {
    const { data } = await octokit.repos.getContent({
      owner,
      repo,
      path,
      ref,
    });
    return Buffer.from(data.content, 'base64').toString();
  } catch (error) {
    console.error(`Error getting content for ${path}:`, error);
    return null;
  }
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

  const reviewComments = [];

  for (const file of files) {
    if (file.patch) {
      // Check for TODO comments
      if (file.patch.includes('TODO')) {
        reviewComments.push({
          path: file.filename,
          position: 1,
          body: '⚠️ Found TODO comments in the code. Please ensure these are addressed before merging.',
        });
      }

      // Get the file content for AI review
      const content = await getFileContent(
        octokit,
        owner,
        repo,
        file.filename,
        pr.head.sha
      );
      if (content) {
        try {
          const prompt = `Please review this code and provide feedback on:
1. Code quality and best practices
2. Potential bugs or issues
3. Security concerns
4. Performance considerations

Be concise and to the point.`;

          const review = await claudeCode.query({
            code: content,
            query: prompt,
            options: {
              /*
              abortController?: AbortController
              allowedTools?: string[]
              appendSystemPrompt?: string
              customSystemPrompt?: string
              cwd?: string
              disallowedTools?: string[]
              executable?: 'bun' | 'deno' | 'node'
              executableArgs?: string[]
              maxThinkingTokens?: number
              maxTurns?: number
              mcpServers?: Record<string, McpServerConfig>
              pathToClaudeCodeExecutable?: string
              permissionMode?: PermissionMode
              permissionPromptToolName?: string
              continue?: boolean
              resume?: string
              model?: string
              */
              maxTurns: 3,
              maxThinkingTokens: 1000,
            },
          });

          if (review) {
            reviewComments.push({
              path: file.filename,
              position: 1,
              body: `🤖 AI Code Review:\n\n${review}`,
            });
          }
        } catch (error) {
          console.error('Error getting AI review:', error);
          reviewComments.push({
            path: file.filename,
            position: 1,
            body: '⚠️ Error getting AI code review. Please try again later.',
          });
        }
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

  console.log('event', event);
  console.log('signature', signature);
  console.log('body', JSON.stringify(req.body, null, 2));

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
