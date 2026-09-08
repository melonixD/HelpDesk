const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const vm = require("node:vm");

// Exercise the real save and field-binding handlers with a small DOM adapter.
// The regression occurs on the second edit, after the server returns its merge.
test("two successive Creator edits save and publish the second photo", async () => {
  const source = await fs.readFile(path.join(__dirname, "../public/admin/admin.js"), "utf8");
  const part = (from, to) => source.slice(source.indexOf(from), source.indexOf(to, source.indexOf(from)));
  const state = {
    role: "main", section: "creators", dirty: false, saving: false, publishing: false,
    data: { resources: { meta: {}, creators: [{ id: "creator", name: "Creator", photoUrl: "/images/initial.png" }] } },
    baselines: {}, drafts: {}, published: {}, history: {},
  };
  const requests = [];
  let savedData;
  let liveData;
  let input;
  let context;
  const container = {};
  const render = () => {
    const handlers = {};
    input = {
      dataset: { bind: "0.photoUrl" }, type: "url", value: state.data.resources.creators[0].photoUrl,
      addEventListener: (name, handler) => { handlers[name] = handler; },
      closest: () => null,
      edit: (url) => { input.value = url; handlers.input(); },
    };
    context.bind(container, state.data.resources.creators);
  };
  context = vm.createContext({
    state, saveButton: {}, publishButton: {}, status: {}, editor: container,
    window: { scrollY: 0, scrollTo() {} }, setTimeout: () => 0,
    $$: (selector, root) => root === container && selector === "[data-bind]" ? [input] : [],
    $: () => null, render, renderHistory() {}, notifyLiveSite() {},
    toast: (message) => { if (/failed/i.test(message)) throw new Error(message); },
    confirm: () => true,
    request: async (url, options) => {
      const body = JSON.parse(options.body);
      requests.push({ url, body });
      if (url === "/api/admin/save") {
        savedData = structuredClone(body.data);
        return { draft: true, deploying: false, draftId: `draft-${requests.length}`, data: structuredClone(savedData) };
      }
      assert.equal(url, "/api/admin/publish");
      liveData = structuredClone(savedData);
      liveData.creators[0].photoUpdatedAt = "2026-09-08T12:00:00.000Z";
      return { version: 3, deploying: false, data: structuredClone(liveData) };
    },
  });
  vm.runInContext([
    part("  function markDirty()", "  async function saveChanges()"),
    part("  async function saveChanges()", "  saveButton.addEventListener"),
    part("  async function publishSavedDraft(", "  async function publishChanges()"),
    part("  function bind(", "  async function uploadFile("),
  ].join("\n"), context);
  render();
  input.edit("/uploads/image-v2-first.png");
  await context.saveChanges();
  input.edit("/uploads/image-v2-second.png");
  await context.saveChanges();
  assert.equal(requests[1].body.data.creators[0].photoUrl, "/uploads/image-v2-second.png");
  assert.equal(requests.filter((request) => request.url.includes("publish")).length, 0);
  await context.publishSavedDraft("resources", "Creators");
  assert.equal(liveData.creators[0].photoUrl, "/uploads/image-v2-second.png");
  assert.equal(state.data.resources.creators[0].photoUpdatedAt, "2026-09-08T12:00:00.000Z");
  input.edit("/uploads/image-v2-third.png");
  await context.saveChanges();
  assert.equal(requests.at(-1).body.data.creators[0].photoUrl, "/uploads/image-v2-third.png");
});
