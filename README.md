# HelpDesk V19.1 · Main-admin password controls & explicit deploys

HelpDesk is the same branch-first HBTU resource library, prepared for Netlify. The frontend, calculator, focus tools, mobile layout, Syllabus Citadel, PDFs, contacts and resource hierarchy are preserved. The Gemini-powered Unlimited Practice API runs as Netlify Functions, so the API key never reaches the browser.

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
- Separate Placements, Notice Board and Scholarships entries in the hamburger menu
- Official year-wise placement figures and source reports
- HBTU announcements refreshed automatically every four hours with a resilient saved fallback
- Daily official scholarship feed with the UP Government Scholarship pinned first
- Scholarship updates merged from HBTU, the Ministry of Education and the National Scholarship Portal
- Akshat Shukla and Priyanshu Dixit help cards and WhatsApp contacts
- Responsive Android/mobile layout, animations, light mode and dark mode
- Netlify Functions, clean `/api/*` routes, security headers and SPA routing
- Static resource fallback if the resource API is temporarily unavailable
- Private responsive admin dashboard for resources, site details, creator cards, placements, notices and the saved scholarship directory
- Dynamic branch → semester → subject → unit management with add, reorder and cascade-delete controls
- Secure 8-hour signed sessions, CSRF checks, bcrypt login and login rate limiting
- Netlify Blob drafts with a separate GitHub-backed **Deploy to website** action
- Chunked Netlify Blob uploads for PDFs (20 MB) and profile images (5 MB)
- Four full-access main-admin accounts configured with bcrypt hashes
- Public regular-admin applications with main-admin approval
- Branch + semester permission controls for every regular admin
- Approval-only resource drafts: regular admins cannot publish directly
- Private Netlify Blob storage for applications, accounts, permissions and change requests
- Contributor leaderboard visible to regular and branch admins
- One contribution coin for every main-admin-approved request
- Main-admin-controlled promotion from Regular Admin to Branch Admin
- Main admins can promote approved Regular or Branch Admins to full Main Admin access
- Branch admins can save scoped contribution drafts inside governed sections; only a main admin can deploy them
- Automatic scope isolation so shared subjects are not unintentionally changed in other branches
- Uploadable profile pictures for main, branch and regular admins
- Secure self-service password changes for main admins, stored as bcrypt hashes in private Netlify Blobs
- Automatic “Provided by …” attribution on approved and branch-published resource updates
- Renamed, simplified **Syllabus Citadel** public section

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
   | Node | `22.12.0` |

5. Before or after the first deploy, open **Project configuration → Environment variables** and add:

   | Name | Value |
   | --- | --- |
   | `GEMINI_API_KEY` | Your Google AI Studio API key |
   | `GEMINI_MODEL` | `gemini-3.6-flash` (optional) |
   | `MAIN_ADMINS_JSON` | The complete one-line JSON value from `.env.example` |
   | `SESSION_SECRET` | A random secret of at least 32 characters |
   | `GITHUB_TOKEN` | Fine-grained GitHub token with Contents read/write access to this repository |
   | `GITHUB_REPO` | `OWNER/REPOSITORY` |
   | `GITHUB_BRANCH` | `main` |

6. Trigger a new production deploy after saving the key.
7. Check `https://YOUR-SITE.netlify.app/api/health`. It should return JSON with `"status":"ok"`.
8. Open **Unlimited Practice**, choose a semester, subject and unit, then generate a question set.

## Direct ZIP upload

