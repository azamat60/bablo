import type { Bucket, CategoryGroupKind } from '@/db/types';

export const BUCKET_OPTIONS: readonly { value: Bucket }[] = [
  { value: 'needs' },
  { value: 'wants' },
  { value: 'savings' },
];

export const BUCKET_LABEL_KEY: Record<Bucket, 'bucketNeeds' | 'bucketWants' | 'bucketSavings'> = {
  needs: 'bucketNeeds',
  wants: 'bucketWants',
  savings: 'bucketSavings',
};

export const GROUP_KIND_OPTIONS: readonly { value: CategoryGroupKind }[] = [{ value: 'expense' }, { value: 'income' }];

/**
 * Tuned so a white glyph stays legible on every swatch, which is how tiles
 * render them. Existing groups keep whatever colour they were saved with;
 * this list only affects new picks.
 */
export const GROUP_COLOR_OPTIONS: readonly string[] = [
  '#3d8bfd',
  '#2fc48d',
  '#f5a83a',
  '#f2545f',
  '#a06cf0',
  '#2bb8c4',
  '#ee5f9a',
  '#f57c3a',
  '#6d778a',
];
