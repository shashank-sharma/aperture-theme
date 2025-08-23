import type { GalleryConfig, GalleryItem } from "../types";

export const getLabelText = (item: GalleryItem): string => {
  const fromCaption = item.caption?.trim();
  const fromAlt = item.alt?.trim();
  const fromSrc = (() => {
    try {
      const url = new URL(
        item.src,
        typeof window !== "undefined" ? window.location.href : "http://local",
      );
      const name = url.pathname.split("/").pop() || "";
      return name || undefined;
    } catch (_) {
      const parts = (item.src || "").split("/");
      return parts[parts.length - 1] || undefined;
    }
  })();
  return fromCaption || fromAlt || fromSrc || "";
};

export const preloadItems = async (
  list: GalleryItem[],
  poolSize: number,
  concurrency: number,
  onProgress?: (completed: number, total: number) => void
): Promise<void> => {
  const limited = list.slice(0, Math.min(list.length, poolSize * 2));
  const total = Math.max(1, limited.length);
  let completed = 0;

  const loadOne = (m: GalleryItem) =>
    new Promise<void>((resolve) => {
      const finish = () => {
        completed += 1;
        try { onProgress?.(completed, total); } catch {}
        resolve();
      };
      if (m.kind === "image" || m.kind === "yt-video") {
        const img = new Image();
        (img as any).decoding = "async";
        (img as any).loading = "eager";
        img.addEventListener("load", finish, { once: true } as any);
        img.addEventListener("error", finish, { once: true } as any);
        img.src = m.src;
      } else {
        const vid = document.createElement("video");
        vid.preload = "auto";
        vid.muted = true;
        const onDone = () => finish();
        vid.addEventListener("loadeddata", onDone, { once: true });
        vid.addEventListener("error", onDone, { once: true });
        vid.src = m.src;
      }
    });

  let i = 0;
  const runNext = async (): Promise<void> => {
    if (i >= limited.length) return;
    const current = limited[i++];
    await loadOne(current);
    return runNext();
  };
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, runNext));
};

