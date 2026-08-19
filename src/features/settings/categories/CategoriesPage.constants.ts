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

export const GROUP_COLOR_OPTIONS: readonly string[] = [
  '#4f8dfd',
  '#2fbf71',
  '#f5a623',
  '#ef5f6d',
  '#d88fd8',
  '#5aa9e6',
  '#45c4b0',
  '#f2994a',
  '#8b98a9',
];
