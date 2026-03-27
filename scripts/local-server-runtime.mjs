import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const projectRoot = path.resolve(__dirname, "..");
export const runtimeDir = path.join(projectRoot, ".runtime");
export const runtimeFile = path.join(runtimeDir, "local-server.json");
export const WEB_HOST = "127.0.0.1";
export const WEB_PORT = 4173;
export const WEB_URL = `http://${WEB_HOST}:${WEB_PORT}`;

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

export async function isCurrentWebUiRunning(webUrl = WEB_URL) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1000);
    const response = await fetch(`${webUrl}/`, { signal: controller.signal });
    clearTimeout(timer);
    if (!response.ok) {
      return false;
    }
    const html = await response.text();
    return html.includes("<title>积存金复盘台</title>");
  } catch {
    return false;
  }
}

export async function readRuntimeState() {
  if (!existsSync(runtimeFile)) {
    return null;
  }

  try {
    const content = await readFile(runtimeFile, "utf8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

export async function writeRuntimeState(state) {
  await mkdir(runtimeDir, { recursive: true });
  await writeFile(runtimeFile, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

export async function removeRuntimeState({ pid } = {}) {
  if (pid != null) {
    const current = await readRuntimeState();
    if (current && current.pid !== pid) {
      return;
    }
  }

  await rm(runtimeFile, { force: true });
}

export function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error && typeof error === "object" && error.code === "EPERM") {
      return true;
    }
    return false;
  }
}

export async function findListeningPid(port = WEB_PORT) {
  try {
    const { stdout } = await runProcess("lsof", ["-nP", "-t", `-iTCP:${port}`, "-sTCP:LISTEN"]);
    const line = stdout
      .split(/\r?\n/u)
      .map((item) => item.trim())
      .find(Boolean);
    const pid = Number(line);
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

export async function describeRunningServer() {
  const runtime = await readRuntimeState();
  const runtimePid = Number(runtime?.pid);
  const runtimePidAlive = isProcessAlive(runtimePid);
  const listeningPid = await findListeningPid();
  const webUiRunning = await isCurrentWebUiRunning();
  const runtimeOwnsListener = runtimePidAlive && listeningPid != null && runtimePid === listeningPid;

  return {
    runtime,
    runtimePid: runtimeOwnsListener ? runtimePid : null,
    listeningPid,
    webUiRunning,
    managedPid: runtimeOwnsListener ? runtimePid : null,
  };
}
