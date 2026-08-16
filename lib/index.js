// dsh-pwsh-patch — host face: self-healing re-applier for the pwsh hardening patch.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { findInstallDir, loadPayload, runPatch } from "./patch.js";

const name = "pwsh-patch";
export { name };

const SELF_DIR = dirname(fileURLToPath(import.meta.url));
const PLUGIN_DIR = dirname(SELF_DIR);

function dshHome() { return process.env.DSH_HOME ?? join(homedir(), ".dsh"); }
function stateDir() { return join(dshHome(), "pwsh-patch"); }
function statePath() { return join(stateDir(), "state.json"); }

function jsonResponse(res, status, value) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(value));
}

function readState() {
  try { return JSON.parse(readFileSync(statePath(), "utf8")); }
  catch { return { schema: 1, loading: true }; }
}

function runOnce() {
  const installDir = findInstallDir();
  let result;
  try { result = runPatch(installDir, loadPayload(PLUGIN_DIR)); }
  catch (error) { result = { schema: 1, ranAt: Date.now(), ok: false, restartRequired: false, error: error instanceof Error ? error.message : String(error), results: [] }; }
  try { mkdirSync(stateDir(), { recursive: true }); writeFileSync(statePath(), JSON.stringify(result, null, 2) + "\n", "utf8"); } catch {}
  return result;
}

function apply(ctx) {
  ctx.inject(["webServer"], (sctx) => {
    const server = sctx.get("webServer");
    sctx.effect(() => server.register({ kind: "exact", path: "/pwsh-patch/state", handler: (req, res) => {
      if (req.method !== "GET") return jsonResponse(res, 405, { ok: false, error: "method not allowed" });
      jsonResponse(res, 200, { ok: true, ...readState() });
    } }), "pwsh-patch: state route");
    sctx.effect(() => server.register({ kind: "exact", path: "/pwsh-patch/run", handler: async (req, res) => {
      if (req.method !== "POST") return jsonResponse(res, 405, { ok: false, error: "method not allowed" });
      jsonResponse(res, 200, { ok: true, started: true });
      runOnce();
    } }), "pwsh-patch: run route");
  });
  try {
    const result = runOnce();
    if (!result.ok) ctx.logger?.warn(name + ": patch check failed: " + (result.error ?? (result.results ?? []).filter((r) => r.state !== "ok").map((r) => r.rel + " [" + r.state + "] " + r.detail).join("; ")));
    else if (result.restartRequired) ctx.logger?.info(name + ": patch applied — restart DSH to take effect");
    else ctx.logger?.info(name + ": patch intact");
  } catch (error) {
    ctx.logger?.warn(name + ": " + (error instanceof Error ? error.message : String(error)));
  }
}

export { apply };
