import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.join(__dirname, "public");

const AUTH_DIR_NAME = ".coplan";
const AUTH_FILE_NAME = "auth.json";
const MAX_BODY_BYTES = 16 * 1024;

function getAuthPath() {
  return path.join(os.homedir(), AUTH_DIR_NAME, AUTH_FILE_NAME);
}

function ensureAuthDir() {
  fs.mkdirSync(path.dirname(getAuthPath()), { recursive: true });
}

function writeAuth(record) {
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

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store"
  });
  res.end(body);
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalBytes = 0;
    req.on("data", (chunk) => {
      chunks.push(chunk);
      totalBytes += chunk.length;
      if (totalBytes > MAX_BODY_BYTES) {
        reject(new Error("Request body too large."));
        req.destroy();
      }
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(new Error("Invalid JSON body."));
      }
    });
    req.on("error", reject);
  });
}

function serveFile(res, filePath, contentType) {
  if (!fs.existsSync(filePath)) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  const data = fs.readFileSync(filePath);
  res.writeHead(200, { "Content-Type": contentType });
  res.end(data);
}

function isTrustedBrowserRequest(req, expectedOrigin) {
  const origin = req.headers.origin;
  const hasOrigin = typeof origin === "string" && origin.length > 0;
  if (hasOrigin && origin !== expectedOrigin) {
    return false;
  }

  const referer = req.headers.referer;
  const hasReferer = typeof referer === "string" && referer.length > 0;
  if (hasReferer) {
    if (!referer.startsWith(`${expectedOrigin}/`) && referer !== expectedOrigin) {
      return false;
    }
  }

  if (!hasOrigin && !hasReferer) {
    return false;
  }

  return true;
}

function createRequestHandler(expectedOrigin) {
  return async (req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");

    if (req.method === "GET" && url.pathname === "/") {
      serveFile(res, path.join(PUBLIC_DIR, "index.html"), "text/html; charset=utf-8");
      return;
    }
    if (req.method === "GET" && url.pathname === "/app.js") {
      serveFile(res, path.join(PUBLIC_DIR, "app.js"), "application/javascript; charset=utf-8");
      return;
    }
    if (req.method === "GET" && url.pathname === "/style.css") {
      serveFile(res, path.join(PUBLIC_DIR, "style.css"), "text/css; charset=utf-8");
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/status") {
      sendJson(res, 200, { ok: true, auth_path: getAuthPath() });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/login") {
      try {
        if (!isTrustedBrowserRequest(req, expectedOrigin)) {
          sendJson(res, 403, { ok: false, error: "Untrusted origin." });
          return;
        }
        const contentType = (req.headers["content-type"] || "").toLowerCase();
        if (!contentType.includes("application/json")) {
          sendJson(res, 415, { ok: false, error: "Content-Type must be application/json." });
          return;
        }

        const body = await readRequestBody(req);
        const provider = body.provider === "openai" ? "openai" : "openai";
        const accessToken = typeof body.access_token === "string" ? body.access_token.trim() : "";

        if (!accessToken) {
          sendJson(res, 400, { ok: false, error: "access_token is required." });
          return;
        }

        const payload = {
          provider,
          access_token: accessToken,
          created_at: new Date().toISOString()
        };

        writeAuth(payload);
        sendJson(res, 200, { ok: true, auth_path: getAuthPath() });
        return;
      } catch (error) {
        sendJson(res, 400, { ok: false, error: error instanceof Error ? error.message : String(error) });
        return;
      }
    }

    res.writeHead(404);
    res.end("Not found");
  };
}

export async function startAuthServer(options = {}) {
  const host = options.host || "127.0.0.1";
  const port = Number(options.port || 8719);

  if (host !== "127.0.0.1") {
    throw new Error("Auth server must bind to 127.0.0.1 only.");
  }

  const expectedOrigin = `http://${host}:${port}`;
  const server = http.createServer(createRequestHandler(expectedOrigin));
  await new Promise((resolve) => server.listen(port, host, resolve));

  return {
    host,
    port,
    url: `http://${host}:${port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startAuthServer()
    .then(({ url }) => {
      console.log(`coplan-auth listening at ${url}`);
    })
    .catch((error) => {
      console.error("Failed to start auth server:", error);
      process.exit(1);
    });
}
