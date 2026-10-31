import { palette } from "./palette";

/**
 * None is red or yellow, so a brand button never reads as danger or premium.
 */
export const themes = {
  blue: palette.sky,
  green: palette.emerald,
  purple: palette.violet,
  orange: palette.orange,
};

export type Theme = keyof typeof themes;

export const DEFAULT_THEME: Theme = "blue";
