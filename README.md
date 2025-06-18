# Code Review Bot

A GitHub App that automatically reviews pull request code when triggered by a comment containing "code review bot". The bot uses Anthropic's Claude AI to provide intelligent code reviews.

## Features

- Triggers code review when someone comments "code review bot" on a pull request
- Uses Claude AI to analyze code for:
  - Code quality and best practices
  - Potential bugs or issues
  - Security concerns
  - Performance considerations
- Checks for TODO comments in the code
- Provides detailed feedback directly on the pull request

## Setup

1. Create a new GitHub App:

   - Go to GitHub Settings > Developer Settings > GitHub Apps
   - Click "New GitHub App"
   - Set the following permissions:
     - Repository permissions:
       - Pull requests: Read & Write
       - Contents: Read
     - Subscribe to events:
       - Issue comments
   - Set the webhook URL to your Vercel deployment URL + `/api/webhook`

2. Get a Claude API Key:

   - Sign up for Anthropic's API at https://console.anthropic.com
   - Create an API key
   - Note down the key for the next step

3. Deploy to Vercel:

   ```bash
   npm install
   vercel
   ```

4. Configure environment variables in Vercel:

   - `GITHUB_APP_ID`: Your GitHub App ID
   - `GITHUB_PRIVATE_KEY`: Your GitHub App private key
   - `GITHUB_CLIENT_ID`: Your GitHub App client ID
   - `GITHUB_CLIENT_SECRET`: Your GitHub App client secret
   - `CLAUDE_API_KEY`: Your Anthropic Claude API key

5. Install the GitHub App on your repositories

## Usage

1. Create a pull request
2. Comment "code review bot" on the pull request
3. The bot will automatically review the code using Claude AI and provide detailed feedback

## Development

```bash
# Install dependencies
npm install

# Run locally
npm run dev
```

## License

MIT
