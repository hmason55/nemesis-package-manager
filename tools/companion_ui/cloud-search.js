"use strict";
// A request generation belongs to the latest user intent, including queued text.
// Older responses and errors cannot replace that intent's results or status.
globalThis.NemesisCloudSearch = function ({load, render, error, loading, delay = 250, schedule = setTimeout, cancel = clearTimeout}) {
  let revision = 0, timer, source;
  async function execute(request, current) {
    loading(true);
    try { const result = await load(request); if (current === revision) render(result); }
    catch (failure) { if (current === revision) error(failure); }
    finally { if (current === revision) loading(false); }
  }
  function invalidate() { revision++; cancel(timer); loading(false); }
  return {
    queue(request) { invalidate(); const current = revision; timer = schedule(() => execute(request, current), delay); },
    now(request) { invalidate(); return execute(request, revision); },
    invalidate,
    sourceChanged(next) { if (next === source) return false; source = next; invalidate(); return true; },
  };
};
// Update rows are folder-specific, even when their internal IDs are identical.
globalThis.NemesisCloudSearch.selectionKey = (id, folder) => JSON.stringify([id, folder || null]);
globalThis.NemesisCloudSearch.count = (number, word) => `${number} ${word}${Number(number) === 1 ? "" : "s"}`;
globalThis.NemesisCloudSearch.bytes = value => {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes < 0) return "Unknown size";
  const unit = bytes === 0 ? 0 : Math.max(0, Math.min(3, Math.floor(Math.log(bytes) / Math.log(1024))));
  return (bytes / (1024 ** unit)).toLocaleString(undefined, {maximumFractionDigits: unit ? 1 : 0}) + " " + ["B", "KiB", "MiB", "GiB"][unit];
};
