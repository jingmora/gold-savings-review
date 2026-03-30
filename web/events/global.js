export function bindGlobalEvents({
  closeImageLightbox,
  elements,
  isHistoryDrawerOpen,
  setHistoryDrawerOpen,
}) {
  elements.lightbox.addEventListener("click", (event) => {
    const target = event.target.closest("[data-action='close-lightbox']");
    if (target || event.target === elements.lightbox) {
      closeImageLightbox();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !elements.lightbox.classList.contains("is-hidden")) {
      closeImageLightbox();
      return;
    }

    if (event.key === "Escape" && isHistoryDrawerOpen()) {
      setHistoryDrawerOpen(false);
    }
  });
}
