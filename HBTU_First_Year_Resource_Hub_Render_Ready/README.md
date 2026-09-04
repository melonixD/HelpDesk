# HelpDesk V14 · Netlify edition

HelpDesk is the same branch-first HBTU resource library, prepared for Netlify. The frontend, calculator, focus tools, mobile layout, syllabus library, PDFs, contacts and resource hierarchy are preserved. The Gemini-powered Unlimited Practice API now runs as Netlify Functions, so the API key never reaches the browser.

## Included

- 14 branches, including Biotechnology
- Branch → Semester → Subject → Unit navigation
- Technology and Engineering semester mappings
- Lectures, Notes, PYQs, Books and Practice inside units
- 20 browser-viewable unit-wise PYQ PDFs
- Updated Engineering Chemistry PYQ links for Units 1-5
- Engineering Chemistry Notes folders split into Handwritten Notes and Master Notes
- Engineering Chemistry Master Notes PDFs for Units 1–5
- Chemistry Unit 5 topic lectures for Water Analysis, Polymers and Solid Waste Management
- Chemistry Lab section with Lab Manual, Viva Questions and End-Semester Lab Questions
- Engineering Mechanics Master Notes PDFs for Units 1–5
- Mechanics lecture folders for Trusses, Beams, Centroid, Moment of Inertia and Strength of Materials
- Replacement Basic Electronics PYQs and PYQ-backed Practice Mode for Units 1–5
- Basic Electronics Master Notes for Units 1–5
- Neso lectures for Electronics Units 1–3, a dedicated Unit 4 playlist and notes-only Unit 5 guidance
- Engineering and Technology syllabus folders, initially collapsed
- Unlimited Practice powered by real PYQ text and Gemini
- SGPA/CGPA calculator, focus timer and study list
- Separate Placements and Notice Board entries in the hamburger menu
- Official year-wise placement figures and source reports
- Automatically refreshed HBTU announcements with a resilient saved fallback
- Akshat Shukla and Priyanshu Dixit help cards and WhatsApp contacts
- Responsive Android/mobile layout, animations, light mode and dark mode
- Netlify Functions, clean `/api/*` routes, security headers and SPA routing
- Static resource fallback if the resource API is temporarily unavailable
- Private responsive admin dashboard for resources, site details, creator cards, placements and notices
- Dynamic branch → semester → subject → unit management with add, reorder and cascade-delete controls
- Secure 8-hour signed sessions, CSRF checks, bcrypt login and login rate limiting
- GitHub-backed content saves that automatically trigger the connected Netlify deployment
- Chunked Netlify Blob uploads for PDFs (20 MB) and profile images (5 MB)

## Deploy to Netlify from GitHub (recommended)

1. Extract this ZIP.
2. Upload **the contents** to the root of your GitHub repository. `netlify.toml`, `package.json`, `public`, `data` and `netlify` must be visible at the repository root.
3. In Netlify, choose **Add new project → Import an existing project → GitHub**.
4. Choose the repository. Netlify reads these settings from `netlify.toml`:

   | Setting | Value |
   | --- | --- |
   | Build command | `npm run build` |
   | Publish directory | `public` |
   | Functions directory | `netlify/functions` |
   | Node | `20` |

5. Before or after the first deploy, open **Project configuration → Environment variables** and add:

   | Name | Value |
   | --- | --- |
   | `GEMINI_API_KEY` | Your Google AI Studio API key |
   | `GEMINI_MODEL` | `gemini-3.6-flash` (optional) |
   | `ADMIN_USERNAME` | `Priyanshu` |
   | `ADMIN_PASSWORD_HASH` | The bcrypt hash from `.env.example` |
   | `SESSION_SECRET` | A random secret of at least 32 characters |
   | `GITHUB_TOKEN` | Fine-grained GitHub token with Contents read/write access to this repository |
   | `GITHUB_REPO` | `OWNER/REPOSITORY` |
   | `GITHUB_BRANCH` | `main` |

6. Trigger a new production deploy after saving the key.
7. Check `https://YOUR-SITE.netlify.app/api/health`. It should return JSON with `"status":"ok"`.
8. Open **Unlimited Practice**, choose a semester, subject and unit, then generate a question set.

## Direct ZIP upload

