# HelpDesk — Backpaper First-Year Practice Mode

## ZIP-only delivery

Nothing has been committed, pushed, published or deployed. Source-owner reuse permission was confirmed by you on 14 October 2026. Collection used only public GET endpoints used by Backpaper’s frontend: catalogue, paginated questions, answers and linked figures. No private data, credentials, reports or access restrictions were bypassed or modified.

## Verified content

All **18 public branch/semester views** for semesters **1 and 2** were collected. Received counts match their reported totals. Shared questions across branches are stored once.

- **821 distinct questions** across **13 subjects**.
- **821 locally stored answers**, with available pro tips and YouTube learning links.
- **97 unique figure files** copied locally.
- **3 source figure files return HTTP 404**; their question cards clearly mark the missing figure.
- Academic-year labels, marks and multi-unit tags are preserved.
- No semester 3 or later material is included.

| Subject | Questions |
| --- | ---: |
| Programming for Problem Solving | 10 |
| Universal Human Values | 5 |
| English for Technical Writing | 5 |
| Engineering Graphics | 70 |
| Basic Electrical Engineering | 108 |
| Engineering Mathematics I | 89 |
| Engineering Physics | 129 |
| Environment, Ecology & Sustainability | 5 |
| Introduction to Chemical Engineering & Technology | 126 |
| Engineering Chemistry | 88 |
| Basic Electronics Engineering | 85 |
| Professional Communication | 43 |
| Engineering Mechanics | 58 |

`data/backpaper-import-report.json` lists source coverage and the three missing figure filenames/question IDs. Source solutions/classifications are imported, not independently fact-checked. Unspecified “Mid-Sem” is kept as generic Mid-sem, not guessed as Mid-sem 1 or 2.

## Student interface

- Practice Mode card between the academic library and Help/contact.
- Practice links in navigation and the hamburger menu; chapter buttons in units/labs.
- Branch → Semester → Subject → Unit/topic navigation, search and collapsed advanced filters.
- Year, exam and marks filters; browse or shuffled one-by-one practice.
- Saved/completed questions, figures, expandable solutions, copy question and issue reporting.
- Sanitized Markdown, tables/code, KaTeX equations and supported Mermaid diagrams.
- Mobile-focused fullscreen reader: 16px inputs, 44px+ targets, safe-area spacing and sticky Next/Previous controls.

Existing Gemini Unlimited Practice stays available separately as **AI Practice**. Its extracted PYQ bank is unchanged. This new real-question bank contains the 821 source questions, not the earlier 142-question placeholder seed.

Intro Technology and CSE AI & ML are **practice-only catalogue additions**, so your live Resources tree/core/syllabus are not altered. Intro Technology appears in Engineering S2 and Technology S1. CSE AI & ML uses CSE’s practice curriculum. Other shared courses follow HelpDesk’s existing semester mappings.

## Install when YOU choose

1. Back up your repository, extract this ZIP and put its contents at the repository root.
2. Copy the updated files into your checkout. Do not delete Netlify environment variables or existing Blob data.
3. Commit/push when ready. **One deployment** installs the new interface, API and bundled assets.
4. Keep existing `SESSION_SECRET`, `MAIN_ADMINS_JSON` and optional Gemini settings. No new credentials are needed.
5. Check Practice Mode on mobile and desktop.

**If an older Practice bank is already published to Blobs:** Main Admin → Practice question bank → **Add bundled Backpaper questions to draft** → review → **Save draft** → **Publish changes**. Existing questions remain and duplicates are skipped. Do not reset Resources.

**If no Practice bank has previously been published:** the bundled 821-question bank is automatically used as the first-run fallback.

## Administration

Main Admins can add/edit/delete/import questions and correct imported answers through drafts. Reports go to **HelpDesk’s own queue**, not Backpaper: Practice question bank → Load reports → edit/resolve. Reports are bounded to 1–1000 characters, 500 retained records and a per-warm-instance submission limit; this is not distributed anti-spam protection.

Regular/Branch Admin permissions have not been widened. Global question-bank administration/report management remains Main Admin-only; existing scoped library contribution permissions stay unchanged.

The mutable bank metadata is about **0.68 MB**, below the 2 MB document limit. Full answers are local, content-hashed `public/practice-answers/*.json` assets loaded only when opened. Figures are local `public/practice-assets/*` files and lazy-loaded. Markdown/math libraries load only when Practice Mode opens; Mermaid loads only for answers with a diagram. Assets use long-lived caching.

Routine admin edits and publishing use Blobs, **not a production deployment**. API usage/bandwidth/storage still count toward hosting usage. The source website is not contacted by students at runtime. Saved questions/progress are device-local, not cloud accounts. This is not the planned R2 protected PDF viewer.

## Import schema

Download the template in the admin editor. Required question fields: `id`, `subjectId`, `unitNumber`, `chapter`, `question`, `answer`, `year`, `exam`, `marks`, `branchIds`, `sourceTitle`, `sourceUrl`.

- IDs: lowercase letters/digits/hyphens, max 80 characters. Use actual HelpDesk subject IDs.
- `unitNumber` is a string. Optional `unitNumbers`/`topics` preserve multi-unit classification.
- `exam`: `mid-sem`, `mid-sem-1`, `mid-sem-2`, `end-sem`, `unknown`.
- Unknown year/marks: `null`. Difficulty is no longer shown or required; older bank metadata remains compatible.
- `branchIds: []`: shared where that subject is referenced in the selected semester.
- Source URL: HTTPS or bundled `/resources/…` / uploaded `/uploads/…`.
- Optional `academicYear`, `proTip`, `videoLinks`, local `imageUrl` and local `answerUrl` are validated.
- Imports are additive. Duplicate detection includes subject/unit/text/year/exam, retaining repetitions from different years.
- Import and combined metadata must stay below 2 MB; larger future banks need record-level storage.

## Verification / limitations

Build and syntax checks pass. **All 16 new-feature tests pass**, including source metadata, scope filtering, multi-unit tags, catalogue isolation, duplicate-safe import, pagination/shuffle, private drafts, HTTP routes, local answer/figure validation, write authorization, report controls and mobile/security source checks.

The existing GitHub baseline has five older failing assertions about asset rewriting and library/syllabus structure. Unrelated user content has been preserved, not deleted to make old counts pass.

Live deployment and visual browser QA have not been performed. Test after installing. Malformed equations remain readable; unsupported source diagrams fall back to their code instead of crashing the reader.

Read-only collection/normalization scripts are included for reproducibility, not automatic live scraping. Use them only with permission and stop on rate/access restrictions. Checkpoints outside this project are not included in the ZIP.

## Interface refinement

Source-site branding is absent from student and admin screens. Imported questions use a neutral paper label, including banks previously published to Blobs. Difficulty labels, selectors and editor fields have been removed. Original collection provenance remains in the internal import report.
