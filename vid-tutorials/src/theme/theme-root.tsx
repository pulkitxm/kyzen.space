import { DEFAULT_THEME, THEMES } from "@kyzen/shared/constants";
import type { ThemeId } from "@kyzen/shared/types";
import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill } from "remotion";
import { fontSans } from "./fonts";

type ThemeMode = "light" | "dark";

type ThemeRootProps = {
  children: ReactNode;
  themeId?: ThemeId;
  mode?: ThemeMode;
  style?: CSSProperties;
};

export const ThemeRoot = ({
  children,
  themeId = DEFAULT_THEME,
  mode = "dark",
  style,
}: ThemeRootProps) => {
  const theme = THEMES.find((entry) => entry.id === themeId);
  const themeVars = {
    "--d": theme?.deep ?? "#1a0f04",
    "--v": theme?.vivid ?? "#e0921f",
  } as CSSProperties;
  return (
    <AbsoluteFill
      className="vt-theme"
      data-mode={mode}
      style={{
        ...themeVars,
        backgroundColor: "var(--background)",
        color: "var(--foreground)",
        fontFamily: fontSans,
        ...style,
      }}
    >
      {children}
    </AbsoluteFill>
  );
};
