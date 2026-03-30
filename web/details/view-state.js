export function createDetailViewStateApi({
  detailViewState,
  elements,
}) {
  function getSortField(sortValue = detailViewState.sort) {
    return String(sortValue).split("-")[0];
  }

  function getSortDirection(sortValue = detailViewState.sort) {
    return String(sortValue).split("-")[1] || "desc";
  }

  function toggleDetailSort(field) {
    if (getSortField() === field) {
      detailViewState.sort = `${field}-${getSortDirection() === "asc" ? "desc" : "asc"}`;
      return;
    }

    detailViewState.sort = `${field}-${field === "time" ? "desc" : "asc"}`;
  }

  function renderDetailSortIndicators() {
    const activeField = getSortField();
    const activeDirection = getSortDirection();
    const indicatorMap = {
      time: elements.detailSortIndicatorTime,
      weight: elements.detailSortIndicatorWeight,
      price: elements.detailSortIndicatorPrice,
    };
    const buttonMap = {
      time: elements.detailSortTime,
      weight: elements.detailSortWeight,
      price: elements.detailSortPrice,
    };

    Object.entries(indicatorMap).forEach(([field, element]) => {
      const isActive = field === activeField;
      const direction = isActive ? activeDirection : "asc";
      element.textContent = direction === "asc" ? "▲" : "▼";
      element.classList.toggle("active", isActive);
      buttonMap[field]?.classList.toggle("active", isActive);
      buttonMap[field]?.setAttribute(
        "aria-label",
        `${field === "time" ? "成交时间" : field === "weight" ? "克重" : "单价"}，当前${direction === "asc" ? "升序" : "降序"}`
      );
    });
  }

  return {
    getSortField,
    getSortDirection,
    toggleDetailSort,
    renderDetailSortIndicators,
  };
}
