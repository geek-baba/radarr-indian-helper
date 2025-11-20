# Radarr Indian Helper

Internal web dashboard for managing Indian-language movie releases with Radarr using RSS feeds and configurable quality preferences.

## Overview

Radarr Indian Helper is a Node.js + TypeScript + Express application that helps manage Indian-language movie releases with Radarr. It fetches RSS feeds, parses release information, matches movies with Radarr, and identifies new movies and upgrade candidates based on your configurable quality preferences.

## Features

- **RSS Feed Management**: Add, edit, and manage multiple RSS feeds through the Settings UI
- **Quality Preferences**: Configure resolution, codec, source, audio, and language preferences stored in SQLite
- **Smart Release Parsing**: Automatically extracts resolution, codec, source tags, audio formats, and languages from release titles
- **Radarr Integration**: Seamlessly integrates with Radarr API for movie lookup and management
- **Upgrade Detection**: Identifies upgrade candidates based on quality score differences and file size increases
- **Dubbed Detection**: Detects dubbed releases by comparing original language with audio languages
- **Web Dashboard**: Modern UI built with EJS and Tailwind CSS

## Configuration

### Radarr API Setup

1. Get your Radarr API key from Radarr Settings → General → Security
2. After starting the application, navigate to the Settings page (`/settings`)
3. In the "Radarr API Configuration" section, enter:
   - **Radarr API URL**: Your Radarr API URL (e.g., `http://radarr:7878/api/v3`)
   - **Radarr API Key**: Your Radarr API key
4. Click "Save Radarr Configuration"
5. The configuration is stored in the database and persists across container restarts

**Note**: Radarr API configuration is no longer done via environment variables. Use the Settings page instead.

### Adding RSS Feeds

1. Start the application and navigate to the Settings page (`/settings`)
2. Click "Add Feed" to add a new RSS feed
3. Enter the feed name and URL
4. Enable or disable the feed as needed
5. All feeds are stored in SQLite database (not in environment variables)

### Configuring Quality Settings

1. Navigate to Settings page (`/settings`)
2. Configure resolution rules:
   - Enable/disable specific resolutions (2160p, 1080p, 720p, 480p)
   - Set preferred and discouraged codecs per resolution
3. Adjust quality weights:
   - Resolution weights
   - Source tag weights (AMZN, NF, JC, ZEE5, DSNP, HS)
   - Codec weights (x264, x265, HEVC, AVC)
   - Audio weights (Atmos, TrueHD, DDP5.1, DD5.1, 2.0)
4. Configure language preferences:
   - Preferred audio languages (e.g., hi, en)
   - Preferred language bonus
   - Dubbed penalty
5. Set upgrade thresholds:
   - Minimum size increase percentage for upgrade
   - Upgrade threshold (score delta)
   - Poll interval in minutes

All settings are persisted in SQLite database.

## Local Development

### Prerequisites

- Node.js 22+ 
- npm

### Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Set environment variables (optional):
   ```bash
   export PORT=8085
   ```
   
   **Note**: Radarr API configuration is done via the Settings page after starting the app, not via environment variables.

3. Build the project:
   ```bash
   npm run build
   ```

4. Start the server:
   ```bash
   npm start
   ```

5. Access the dashboard at `http://localhost:8085`

## Docker

### Build Locally

```bash
docker build -t radarr-indian-helper .
docker run -p 8085:8085 -v /path/to/data:/app/data radarr-indian-helper
```

**Note**: Radarr API configuration is done via the Settings page after starting the container, not via environment variables.

### Docker Quick Start

```bash
docker pull ghcr.io/geek-baba/radarr-indian-helper:latest

docker run -d \
  --name radarr-indian-helper \
  -p 8085:8085 \
  -v /path/to/data:/app/data \
  ghcr.io/geek-baba/radarr-indian-helper:latest
```

After starting the container, navigate to `http://localhost:8085/settings` to configure your Radarr API URL and API key.

## Project Structure

```
src/
  ├── server.ts              # Main Express server
  ├── config.ts              # Environment configuration
  ├── db/index.ts            # Database initialization
  ├── models/                # Data models (releases, feeds, settings)
  ├── types/                 # TypeScript type definitions
  ├── radarr/                # Radarr API client
  ├── rss/                   # RSS feed processing
  ├── scoring/               # Quality scoring logic
  └── routes/                # Express routes
views/                       # EJS templates
public/                      # Static files
```

## Database Schema

The application uses SQLite with three main tables:

- **releases**: Stores parsed RSS feed items with quality scores and status
- **rss_feeds**: Stores RSS feed configurations
- **app_settings**: Stores quality settings and preferences

## License

ISC
