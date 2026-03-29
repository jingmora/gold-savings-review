export const state = {
  currentBatchId: null,
  currentBatchName: "",
  currentBatchCreatedAt: "",
  currentBatchUpdatedAt: "",
};

export const imageState = {
  items: [],
  processing: false,
};

export const workspaceState = {
  baseRows: [],
  batches: [],
  db: null,
  dirty: false,
};

export const chartState = {
  instances: {},
};

export const ocrEngineState = {
  checked: false,
  available: false,
  mode: "",
};

export const marketState = {
  status: "idle",
  quote: null,
  error: "",
  refreshTimerId: null,
  buySpread: 0,
  sellSpread: 0,
};

export const detailViewState = {
  sort: "time-desc",
  mode: "flat",
  onlyAnomalies: false,
  editingKey: null,
  editingField: null,
};
