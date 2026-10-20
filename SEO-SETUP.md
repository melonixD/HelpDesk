# HelpDesk: HBTU PYQ search visibility

This ZIP contains the full current HelpDesk project plus SEO changes. It has **not been pushed or deployed**. It keeps the Practice Mode release from commit `92fee32` and does not reset Netlify Blobs, existing admin accounts, resource uploads or private drafts.

## What changed

- Homepage title: **HBTU PYQs, Notes & Lectures | HelpDesk**. The main heading now describes the content, and the browser title keeps that wording after JavaScript loads or the focus timer stops.
- Canonical URLs, descriptive metadata, social sharing tags, WebSite/WebPage metadata and subject breadcrumbs.
- Valid `/robots.txt` and a live XML `/sitemap.xml`.
- `/hbtu-pyqs/` and subject pages such as `/hbtu-pyqs/chemistry/`, `/hbtu-pyqs/bee/` and `/hbtu-pyqs/engineering-physics/`.
- Subject pages contain real sample questions, available paper links and links into the correct Practice Mode subject. These are ordinary HTML pages, readable before JavaScript runs. They are shown identically to people and crawlers.
- Pages and the sitemap use **published** resources and questions from Blobs. Private drafts are not indexed through these routes. Empty subjects are excluded from the sitemap, and unknown subject URLs return 404.
- Existing removed/disabled exam sections remain disabled. Legacy uploaded PDF links use the same asset helper as the main library.

The bundled bank currently produces 13 subject pages plus the homepage and PYQ hub: 15 sitemap URLs. This changes with the published bank. Individual question pages and duplicate branch pages have not been generated merely to add keywords.

## Install this ZIP

1. Back up your checkout and copy the ZIP's contents into the repository root. Preserve your current Netlify environment variables and Blob stores.
2. Follow your usual GitHub Desktop deployment process when you choose to publish. Netlify needs one normal build to install the new function and routing.
3. Confirm the homepage and the new hub load. Open `/robots.txt` and `/sitemap.xml`: the former should be text and the latter XML, not homepage HTML.
4. Test a subject's Practice Mode link. It deliberately opens the right subject across branches/semesters, rather than inheriting the homepage's default Food Technology semester.

The server-rendered pages use CDN caching: normally up to 10 minutes, with a further one-minute stale-while-revalidate window. Admin updates can reach these pages without rebuilding; Google's own indexed copy takes a separate recrawl. The main library keeps its existing immediate-publishing behavior. CDN requests, functions and Blob reads still count toward hosting usage.

## Set up Google Search Console

1. Open **https://search.google.com/search-console/** using the Google account you want to own HelpDesk's search property.
2. Add a **URL-prefix** property with the exact production address: `https://helpdeskhbtu.netlify.app/`.
3. Choose the **HTML tag** verification method. Copy just the value of the `content="..."` token, not the complete tag.
4. Add `GOOGLE_SITE_VERIFICATION` in Netlify's environment settings with that value available to the build. Ideally do this before deploying this ZIP, so verification does not need another build. The build inserts the verification tag automatically. Alternatively, Google also supports uploading its exact HTML verification file to `public/` before deploying.
5. Once deployed, return to Search Console and click **Verify**.
6. In **Sitemaps**, submit `https://helpdeskhbtu.netlify.app/sitemap.xml`.
7. In **URL inspection**, inspect the homepage and `/hbtu-pyqs/`, run the live test and request indexing if eligible. Use the same check for a few important subject pages.
8. In the Performance report, monitor impressions, clicks and average position for searches such as `hbtu pyqs`, `hbtu previous year question papers` and subject-specific searches. Average position varies by query, device and location; it is not a universal rank.

The HelpDesk URL-prefix property has now been added in Search Console under the selected Google account. Its public HTML verification tag is bundled in this update and survives future builds. You do not need to add an environment variable for this account; `GOOGLE_SITE_VERIFICATION` remains an optional override if ownership changes. Deploy this updated ZIP before clicking Verify. Ownership is not verified yet, and the sitemap has not been submitted.

## Domain configuration

The default production origin is `https://helpdeskhbtu.netlify.app`. If you switch to another production domain, set `HELPDESK_PUBLIC_URL` to that HTTPS origin, for example `https://your-domain.example`, in **both build and function environments**. Do not use a deploy-preview address, a path or a query string. Redeploy after changing this setting. Canonicals, structured data, robots and the sitemap will use the configured origin.

## Improving the chance of ranking well

First place cannot be guaranteed. Google controls crawling, indexing and ranking. This code removes technical obstacles; useful, accurate papers, clear solutions and a good mobile experience remain important. Keep broken links corrected and make the year/exam labels trustworthy.

Ask relevant HBTU student clubs, class resource pages or department contacts to link to the hub when it is useful to their students. Use genuine editorial links; avoid paid link packages, fake reviews, keyword stuffing or mass duplicate pages. Keep sharing one stable production URL.

Evaluate results over weeks, rather than assuming deployment should immediately change the ranking. Google's guidance says some effects can take hours and others months; no deadline or ranking improvement is guaranteed.

## Validation

Build and 23 focused tests (7 SEO plus 16 Practice Mode) pass. They cover HTTP content types, the sitemap, canonical links, subject content, math rendering, input escaping, private drafts, disabled papers, deep-link scope and domain/token validation. Visual browser QA has not been performed.

The existing repository has five older failing assertions concerning library counts, syllabus/core structure and asset helpers. These unrelated content expectations have not been changed to alter the site's resources.

## Official references

- Google SEO Starter Guide: https://developers.google.com/search/docs/fundamentals/seo-starter-guide
- JavaScript SEO: https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics
- Sitemap guidance: https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap
- Search Console verification: https://support.google.com/webmasters/answer/9008080
- Requesting recrawls: https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl

Sources checked on 20 October 2026.
