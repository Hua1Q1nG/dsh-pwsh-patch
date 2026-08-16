// dsh-pwsh-patch — core applier (ctx-free so tests can exercise it directly).
import { readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";

/** Locate the DSH desktop install dir (explicit env override first). */
export function findInstallDir() {
  if (process.env.DSH_INSTALL_DIR) return process.env.DSH_INSTALL_DIR;
  let dir = dirname(process.execPath);
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, "resources", "app", "package.json"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

export function loadPayload(patchDir) {
  return JSON.parse(readFileSync(join(patchDir, "patch", "payload.json"), "utf8"));
}

function syntaxCheck(path) {
  const r = spawnSync(process.execPath, ["--check", path], { encoding: "utf8", timeout: 30000 });
  if (r.status === 0) return null;
  return String(r.stderr ?? "").split(/\r?\n/)[0] ?? "syntax error";
}

/** Apply one target (all hunks) idempotently. Returns { rel, state, detail }. */
export function applyTarget(installDir, target) {
  const path = join(installDir, ...target.rel.split("/"));
  let text;
  try { text = readFileSync(path, "utf8"); }
  catch (error) { return { rel: target.rel, state: "error", detail: "unreadable: " + (error instanceof Error ? error.message : String(error)) }; }
  const hunks = target.hunks ?? [];
  const applied = hunks.filter((h) => text.includes(h.replace)).length;
  if (applied === hunks.length) return { rel: target.rel, state: "ok", detail: "already applied (" + hunks.length + "/" + hunks.length + " hunks)" };
  if (applied > 0) return { rel: target.rel, state: "drift", detail: "partially applied (" + applied + "/" + hunks.length + ") — upstream changed this file; re-port per pwsh-patch/UPDATE-GUIDE.md section 3" };
  const bad = [];
  for (const h of hunks) {
    const first = text.indexOf(h.find);
    if (first < 0) bad.push(h.id + ": base text not found");
    else if (text.indexOf(h.find, first + 1) >= 0) bad.push(h.id + ": base text ambiguous");
  }
  if (bad.length > 0) return { rel: target.rel, state: "drift", detail: bad.join("; ") + " — re-port per pwsh-patch/UPDATE-GUIDE.md section 3" };
  let next = text;
  for (const h of hunks) next = next.replace(h.find, h.replace);
  const tmp = path + ".dsh-pwsh-patch.tmp.js";
  try { writeFileSync(tmp, next, "utf8"); } catch (error) { return { rel: target.rel, state: "error", detail: "cannot write temp file: " + (error instanceof Error ? error.message : String(error)) }; }
  const syntax = syntaxCheck(tmp);
  if (syntax !== null) { rmSync(tmp, { force: true }); return { rel: target.rel, state: "error", detail: "syntax check failed, target untouched: " + syntax }; }
  try { writeFileSync(path, next, "utf8"); rmSync(tmp, { force: true }); }
  catch (error) { rmSync(tmp, { force: true }); return { rel: target.rel, state: "error", detail: "cannot write target: " + (error instanceof Error ? error.message : String(error)) }; }
  return { rel: target.rel, state: "applied", detail: hunks.length + " hunks applied + syntax ok — restart DSH to take effect" };
}

/** Run the whole patch. Returns the state object. */
export function runPatch(installDir, payload) {
  if (!installDir) return { schema: 1, ranAt: Date.now(), ok: false, restartRequired: false, error: "install dir not found (set DSH_INSTALL_DIR or run inside DSH)", results: [] };
  const results = [];
  for (const target of payload.targets ?? []) {
    try { results.push(applyTarget(installDir, target)); }
    catch (error) { results.push({ rel: target.rel, state: "error", detail: error instanceof Error ? error.message : String(error) }); }
  }
  const ok = results.every((r) => r.state === "ok" || r.state === "applied");
  const restartRequired = results.some((r) => r.state === "applied");
  return { schema: 1, ranAt: Date.now(), ok, restartRequired, results };
}
