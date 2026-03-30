export function bindCaptureEvents({
  captureApi,
  elements,
  imageState,
}) {
  const {
    addImageFiles,
    clearImageSelection,
    openImageLightbox,
    recognizeSelectedImage,
    removeImage,
    setDropzoneActive,
  } = captureApi;

  elements.imageInput.addEventListener("change", (event) => {
    addImageFiles(event.target.files);
  });

  elements.imageDropzone.addEventListener("click", () => {
    elements.imageInput.click();
  });

  elements.imageDropzone.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      elements.imageInput.click();
    }
  });

  ["dragenter", "dragover"].forEach((eventName) => {
    elements.imageDropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      setDropzoneActive(true);
    });
  });

  ["dragleave", "dragend"].forEach((eventName) => {
    elements.imageDropzone.addEventListener(eventName, () => {
      setDropzoneActive(false);
    });
  });

  elements.imageDropzone.addEventListener("drop", (event) => {
    event.preventDefault();
    setDropzoneActive(false);
    addImageFiles(event.dataTransfer?.files);
  });

  elements.imagePreview.addEventListener("click", async (event) => {
    const target = event.target.closest("button[data-action]");
    if (!target) {
      return;
    }

    const { action, key } = target.dataset;
    if (action === "preview") {
      openImageLightbox(key);
      return;
    }

    if (imageState.processing) {
      return;
    }

    if (action === "remove") {
      removeImage(key);
      return;
    }

    if (action === "retry") {
      await recognizeSelectedImage([key]);
    }
  });

  elements.recognizeImage.addEventListener("click", async () => {
    await recognizeSelectedImage();
  });

  elements.clearImage.addEventListener("click", () => {
    clearImageSelection();
  });

  document.addEventListener("paste", (event) => {
    const items = event.clipboardData?.items || [];
    const pastedFiles = [];

    for (const item of items) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) {
          pastedFiles.push(file);
        }
      }
    }

    if (pastedFiles.length) {
      addImageFiles(pastedFiles);
    }
  });
}
