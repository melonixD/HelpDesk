# Mathematics and subject recovery update

Copy the contents of this folder into your existing HelpDesk GitHub checkout, replacing matching files. Do not delete your existing repository. Commit and push once, then allow Netlify to deploy.

Engineering Mathematics 1 is now protected in Engineering Semester 1 and Technology Semester 2. Saving and publishing both repair missing links and persist the corrected data. Existing Mathematics content is preserved. If a stale draft lacks the subject entirely, publishing recovers it from the current published record before using the bundled fallback. Already-lost Blob-only edits cannot be reconstructed from this ZIP.

After deployment, reload the admin Resources editor, Save draft and Publish changes once to persist the recovered Mathematics data in Blobs. The previous time cutoff has been removed, so future publishes keep the recovery active. This content publish does not require another code deployment. Review any other pending draft edits before publishing. Removing Mathematics from its required semesters is now automatically repaired; other subjects retain the normal deletion and restoration workflow.

Future whole-subject deletions and removal from semesters are recorded in Admin activity. Use **Restore section to draft**, review Resources, then Publish changes. A complete subject snapshot includes units, books and notes plus its former semester links. Restoration will refuse to overwrite a different subject with the same ID.

Existing Netlify Blobs files and credentials stay on Netlify. This ZIP contains source and bundled assets, not the live Blob database. Git history, local secrets and dependencies are excluded.
