# NoteNinja

**IT HAPPENS @ RAALE #14 · Team GOD PROMO · Rathinam Technical Campus**

One dashboard that solves both challenges:

- **Challenge 01 — Senior-to-Junior Knowledge Sharing:** seniors upload notes, previous question papers and tips; juniors search, filter, preview/download, rate (1–5 stars), like/dislike, bookmark and report. A moderator approves uploads before they appear, and only approved items show the **Verified** badge.
- **Challenge 02 — Smart Timetable & Reminders:** weekly class/lab timetable with clash detection, assignments with due date/time and done/overdue status, and reminders (15 min before a class/lab, 24 h and 1 h before a deadline), each sent only once.
- **Extras:** subject communities with teachers (pin/delete), LinkedIn-style connections, personal chats (only after the other person accepts), and the **Ask Ninja** chatbot.

## Stack
Plain HTML, CSS and JavaScript (no build step) · Supabase Postgres + Storage · Vercel.
The browser never writes to tables directly: every action calls a validated Postgres function (`nn_*`), so all rules are enforced on the server.

## Upload and visibility rules
- Title (3–120 chars), type and subject are required; empty files are rejected.
- Allowed: PDF, DOCX, PPTX, PNG, JPG. Max size 10 MB (checked in the browser, in the database function and by the storage bucket).
- Duplicate files (same SHA-256 hash) are rejected: "This file was already uploaded".
- New uploads are **pending**; only moderators can approve or reject. Pending items are hidden from other students.
- Uploader emails are never shown.

## Run it
1. Open `index.html` with any static server, e.g. `npx serve .` — or open the Vercel link.
2. Click **Sign in** and pick a demo account (Moderator, Teacher, Senior or Junior) or create one.

## Limitations
- Demo sign-in (pick an account) instead of passwords, so the team can demo all roles quickly.
- Reminders work while the app is open (browser notifications if allowed).
