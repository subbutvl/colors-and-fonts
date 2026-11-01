// Keeps the app version the same in package.json, package-lock.json,
// src-tauri/tauri.conf.json and src-tauri/Cargo.toml.
//   node scripts/version.mjs              print the versions
//   node scripts/version.mjs set 0.2.0    set all of them
//   node scripts/version.mjs check v0.2.0 fail unless all equal the tag
import { readFileSync, writeFileSync } from "node:fs";

const SEMVER = /^\d+\.\d+\.\d+$/;
const json = (p) => JSON.parse(readFileSync(p, "utf8"));
const writeJson = (p, v) => writeFileSync(p, `${JSON.stringify(v, null, 2)}\n`);
const CARGO = "src-tauri/Cargo.toml";
const cargoVersion = (text) => text.match(/^\[package\][^[]*?^version\s*=\s*"([^"]+)"/m)?.[1];

function read() {
  const lock = json("package-lock.json");
  return {
    "package.json": json("package.json").version,
    "package-lock.json": lock.version,
    "tauri.conf.json": json("src-tauri/tauri.conf.json").version,
    "Cargo.toml": cargoVersion(readFileSync(CARGO, "utf8")),
  };
}

function set(v) {
  // MSI needs plain major.minor.patch (each part up to 255 for major and minor, 65535 for patch).
  if (!SEMVER.test(v)) throw new Error(`Version must look like 1.2.3, got "${v}"`);
  const pkg = json("package.json");
  pkg.version = v;
  writeJson("package.json", pkg);
  const lock = json("package-lock.json");
  lock.version = v;
  if (lock.packages?.[""]) lock.packages[""].version = v;
  writeJson("package-lock.json", lock);
  const conf = json("src-tauri/tauri.conf.json");
  conf.version = v;
  writeJson("src-tauri/tauri.conf.json", conf);
  const cargo = readFileSync(CARGO, "utf8");
  writeFileSync(CARGO, cargo.replace(/^(\[package\][^[]*?^version\s*=\s*")[^"]+(")/m, `$1${v}$2`));
  console.log(`Version set to ${v}. Run cargo check in src-tauri to update Cargo.lock.`);
}

const [cmd, arg] = process.argv.slice(2);
if (cmd === "set") set(arg ?? "");
else {
  const found = read();
  console.table(found);
  if (cmd === "check") {
    const want = (arg ?? "").replace(/^v/, "");
    const wrong = Object.entries(found).filter(([, v]) => v !== want);
    if (wrong.length) {
      console.error(`Tag ${arg} does not match: ${wrong.map(([f, v]) => `${f} has ${v}`).join(", ")}`);
      process.exit(1);
    }
  }
}
