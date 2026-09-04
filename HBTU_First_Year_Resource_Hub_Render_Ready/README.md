# HelpDesk · Netlify edition

HelpDesk is the same branch-first HBTU resource library, prepared for Netlify. The frontend, calculator, focus tools, mobile layout, syllabus library, PDFs, contacts and resource hierarchy are preserved. The Gemini-powered Unlimited Practice API now runs as Netlify Functions, so the API key never reaches the browser.

## Included

- 14 branches, including Biotechnology
- Branch → Semester → Subject → Unit navigation
- Technology and Engineering semester mappings
- Lectures, Notes, PYQs, Books and Practice inside units
- 20 browser-viewable unit-wise PYQ PDFs
- Engineering and Technology syllabus folders, initially collapsed
- Unlimited Practice powered by real PYQ text and Gemini
- SGPA/CGPA calculator, focus timer and study list
- Akshat Shukla and Priyanshu Dixit help cards and WhatsApp contacts
- Responsive Android/mobile layout, animations, light mode and dark mode
- Netlify Functions, clean `/api/*` routes, security headers and SPA routing
- Static resource fallback if the resource API is temporarily unavailable

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

6. Trigger a new production deploy after saving the key.
7. Check `https://YOUR-SITE.netlify.app/api/health`. It should return JSON with `"status":"ok"`.
8. Open **Unlimited Practice**, choose a semester, subject and unit, then generate a question set.

## Direct ZIP upload

You can upload this complete ZIP at [Netlify Drop](https://app.netlify.com/drop) while signed in. Upload the project ZIP—not only the `public` folder—because the Netlify Functions and configuration are outside `public`. Add `GEMINI_API_KEY` in the project environment variables and redeploy once afterward.

This project is about 33 MB and contains one PDF larger than 10 MB. If the browser upload stalls, use the GitHub method above; it is more reliable for this project and makes later updates automatic.

## Unlimited Practice

Practice Mode takes a unit's local `pyqUrl`, finds its extracted real questions in `data/pyq-bank.json`, and asks Gemini for five new questions and answers at a similar level.

- Browser request: `POST /api/practice/generate`
- Netlify function: `netlify/functions/practice-generate.js`
- Server-side shared logic: `netlify/lib/helpdesk-api.js`
- Secret: `GEMINI_API_KEY` in Netlify environment variables
- Default model: `gemini-3.6-flash`
- Protection: 20 generation requests per IP per warm function instance per hour

The UI still works without the Gemini key; only question generation shows a setup message. Google API quotas are separate from Netlify traffic limits, so high visitor counts may require a paid Gemini quota.

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

- `branches` controls branches and `semesterSubjectIds`.
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
- `POST /api/practice/generate` with body `{ "pyqUrl": "/resources/pyqs/.../Unit_3_PYQs.pdf" }`

## Structure

```text
helpdesk/
├── data/
│   ├── resources.json
│   └── pyq-bank.json
├── netlify/
│   ├── functions/
│   │   ├── health.js
│   │   ├── resources.js
│   │   └── practice-generate.js
│   └── lib/helpdesk-api.js
├── public/
│   ├── app.js
│   ├── index.html
│   ├── premium.css
│   ├── resources.json
│   ├── images/
│   └── resources/pyqs/
├── scripts/
├── test/
├── netlify.toml
├── package.json
└── server.js
```

Made for HBTU juniors by **Akshat Shukla** and **Priyanshu Dixit**. Licensed under MIT.
