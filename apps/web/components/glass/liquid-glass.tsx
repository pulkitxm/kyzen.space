"use client";

import { useEffect, useState } from "react";
import { useGlassMode } from "@/lib/appearance";
import {
  computeLensDisplacementPixels,
  LENS_MAX_AREA,
  LENS_MIN_SIZE,
  LENS_SCALE_B,
  LENS_SCALE_G,
  LENS_SCALE_R,
} from "@/lib/glass-lens";

const SVG_NS = "http://www.w3.org/2000/svg";
const FILTER_CACHE_LIMIT = 32;

let lensSupport: boolean | null = null;

function supportsLens(): boolean {
  if (lensSupport !== null) return lensSupport;
  lensSupport =
    typeof window !== "undefined" &&
    typeof CSS !== "undefined" &&
    /Chrom(e|ium)/.test(navigator.userAgent) &&
    (CSS.supports("backdrop-filter", "url(#gl)") ||
      CSS.supports("-webkit-backdrop-filter", "url(#gl)"));
  return lensSupport;
}

function lensMapDataUrl(w: number, h: number, radius: number): string {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d canvas unavailable");
  const image = new ImageData(
    computeLensDisplacementPixels(w, h, radius),
    w,
    h,
  );
  ctx.putImageData(image, 0, 0);
  return canvas.toDataURL();
}

function channelMatrix(channel: 0 | 1 | 2): string {
  const rows = ["0 0 0 0 0", "0 0 0 0 0", "0 0 0 0 0", "0 0 0 1 0"];
  rows[channel] = ["1 0 0 0 0", "0 1 0 0 0", "0 0 1 0 0"][channel];
  return rows.join("  ");
}

let svgHost: SVGSVGElement | null = null;
const filterIds = new Map<string, string>();

function ensureSvgHost(): SVGSVGElement {
  if (svgHost?.isConnected) return svgHost;
  svgHost = document.createElementNS(SVG_NS, "svg");
  svgHost.setAttribute("width", "0");
  svgHost.setAttribute("height", "0");
  svgHost.setAttribute("aria-hidden", "true");
  svgHost.style.position = "absolute";
  document.body.appendChild(svgHost);
  return svgHost;
}

function appendDisplacement(
  filter: SVGElement,
  scale: number,
  channel: 0 | 1 | 2,
  result: string,
): void {
  const displace = document.createElementNS(SVG_NS, "feDisplacementMap");
  displace.setAttribute("in", "SourceGraphic");
  displace.setAttribute("in2", "map");
  displace.setAttribute("scale", String(scale));
  displace.setAttribute("xChannelSelector", "R");
  displace.setAttribute("yChannelSelector", "G");
  displace.setAttribute("result", `d${result}`);
  filter.appendChild(displace);

  const matrix = document.createElementNS(SVG_NS, "feColorMatrix");
  matrix.setAttribute("in", `d${result}`);
  matrix.setAttribute("type", "matrix");
  matrix.setAttribute("values", channelMatrix(channel));
  matrix.setAttribute("result", result);
  filter.appendChild(matrix);
}

function appendAdd(
  filter: SVGElement,
  a: string,
  b: string,
  result?: string,
): void {
  const composite = document.createElementNS(SVG_NS, "feComposite");
  composite.setAttribute("in", a);
  composite.setAttribute("in2", b);
  composite.setAttribute("operator", "arithmetic");
  composite.setAttribute("k1", "0");
  composite.setAttribute("k2", "1");
  composite.setAttribute("k3", "1");
  composite.setAttribute("k4", "0");
  if (result) composite.setAttribute("result", result);
  filter.appendChild(composite);
}

