# Year-Wise-PYQs update

Every subject now includes **Year-Wise-PYQs**, alongside its existing units, labs or core sections. Starting years are **2025, 2024, 2023 and 2022**, each containing **Mid-sem 1, Mid-sem 2 and End-sem**. Empty paper links show **Coming soon**. Existing live Blob content and existing drafts receive these empty folders automatically; their current units and links are preserved.

Open **Admin → Resources → Branch → Semester → Subject → Year-Wise-PYQs**. Expand a year to paste Google Drive links, rename its year or remove it. Use **Add another year** to add future or older years. Make the Drive files viewable by anyone with the link. Use **Save draft → Publish changes** to make the papers live. Main admins retain full access; branch and regular admins retain their existing scope and approval restrictions. As with other subject resources, edits to a shared subject appear wherever that subject is linked.

Year-wise paper links are included in resource activity history and Remove resource everywhere. Removed paper links can be restored from activity history, including when their year was removed. Concurrent changes to different papers merge; conflicting edits to the same paper are rejected for review.

This ZIP needs one code deployment before the feature appears on the live site. Subsequent paper-link changes use the existing Netlify Blobs publish flow and do not trigger a deployment. The local build and 16 focused tests passed, covering default folders, validation, merging, restoration, draft/publish behavior, public rendering and the earlier Mathematics/photo fixes. Live Netlify deployment has not been performed for this ZIP.

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
