# Copilot Instructions

## Active App

The app the user runs is the **Express.js app** located at `weekly-menus-manually-generated/`.

- Start command: `npm start` (runs `node weekly-menus-manually-generated/server.mjs`)
- Frontend: `weekly-menus-manually-generated/index.html` — single-page app with all JS inline
- Styles: `weekly-menus-manually-generated/styles.css`
- Database: PostgreSQL via Railway (`DATABASE_URL` / `POSTGRES_URL` in `.env.local` at workspace root)

**All new features, bug fixes, and changes must target this Express app only.**

## Deprecated App — Do Not Modify

The `archive/` directory contains a deprecated Next.js 14 app that is **no longer used or maintained**.

- Do NOT add features, fix bugs, or make any changes to files inside `archive/`.
- Do NOT create new files inside `archive/`.
- If a task seems to require changes in `archive/`, implement it in `weekly-menus-manually-generated/` instead.