function ensureLensFilter(w: number, h: number, radius: number): string {
  const key = `${w}x${h}r${radius}`;
  const cached = filterIds.get(key);
  if (cached && svgHost?.isConnected) {
    filterIds.delete(key);
    filterIds.set(key, cached);
    return cached;
  }

  const host = ensureSvgHost();
  if (filterIds.size >= FILTER_CACHE_LIMIT) {
    const [oldestKey, oldestId] = filterIds.entries().next().value as [
      string,
      string,
    ];
    host.querySelector(`#${oldestId}`)?.remove();
    filterIds.delete(oldestKey);
  }

  const id = `gl-lens-${key}`;
  const filter = document.createElementNS(SVG_NS, "filter");
  filter.setAttribute("id", id);
  filter.setAttribute("filterUnits", "userSpaceOnUse");
  filter.setAttribute("x", "0");
  filter.setAttribute("y", "0");
  filter.setAttribute("width", String(w));
  filter.setAttribute("height", String(h));
  filter.setAttribute("color-interpolation-filters", "sRGB");

  const feImage = document.createElementNS(SVG_NS, "feImage");
  feImage.setAttribute("href", lensMapDataUrl(w, h, radius));
  feImage.setAttribute("x", "0");
  feImage.setAttribute("y", "0");
  feImage.setAttribute("width", String(w));
  feImage.setAttribute("height", String(h));
  feImage.setAttribute("preserveAspectRatio", "none");
  feImage.setAttribute("result", "map");
  filter.appendChild(feImage);

  appendDisplacement(filter, LENS_SCALE_R, 0, "red");
  appendDisplacement(filter, LENS_SCALE_G, 1, "green");
  appendDisplacement(filter, LENS_SCALE_B, 2, "blue");
  appendAdd(filter, "red", "green", "rg");
  appendAdd(filter, "rg", "blue");

  host.appendChild(filter);
  filterIds.set(key, id);
  return id;
}

function readCornerRadius(el: HTMLElement, w: number, h: number): number {
  const raw = getComputedStyle(el).borderTopLeftRadius;
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed)) return Math.min(16, w / 2, h / 2);
  const px = raw.trim().endsWith("%")
    ? (parsed / 100) * Math.min(w, h)
    : parsed;
  return Math.min(px, w / 2, h / 2);
}

function applyLens(el: HTMLElement): void {
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  if (w < LENS_MIN_SIZE || h < LENS_MIN_SIZE || w * h > LENS_MAX_AREA) {
    el.style.removeProperty("backdrop-filter");
    el.style.removeProperty("-webkit-backdrop-filter");
    return;
  }
  try {
    const id = ensureLensFilter(w, h, Math.round(readCornerRadius(el, w, h)));
    const value = `url(#${id}) blur(2px) saturate(var(--glass-saturate, 170%)) brightness(var(--glass-brighten, 1.05))`;
    el.style.setProperty("backdrop-filter", value);
    el.style.setProperty("-webkit-backdrop-filter", value);
  } catch (err) {
    console.warn("Liquid glass lens disabled for element", err);
  }
}

const RESIZE_SETTLE_MS = 150;

function attachLens(el: HTMLElement): () => void {
  let settle: ReturnType<typeof setTimeout> | null = null;
  const observer = new ResizeObserver(() => {
    if (settle) clearTimeout(settle);
    settle = setTimeout(() => applyLens(el), RESIZE_SETTLE_MS);
  });
  observer.observe(el);
  applyLens(el);
  return () => {
    observer.disconnect();
    if (settle) clearTimeout(settle);
    el.style.removeProperty("backdrop-filter");
    el.style.removeProperty("-webkit-backdrop-filter");
  };
}

export function useLiquidLens<T extends HTMLElement>(): (
  node: T | null,
) => void {
  const { glass } = useGlassMode();
  const [node, setNode] = useState<T | null>(null);

  useEffect(() => {
    if (!node || glass === "off" || !supportsLens()) return;
    const media = window.matchMedia("(prefers-reduced-transparency: reduce)");
    let detach: (() => void) | null = null;
    const sync = () => {
      if (media.matches) {
        detach?.();
        detach = null;
      } else if (!detach) {
        detach = attachLens(node);
      }
    };
    sync();
    media.addEventListener("change", sync);
    return () => {
      media.removeEventListener("change", sync);
      detach?.();
      detach = null;
    };
  }, [node, glass]);

  return setNode;
}