You can upload this complete ZIP at [Netlify Drop](https://app.netlify.com/drop) while signed in. Upload the project ZIP—not only the `public` folder—because the Netlify Functions and configuration are outside `public`. Add `GEMINI_API_KEY` in the project environment variables and redeploy once afterward.

This project contains several PDFs and may be too large for a reliable browser drop. The GitHub method is recommended and enables the admin dashboard's explicit deployment button.

## Private admin dashboard

The admin route is `/admin`. It is also revealed in the hamburger menu after tapping the small version label five times within three seconds, or holding it for about one second. The menu shows Admin and Log out only while a valid session exists.

There are three roles:

- **Main admin:** can edit and publish every website section, approve applicants, assign or remove regular-admin permissions, reset regular-admin passwords, disable accounts, approve or reject change requests, and promote approved contributors to Main Admin.
- **Branch admin:** sees only assigned branch + semester combinations and can save edits to existing resource attributes as private contribution drafts. A main admin must explicitly deploy the combined resource draft. Creating or removing structural subjects/units still requires a main-admin-approved request.
- **Regular admin:** sees only assigned branch + semester combinations. They can prepare a resource draft and submit it for approval, but cannot save directly to GitHub or publish anything.

The configured main-admin usernames are `Priyanshu`, `Akshat`, `racoon67` and `Utkarsh`. Passwords are never stored in source code; only their one-way bcrypt hashes are configured through `MAIN_ADMINS_JSON`.

Main admins can edit:

- branches, any number of semesters, linked subjects and unit resources;
- the public site title, institution and description;
- creator names, roles, WhatsApp contacts and profile images;
- placement records and reports;
- Notice Board fallback entries.

Main-admin edits use two deliberate steps:

1. **Save draft** validates the content and stores it privately in Netlify Blobs. It does not touch GitHub, start a Netlify deployment, or consume a deployment credit. There is no automatic save or automatic deployment.
2. **Deploy to website** publishes the saved draft to GitHub. This is the only content action in HelpDesk that starts a Netlify deployment and consumes a deployment credit.

The same rule applies to contributor work: approving a Regular Admin request saves it into the private resource draft, and a Branch Admin's contribution also saves into that draft. Neither action touches GitHub. A main admin must click **Deploy saved resource draft** or open Resources and click **Deploy to website**.

In Resources, **Fill in selected…** lets a main admin reuse the currently selected subject in explicitly checked branch + semester sections. Unchecked sections are never changed. Save the resulting work as a draft, review it, and deploy it only when ready.

The V19 resource editor uses a guided **Branch → Semester → Subject** picker. Subject settings and structural controls stay collapsed until needed, while every unit opens focused upload groups for lectures, notes, PYQs and books. Books support any number of titled links as well as multi-PDF upload. **Add unit or special section** can create a standard unit, Physics/Chemistry-style Lab, workshop shop or class-notes section and immediately opens the new item for editing.

Main admins can change their own password from **My profile → Change password**. The current password must be confirmed, the replacement must contain at least 10 characters, and the admin is signed out after a successful change. Only the bcrypt hash is saved in private Netlify Blobs. This does not create a GitHub commit, trigger Netlify or use a deployment credit.

For initial setup, the password itself is never stored in the source or sent to the browser. Generate a replacement hash locally with:

```bash
node -e "require('bcryptjs').hash(process.argv[1], 12).then(console.log)" 'YOUR_NEW_PASSWORD'
```

Copy these values into Netlify. Keep `MAIN_ADMINS_JSON` on one line exactly as shown (the values inside it are one-way bcrypt hashes, not passwords):

```dotenv
MAIN_ADMINS_JSON=[{"username":"Priyanshu","name":"Priyanshu Dixit","passwordHash":"$2b$12$9DsaIlwzN45reAa8sSTcgOFl5chG7AV.totGf30xQbWQUZw.bQ/sS"},{"username":"Akshat","name":"Akshat Shukla","passwordHash":"$2b$12$KwyCWEvO24hKoQhTTwR0XeeSd4XxxpGJZ8zJVX1pWcxNjzgdcE5R."},{"username":"racoon67","name":"Shreyansh","passwordHash":"$2b$12$2qpnFwrJr6M0q1xxm2uHwuKZEFzqYscTGJxbdBY/ESSsdqsbnUP3O"},{"username":"Utkarsh","name":"Utkarsh","passwordHash":"$2b$12$gSoLCwjf4kELN2QHT6LNGujupjCP6.YHq67gYJm7coJrNEyn4QfWy"}]
SESSION_SECRET=replace-with-the-output-of-openssl-rand-hex-32
GITHUB_TOKEN=your-fine-grained-github-token
GITHUB_REPO=YOUR_GITHUB_USERNAME/YOUR_REPOSITORY
GITHUB_BRANCH=main
```

Generate a session secret with `openssl rand -hex 32`. The older `ADMIN_USERNAME` and `ADMIN_PASSWORD_HASH` variables remain supported as a migration fallback, but `MAIN_ADMINS_JSON` is the source of the four main accounts in V19.

Uploaded assets, unpublished main-admin drafts and the private access-control database use Netlify Blobs automatically when the dashboard runs in Netlify Functions; no separate Blob credential is needed there. Local dashboard uploads are placed in `public/uploads`, while local drafts and registration data use ignored files under `data/`.

V19.1 detects Netlify's Lambda runtime, initializes Blob access for every Lambda-compatible handler and uses the supported default consistency endpoint. This prevents read-only `/var/task`, missing Blob-context and missing `uncachedEdgeURL` errors.

### Regular-admin workflow

1. The applicant opens `/admin`, chooses **Admin registration**, and submits name, branch, roll number and email.
2. A main admin signs in and opens **Access & approvals**.
3. The main admin chooses one or more branch + semester permissions, approves the application, and creates a username and temporary password.
4. The main admin shares those credentials privately with the applicant. This build does not email credentials automatically.
5. The regular admin signs in and sees only the resource sections assigned to them.
6. They edit an assigned section and choose **Submit request** with a short summary.
7. A main admin reviews the request in **Access & approvals** and selects **Approve to draft**. This validates the change and adds it to the private resource draft without deploying.
8. Approval adds one coin to the contributor and stamps changed resources with **Provided by _name_**.
9. When the batch is ready, a main admin clicks **Deploy saved resource draft**. That explicit action creates the GitHub commit and triggers Netlify once.

All active contributors can open **Leaderboard** to see names, branches, governed sections, roles, approved contributions and coins. Private roll numbers and emails are never shown there. The highest-scoring contributor is highlighted, and a main admin can promote any eligible contributor to Branch Admin from **Access & approvals**.

Any main admin can also choose **Make main admin** on an active approved contributor. The promoted person keeps the same username and password, then signs out and signs in again to receive full Main Admin access. Promotion is saved privately in Netlify Blobs, so it does not commit to GitHub, trigger a deployment, or spend a deployment credit. A promoted main admin can also promote other eligible contributors.

Main admins can change permissions later, promote or demote branch admins, disable or re-enable an account, and set a replacement temporary password. Contributors can upload their own profile picture from **My profile**. Regular and branch admins never receive access to site details, syllabus administration, creators, placements, notices or access management.

Branch-admin updates are limited to existing resource attributes. If a subject is shared by several branches, HelpDesk creates a scoped copy for the governed branch + semester so unrelated branches stay unchanged. Each successfully saved contribution draft earns one coin and receives contributor attribution; publication waits for a main admin's explicit deploy.

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

## Placements, Notice Board and Scholarships

The hamburger menu has separate **Placements**, **Notice Board** and **Scholarships** entries. Placements opens directly to figures and report links published by HBTU. Notice Board opens the latest announcements from `GET /api/notices`. Scholarships opens a dedicated funding directory from `GET /api/scholarships`, with the Uttar Pradesh Government Scholarship & Fee Reimbursement portal permanently pinned first.

The `refresh-notices` scheduled function runs every four hours. The public notice endpoint is cached for four hours, so visitors do not contact HBTU individually. The `refresh-scholarships` function runs daily at 18:30 UTC (midnight IST) and merges official scholarship announcements from HBTU, the Ministry of Education and the National Scholarship Portal. Both feeds use Netlify Blobs and fall back to bundled official links if a source is unavailable or changes its page structure. No extra API key or environment variable is required. Scheduled functions only run automatically on published production deploys.

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
- `GET /api/scholarships`
- `POST /api/admin/login`, `GET /api/admin/session`, `POST /api/admin/logout`
- `GET /api/admin/data`, `POST /api/admin/save` (private draft), `POST /api/admin/publish` (GitHub + Netlify deployment), `POST /api/admin/upload`
- `POST /api/admin/register` (public application form)
- `GET|POST /api/admin/management` (main admins only)
- `POST /api/admin/change-request` (contributor approval requests)
- `POST /api/admin/scoped-save` (branch-admin draft save inside assigned sections; never deploys)
- `POST /api/admin/profile` (current admin profile picture)

## Structure

```text
helpdesk/
├── data/
│   ├── resources.json
│   ├── pyq-bank.json
│   ├── pyq-overrides.json
│   ├── placements.json
│   ├── notices-fallback.json
│   └── scholarships-fallback.json
├── netlify/
│   ├── functions/
│   │   ├── health.js
│   │   ├── resources.js
│   │   ├── practice-generate.js
│   │   ├── notices.js
│   │   ├── scholarships.js
│   │   ├── refresh-notices.js
│   │   ├── refresh-scholarships.js
│   │   └── admin-*.js
│   └── lib/
│       ├── helpdesk-api.js
│       ├── hbtu-feed.js
│       ├── scholarship-feed.js
│       ├── feed-cache.js
│       ├── admin-auth.js
│       ├── admin-state.js
│       ├── admin-control.js
│       ├── admin-content.js
│       └── admin-uploads.js
├── public/
│   ├── app.js
│   ├── index.html
│   ├── premium.css
│   ├── resources.json
│   ├── placements.json
│   ├── notices-fallback.json
│   ├── scholarships-fallback.json
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
