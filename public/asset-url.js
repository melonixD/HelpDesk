(function (root) {
  "use strict";
  function assetUrl(value, origin) {
    const original = String(value || "").trim();
    let pathname = original.split(/[?#]/, 1)[0];
    if (/^https?:\/\//i.test(original)) {
      try {
        const url = new URL(original);
        if (!origin || url.origin !== origin) return original;
        pathname = url.pathname;
      } catch { return original; }
    }
    if (!pathname.startsWith("/uploads/")) return original;
    const key = pathname.slice("/uploads/".length);
    if (!/^[a-z0-9-]{10,100}\.(pdf|png|jpg|webp)$/.test(key)) return original;
    return "/.netlify/functions/admin-asset?key=" + encodeURIComponent(key);
  }
  if (typeof module !== "undefined" && module.exports) module.exports = { assetUrl };
  else root.HelpDeskAssets = { assetUrl };
})(globalThis);
