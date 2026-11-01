// Unpacks the google-font-metadata npm package (MIT) into a temp dir, so the
// build scripts read the Google Fonts API data without an API key.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function loadMetadata(version = "latest") {
  const dir = mkdtempSync(join(tmpdir(), "gfm-"));
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const tgz = execFileSync(npm, ["pack", `google-font-metadata@${version}`, "--silent"], { cwd: dir, shell: process.platform === "win32" })
    .toString()
    .trim()
    .split("\n")
    .pop();
  execFileSync("tar", ["xzf", tgz], { cwd: dir });
  const read = (name) => JSON.parse(readFileSync(join(dir, "package", name), "utf8"));
  return { version: read("package.json").version, read: (file) => read(join("data", file)) };
}
