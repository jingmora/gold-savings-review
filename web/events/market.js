export function bindMarketEvents({
  elements,
  setLivePriceSpreads,
}) {
  function commitLivePriceSpreads() {
    setLivePriceSpreads({
      buySpread: elements.buySpreadInput.value,
      sellSpread: elements.sellSpreadInput.value,
    });
  }

  elements.buySpreadInput.addEventListener("input", commitLivePriceSpreads);
  elements.sellSpreadInput.addEventListener("input", commitLivePriceSpreads);
}
