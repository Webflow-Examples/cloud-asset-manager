import type { Asset } from "@/lib/asset-types";

export const TINY_THUMBNAIL_HEIGHT = 38;
export const MEDIUM_THUMBNAIL_HEIGHT = 330;

const THUMBNAIL_QUALITY = 0.82;

function assetKindFromFile(file: File): Asset["kind"] {
  const lowerType = (file.type || "").toLowerCase();
  const lowerName = file.name.toLowerCase();

  if (lowerType.startsWith("image/")) return "image";
  if (lowerType.startsWith("video/")) return "video";
  if (lowerType === "application/pdf" || lowerName.endsWith(".pdf")) return "pdf";
  if (
    lowerType.includes("model") ||
    [".glb", ".gltf", ".obj", ".fbx", ".stl", ".usdz"].some((ext) => lowerName.endsWith(ext))
  ) {
    return "model";
  }
  if (lowerType.startsWith("text/") || lowerType.includes("json") || lowerType.includes("xml")) {
    return "text";
  }
  if ([".zip", ".tar", ".gz", ".rar", ".7z"].some((ext) => lowerName.endsWith(ext))) {
    return "archive";
  }
  return "file";
}

async function imageSourceFromFile(file: File) {
  if ("createImageBitmap" in window) {
    try {
      return await createImageBitmap(file);
    } catch {
      // Fall back to HTMLImageElement decoding for formats not handled by createImageBitmap.
    }
  }

  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Could not decode image thumbnail."));
    };
    image.src = objectUrl;
  });
}

function drawThumbnailCanvas(
  source: CanvasImageSource,
  width: number,
  height: number,
  targetHeight: number,
) {
  if (!width || !height) {
    return null;
  }

  const canvas = document.createElement("canvas");
  const targetWidth = Math.max(1, Math.round((width / height) * targetHeight));
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const context = canvas.getContext("2d");

  if (!context) {
    return null;
  }

  context.drawImage(source, 0, 0, width, height, 0, 0, targetWidth, targetHeight);
  return canvas;
}

async function thumbnailFileFromCanvas(canvas: HTMLCanvasElement, targetHeight: number) {
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/webp", THUMBNAIL_QUALITY);
  });

  if (!blob) return null;

  return new globalThis.File([blob], `thumbnail-${targetHeight}.webp`, {
    type: blob.type || "image/webp",
  });
}

async function imageThumbnailCanvas(file: File, targetHeight: number) {
  const source = await imageSourceFromFile(file);

  try {
    return drawThumbnailCanvas(source, source.width, source.height, targetHeight);
  } finally {
    if ("close" in source) source.close();
  }
}

async function pdfThumbnailCanvas(file: File, targetHeight: number) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc ||= new URL(
    "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();
  const data = new Uint8Array(await file.arrayBuffer());
  const documentTask = pdfjs.getDocument({ data });
  const pdfDocument = await documentTask.promise;

  try {
    const page = await pdfDocument.getPage(1);
    const viewport = page.getViewport({ scale: 1 });

    if (!viewport.width || !viewport.height) return null;

    const scale = targetHeight / viewport.height;
    const scaledViewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(scaledViewport.width));
    canvas.height = Math.max(1, Math.round(scaledViewport.height));

    await page.render({
      canvas,
      viewport: scaledViewport,
    }).promise;

    return canvas;
  } finally {
    await pdfDocument.destroy();
  }
}

async function videoThumbnailCanvas(file: File, targetHeight: number) {
  return new Promise<HTMLCanvasElement | null>((resolve, reject) => {
    const video = document.createElement("video");
    const objectUrl = URL.createObjectURL(file);
    let settled = false;

    const cleanup = () => {
      URL.revokeObjectURL(objectUrl);
      video.removeAttribute("src");
      video.load();
    };

    const finish = (canvas: HTMLCanvasElement | null) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(canvas);
    };

    const fail = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error("Could not decode video thumbnail."));
    };

    const captureFrame = () => {
      const canvas = drawThumbnailCanvas(
        video,
        video.videoWidth,
        video.videoHeight,
        targetHeight,
      );
      finish(canvas);
    };

    video.muted = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.addEventListener("error", fail, { once: true });
    video.addEventListener(
      "loadedmetadata",
      () => {
        const duration = Number.isFinite(video.duration) ? video.duration : 0;
        const seekTime = duration > 1 ? 1 : 0;

        if (seekTime > 0) {
          video.addEventListener("seeked", captureFrame, { once: true });
          video.currentTime = seekTime;
          return;
        }

        captureFrame();
      },
      { once: true },
    );
    video.src = objectUrl;
  });
}

export async function createAssetThumbnail(file: File, targetHeight: number) {
  const kind = assetKindFromFile(file);
  let canvas: HTMLCanvasElement | null = null;

  if (kind === "image") {
    canvas = await imageThumbnailCanvas(file, targetHeight);
  } else if (kind === "pdf") {
    canvas = await pdfThumbnailCanvas(file, targetHeight);
  } else if (kind === "video") {
    canvas = await videoThumbnailCanvas(file, targetHeight);
  }

  if (!canvas) return null;

  return thumbnailFileFromCanvas(canvas, targetHeight);
}
