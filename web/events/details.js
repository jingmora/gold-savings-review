export function bindDetailEvents({
  detailApi,
  detailViewState,
  elements,
  update,
}) {
  const {
    clearEditingRow,
    clearLoadedRows,
    deleteDetailRow,
    openImageLightbox,
    sanitizeInlineEditInput,
    saveEditedDetailRow,
    setEditingRow,
    toggleDetailSort,
  } = detailApi;

  elements.parsedSheetBody.addEventListener("click", (event) => {
    const target = event.target.closest("button[data-action]");
    if (!target) {
      return;
    }

    if (target.dataset.action === "preview" && target.dataset.key) {
      openImageLightbox(target.dataset.key);
      return;
    }

    const meta = {
      sourceType: target.dataset.sourceType,
      rowIndex: target.dataset.rowIndex,
      itemKey: target.dataset.itemKey,
    };

    if (target.dataset.action === "edit-row") {
      setEditingRow(meta, target.dataset.editField || "time");
      return;
    }

    if (target.dataset.action === "delete-row") {
      deleteDetailRow(meta);
      return;
    }

    if (target.dataset.action === "clear-loaded-rows") {
      clearLoadedRows();
    }
  });

  elements.parsedSheetBody.addEventListener("input", (event) => {
    sanitizeInlineEditInput(event.target);
  });

  elements.parsedSheetBody.addEventListener("keydown", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const meta = {
      sourceType: target.dataset.sourceType,
      rowIndex: target.dataset.rowIndex,
      itemKey: target.dataset.itemKey,
    };

    if (event.key === "Enter" && target.dataset.field) {
      event.preventDefault();
      saveEditedDetailRow(meta);
      return;
    }

    if (event.key === "Escape" && target.dataset.field) {
      event.preventDefault();
      clearEditingRow();
      update();
    }
  });

  elements.detailClearLoaded.addEventListener("click", () => {
    clearLoadedRows();
  });

  elements.detailOnlyAnomalies.addEventListener("change", (event) => {
    detailViewState.onlyAnomalies = event.target.checked;
    update();
  });

  elements.detailSortTime.addEventListener("click", () => {
    toggleDetailSort("time");
    update();
  });

  elements.detailSortWeight.addEventListener("click", () => {
    toggleDetailSort("weight");
    update();
  });

  elements.detailSortPrice.addEventListener("click", () => {
    toggleDetailSort("price");
    update();
  });

  elements.detailViewFlat.addEventListener("click", () => {
    clearEditingRow();
    detailViewState.mode = "flat";
    update();
  });

  elements.detailViewByImage.addEventListener("click", () => {
    clearEditingRow();
    detailViewState.mode = "by-image";
    update();
  });
}
