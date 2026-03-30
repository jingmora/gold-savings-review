import { bindCaptureEvents } from "./capture.js";
import { bindDetailEvents } from "./details.js";
import { bindGlobalEvents } from "./global.js";
import { bindHistoryEvents } from "./history.js";
import { bindMarketEvents } from "./market.js";

export function bindAppEvents({
  captureApi,
  detailApi,
  detailViewState,
  elements,
  historyApi,
  imageState,
  isHistoryDrawerOpen,
  setHistoryDrawerOpen,
  setLivePriceSpreads,
  setOcrStatus,
  state,
  transferApi,
  update,
  workspaceState,
}) {
  bindCaptureEvents({
    captureApi,
    elements,
    imageState,
  });
  bindDetailEvents({
    detailApi: {
      ...detailApi,
      openImageLightbox: captureApi.openImageLightbox,
    },
    detailViewState,
    elements,
    update,
  });
  bindHistoryEvents({
    elements,
    historyApi,
    imageState,
    setHistoryDrawerOpen,
    setOcrStatus,
    state,
    transferApi,
    workspaceState,
  });
  bindMarketEvents({
    elements,
    setLivePriceSpreads,
  });
  bindGlobalEvents({
    closeImageLightbox: captureApi.closeImageLightbox,
    elements,
    isHistoryDrawerOpen,
    setHistoryDrawerOpen,
  });
}
