# HelpDesk

HelpDesk is a clean, branch-first resource library for HBTU juniors. It uses a lightweight Node.js backend and dependency-free JavaScript frontend, and is ready to deploy on Render.

## What is included

- 14 branches—including Biotechnology—in a focused three-pane browser
- Branch → Semester → Subject → Unit resource navigation
- Engineering Semester 1 contains seven shared subjects: Mathematics 1, Basic Electrical Engineering (BEE), Engineering Graphics, Engineering Physics, Universal Human Value, Programming and Problem Solving, and English and Technical Writing
- Technology Semester 1 keeps six shared subjects plus one branch-specific Core subject
- Technology Semester 2 uses the Engineering Semester 1 subject set; Engineering Semester 2 uses the six shared Technology Semester 1 subjects
- Lectures, Notes, PYQs and Books inside every unit
- 20 separated unit-wise PYQ PDFs that open in the browser
- Two large syllabus groups—Engineering and Technology—with Semester 1 and Semester 2 inside each
- Technology Semester 1 syllabi reused for Engineering Semester 2 and linked both at the top and inside relevant subjects
- Engineering Semester 1 syllabi reused for Technology Semester 2; four supplied files are ready and the remaining three are marked Coming soon
- Mobile-friendly vertical branch and subject lists with no sideways scrolling
- Static resource fallback and cache-safe application updates
- Android Chrome and WebView-compatible rendering and touch controls
- Lightweight branch, semester, subject, unit and resource reveal animations
- Local study list and 25-minute focus timer inside the hamburger panel
- Help and contact section with profile photos and revealable WhatsApp details
- Responsive light and dark themes
- Render Blueprint configuration and health endpoint
- **Practice Mode** — AI-generated practice questions per unit, built from your real PYQs (see below)

## Run locally

1. Install [Node.js 20 or newer](https://nodejs.org/).
2. Open a terminal in this project folder.
3. Run:

```bash
npm install
npm start
```

4. Open `http://localhost:3000`.

To also test Practice Mode locally, copy `.env.example` to `.env`, add a free `GEMINI_API_KEY` (see below), then run `npm start`.

## Practice Mode (AI-generated questions)

Every unit that has a PYQ PDF now shows a "Practice Mode" option. It sends a handful of real questions from that unit as examples to Google's Gemini API and asks for 5 new, similar questions with answers — so students get unlimited fresh practice instead of just the same fixed PYQ set.

**How it works**
- `scripts/build-pyq-bank.py` extracts individual questions from every PYQ PDF and writes `data/pyq-bank.json` (already generated and committed — you don't need to re-run this unless you add new PYQ PDFs).
- `server.js` exposes `POST /api/practice/generate` — it takes a `pyqUrl`, looks up real questions for that unit, and calls the Gemini API server-side (your key is never exposed to the browser).
- `public/app.js` renders the "Practice Mode" button and a modal to display generated questions.

**Setup (free)**
1. Get a free API key at [aistudio.google.com](https://aistudio.google.com) → API Keys.
2. Set it as an environment variable named `GEMINI_API_KEY` (locally via `.env`, or in Render's dashboard — `render.yaml` already declares this variable so Render will prompt for it on deploy).
3. That's it — the free tier (Gemini Flash) covers normal traffic for a small student site. If it's ever unset, Practice Mode shows a friendly "not configured" message instead of breaking the rest of the site.

**Re-generating the question bank**
If you add new PYQ PDFs later, update `data/resources.json` as usual, then re-run:
```bash
pip install pdfplumber
python3 scripts/build-pyq-bank.py
```
This regenerates `data/pyq-bank.json` from every PDF referenced in `unitCollections`.

## Deploy on Render

### Blueprint

1. Upload the **contents of this folder** to the root of your GitHub repository.
2. Confirm `render.yaml`, `package.json`, `server.js`, `public`, and `data` are visible on the `main` branch—not inside another folder.
3. In Render, choose **New + → Blueprint** and connect the repository.
4. Render will detect `render.yaml`; approve the `helpdesk-hbtu` service and deploy.

### Web Service

Use these settings if you prefer to create a Web Service manually:

| Setting | Value |
| --- | --- |
| Runtime | Node |
| Build command | `npm install` |
| Start command | `npm start` |
| Health check path | `/api/health` |

No database is required. Practice Mode needs one environment variable — see the section above.

## Update resources

The navigation and resource links live in `data/resources.json`:

- `branches` controls the branch list and each branch's `semesterSubjectIds`.
- `unitCollections` controls each subject's five units and its lecture, notes, PYQ, and book links.
- `syllabusGroups` controls the two branch groups and the Semester 1 and Semester 2 folders nested inside each.
- `syllabi` controls the individual syllabus links available inside those folders and subjects.

Add a resource URL to an individual unit when it is unit-specific, or to the subject collection when one link should appear in every unit. Use `null` for material that is not available yet.

## Project structure

```text
first-year-resource-hub/
├── data/resources.json
├── data/pyq-bank.json      # extracted PYQ text used to seed Practice Mode
├── scripts/build-pyq-bank.py
├── public/
│   ├── app.js
│   ├── index.html
│   ├── premium.css
│   ├── resources.json      # Static fallback for the library
│   └── resources/pyqs/   # 20 browser-viewable PDFs
├── test/server.test.js
├── package.json
├── render.yaml
└── server.js
```

## API

- `GET /api/health` — deployment health check
- `GET /api/resources` — complete HelpDesk content
- `GET /api/resources?q=spectroscopy&type=lecture&subject=chemistry` — optional filtered legacy resource response
- `POST /api/practice/generate` — body `{ "pyqUrl": "/resources/pyqs/.../Unit_3_PYQs.pdf" }`, returns 5 AI-generated practice questions with answers for that unit

Made for HBTU juniors by **Akshat Shukla** and **Priyanshu Dixit**. Licensed under MIT.
