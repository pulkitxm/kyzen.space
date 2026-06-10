import { afterEach, describe, expect, it } from "bun:test";
import { isValidTheme, type ThemeId } from "@gamelobby/shared/types";
import { rawAppearanceStorage } from "../lib/appearance-atoms";

type Listener = (e: {
  key: string | null;
  newValue: string | null;
  storageArea: unknown;
}) => void;

function makeWindow() {
  const data = new Map<string, string>();
  const listeners = new Set<Listener>();
  const localStorageMock = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
  };
  const windowMock = {
    localStorage: localStorageMock,
    addEventListener: (_type: string, fn: Listener) => {
      listeners.add(fn);
    },
    removeEventListener: (_type: string, fn: Listener) => {
      listeners.delete(fn);
    },
  };
  return { data, listeners, windowMock };
}

const realWindow = (globalThis as { window?: unknown }).window;

afterEach(() => {
  if (realWindow === undefined) {
    delete (globalThis as { window?: unknown }).window;
  } else {
    (globalThis as { window?: unknown }).window = realWindow;
  }
});

describe("rawAppearanceStorage", () => {
  const storage = rawAppearanceStorage<ThemeId>(isValidTheme);

  it("returns the initial value without a window", () => {
    delete (globalThis as { window?: unknown }).window;
    expect(storage.getItem("gl-palette", "amber")).toBe("amber");
  });

  it("reads stored values raw, without JSON quoting", () => {
    const { data, windowMock } = makeWindow();
    (globalThis as { window?: unknown }).window = windowMock;
    data.set("gl-palette", "violet");
    expect(storage.getItem("gl-palette", "amber")).toBe("violet");
  });

  it("falls back to the initial value for invalid stored values", () => {
    const { data, windowMock } = makeWindow();
    (globalThis as { window?: unknown }).window = windowMock;
    data.set("gl-palette", '"violet"');
    expect(storage.getItem("gl-palette", "amber")).toBe("amber");
    data.set("gl-palette", "neon");
    expect(storage.getItem("gl-palette", "amber")).toBe("amber");
  });

  it("writes values raw so the boot scripts can read them", () => {
    const { data, windowMock } = makeWindow();
    (globalThis as { window?: unknown }).window = windowMock;
    storage.setItem("gl-palette", "rose");
    expect(data.get("gl-palette")).toBe("rose");
  });

  it("notifies subscribers for matching cross-tab storage events", () => {
    const { listeners, windowMock } = makeWindow();
    (globalThis as { window?: unknown }).window = windowMock;
    const seen: string[] = [];
    const unsubscribe = storage.subscribe(
      "gl-palette",
      (v) => {
        seen.push(v);
      },
      "amber",
    );
    const fire = (key: string, newValue: string | null, area?: unknown) => {
      for (const fn of listeners)
        fn({
          key,
          newValue,
          storageArea: area ?? windowMock.localStorage,
        });
    };
    fire("gl-palette", "csk");
    fire("gl-pattern", "space");
    fire("gl-palette", "garbage");
    fire("gl-palette", "rose", {});
    fire("gl-palette", null);
    expect(seen).toEqual(["csk", "amber", "amber"]);
    unsubscribe();
    fire("gl-palette", "violet");
    expect(seen).toEqual(["csk", "amber", "amber"]);
  });
});
