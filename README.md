<p align="center"><img src="assets/logo-wordmark.png" alt="NoteNinja" width="420"></p>

<p align="center"><b>One campus dashboard: seniors' notes for juniors + a smart timetable that reminds you on time.</b></p>

<p align="center">
  <a href="https://noteninja-alpha.vercel.app"><b>🌐 Live website: noteninja-alpha.vercel.app</b></a>
</p>

**IT HAPPENS @ RAALE #14** · Centre of Excellence, Rathinam Technical Campus · 19 Nov 2026
**Team GOD PROMO:** Lohith K (Team Lead) · Keshav Pranav M R · Harini C N

---

## What it does

### Challenge 01 — Senior-to-Junior Knowledge Sharing
- Seniors upload **notes, previous question papers and tips** with title, type, subject and semester.
- Juniors **search and filter** by department, semester, subject and type, and sort by top rated.
- New uploads are **Pending** until a moderator approves them; only approved items show **Verified**.
- PDF and image **preview**, download, **1–5 stars, like/dislike** and comments, **bookmarks**, **reports** and a per-resource **history**.

### Challenge 02 — Smart Student Timetable & Reminders
- Weekly **classes and labs** with subject, time and venue; **clashes** and end-before-start times are rejected.
- **Assignments** with due date and time, done/overdue status, no duplicates.
- **Reminders** 15 minutes before a class or lab and 24 h / 1 h before a deadline — **each sent only once**.

### Also included
- **Google and GitHub sign-in** with a profile (department, year, senior/junior, GitHub, LinkedIn).
- **Subject communities** grouped by semester, **connections** (connect / accept / reject) and **personal chat** with emoji and image/PDF attachments.
- **Notification panel**, **dark and light mode**, landing page.
- **Moderator panel**: live counts, pending approvals, all reports and a moderator-only chat.
- **Ask Ninja** assistant: study plan from your own timetable and deadlines, finds top-rated notes, explains upload rules, page scan, voice input.

## How it works

```
Browser (HTML/CSS/JS on Vercel)
   │  every action calls a validated database function (nn_*)
   ▼
Supabase ── Auth (Google, GitHub)
        ├─ Postgres functions: check fields, roles, file type/size, duplicates,
        │  clashes, past dates, moderator-only actions, chat only after connecting
        ├─ Postgres tables (row-level security on)
        └─ Storage buckets: 10 MB limit + allowed file types enforced on the server
```

The browser never writes to tables directly, so the rules hold even if someone skips the website.

## Rules
| Rule | Where it is enforced |
|---|---|
| Title, type and subject required; empty files rejected | Browser + database function |
| Only PDF, DOCX, PPTX, PNG, JPG; max 10 MB | Browser + database function + storage bucket |
| Duplicate files blocked (SHA-256 fingerprint) | Database function |
| Pending items hidden from other students; only moderators approve | Database function |
| One review per student; no reviewing your own upload | Database function |
| No timetable clashes; end after start; due dates in the future | Database function |
| Personal chat only after a connection is accepted | Database function |
| Uploader emails never shown | Database function |

## Testing
27 server-side tests run directly against the database functions — **27 / 27 pass** (uploads, search, reviews, communities, connections, chat, timetable, moderation).

## Try it
1. Open **https://noteninja-alpha.vercel.app** → **Sign in**.
2. Use **Continue with Google / GitHub**, or a **Judge account**:
   - *Judge – Senior* uploads a PDF (try `virus.exe` — rejected)
   - *Judge – Moderator* approves it on the Moderate page
   - *Judge – Junior* finds it with filters, previews, rates and downloads it
3. Open **Timetable** and add an overlapping class to see the clash check.

## Run locally
No build step is needed:
```
npx serve .
```
Then open http://localhost:3000.

## Team
| Member | Role |
|---|---|
| **Lohith K** (Team Lead) | Idea, front end and back end |
| **Keshav Pranav M R** | Features and AI tools (Ask Ninja) |
| **Harini C N** | Design and testing |

## Tech
HTML · CSS · JavaScript · Supabase (Postgres, Auth, Storage) · Vercel · Built with the help of Google Antigravity and Claude.
