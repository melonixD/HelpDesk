const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { validateResources } = require("../netlify/lib/admin-content");
const resources = require("../data/resources.json");

const fresh = () => structuredClone(resources);

test("WhatsApp logo accepts uploaded and HTTPS images but rejects unsafe URLs", () => {
  const data = fresh();
  data.meta.whatsappLogoUrl = "/uploads/image-v2-1234567890abcdef.png?asset=20260911";
  assert.doesNotThrow(() => validateResources(data));
  data.meta.whatsappLogoUrl = "https://images.example.com/whatsapp.png";
  assert.doesNotThrow(() => validateResources(data));
  data.meta.whatsappLogoUrl = "javascript:alert(1)";
  assert.throws(() => validateResources(data), /WhatsApp logo/);
});

test("admin can upload, preview and reset the shared WhatsApp logo", () => {
  const admin = fs.readFileSync(path.join(__dirname, "../public/admin/admin.js"), "utf8");
  const site = fs.readFileSync(path.join(__dirname, "../public/app.js"), "utf8");
  assert.match(admin, /whatsappLogoUrl/);
  assert.match(admin, /data-whatsapp-logo-preview/);
  assert.match(admin, /reset-whatsapp-logo/);
  assert.match(site, /state\.data\.meta\.whatsappLogoUrl/);
  assert.match(site, /whatsappLogoMarkup\(\)/);
});

