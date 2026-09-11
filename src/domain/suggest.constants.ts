/** Scoring weights. Exported so they can be tuned without touching the logic. */
export const SUGGEST_WEIGHTS = {
  recency: 0.4,
  frequency: 0.3,
  weekday: 0.15,
  account: 0.15,
} as const;

/** How far back to look for signal. */
export const LOOKBACK_DAYS = 120;

/** Recency half-life, in days, for the exponential decay. */
export const RECENCY_TAU_DAYS = 21;

/**
 * A weekday preference computed from one or two transactions is noise, and
 * noise here produces confidently wrong suggestions.
 */
export const MIN_SAMPLES_FOR_WEEKDAY = 3;

/** Below this score, or this margin over the runner-up, show nothing. */
export const MIN_SCORE = 0.35;
export const MIN_MARGIN = 0.08;

/** Amount is suppressed above this coefficient of variation. */
export const MAX_AMOUNT_CV = 0.6;

export const AMOUNT_SAMPLE_SIZE = 10;
export const REPEAT_SAMPLE_SIZE = 5;
export const MIN_REPEATS = 3;

/** Values at or above this are rounded to the nearest 100 minor units. */
export const ROUND_ABOVE_MINOR = 10_000;
