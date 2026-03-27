const RUNTIME_SESSION_ENDPOINT = "/__api/runtime";

function canManageLocalRuntime() {
  return window.location.protocol === "http:" || window.location.protocol === "https:";
}

function buildJsonRequest(path, payload, { keepalive = false } = {}) {
  return fetch(`${RUNTIME_SESSION_ENDPOINT}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(payload),
    keepalive,
  });
}

export function attachRuntimeSession({ onStatusChange } = {}) {
  if (!canManageLocalRuntime()) {
    onStatusChange?.({ connected: false, reason: "unsupported" });
    return () => {};
  }

  let sessionId = "";
  let heartbeatTimer = 0;
  let reconnectTimer = 0;
  let isClosed = false;
  let currentStatus = "unknown";

  const emitStatus = (connected, reason = "") => {
    const nextStatus = connected ? "connected" : "disconnected";
    if (currentStatus === nextStatus && !reason) {
      return;
    }
    currentStatus = nextStatus;
    onStatusChange?.({ connected, reason });
  };

  const stopHeartbeat = () => {
    if (heartbeatTimer) {
      window.clearInterval(heartbeatTimer);
      heartbeatTimer = 0;
    }
  };

  const stopReconnect = () => {
    if (reconnectTimer) {
      window.clearTimeout(reconnectTimer);
      reconnectTimer = 0;
    }
  };

  const scheduleReconnect = () => {
    if (reconnectTimer || isClosed) {
      return;
    }
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = 0;
      void startSession();
    }, 5000);
  };

  const sendCloseBeacon = () => {
    if (!sessionId) {
      return;
    }

    const payload = JSON.stringify({ sessionId });
    if (navigator.sendBeacon) {
      const blob = new Blob([payload], { type: "application/json; charset=utf-8" });
      navigator.sendBeacon(`${RUNTIME_SESSION_ENDPOINT}/session-close`, blob);
      return;
    }

    void buildJsonRequest("/session-close", { sessionId }, { keepalive: true }).catch(() => {});
  };

  const closeSession = () => {
    if (isClosed) {
      return;
    }

    isClosed = true;
    stopHeartbeat();
    stopReconnect();
    window.removeEventListener("pagehide", closeSession);
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    sendCloseBeacon();
  };

  const pingSession = async () => {
    if (!sessionId || isClosed) {
      return;
    }

    try {
      const response = await buildJsonRequest("/session-ping", { sessionId });
      if (!response.ok && response.status === 404) {
        sessionId = "";
        stopHeartbeat();
        emitStatus(false, "expired");
        scheduleReconnect();
      }
    } catch {
      sessionId = "";
      stopHeartbeat();
      emitStatus(false, "bridge-unavailable");
      scheduleReconnect();
    }
  };

  const handleVisibilityChange = () => {
    if (document.visibilityState === "hidden") {
      void pingSession();
    }
  };

  const startSession = async () => {
    if (isClosed) {
      return;
    }

    try {
      const response = await buildJsonRequest("/session-open", {});
      if (!response.ok) {
        emitStatus(false, "bridge-unavailable");
        scheduleReconnect();
        return;
      }

      const payload = await response.json().catch(() => null);
      if (!payload?.ok || !payload?.sessionId) {
        emitStatus(false, "bridge-unavailable");
        scheduleReconnect();
        return;
      }

      stopReconnect();
      sessionId = payload.sessionId;
      emitStatus(true);

      const intervalMs = Number(payload.heartbeatIntervalMs) || 5000;
      heartbeatTimer = window.setInterval(() => {
        void pingSession();
      }, intervalMs);

      window.addEventListener("pagehide", closeSession);
      document.addEventListener("visibilitychange", handleVisibilityChange);
    } catch {
      emitStatus(false, "bridge-unavailable");
      scheduleReconnect();
    }
  };

  void startSession();
  return closeSession;
}
