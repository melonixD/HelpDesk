# Technology Core syllabus update

**Syllabus Citadel → Technology** now contains a third subsection named **Core**, alongside Semester 1 and Semester 2. It includes Biochemical Engineering Core, Biotechnology Core, Chemical Engineering Core, Food Technology Core, Leather Technology Core, Oil Technology Core, Paint Technology Core and Plastic Technology Core. The existing Food Technology syllabus link is preserved; cores without links display **Coming soon**.

Main admins can manage this from **Admin → Syllabus**:

- **Add section** creates another editable subsection under Engineering or Technology.
- **Remove section** removes that subsection from the draft without deleting its reusable syllabus files.
- **New file** adds a syllabus directly inside a chosen subsection and accepts an HTTPS Google Drive/Docs link.
- **Link existing** reuses a syllabus file in another subsection.
- The **All syllabus files** panel can rename files, paste Google Drive links, upload PDF files, set Available/Coming soon, or delete a file everywhere.
- The × beside a linked syllabus removes it only from that subsection.

This release includes a one-time, non-destructive migration for existing Netlify Blob content, so Technology Core appears even if the live database predates this feature. Once migrated, admin deletions remain deleted and are not recreated automatically. Use **Save draft → Publish changes**; later syllabus edits remain Blob-driven and do not require deployments.

## WhatsApp logo correction

The WhatsApp contact and community cards now use the supplied clean circular logo at its original proportions. The old hand-drawn inline mark, rounded-square background and stretching rules were removed. Cache-versioned CSS and JavaScript references make the corrected logo appear immediately after deployment instead of waiting for an older browser cache to expire.

Main admins can change it under **Admin → Site details → WhatsApp logo**. Upload a PNG, JPEG or WebP image, review the preview, then use **Save draft → Publish changes**. The same published logo is used in the community banner and every WhatsApp contact icon. **Use default logo** restores the bundled circular mark. Once this code update is deployed, later logo uploads use Netlify Blobs and do not need another code deployment.

## Removable PYQ sections and Remember me

Admins can now remove an individual **Mid-sem 1**, **Mid-sem 2** or **End-sem** section from any Year-Wise-PYQs year. Removing a section clears its link and hides that row on the public site. The year editor then offers **Add exam section**, so any removed section can be added back later. Existing subjects remain backward compatible and initially keep all three exam sections.

The login screen now includes **Remember me for 30 days**. When selected, it creates a signed, secure, HttpOnly 30-day session cookie. The raw password is never stored in the browser. Without it, login remains an eight-hour browser session; logging out still ends either session.

Removed linked papers continue to appear in Admin activity. Restoring one now restores both its Google Drive link and its removed exam section.

This ZIP requires one code deployment. After that, removing or re-adding PYQ sections and saving/publishing data continues through Netlify Blobs without a code deployment. The build and 20 focused tests passed.

## Year-Wise-PYQs update

Every subject now includes **Year-Wise-PYQs**, alongside its existing units, labs or core sections. Starting years are **2025, 2024, 2023 and 2022**, each containing **Mid-sem 1, Mid-sem 2 and End-sem**. Empty paper links show **Coming soon**. Existing live Blob content and existing drafts receive these empty folders automatically; their current units and links are preserved.

Open **Admin → Resources → Branch → Semester → Subject → Year-Wise-PYQs**. Expand a year to paste Google Drive links, rename its year or remove it. Use **Add another year** to add future or older years. Make the Drive files viewable by anyone with the link. Use **Save draft → Publish changes** to make the papers live. Main admins retain full access; branch and regular admins retain their existing scope and approval restrictions. As with other subject resources, edits to a shared subject appear wherever that subject is linked.

Year-wise paper links are included in resource activity history and Remove resource everywhere. Removed paper links can be restored from activity history, including when their year was removed. Concurrent changes to different papers merge; conflicting edits to the same paper are rejected for review.

This ZIP needs one code deployment before the feature appears on the live site. Subsequent paper-link changes use the existing Netlify Blobs publish flow and do not trigger a deployment. The local build and focused tests passed, covering default folders, validation, merging, restoration, draft/publish behavior, public rendering and the earlier Mathematics/photo fixes. Live Netlify deployment has not been performed for this ZIP.

## Included earlier updates

Copy the contents of this folder into your existing HelpDesk GitHub checkout, replacing matching files. Do not delete your existing repository. Commit and push once, then allow Netlify to deploy.

Holiday list: the hamburger menu now includes a direct link, with no intermediate page. Open **Admin → Site details → Holiday list**, paste your Google Drive share link, then **Save draft → Publish changes**. No link has been supplied yet, so the menu shows Coming soon. Clearing the field restores Coming soon. Make the Drive file viewable by anyone with the link. Once this code update is deployed, editing this link uses Blobs without another deployment.

Creator photos: after this code deploy, reload the admin page. Under **Creators**, upload or choose the correct photo, click **Save draft**, then **Publish changes**. Repeat this once for any photo which was only visible in the old editor: the previous editor could show a new preview while sending the previous data after an earlier save. A successful save now reconnects every field to the merged draft, so repeated edits are included.

Under **My profile**, **Save profile picture** also updates the public photo for an existing matching Creator. A later photo change published in Creators takes priority; publishing unrelated resources preserves the latest photo choice. Existing uploaded Creator photos retain priority over legacy admin avatars until a new profile picture is saved. Admin profile state can take up to one minute to reach all Netlify locations; return to or refresh the main-site tab after saving.

Both admin and public photos use the direct asset endpoint. The public site also checks for updates when you return to its tab, without continuous background polling. Photo/content saves continue using Blobs and do not create a GitHub commit or deployment. This ZIP itself needs one code deployment before the fix runs on your live site.

Engineering Mathematics 1 is now protected in Engineering Semester 1 and Technology Semester 2. Saving and publishing both repair missing links and persist the corrected data. Existing Mathematics content is preserved. If a stale draft lacks the subject entirely, publishing recovers it from the current published record before using the bundled fallback. Already-lost Blob-only edits cannot be reconstructed from this ZIP.

After deployment, reload the admin Resources editor, Save draft and Publish changes once to persist the recovered Mathematics data in Blobs. The previous time cutoff has been removed, so future publishes keep the recovery active. This content publish does not require another code deployment. Review any other pending draft edits before publishing. Removing Mathematics from its required semesters is now automatically repaired; other subjects retain the normal deletion and restoration workflow.

Future whole-subject deletions and removal from semesters are recorded in Admin activity. Use **Restore section to draft**, review Resources, then Publish changes. A complete subject snapshot includes units, books and notes plus its former semester links. Restoration will refuse to overwrite a different subject with the same ID.

Existing Netlify Blobs files and credentials stay on Netlify. This ZIP contains source and bundled assets, not the live Blob database. Git history, local secrets and dependencies are excluded.
