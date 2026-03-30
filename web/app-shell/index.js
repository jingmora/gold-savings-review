import { createShellMarketApi } from "./market.js";
import { createShellPersistenceApi } from "./persistence.js";
import { createShellStatusApi } from "./status.js";
import { createShellWorkspaceApi } from "./workspace.js";

export function createAppShellApi({
  detailViewState,
  elements,
  imageState,
  marketState,
  state,
  update,
  workspaceState,
  getDisplayRows,
} = {}) {
  const statusApi = createShellStatusApi({
    elements,
  });
  const workspaceApi = createShellWorkspaceApi({
    imageState,
    setOcrStatus: statusApi.setOcrStatus,
    state,
    workspaceState,
  });
  const persistenceApi = createShellPersistenceApi({
    detailViewState,
    marketState,
    state,
  });
  const marketApi = createShellMarketApi({
    getDisplayRows,
    marketState,
    update,
  });

  return {
    ...workspaceApi,
    ...persistenceApi,
    ...statusApi,
    ...marketApi,
  };
}
