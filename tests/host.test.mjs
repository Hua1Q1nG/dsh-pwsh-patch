import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, copyFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadPayload, runPatch } from "../lib/patch.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN_DIR = dirname(HERE);
const payload = loadPayload(PLUGIN_DIR);

function findLiveInstall() {
  if (process.env.DSH_PWSH_TEST_INSTALL) return process.env.DSH_PWSH_TEST_INSTALL;
  const candidates = ["E:/program(E)/DSH/DSH Desktop", "C:/Program Files/DSH Desktop"];
  for (const dir of candidates) if (existsSync(join(dir, "resources", "app", "package.json"))) return dir;
  return undefined;
}

function liveFile(rel) { return join(findLiveInstall(), ...rel.split("/")); }
function tempInstall(live) {
  const root = mkdtempSync(join(tmpdir(), "dsh-pwsh-patch-"));
  for (const target of payload.targets) {
    const src = join(live, ...target.rel.split("/"));
    const dst = join(root, ...target.rel.split("/"));
    mkdirSync(dirname(dst), { recursive: true });
    copyFileSync(src, dst);
  }
  return root;
}
function stripPatch(text, target) {
  let out = text;
  for (const h of target.hunks) out = out.replace(h.replace, h.find);
  return out;
}

const live = findLiveInstall();
const LIVE = live !== undefined;

test("payload is well-formed", () => {
  assert.equal(payload.schema, 1);
  assert.ok(Array.isArray(payload.targets) && payload.targets.length === 2);
  for (const t of payload.targets) assert.ok(t.hunks.length >= 1, t.rel);
});

test("live files currently carry the patch (ground truth)", { skip: !LIVE }, () => {
  for (const t of payload.targets) {
    const text = readFileSync(liveFile(t.rel), "utf8");
    for (const h of t.hunks) assert.ok(text.includes(h.replace), t.rel + " missing " + h.id);
  }
});

test("fresh originals are patched back to byte-identical live files", { skip: !LIVE }, () => {
  const root = tempInstall(live);
  process.env.DSH_INSTALL_DIR = root;
  for (const t of payload.targets) {
    const path = join(root, ...t.rel.split("/"));
    writeFileSync(path, stripPatch(readFileSync(path, "utf8"), t), "utf8");
    for (const h of t.hunks) assert.ok(readFileSync(path, "utf8").includes(h.find), t.rel + " original missing " + h.id);
  }
  const result = runPatch(root, payload);
  assert.equal(result.ok, true);
  assert.equal(result.restartRequired, true);
  for (const t of payload.targets) {
    const patched = readFileSync(join(root, ...t.rel.split("/")), "utf8");
    const liveText = readFileSync(liveFile(t.rel), "utf8");
    assert.equal(patched, liveText, t.rel + " not byte-identical to live file");
  }
  rmSync(root, { recursive: true, force: true });
  delete process.env.DSH_INSTALL_DIR;
});

test("re-run is idempotent", { skip: !LIVE }, () => {
  const root = tempInstall(live);
  process.env.DSH_INSTALL_DIR = root;
  const again = runPatch(root, payload);
  assert.equal(again.ok, true);
  assert.equal(again.restartRequired, false);
  for (const r of again.results) assert.equal(r.state, "ok");
  rmSync(root, { recursive: true, force: true });
  delete process.env.DSH_INSTALL_DIR;
});

test("upstream drift is reported loudly, not silently skipped", { skip: !LIVE }, () => {
  const root = tempInstall(live);
  process.env.DSH_INSTALL_DIR = root;
  for (const t of payload.targets) {
    const path = join(root, ...t.rel.split("/"));
    writeFileSync(path, stripPatch(readFileSync(path, "utf8"), t), "utf8");
  }
  const path = join(root, ...payload.targets[0].rel.split("/"));
  writeFileSync(path, readFileSync(path, "utf8").replace("UTF-8 output pinning", "UTF-8 OUTPUT PINNING"), "utf8");
  const result = runPatch(root, payload);
  assert.equal(result.ok, false);
  assert.equal(result.results[0].state, "drift");
  assert.match(result.results[0].detail, /command-preamble/);
  rmSync(root, { recursive: true, force: true });
  delete process.env.DSH_INSTALL_DIR;
});

test("partial application is flagged as drift", { skip: !LIVE }, () => {
  const root = tempInstall(live);
  process.env.DSH_INSTALL_DIR = root;
  const t = payload.targets[0];
  const path = join(root, ...t.rel.split("/"));
  let text = stripPatch(readFileSync(path, "utf8"), t);
  text = text.replace(t.hunks[0].find, t.hunks[0].replace);
  writeFileSync(path, text, "utf8");
  const result = runPatch(root, payload);
  assert.equal(result.ok, false);
  assert.equal(result.results[0].state, "drift");
  assert.match(result.results[0].detail, /partially applied/);
  rmSync(root, { recursive: true, force: true });
  delete process.env.DSH_INSTALL_DIR;
});
