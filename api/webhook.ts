import { createAppAuth } from '@octokit/auth-app';
import { Octokit } from '@octokit/rest';
import { query } from '@anthropic-ai/claude-code/sdk';
import { VercelRequest, VercelResponse } from '@vercel/node';
import dotenv from 'dotenv';

dotenv.config();

interface GitHubWebhookPayload {
  action: string;
  comment: {
    body: string;
  };
  issue: {
    number: number;
    pull_request?: {
      url: string;
    };
  };
  repository: {
    full_name: string;
  };
  installation: {
    id: number;
  };
}

interface AuthResponse {
  token: string;
}

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

async function getInstallationOctokit(installationId: number): Promise<Octokit> {
  const { token } = await octokit.auth({
    type: 'installation',
    installationId,
  }) as AuthResponse;

  return new Octokit({
    auth: token,
  });
}

async function getFileContent(
  octokit: Octokit,
  owner: string,
  repo: string,
  path: string,
  ref: string
): Promise<string | null> {
  try {
    const { data } = await octokit.repos.getContent({
      owner,
      repo,
      path,
      ref,
    });

    if ('content' in data) {
      return Buffer.from(data.content, 'base64').toString();
    }
    return null;
  } catch (error) {
    console.error(`Error getting content for ${path}:`, error);
    return null;
  }
}

async function reviewCode(
  octokit: Octokit,
  owner: string,
  repo: string,
  pullNumber: number
): Promise<void> {
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

  const reviewComments: Array<{
    path: string;
    position: number;
    body: string;
  }> = [];

  for (const file of files) {
    if (file.patch) {
      // Check for TODO comments
      if (file.patch.includes('TODO')) {
        reviewComments.push({
          path: file.filename,
          position: 1,
          body: '⚠️ Found TODO comments in the code. Please ensure these are addressed before merging.'
        });
      }

      // Get the file content for AI review
      const content = await getFileContent(octokit, owner, repo, file.filename, pr.head.sha);
      if (content) {
        try {
          const prompt = `Please review this code and provide feedback on:
1. Code quality and best practices
2. Potential bugs or issues
3. Security concerns
4. Performance considerations

Here's the code to review:
\`\`\`
${content}
\`\`\`

Be concise and to the point.`;

          const response = query({
            prompt,
            options: {
              maxTurns: 1,
              maxThinkingTokens: 1000,
            }
          });

          let review = '';
          for await (const message of response) {
            if (message.type === 'result' && message.subtype === 'success') {
              review = message.result;
              break;
            }
          }

          if (review) {
            reviewComments.push({
              path: file.filename,
              position: 1,
              body: `🤖 AI Code Review:\n\n${review}`
            });
          }
        } catch (error) {
          console.error('Error getting AI review:', error);
          reviewComments.push({
            path: file.filename,
            position: 1,
            body: '⚠️ Error getting AI code review. Please try again later.'
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
      event: 'REQUEST_CHANGES'
    });
  } else {
    await octokit.pulls.createReview({
      owner,
      repo,
      pull_number: pullNumber,
      body: 'Code review completed. No issues found! 👍',
      event: 'APPROVE'
    });
  }
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const event = req.headers['x-github-event'];
  const signature = req.headers['x-hub-signature-256'];

  console.log('event', event);
  console.log('signature', signature);
  console.log('body', JSON.stringify(req.body, null, 2));

  // Verify webhook signature here if needed
  // For now, we'll skip signature verification for simplicity

  if (event === 'issue_comment') {
    const payload = req.body as GitHubWebhookPayload;
    const { action, comment, issue, repository, installation } = payload;

    if (action === 'created' && comment.body.toLowerCase().trim() === 'code review bot') {
      try {
        const installationOctokit = await getInstallationOctokit(installation.id);

        // Check if the comment is on a pull request
        if (issue.pull_request) {
          const pullNumber = issue.number;
          const [owner, repo] = repository.full_name.split('/');

          await reviewCode(installationOctokit, owner, repo, pullNumber);

          res.status(200).json({ message: 'Code review completed' });
          return;
        }
      } catch (error) {
        console.error('Error processing webhook:', error);
        res.status(500).json({ error: 'Internal server error' });
        return;
      }
    }
  }

  res.status(200).json({ message: 'Event processed' });
}
