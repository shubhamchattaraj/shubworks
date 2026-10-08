# SHUBWORKS

### A personal literary archive and reading platform.

SHUBWORKS is an evolving personal project for organizing and presenting literary work through a custom web reading experience.

This public repository contains the application code and project structure. The actual literary Markdown content and private metadata are intentionally **not included**.

## What is included

- Frontend reading experience
- Archive interface
- Reading map
- Express API
- PostgreSQL integration
- Incremental synchronization engine
- Netlify publishing workflow
- Database schema and project configuration

## What is intentionally excluded

The following remain in the private master project and are not committed here:

- Literary `.md` files
- Metadata JSON files
- `node_modules`
- `.env` files and secrets
- Generated archive data
- Work-specific sitemap entries

## Local project architecture

```text
Private metadata + Markdown
          ↓
      Sync engine
          ↓
      PostgreSQL
          ↓
      Express API
          ↓
      SHUBWORKS frontend
```

The private master project remains the source of truth for the actual archive content.

## Setup

1. Clone this repository.
2. Run `npm install`.
3. Create a local `.env` from `.env.example`.
4. Provide your own private metadata/content files locally if you want to run the sync workflow.
5. Run `npm run dev` to start the application.

The public repository is designed to share the software side of SHUBWORKS without publishing the literary source material.

## Live site

[SHUBWORKS](https://shubworks.netlify.app/)

## Author

Created and maintained as an independent literary + software project.
