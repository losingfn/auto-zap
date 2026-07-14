export const importSafetyThresholds = {
  maxCatalogShrinkRatio: 0.3,
  maxArchiveRatio: 0.2,
  maxParseErrorRatio: 0.01,
  maxMissingPriceRatio: 0.02,
  maxMissingNameRatio: 0.005,
  maxExistingCategoryLossRatio: 0.01,
  reviewWarningRatio: 0.05
} as const;
