// Reconstruct pristine originals from payload.json + live files (byte-exact reverse),
// then emit a unified diff for each target when git is available.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const payload = JSON.parse(readFileSync(join(HERE, "payload.json"), "utf8"));

function findInstall() {
  if (process.env.DSH_INSTALL_DIR) return process.env.DSH_INSTALL_DIR;
  if (process.env.DSH_PWSH_TEST_INSTALL) return process.env.DSH_PWSH_TEST_INSTALL;
  for (const dir of ["C:/Program Files/DSH Desktop", "C:/Program Files (x86)/DSH Desktop"]) {
    if (existsSync(join(dir, "resources", "app", "package.json"))) return dir;
  }
  return undefined;
}

const install = findInstall();
if (!install) { console.error("install dir not found (set DSH_INSTALL_DIR)"); process.exit(1); }
const cache = join(HERE, ".cache");
mkdirSync(cache, { recursive: true });
const diffs = [];
let i = 0;
for (const t of payload.targets) {
  i++;
  const src = join(install, ...t.rel.split("/"));
  let txt = readFileSync(src, "utf8");
  for (const h of t.hunks) txt = txt.replace(h.replace, h.find);
  const orig = join(cache, "orig-" + i + "-" + t.rel.split("/").pop());
  writeFileSync(orig, txt, "utf8");
  const r = spawnSync("git", ["diff", "--no-index", "--no-prefix", "--", orig, src], { encoding: "utf8" });
  const body = (r.stdout || "").split("\n").filter((l) => !/^(diff --git|index |--- |\+\+\+ )/.test(l)).join("\n");
  diffs.push("diff --git a/" + t.rel + " b/" + t.rel + "\n" + body);
}
const header = "# dsh-pwsh-hardening patch\n# unified diff for human review / upstream porting; the applier uses payload.json\n\n";
writeFileSync(join(HERE, "dsh-pwsh-hardening.diff"), header + diffs.join(""), "utf8");
console.log("generated patch/dsh-pwsh-hardening.diff (" + diffs.length + " targets, " + (header + diffs.join("")).length + " bytes)");
