export function createShellStatusApi({
  elements,
}) {
  function isHistoryDrawerOpen() {
    return !elements.historyDrawer.classList.contains("is-hidden");
  }

  function setHistoryDrawerOpen(isOpen) {
    elements.historyDrawer.classList.toggle("is-hidden", !isOpen);
    elements.historyDrawer.setAttribute("aria-hidden", String(!isOpen));
    elements.openHistory?.setAttribute("aria-expanded", String(isOpen));
    document.body.classList.toggle("history-open", isOpen);
  }

  function setOcrStatus(message, type = "default") {
    elements.ocrStatus.textContent = message;
    elements.ocrStatus.classList.remove("processing", "error");
    elements.ocrStatus.classList.toggle(
      "is-hidden",
      !message || (type === "default" && message === "等待导入截图")
    );
    if (type === "processing") {
      elements.ocrStatus.classList.add("processing");
    }
    if (type === "error") {
      elements.ocrStatus.classList.add("error");
    }
  }

  function setRuntimeBridgeStatus({ connected, reason = "" } = {}) {
    if (!elements.runtimeBridgeStatus) {
      return;
    }

    if (connected || reason === "unsupported") {
      elements.runtimeBridgeStatus.textContent = "";
      elements.runtimeBridgeStatus.classList.add("is-hidden");
      return;
    }

    const message = reason === "expired"
      ? "本地服务会话已过期，当前页面可能是旧页面。请重新打开积存金复盘台.app 以恢复导出和原生文件保存。"
      : "当前页面已与本地服务断开。历史批次仍保留在浏览器本地，但导出和 Mac 原生文件保存可能不可用，请重新打开积存金复盘台.app。";

    elements.runtimeBridgeStatus.textContent = message;
    elements.runtimeBridgeStatus.classList.remove("is-hidden");
  }

  return {
    isHistoryDrawerOpen,
    setHistoryDrawerOpen,
    setOcrStatus,
    setRuntimeBridgeStatus,
  };
}
