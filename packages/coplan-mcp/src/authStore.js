import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const AUTH_DIR_NAME = ".coplan";
const AUTH_FILE_NAME = "auth.json";

export function getAuthPath() {
  return path.join(os.homedir(), AUTH_DIR_NAME, AUTH_FILE_NAME);
}

export function ensureAuthDir() {
  fs.mkdirSync(path.dirname(getAuthPath()), { recursive: true });
}

export function readAuth() {
  const authPath = getAuthPath();

  if (!fs.existsSync(authPath)) {
    return null;
  }

  const raw = fs.readFileSync(authPath, "utf8");
  return JSON.parse(raw);
}

export function writeAuth(record) {
  ensureAuthDir();
  const authPath = getAuthPath();
  fs.writeFileSync(authPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  if (process.platform !== "win32") {
    try {
      fs.chmodSync(authPath, 0o600);
    } catch (_) {
      // Best-effort permission hardening on Unix-like platforms.
    }
  }
}

export function clearAuth() {
  const authPath = getAuthPath();
  if (fs.existsSync(authPath)) {
    fs.unlinkSync(authPath);
  }
}
