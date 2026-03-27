import {
  describeRunningServer,
  isCurrentWebUiRunning,
  isProcessAlive,
  removeRuntimeState,
  WEB_URL,
} from "./local-server-runtime.mjs";

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitForShutdown(pid, timeoutMs = 4000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const alive = isProcessAlive(pid);
    const webUiRunning = await isCurrentWebUiRunning();
    if (!alive && !webUiRunning) {
      return true;
    }
    await sleep(150);
  }
  return false;
}

async function main() {
  const status = await describeRunningServer();
  const runtimePid = status.runtimePid;
  const listeningPid = status.listeningPid;
  const targetPid = runtimePid ?? listeningPid;

  if (!status.webUiRunning && !targetPid) {
    await removeRuntimeState().catch(() => {});
    console.log("积存金复盘台当前未运行，无需停止。");
    return;
  }

  if (!status.webUiRunning) {
    await removeRuntimeState().catch(() => {});
    console.log("状态文件已清理，但网页入口当前不可访问。");
    return;
  }

  if (!targetPid) {
    console.error("检测到网页入口可用，但未能定位监听进程 PID。");
    console.error(`请手动检查：${WEB_URL}`);
    process.exit(1);
  }

  if (!runtimePid) {
    console.log("正在停止一个旧实例（不是当前状态文件管理的进程）。");
  }

  process.kill(targetPid, "SIGTERM");
  const stopped = await waitForShutdown(targetPid);
  if (runtimePid) {
    await removeRuntimeState({ pid: runtimePid }).catch(() => {});
  } else {
    await removeRuntimeState().catch(() => {});
  }

  if (!stopped && (await isCurrentWebUiRunning())) {
    console.error(`已向 PID ${targetPid} 发送 SIGTERM，但服务仍在运行。`);
    process.exit(1);
  }

  console.log(`已停止积存金复盘台（PID ${targetPid}）。`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