You can upload this complete ZIP at [Netlify Drop](https://app.netlify.com/drop) while signed in. Upload the project ZIP—not only the `public` folder—because the Netlify Functions and configuration are outside `public`. Add `GEMINI_API_KEY` in the project environment variables and redeploy once afterward.

This project contains several PDFs and may be too large for a reliable browser drop. The GitHub method is recommended and also enables the admin dashboard's automatic saves.

## Private admin dashboard

The admin route is `/admin`. It is also revealed in the hamburger menu after tapping the small version label five times within three seconds, or holding it for about one second. The menu shows Admin and Log out only while a valid session exists.

On the dashboard you can edit:

- branches, any number of semesters, linked subjects and unit resources;
- the public site title, institution and description;
- creator names, roles, WhatsApp contacts and profile images;
- placement records and reports;
- Notice Board fallback entries.

Choose **Save changes** to validate the entire JSON document on the server and commit it through GitHub. Netlify then deploys that commit. The History link opens the relevant GitHub file history. Saves are serialized by the UI; if GitHub reports a conflict, reload before retrying.

The password itself is never stored in the source or sent to the browser. Generate a replacement hash locally with:

```bash
node -e "require('bcryptjs').hash(process.argv[1], 12).then(console.log)" 'YOUR_NEW_PASSWORD'
```

For the initial account requested for this build, copy these values into Netlify (the value below is a one-way bcrypt hash, not the password):

```dotenv
ADMIN_USERNAME=Priyanshu
ADMIN_PASSWORD_HASH=$2b$12$9DsaIlwzN45reAa8sSTcgOFl5chG7AV.totGf30xQbWQUZw.bQ/sS
SESSION_SECRET=replace-with-the-output-of-openssl-rand-hex-32
GITHUB_TOKEN=your-fine-grained-github-token
GITHUB_REPO=YOUR_GITHUB_USERNAME/YOUR_REPOSITORY
GITHUB_BRANCH=main
```

Generate a session secret with `openssl rand -hex 32`. Uploaded assets use Netlify Blobs automatically when the dashboard runs in Netlify Functions; no separate Blob credential is needed there. Local dashboard uploads are placed in `public/uploads` for previewing.

## Unlimited Practice

Practice Mode takes a unit's internal `practiceKey`, finds its extracted real questions in `data/pyq-bank.json`, and asks Gemini 3.6 for three new questions and concise answers at a similar level. The visible `pyqUrl` may be a newer Google Drive file without breaking the existing question bank. Gemini thinking is kept minimal and the request is stopped after 22 seconds so it finishes before the deployment timeout. If Gemini is temporarily slow or unreachable, the UI falls back to real questions from that unit instead of failing.

- Browser request: `POST /api/practice/generate`
- Netlify function: `netlify/functions/practice-generate.js`
- Server-side shared logic: `netlify/lib/helpdesk-api.js`
- Secret: `GEMINI_API_KEY` in Netlify environment variables
- Default model: `gemini-3.6-flash`
- Optional timeout override: `PRACTICE_API_TIMEOUT_MS` (1,000–25,000 ms; default 22,000)
- Protection: 20 generation requests per IP per warm function instance per hour

The UI still works without the Gemini key; only question generation shows a setup message. Google API quotas are separate from Netlify traffic limits, so high visitor counts may require a paid Gemini quota.

## Placements and Notice Board

The hamburger menu has separate **Placements** and **Notice Board** entries. Placements opens directly to figures and report links published by HBTU. Notice Board opens directly to the latest announcements and calls `GET /api/notices`, which reads the Circulars & Announcements section of the official HBTU homepage.

Netlify's durable CDN cache holds the notice response for 30 minutes and may serve a stale copy for up to six hours while refreshing. That avoids contacting HBTU once per visitor. If HBTU is unavailable or changes its page structure, the function returns the bundled saved feed instead of leaving the section empty. No extra API key or environment variable is required.

## Run locally

```bash
npm install
npm start
```

Open `http://localhost:3000`.

For local Practice Mode, set `GEMINI_API_KEY` and optionally `GEMINI_MODEL` in your shell before running `npm start`. To emulate Netlify routing and Functions, install the Netlify CLI and run `netlify dev`.

## Validate before deploying

```bash
npm run build
npm test
```

The build checks that all branches load, every linked PYQ PDF exists, and every Practice-ready PDF has a matching question-bank entry.

## Update resources

Edit `data/resources.json`:

- `branches` controls branches and each branch's dynamic `semesters` list.
- `unitCollections` controls subjects, units, lectures, notes, PYQs and books.
- `syllabusGroups` controls Engineering/Technology and their semesters.
- `syllabi` controls the syllabus links shown at the top and inside subjects.

Then run `npm run build`. This copies the validated resource data to `public/resources.json`, which is the frontend's static fallback.

After adding or changing PYQ PDFs, regenerate the question bank:

```bash
pip install pdfplumber
python3 scripts/build-pyq-bank.py
npm run build
```

## API

- `GET /api/health`
- `GET /api/resources`
- `GET /api/resources?q=spectroscopy&type=lecture&subject=chemistry`
- `GET /api/resources?branch=mechanical&semester=semester-2`
- `POST /api/practice/generate` with body `{ "pyqUrl": "/resources/pyqs/.../Unit_3_PYQs.pdf" }`
- `GET /api/notices`
- `POST /api/admin/login`, `GET /api/admin/session`, `POST /api/admin/logout`
- `GET /api/admin/data`, `POST /api/admin/save`, `POST /api/admin/upload`

## Structure

```text
helpdesk/
├── data/
│   ├── resources.json
│   ├── pyq-bank.json
│   ├── pyq-overrides.json
│   ├── placements.json
│   └── notices-fallback.json
├── netlify/
│   ├── functions/
│   │   ├── health.js
│   │   ├── resources.js
│   │   ├── practice-generate.js
│   │   ├── notices.js
│   │   └── admin-*.js
│   └── lib/
│       ├── helpdesk-api.js
│       ├── hbtu-feed.js
│       ├── admin-auth.js
│       ├── admin-content.js
│       └── admin-uploads.js
├── public/
│   ├── app.js
│   ├── index.html
│   ├── premium.css
│   ├── resources.json
│   ├── placements.json
│   ├── notices-fallback.json
│   ├── admin/
│   ├── images/
│   └── resources/pyqs/
├── scripts/
├── test/
├── netlify.toml
├── package.json
└── server.js
```

Made for HBTU juniors by **Akshat Shukla** and **Priyanshu Dixit**. Licensed under MIT.
