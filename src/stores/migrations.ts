import type { ConfigSlice, TimeRange } from "./config";

// As an older app saved it, so not the current `Package` and `TimeRange`.
type SavedConfig = {
  packages: Record<string, unknown>[];
  timeRange: string;
};

export const migrateConfig = (persistedState: unknown, version: number) => {
  const { config } = persistedState as { config: SavedConfig };

  if (version === 0) {
    for (const pkg of config.packages) {
      pkg.package_is_partial = 0;
    }
    version++;
  }
  if (version === 1) {
    for (const pkg of config.packages) {
      delete pkg.shareImageData;
    }
    version++;
  }
  if (version === 2) {
    const timeRanges: Record<string, TimeRange> = {
      "4 weeks": "4weeks",
      "6 months": "6months",
      Year: "year",
      Lifetime: "lifetime",
    };
    config.timeRange = timeRanges[config.timeRange];
    version++;
  }

  return persistedState as { config: ConfigSlice };
};
