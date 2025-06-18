# Code Review Bot

A GitHub App that automatically reviews pull request code when triggered by a comment containing "code review bot".

## Features

- Triggers code review when someone comments "code review bot" on a pull request
- Reviews code for common issues like:
  - Large file changes
  - TODO comments
- Provides feedback directly on the pull request

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

2. Deploy to Vercel:

   ```bash
   npm install
   vercel
   ```

3. Configure environment variables in Vercel:

   - `GITHUB_APP_ID`: Your GitHub App ID
   - `GITHUB_PRIVATE_KEY`: Your GitHub App private key
   - `GITHUB_CLIENT_ID`: Your GitHub App client ID
   - `GITHUB_CLIENT_SECRET`: Your GitHub App client secret

4. Install the GitHub App on your repositories

## Usage

1. Create a pull request
2. Comment "code review bot" on the pull request
3. The bot will automatically review the code and provide feedback

## Development

```bash
# Install dependencies
npm install

# Run locally
npm run dev
```

## License

MIT
