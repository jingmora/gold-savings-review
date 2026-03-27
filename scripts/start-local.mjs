import { createReadStream, existsSync } from "node:fs";
import { stat, writeFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import {
  isCurrentWebUiRunning,
  removeRuntimeState,
  WEB_HOST,
  WEB_PORT,
  WEB_URL,
  writeRuntimeState,
} from "./local-server-runtime.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

const OCR_HEALTH_URL = "http://127.0.0.1:8765/health";
const SESSION_HEARTBEAT_INTERVAL_MS = 15000;
const SESSION_TIMEOUT_MS = 120000;
const AUTO_SHUTDOWN_GRACE_MS = 15000;

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
  const normalizedPath = requestedPath === "/" || requestedPath === "/index.html"
    ? "/web/index.html"
    : requestedPath;
  const safePath = path.normalize(normalizedPath).replace(/^(\.\.[/\\])+/, "");
  const absolutePath = path.resolve(projectRoot, `.${safePath}`);

  if (!absolutePath.startsWith(projectRoot)) {
    return null;
  }

  return absolutePath;
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let raw = "";
    request.setEncoding("utf8");

    request.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 5 * 1024 * 1024) {
        reject(new Error("请求体过大"));
        request.destroy();
      }
    });

    request.on("end", () => resolve(raw));
    request.on("error", reject);
  });
}

function runProcess(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      const error = new Error(stderr.trim() || `命令退出码 ${code}`);
      error.code = code;
      reject(error);
    });
  });
}

async function chooseSavePath(defaultName) {
  if (process.platform !== "darwin") {
    return { supported: false, filePath: "" };
  }

  const script = [
    "ObjC.import('Cocoa')",
    "function run(argv) {",
    "  const defaultName = String(argv[0] || 'history-batches.json')",
    "  const panel = $.NSSavePanel.savePanel",
    "  panel.setCanCreateDirectories(true)",
    "  panel.setTitle('导出批次 JSON')",
    "  panel.setMessage('选择保存位置并确认文件名')",
    "  panel.setPrompt('导出')",
    "  panel.setNameFieldStringValue(defaultName)",
    "  panel.setExtensionHidden(false)",
    "  const result = panel.runModal()",
    "  if (result !== $.NSModalResponseOK) {",
    "    return ''",
    "  }",
    "  return ObjC.unwrap(panel.URL.path)",
    "}",
  ];

  try {
    const { stdout } = await runProcess("osascript", [
      "-l",
      "JavaScript",
      ...script.flatMap((line) => ["-e", line]),
      defaultName,
    ]);
    const filePath = stdout.trim();
    return { supported: true, filePath };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("User canceled")) {
      return { supported: true, filePath: "" };
    }
    throw error;
  }
}

async function handleSaveJson(request, response) {
  try {
    const rawBody = await readRequestBody(request);
    const payload = JSON.parse(rawBody || "{}");
    const suggestedName = String(payload?.suggestedName || "history-batches.json").trim() || "history-batches.json";
    const content = String(payload?.content || "");

    const { supported, filePath } = await chooseSavePath(suggestedName);
    if (!supported) {
      sendJson(response, 501, { ok: false, supported: false });
      return;
    }

    if (!filePath) {
      sendJson(response, 200, { ok: false, cancelled: true, supported: true });
      return;
    }

    await writeFile(filePath, content, "utf8");
    sendJson(response, 200, { ok: true, path: filePath, supported: true });
  } catch (error) {
    sendJson(response, 500, {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      supported: true,
    });
  }
}

function createBrowserSessionManager({ onIdle }) {
  const sessions = new Map();
  let hasSeenBrowserSession = false;
  let shutdownTimer = null;

  const clearShutdownTimer = () => {
    if (shutdownTimer) {
      clearTimeout(shutdownTimer);
      shutdownTimer = null;
    }
  };

  const scheduleIdleShutdown = () => {
    clearShutdownTimer();
    if (!hasSeenBrowserSession || sessions.size > 0) {
      return;
    }

    shutdownTimer = setTimeout(() => {
      shutdownTimer = null;
      if (sessions.size === 0) {
        void onIdle();
      }
    }, AUTO_SHUTDOWN_GRACE_MS);
    shutdownTimer.unref?.();
  };

  const pruneExpiredSessions = () => {
    const now = Date.now();
    for (const [sessionId, lastSeenAt] of sessions.entries()) {
      if (now - lastSeenAt > SESSION_TIMEOUT_MS) {
        sessions.delete(sessionId);
      }
    }
    scheduleIdleShutdown();
  };

  const maintenanceTimer = setInterval(pruneExpiredSessions, SESSION_HEARTBEAT_INTERVAL_MS);
  maintenanceTimer.unref?.();

  return {
    openSession() {
      clearShutdownTimer();
      hasSeenBrowserSession = true;
      const sessionId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      sessions.set(sessionId, Date.now());
      return {
        sessionId,
        heartbeatIntervalMs: SESSION_HEARTBEAT_INTERVAL_MS,
        shutdownGraceMs: AUTO_SHUTDOWN_GRACE_MS,
      };
    },
    touchSession(sessionId) {
      if (!sessionId || !sessions.has(sessionId)) {
        return false;
      }
      sessions.set(sessionId, Date.now());
      clearShutdownTimer();
      return true;
    },
    closeSession(sessionId) {
      if (!sessionId) {
        return false;
      }
      const didDelete = sessions.delete(sessionId);
      scheduleIdleShutdown();
      return didDelete;
    },
    stop() {
      clearShutdownTimer();
      clearInterval(maintenanceTimer);
      sessions.clear();
    },
  };
}

