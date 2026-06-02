"use client";

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
        width: width > 0 ? width : 480,
        height: height > 0 ? height : 480,
        alt: alt ?? "",
      },
    ],
    index: 0,
    bgOpacity: 0.92,
    showHideAnimationType: "zoom",
    initialZoomLevel: "fit",
    secondaryZoomLevel: 2,
    maxZoomLevel: 4,
  });
  pswp.init();
}
