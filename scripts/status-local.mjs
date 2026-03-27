import {
  describeRunningServer,
  isProcessAlive,
  removeRuntimeState,
  WEB_URL,
} from "./local-server-runtime.mjs";

async function main() {
  const status = await describeRunningServer();
  const hasManagedRuntime = Boolean(status.runtimePid);
  const hasKnownWebUi = status.webUiRunning;
  const hasListeningPid = Number.isInteger(status.listeningPid) && status.listeningPid > 0;

  if (!hasKnownWebUi && !hasManagedRuntime && !hasListeningPid) {
    await removeRuntimeState().catch(() => {});
    console.log("积存金复盘台未运行。");
    console.log(`访问地址：${WEB_URL}`);
    return;
  }

  console.log("积存金复盘台正在运行。");
  console.log(`访问地址：${WEB_URL}`);

  if (hasManagedRuntime) {
    console.log(`PID：${status.runtimePid}`);
    if (status.runtime?.startedAt) {
      console.log(`启动时间：${status.runtime.startedAt}`);
    }
    console.log("实例来源：受当前项目脚本管理");
    if (status.runtime?.ocrAlreadyRunning === true) {
      console.log("OCR：复用已有服务");
    } else if (status.runtime?.ocrPid) {
      console.log(`OCR PID：${status.runtime.ocrPid}`);
    }
    return;
  }

  if (!hasKnownWebUi) {
    await removeRuntimeState().catch(() => {});
    console.log("状态文件已过期，服务当前不可访问。");
    return;
  }

  if (hasListeningPid && isProcessAlive(status.listeningPid)) {
    console.log(`PID：${status.listeningPid}`);
  }
  console.log("实例来源：检测到旧实例，但不是当前状态文件管理的进程。");
  console.log("可执行 `npm run stop` 结束它。");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