async function handleRuntimeSession(request, response, browserSessionManager) {
  try {
    const rawBody = await readRequestBody(request);
    const payload = rawBody ? JSON.parse(rawBody) : {};

    if (request.url === "/__api/runtime/session-open") {
      const session = browserSessionManager.openSession();
      sendJson(response, 200, { ok: true, ...session });
      return;
    }

    if (request.url === "/__api/runtime/session-ping") {
      const ok = browserSessionManager.touchSession(String(payload?.sessionId || ""));
      sendJson(response, ok ? 200 : 404, { ok });
      return;
    }

    if (request.url === "/__api/runtime/session-close") {
      const ok = browserSessionManager.closeSession(String(payload?.sessionId || ""));
      sendJson(response, 200, { ok });
      return;
    }

    sendJson(response, 404, { ok: false });
  } catch (error) {
    sendJson(response, 500, {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function createStaticServer({ browserSessionManager }) {
  return http.createServer(async (request, response) => {
    if (request.method === "POST" && request.url === "/__api/save-json") {
      await handleSaveJson(request, response);
      return;
    }

    if (
      request.method === "POST"
      && request.url
      && request.url.startsWith("/__api/runtime/")
    ) {
      await handleRuntimeSession(request, response, browserSessionManager);
      return;
    }

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
    const chromeAppPath = "/Applications/Google Chrome.app";
    const openArgs = existsSync(chromeAppPath) ? ["-a", "Google Chrome", url] : [url];
    spawn("open", openArgs, { stdio: "ignore", detached: true }).unref();
    return;
  }

  if (process.platform === "win32") {
    spawn("cmd", ["/c", "start", "", url], { stdio: "ignore", detached: true }).unref();
    return;
  }

  spawn("xdg-open", [url], { stdio: "ignore", detached: true }).unref();
}

function requestCloseLaunchWindow() {
  if (process.platform !== "darwin" || process.env.GOLD_REVIEW_AUTO_CLOSE_WINDOW !== "1") {
    return;
  }

  const sessionId = process.env.ITERM_SESSION_ID || process.env.TERM_SESSION_ID;
  if (!sessionId) {
    return;
  }

  const script = [
    "on run argv",
    "  set targetSessionId to item 1 of argv",
    "  delay 0.4",
    "  tell application \"iTerm\"",
    "    repeat with aWindow in windows",
    "      repeat with aTab in tabs of aWindow",
    "        repeat with aSession in sessions of aTab",
    "          if id of aSession is targetSessionId then",
    "            close aWindow",
    "            return",
    "          end if",
    "        end repeat",
    "      end repeat",
    "    end repeat",
    "  end tell",
    "end run",
  ];

  spawn(
    "osascript",
    [...script.flatMap((line) => ["-e", line]), sessionId],
    { stdio: "ignore", detached: true }
  ).unref();
}

async function main() {
  const pythonExecutable = getPythonExecutable();
  const pythonAbsolutePath = path.resolve(projectRoot, pythonExecutable);
  if (!existsSync(pythonAbsolutePath)) {
    throw new Error(`未找到 Python 环境：${pythonExecutable}`);
  }

  let shutdown = async () => {};
  const browserSessionManager = createBrowserSessionManager({
    onIdle: async () => {
      console.log("检测到所有浏览器页面已关闭，正在自动停止本地服务。");
      await shutdown();
    },
  });
  const server = createStaticServer({ browserSessionManager });
  let ocrProcess = null;
  let shuttingDown = false;

  await new Promise((resolve, reject) => {
    const handleError = (error) => {
      server.off("listening", handleListening);
      reject(error);
    };
    const handleListening = () => {
      server.off("error", handleError);
      resolve();
    };

    server.once("error", handleError);
    server.once("listening", handleListening);
    server.listen(WEB_PORT, WEB_HOST);
  });

  const ocrAlreadyRunning = await isOcrServiceRunning();
  if (!ocrAlreadyRunning) {
    ocrProcess = spawn(pythonAbsolutePath, ["python/paddle_ocr_service.py"], {
      cwd: projectRoot,
      stdio: "inherit",
    });

    ocrProcess.on("exit", (code) => {
      if (code && code !== 0) {
        console.error(`OCR 服务已退出，状态码 ${code}`);
      }
    });
  }

  await writeRuntimeState({
    pid: process.pid,
    startedAt: new Date().toISOString(),
    webUrl: WEB_URL,
    ocrPid: ocrProcess?.pid ?? null,
    ocrAlreadyRunning,
  });

  console.log(`Web UI: ${WEB_URL}`);
  console.log(ocrAlreadyRunning ? "OCR 服务已复用现有进程" : "OCR 服务已随启动脚本拉起");
  console.log("按 Ctrl+C 可同时关闭当前启动脚本及它启动的服务");

  openBrowser(WEB_URL);

  shutdown = async () => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;

    browserSessionManager.stop();
    await new Promise((resolve) => {
      server.close(() => resolve());
    });
    if (ocrProcess && !ocrProcess.killed) {
      ocrProcess.kill("SIGTERM");
    }
    await removeRuntimeState({ pid: process.pid }).catch(() => {});
    requestCloseLaunchWindow();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  if (error && typeof error === "object" && error.code === "EADDRINUSE") {
    isCurrentWebUiRunning(WEB_URL)
      .then((isKnownApp) => {
        if (isKnownApp) {
          console.log(`Web UI 已在运行：${WEB_URL}`);
          console.log("检测到现有积存金复盘台实例，本次不再重复启动。");
          openBrowser(WEB_URL);
          process.exit(0);
          return;
        }

        console.error(`Web 端口已被占用：${WEB_URL}`);
        console.error("当前监听的不是可识别的积存金复盘台实例，请先释放端口后再启动。");
        process.exit(1);
      })
      .catch(() => {
        console.error(message);
        process.exit(1);
      });
    return;
  }

  console.error(message);
  process.exit(1);
});
