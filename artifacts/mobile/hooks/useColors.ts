import { useColorScheme } from "react-native";

import colors from "@/constants/colors";

/**
 * Returns design tokens for the current color scheme (light or dark).
 * Falls back to the light palette when no system-level preference is set
 * or when the dark key is absent from constants/colors.ts.
 *
 * Primary: Deep Indigo #3730A3  |  Font: Inter  |  Radius: 12px
 */
export function useColors() {
  const scheme = useColorScheme();
  const palette =
    scheme === "dark" && "dark" in colors
      ? (colors as unknown as Record<string, typeof colors.light>).dark
      : colors.light;
  return { ...palette, radius: colors.radius };
}
