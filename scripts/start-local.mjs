import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

const WEB_HOST = "127.0.0.1";
const WEB_PORT = 4173;
const OCR_HEALTH_URL = "http://127.0.0.1:8765/health";

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function getPythonExecutable() {
  return process.platform === "win32" ? ".venv\\Scripts\\python.exe" : ".venv/bin/python";
}

function getContentType(filePath) {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}

function resolveRequestPath(urlPath) {
  const requestedPath = decodeURIComponent((urlPath || "/").split("?")[0]);
  const normalizedPath = requestedPath === "/" ? "/index.html" : requestedPath;
  const safePath = path.normalize(normalizedPath).replace(/^(\.\.[/\\])+/, "");
  const absolutePath = path.resolve(projectRoot, `.${safePath}`);

  if (!absolutePath.startsWith(projectRoot)) {
    return null;
  }

  return absolutePath;
}

function createStaticServer() {
  return http.createServer(async (request, response) => {
    const targetPath = resolveRequestPath(request.url || "/");
    if (!targetPath) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }

    try {
      const fileStat = await stat(targetPath);
      if (!fileStat.isFile()) {
        response.writeHead(404);
        response.end("Not Found");
        return;
      }

      response.writeHead(200, { "Content-Type": getContentType(targetPath) });
      createReadStream(targetPath).pipe(response);
    } catch {
      response.writeHead(404);
      response.end("Not Found");
    }
  });
}

async function isOcrServiceRunning() {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1000);
    const response = await fetch(OCR_HEALTH_URL, { signal: controller.signal });
    clearTimeout(timer);
    if (!response.ok) {
      return false;
    }
    const payload = await response.json().catch(() => ({}));
    return Boolean(payload?.ok);
  } catch {
    return false;
  }
}

function openBrowser(url) {
  if (process.env.CI) {
    return;
  }

  if (process.platform === "darwin") {
    spawn("open", [url], { stdio: "ignore", detached: true }).unref();
    return;
  }

  if (process.platform === "win32") {
    spawn("cmd", ["/c", "start", "", url], { stdio: "ignore", detached: true }).unref();
    return;
  }

  spawn("xdg-open", [url], { stdio: "ignore", detached: true }).unref();
}

async function main() {
  const pythonExecutable = getPythonExecutable();
  const pythonAbsolutePath = path.resolve(projectRoot, pythonExecutable);
  if (!existsSync(pythonAbsolutePath)) {
    throw new Error(`未找到 Python 环境：${pythonExecutable}`);
  }

  const server = createStaticServer();
  const webUrl = `http://${WEB_HOST}:${WEB_PORT}`;

  const ocrAlreadyRunning = await isOcrServiceRunning();
  const ocrProcess = ocrAlreadyRunning
    ? null
    : spawn(pythonAbsolutePath, ["python/paddle_ocr_service.py"], {
        cwd: projectRoot,
        stdio: "inherit",
      });

  if (ocrProcess) {
    ocrProcess.on("exit", (code) => {
      if (code && code !== 0) {
        console.error(`OCR 服务已退出，状态码 ${code}`);
      }
    });
  }

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(WEB_PORT, WEB_HOST, resolve);
  });

  console.log(`Web UI: ${webUrl}`);
  console.log(ocrAlreadyRunning ? "OCR 服务已复用现有进程" : "OCR 服务已随启动脚本拉起");
  console.log("按 Ctrl+C 可同时关闭当前启动脚本及它启动的服务");

  openBrowser(webUrl);

  const shutdown = () => {
    server.close();
    if (ocrProcess && !ocrProcess.killed) {
      ocrProcess.kill("SIGTERM");
    }
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
