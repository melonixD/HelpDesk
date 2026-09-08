const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
process.env.HELPDESK_LOCAL_STORAGE = "true";
process.env.PUBLISHED_CONTENT_PATH = path.join(os.tmpdir(), `helpdesk-photos-published-${process.pid}.json`);
const { creatorWithProfilePhoto, stampCreatorPhotos } = require("../netlify/lib/creator-photos");
const { assetUrl } = require("../public/asset-url");
const { publishContent, loadPublished } = require("../netlify/lib/content-store");
const { readJson } = require("../netlify/lib/admin-content");
test.after(() => fs.rm(process.env.PUBLISHED_CONTENT_PATH, { force: true }));

test("latest explicit photo change wins without modifying the saved Creator document", () => {
  const creator = { id: "priyanshu", photoUrl: "/uploads/image-v2-old.png", photoUpdatedAt: "2026-09-07T10:00:00.000Z" };
  const profile = { photoUrl: "/uploads/image-v2-new.png", photoUpdatedAt: "2026-09-07T11:00:00.000Z" };
  assert.equal(creatorWithProfilePhoto(creator, profile).photoUrl, profile.photoUrl);
  assert.equal(creator.photoUrl, "/uploads/image-v2-old.png");
  const published = { ...creator, photoUpdatedAt: "2026-09-07T12:00:00.000Z" };
  assert.equal(creatorWithProfilePhoto(published, profile).photoUrl, creator.photoUrl);
});

test("legacy uploaded Creator photos remain visible and legacy avatars replace bundled photos", () => {
  const profile = { photoUrl: "/uploads/image-v2-admin.png", updatedAt: "2026-09-07T11:00:00.000Z" };
  const creator = { id: "akshat", photoUrl: "/uploads/image-v2-creator.png" };
  assert.equal(creatorWithProfilePhoto(creator, profile).photoUrl, creator.photoUrl);
  assert.equal(creatorWithProfilePhoto({ ...creator, photoUrl: "/images/akshat.jpg" }, profile).photoUrl, profile.photoUrl);
  assert.equal(creatorWithProfilePhoto(creator, null), creator);
});

test("client timestamps cannot promote an unchanged photo above the live profile photo", () => {
  const previous = { creators: [{ id: "akshat", photoUrl: "/images/akshat.jpg", photoUpdatedAt: "2026-09-07T10:00:00.000Z" }] };
  const candidate = { creators: [{ ...previous.creators[0], photoUpdatedAt: "2099-01-01T00:00:00.000Z" }] };
  const result = stampCreatorPhotos(candidate, previous, "2026-09-07T12:00:00.000Z");
  assert.equal(result.creators[0].photoUpdatedAt, previous.creators[0].photoUpdatedAt);
});

test("Creator publish is visible, then an unrelated publish preserves a later profile photo", async () => {
  const initial = structuredClone(readJson("resources"));
  const first = structuredClone(initial);
  first.creators[0].photoUrl = "/uploads/image-v2-first-choice.png";
  await publishContent("resources", first, "test-admin");
  const live = await loadPublished("resources");
  assert.equal(live.creators[0].photoUrl, first.creators[0].photoUrl);
  assert.ok(live.creators[0].photoUpdatedAt);
  const profile = { photoUrl: "/uploads/image-v2-profile-choice.png", photoUpdatedAt: new Date(Date.parse(live.creators[0].photoUpdatedAt) + 1).toISOString() };
  const unrelated = structuredClone(live);
  unrelated.meta.description = "An unrelated resource edit";
  const next = await publishContent("resources", unrelated, "second-admin");
  assert.equal(next.data.creators[0].photoUpdatedAt, live.creators[0].photoUpdatedAt);
  assert.equal(creatorWithProfilePhoto(next.data.creators[0], profile).photoUrl, profile.photoUrl);
  unrelated.creators[0].photoUrl = "/uploads/image-v2-second-choice.png";
  const newest = await publishContent("resources", unrelated, "second-admin");
  assert.equal((await loadPublished("resources")).creators[0].photoUrl, unrelated.creators[0].photoUrl);
  assert.ok(Date.parse(newest.data.creators[0].photoUpdatedAt) >= Date.parse(next.data.creators[0].photoUpdatedAt));
  assert.equal(initial.creators[0].photoUrl, readJson("resources").creators[0].photoUrl);
});

test("public and admin images use the direct asset route without rewriting other hosts", () => {
  const key = "image-v2-0123456789abcdef.png";
  const direct = `/.netlify/functions/admin-asset?key=${key}`;
  assert.equal(assetUrl(`/uploads/${key}?asset=old`), direct);
  assert.equal(assetUrl(`https://helpdesk.test/uploads/${key}`, "https://helpdesk.test"), direct);
  assert.equal(assetUrl(`https://other.test/uploads/${key}`, "https://helpdesk.test"), `https://other.test/uploads/${key}`);
  assert.equal(assetUrl("/images/creator.png"), "/images/creator.png");
  assert.equal(assetUrl(direct), direct);
  assert.equal(assetUrl("/uploads/../../private.json"), "/uploads/../../private.json");
});
