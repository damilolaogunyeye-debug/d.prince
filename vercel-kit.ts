import "server-only";
import fs from "node:fs";
import path from "node:path";

/**
 * The "Vercel kit": 4 files that can be uploaded flat to a GitHub repository (even from a phone).
 * The project's folders travel inside one bundle file; unbundle.mjs restores them on Vercel before
 * `next build`. Built fresh from the current source on every request.
 */
export const KIT_FILES = {
  bundle: { name: "dprince-portal.bundle.json", type: "application/json" },
  unbundle: { name: "unbundle.mjs", type: "text/javascript" },
  package: { name: "package.json", type: "application/json" },
  lock: { name: "package-lock.json", type: "application/json" },
} as const;
export type KitFile = keyof typeof KIT_FILES;

const SKIP_DIRS = new Set(["node_modules", ".next", ".portal-logs", "exports", ".git", "tools"]);
const SKIP_ROOT_FILES = new Set(["package.json", "package-lock.json", "tsconfig.tsbuildinfo"]);

const UNBUNDLE = `// Restores the D.prince Learning Portal's folders from dprince-portal.bundle.json, then the build continues.
// On Vercel / CI it first removes stray files that were uploaded without their folders (only in the build copy).
import fs from "node:fs";
import path from "node:path";

const BUNDLE = "dprince-portal.bundle.json";
if (!fs.existsSync(BUNDLE)) { console.log("unbundle: no bundle found, building the files as they are"); process.exit(0); }
const bundle = JSON.parse(fs.readFileSync(BUNDLE, "utf8"));

if (process.env.VERCEL || process.env.CI) {
  const keep = new Set(["package.json", "package-lock.json", "unbundle.mjs", BUNDLE]);
  let removed = 0;
  for (const name of fs.readdirSync(".")) {
    if (keep.has(name) || name.startsWith(".")) continue;
    const st = fs.statSync(name);
    if (st.isFile() && (/\\.(tsx?|mjs|sql|jsonl|css|md|json)$/.test(name) || name === "download")) { fs.unlinkSync(name); removed++; }
  }
  console.log("unbundle: removed " + removed + " stray top-level files from the build copy");
}

let n = 0;
for (const [rel, b64] of Object.entries(bundle.files)) {
  if (rel.includes("..") || path.isAbsolute(rel)) throw new Error("unsafe path in bundle: " + rel);
  fs.mkdirSync(path.dirname(rel) || ".", { recursive: true });
  fs.writeFileSync(rel, Buffer.from(b64, "base64"));
  n++;
}
console.log("unbundle: restored " + n + " files (bundle made " + bundle.createdAt + ")");
`;

export function buildKitFile(which: KitFile): Buffer {
  const root = process.cwd();
  if (which === "unbundle") return Buffer.from(UNBUNDLE);
  if (which === "lock") return fs.readFileSync(path.join(root, "package-lock.json"));
  if (which === "package") {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
    pkg.scripts = { ...pkg.scripts, build: "node unbundle.mjs && next build" };
    return Buffer.from(JSON.stringify(pkg, null, 2) + "\n");
  }
  const files: Record<string, string> = {};
  (function walk(dir: string) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, e.name);
      const rel = path.relative(root, abs).split(path.sep).join("/");
      // Follow links, so linked folders are walked and linked files are read.
      const st = e.isSymbolicLink() ? fs.statSync(abs) : e;
      if (st.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) walk(abs);
        continue;
      }
      if (!st.isFile()) continue;
      if (dir === root && (SKIP_ROOT_FILES.has(e.name) || e.name.startsWith(".env"))) continue;
      files[rel] = fs.readFileSync(abs).toString("base64");
    }
  })(root);
  return Buffer.from(JSON.stringify({ createdAt: new Date().toISOString(), files }));
}
