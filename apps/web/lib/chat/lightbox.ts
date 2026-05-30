"use client";

// Opens a single image/GIF in a PhotoSwipe lightbox. PhotoSwipe is heavy and
// only needed on click, so it's dynamically imported here (kept out of the
// initial chat bundle). The stylesheet is imported statically by the caller.
export async function openImageLightbox({
  src,
  width,
  height,
  alt,
}: {
  src: string;
  width: number;
  height: number;
  alt?: string;
}): Promise<void> {
  const { default: PhotoSwipe } = await import("photoswipe");
  const pswp = new PhotoSwipe({
    dataSource: [
      {
        src,
        // Fall back to a sane square if the provider omitted dimensions.
        width: width > 0 ? width : 480,
        height: height > 0 ? height : 480,
        alt: alt ?? "",
      },
    ],
    index: 0,
    bgOpacity: 0.92,
    showHideAnimationType: "zoom",
    // GIFs are usually small; allow zooming in to inspect them.
    initialZoomLevel: "fit",
    secondaryZoomLevel: 2,
    maxZoomLevel: 4,
  });
  pswp.init();
}
