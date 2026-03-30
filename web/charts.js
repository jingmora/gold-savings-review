const CHART_COLOR_PRIMARY = "#3b82f6";
const CHART_COLOR_PRIMARY_FILL = "rgba(59, 130, 246, 0.7)";
const CHART_COLOR_SECONDARY = "#10b981";
const CHART_COLOR_SECONDARY_FILL = "rgba(16, 185, 129, 0.7)";

export function createChartsApi({
  chartState,
  elements,
  buildDailySummaryFromRows,
  buildPriceDistribution,
  getDisplayRows,
}) {
  let lastRowsSignature = null;

  function buildRowsSignature(rows) {
    return (rows || [])
      .map((row) => [row.time || "", row.direction || "", row.weight || "", row.price || ""].join("|"))
      .join("\n");
  }

  function destroyChart(key) {
    const instance = chartState.instances[key];
    if (instance) {
      instance.destroy();
      delete chartState.instances[key];
    }
  }

  function setChartEmpty(canvas, isEmpty) {
    const shell = canvas?.closest(".chart-shell");
    if (!shell) {
      return;
    }
    shell.classList.toggle("is-empty", isEmpty);
  }

  function buildChartOptions() {
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        intersect: false,
        mode: "index",
      },
      animation: {
        duration: 420,
        easing: "easeOutCubic",
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "rgba(31, 41, 55, 0.95)",
          titleColor: "#ffffff",
          bodyColor: "#ffffff",
          cornerRadius: 8,
          padding: 10,
          displayColors: false,
          titleFont: { size: 12 },
          bodyFont: { size: 13 },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: "#6b7280",
            maxRotation: 0,
            autoSkip: true,
            padding: 8,
            font: { size: 11 },
          },
          border: { display: false },
        },
        y: {
          grid: {
            color: "rgba(31, 41, 55, 0.06)",
            drawBorder: false,
          },
          ticks: {
            color: "#6b7280",
            padding: 6,
            font: { size: 11 },
            callback: (value) => Number(value).toLocaleString("zh-CN"),
          },
          border: { display: false },
        },
      },
    };
  }

  function getFiniteChartValues(values) {
    return values.filter((value) => Number.isFinite(value));
  }

  function buildTightYAxisRange(values, { paddingRatio = 0.08, minSpan = 10 } = {}) {
    const numericValues = getFiniteChartValues(values);
    if (!numericValues.length) {
      return null;
    }

    const minValue = Math.min(...numericValues);
    const maxValue = Math.max(...numericValues);
    const span = maxValue - minValue;
    const padding = Math.max(span * paddingRatio, minSpan);

    if (span === 0) {
      return {
        min: Math.max(0, minValue - padding),
        max: maxValue + padding,
      };
    }

    return {
      min: Math.max(0, minValue - padding),
      max: maxValue + padding,
    };
  }

  function getNiceStep(value) {
    if (value <= 0) {
      return 1;
    }

    const magnitude = 10 ** Math.floor(Math.log10(value));
    const normalized = value / magnitude;

    if (normalized <= 1) {
      return magnitude;
    }
    if (normalized <= 2) {
      return 2 * magnitude;
    }
    if (normalized <= 5) {
      return 5 * magnitude;
    }
    return 10 * magnitude;
  }

  function buildRoundedYAxisRange(values, { tickCount = 5, paddingRatio = 0.08, minSpan = 10 } = {}) {
    const range = buildTightYAxisRange(values, { paddingRatio, minSpan });
    if (!range) {
      return null;
    }

    const rawSpan = Math.max(range.max - range.min, minSpan);
    const step = getNiceStep(rawSpan / tickCount);
    const min = Math.max(0, Math.floor(range.min / step) * step);
    const max = Math.ceil(range.max / step) * step;

    return {
      min,
      max,
      step,
    };
  }

  function renderChartWithDatasets(key, canvas, { type, labels, datasets, options }) {
    if (!labels.length || !datasets.length) {
      destroyChart(key);
      if (canvas) {
        setChartEmpty(canvas, true);
      }
      return;
    }

    renderSingleChart(key, canvas, {
      type,
      data: { labels, datasets },
      options,
    });
  }

  function renderSingleChart(key, canvas, config) {
    const ChartClass = window.Chart;
    if (!ChartClass || !canvas || !config.data.labels.length) {
      destroyChart(key);
      if (canvas) {
        setChartEmpty(canvas, true);
      }
      return;
    }

    setChartEmpty(canvas, false);
    destroyChart(key);
    chartState.instances[key] = new ChartClass(canvas, config);
  }

  function renderCharts() {
    const rows = getDisplayRows();
    const nextSignature = buildRowsSignature(rows);
    if (nextSignature === lastRowsSignature) {
      return;
    }

    lastRowsSignature = nextSignature;
    const dailyRows = buildDailySummaryFromRows(rows);
    const distributionRows = buildPriceDistribution(rows);
    const options = buildChartOptions();
    const dailyLabels = dailyRows.map((row) => row.label);
    const distributionLabels = distributionRows.map((row) => row.label);
    const buyDailyWeights = dailyRows.map((row) => Number(row.buyWeight.toFixed(4)));
    const sellDailyWeights = dailyRows.map((row) => Number(row.sellWeight.toFixed(4)));
    const buyAverageValues = dailyRows.map((row) => (row.buyWeight > 0 ? Number(row.buyAvgPrice.toFixed(2)) : null));
    const sellAverageValues = dailyRows.map((row) => (row.sellWeight > 0 ? Number(row.sellAvgPrice.toFixed(2)) : null));
    const buyDistributionValues = distributionRows.map((row) => Number(row.buyWeight.toFixed(4)));
    const sellDistributionValues = distributionRows.map((row) => Number(row.sellWeight.toFixed(4)));
    const averageRange = buildRoundedYAxisRange([
      ...getFiniteChartValues(buyAverageValues),
      ...getFiniteChartValues(sellAverageValues),
    ]);

    renderChartWithDatasets("amount", elements.chartAmount, {
      type: "bar",
      labels: dailyLabels,
      datasets: [
        {
          label: "买入成交克重",
          data: buyDailyWeights,
          backgroundColor: CHART_COLOR_PRIMARY_FILL,
          borderColor: CHART_COLOR_PRIMARY,
          borderWidth: 1,
          borderRadius: 6,
          maxBarThickness: 36,
          borderSkipped: false,
        },
      ],
      options: {
        ...options,
        plugins: {
          ...options.plugins,
          legend: {
            display: true,
            position: "bottom",
            labels: {
              color: "#6b7280",
              usePointStyle: true,
              boxWidth: 8,
              boxHeight: 8,
              padding: 12,
            },
          },
        },
        scales: {
          ...options.scales,
          y: {
            ...options.scales.y,
            beginAtZero: true,
          },
        },
      },
    });

    const averageDatasets = [];
    if (getFiniteChartValues(buyAverageValues).length) {
      averageDatasets.push({
        label: "买入均价",
        data: buyAverageValues,
        borderColor: CHART_COLOR_PRIMARY,
        borderWidth: 2,
        backgroundColor: CHART_COLOR_PRIMARY_FILL,
        pointRadius: 2,
        pointHoverRadius: 3,
        pointBackgroundColor: "#ffffff",
        pointBorderWidth: 2,
        tension: 0.24,
        fill: false,
        spanGaps: true,
      });
    }
    if (getFiniteChartValues(sellAverageValues).length) {
      averageDatasets.push({
        label: "卖出均价",
        data: sellAverageValues,
        borderColor: CHART_COLOR_SECONDARY,
        borderWidth: 2,
        backgroundColor: CHART_COLOR_SECONDARY_FILL,
        pointRadius: 2,
        pointHoverRadius: 3,
        pointBackgroundColor: "#ffffff",
        pointBorderWidth: 2,
        tension: 0.24,
        fill: false,
        spanGaps: true,
        borderDash: [6, 4],
      });
    }
    renderChartWithDatasets("average", elements.chartAverage, {
      type: "line",
      labels: dailyLabels,
      datasets: averageDatasets,
      options: {
        ...options,
        plugins: {
          ...options.plugins,
          legend: {
            display: averageDatasets.length > 0,
            position: "bottom",
            labels: {
              color: "#6b7280",
              usePointStyle: true,
              boxWidth: 8,
              boxHeight: 8,
              padding: 12,
            },
          },
        },
        scales: {
          ...options.scales,
          y: {
            ...options.scales.y,
            beginAtZero: false,
            min: averageRange?.min,
            max: averageRange?.max,
            ticks: {
              ...options.scales.y.ticks,
              stepSize: averageRange?.step,
            },
          },
        },
      },
    });

    renderChartWithDatasets("weight", elements.chartWeight, {
      type: "bar",
      labels: dailyLabels,
      datasets: [
        {
          label: "卖出成交克重",
          data: sellDailyWeights,
          backgroundColor: CHART_COLOR_SECONDARY_FILL,
          borderColor: CHART_COLOR_SECONDARY,
          borderWidth: 1,
          borderRadius: 6,
          maxBarThickness: 36,
          borderSkipped: false,
        },
      ],
      options: {
        ...options,
        plugins: {
          ...options.plugins,
          legend: {
            display: true,
            position: "bottom",
            labels: {
              color: "#6b7280",
              usePointStyle: true,
              boxWidth: 8,
              boxHeight: 8,
              padding: 12,
            },
          },
        },
        scales: {
          ...options.scales,
          y: {
            ...options.scales.y,
            beginAtZero: true,
          },
        },
      },
    });

    const distributionDatasets = [];
    if (buyDistributionValues.some((value) => value > 0)) {
      distributionDatasets.push({
        label: "买入克重",
        data: buyDistributionValues,
        backgroundColor: CHART_COLOR_PRIMARY_FILL,
        borderRadius: 6,
        maxBarThickness: 32,
        borderSkipped: false,
      });
    }
    if (sellDistributionValues.some((value) => value > 0)) {
      distributionDatasets.push({
        label: "卖出克重",
        data: sellDistributionValues,
        backgroundColor: CHART_COLOR_SECONDARY_FILL,
        borderRadius: 6,
        maxBarThickness: 32,
        borderSkipped: false,
      });
    }
    renderChartWithDatasets("distribution", elements.chartDistribution, {
      type: "bar",
      labels: distributionLabels,
      datasets: distributionDatasets,
      options: {
        ...options,
        plugins: {
          ...options.plugins,
          legend: {
            display: distributionDatasets.length > 0,
            position: "bottom",
            labels: {
              color: "#6b7280",
              usePointStyle: true,
              boxWidth: 8,
              boxHeight: 8,
              padding: 12,
            },
          },
        },
        scales: {
          ...options.scales,
          y: {
            ...options.scales.y,
            beginAtZero: true,
          },
        },
      },
    });
  }

  return {
    renderCharts,
  };
}
