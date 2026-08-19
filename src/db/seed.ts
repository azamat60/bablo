import { v4 as uuidv4 } from 'uuid';
import type { Locale } from '@/i18n/types';
import { db } from './db';
import { SEED_NAME_RU } from './seed.categories.ru';
import type { Bucket, CategoryGroupKind, Settings } from './types';

type SeedCategory = {
  name: string;
  icon: string;
  bucket?: Bucket;
  isSystem?: boolean;
};

type SeedGroup = {
  name: string;
  kind: CategoryGroupKind;
  bucket?: Bucket;
  color: string;
  categories: SeedCategory[];
};

export const STARTER_GROUPS: readonly SeedGroup[] = [
  {
    name: 'Income',
    kind: 'income',
    color: '#2fbf71',
    categories: [
      { name: 'Salary', icon: 'briefcase' },
      { name: 'Freelance / Side income', icon: 'laptop' },
      { name: 'Business income', icon: 'building' },
      { name: 'Investment income', icon: 'trending-up' },
      { name: 'Gifts & Refunds', icon: 'gift' },
      { name: 'Other income', icon: 'circle-plus' },
    ],
  },
  {
    name: 'Bills & Housing',
    kind: 'expense',
    bucket: 'needs',
    color: '#4f8dfd',
    categories: [
      { name: 'Rent / Mortgage', icon: 'home', bucket: 'needs' },
      { name: 'Utilities', icon: 'lightbulb', bucket: 'needs' },
      { name: 'Internet & Mobile', icon: 'wifi', bucket: 'needs' },
      { name: 'Home maintenance', icon: 'wrench', bucket: 'needs' },
      { name: 'Property tax', icon: 'receipt', bucket: 'needs' },
    ],
  },
  {
    name: 'Insurance',
    kind: 'expense',
    bucket: 'needs',
    color: '#6c8ef5',
    categories: [
      { name: 'Health', icon: 'heart-pulse', bucket: 'needs' },
      { name: 'Auto', icon: 'car', bucket: 'needs' },
      { name: 'Home / Renters', icon: 'shield-check', bucket: 'needs' },
      { name: 'Life', icon: 'heart-handshake', bucket: 'needs' },
    ],
  },
  {
    name: 'Food',
    kind: 'expense',
    color: '#f5a623',
    categories: [
      { name: 'Groceries', icon: 'shopping-cart', bucket: 'needs' },
      { name: 'Restaurants & Cafes', icon: 'utensils', bucket: 'wants' },
      { name: 'Delivery', icon: 'bike', bucket: 'wants' },
      { name: 'Coffee', icon: 'coffee', bucket: 'wants' },
    ],
  },
  {
    name: 'Transport',
    kind: 'expense',
    bucket: 'needs',
    color: '#5aa9e6',
    categories: [
      { name: 'Fuel', icon: 'fuel', bucket: 'needs' },
      { name: 'Public transport', icon: 'bus', bucket: 'needs' },
      { name: 'Taxi / Ride-share', icon: 'taxi', bucket: 'needs' },
      { name: 'Car maintenance', icon: 'cog', bucket: 'needs' },
      { name: 'Parking & Tolls', icon: 'parking', bucket: 'needs' },
    ],
  },
  {
    name: 'Health',
    kind: 'expense',
    bucket: 'needs',
    color: '#45c4b0',
    categories: [
      { name: 'Doctor & Dentist', icon: 'stethoscope', bucket: 'needs' },
      { name: 'Pharmacy', icon: 'pill', bucket: 'needs' },
      { name: 'Fitness & Sport', icon: 'dumbbell', bucket: 'needs' },
      { name: 'Therapy', icon: 'brain', bucket: 'needs' },
    ],
  },
  {
    name: 'Personal',
    kind: 'expense',
    color: '#d88fd8',
    categories: [
      { name: 'Household supplies', icon: 'spray', bucket: 'needs' },
      { name: 'Clothing & Shoes', icon: 'shirt', bucket: 'wants' },
      { name: 'Beauty & Haircut', icon: 'scissors', bucket: 'wants' },
      { name: 'Pets', icon: 'paw', bucket: 'wants' },
    ],
  },
  {
    name: 'Lifestyle',
    kind: 'expense',
    bucket: 'wants',
    color: '#f2994a',
    categories: [
      { name: 'Entertainment', icon: 'clapperboard', bucket: 'wants' },
      { name: 'Subscriptions', icon: 'repeat', bucket: 'wants' },
      { name: 'Hobbies', icon: 'palette', bucket: 'wants' },
      { name: 'Travel & Vacation', icon: 'plane', bucket: 'wants' },
      { name: 'Gifts & Celebrations', icon: 'party', bucket: 'wants' },
    ],
  },
  {
    name: 'Family & Education',
    kind: 'expense',
    bucket: 'needs',
    color: '#56b8f2',
    categories: [
      { name: 'Childcare', icon: 'baby', bucket: 'needs' },
      { name: 'School / Tuition', icon: 'graduation-cap', bucket: 'needs' },
      { name: 'Courses & Books', icon: 'book', bucket: 'needs' },
      { name: "Kids' expenses", icon: 'backpack', bucket: 'needs' },
    ],
  },
  {
    name: 'Debt Payments',
    kind: 'expense',
    bucket: 'savings',
    color: '#ef5f6d',
    categories: [
      { name: 'Credit card payment', icon: 'credit-card', bucket: 'savings' },
      { name: 'Loan payment', icon: 'landmark', bucket: 'savings' },
      { name: 'Interest & Fees', icon: 'trending-down', bucket: 'savings' },
    ],
  },
  {
    name: 'Savings & Goals',
    kind: 'expense',
    bucket: 'savings',
    color: '#2fbf71',
    categories: [
      { name: 'Emergency Fund', icon: 'life-buoy', bucket: 'savings' },
      { name: 'Retirement', icon: 'palmtree', bucket: 'savings' },
      { name: 'Investments', icon: 'bar-chart', bucket: 'savings' },
      { name: 'Big purchase', icon: 'sofa', bucket: 'savings' },
      { name: 'Vacation fund', icon: 'luggage', bucket: 'savings' },
    ],
  },
  {
    name: 'Other',
    kind: 'expense',
    color: '#8b98a9',
    categories: [
      { name: 'Bank fees', icon: 'banknote', bucket: 'needs' },
      { name: 'Taxes', icon: 'calculator', bucket: 'needs' },
      { name: 'Charity', icon: 'hand-heart', bucket: 'wants' },
      { name: 'Uncategorized', icon: 'help-circle', bucket: 'wants', isSystem: true },
    ],
  },
];

export const MINIMAL_GROUPS: readonly SeedGroup[] = [
  {
    name: 'Income',
    kind: 'income',
    color: '#2fbf71',
    categories: [{ name: 'Income', icon: 'briefcase' }],
  },
  {
    name: 'Housing',
    kind: 'expense',
    bucket: 'needs',
    color: '#4f8dfd',
    categories: [
      { name: 'Rent / Mortgage', icon: 'home', bucket: 'needs' },
      { name: 'Utilities', icon: 'lightbulb', bucket: 'needs' },
    ],
  },
  {
    name: 'Food',
    kind: 'expense',
    color: '#f5a623',
    categories: [
      { name: 'Groceries', icon: 'shopping-cart', bucket: 'needs' },
      { name: 'Restaurants & Cafes', icon: 'utensils', bucket: 'wants' },
    ],
  },
  {
    name: 'Transport',
    kind: 'expense',
    bucket: 'needs',
    color: '#5aa9e6',
    categories: [{ name: 'Transport', icon: 'taxi', bucket: 'needs' }],
  },
  {
    name: 'Lifestyle',
    kind: 'expense',
    bucket: 'wants',
    color: '#f2994a',
    categories: [
      { name: 'Entertainment', icon: 'clapperboard', bucket: 'wants' },
      { name: 'Shopping', icon: 'shopping-bag', bucket: 'wants' },
    ],
  },
  {
    name: 'Savings & Debt',
    kind: 'expense',
    bucket: 'savings',
    color: '#2fbf71',
    categories: [{ name: 'Savings', icon: 'life-buoy', bucket: 'savings' }],
  },
  {
    name: 'Other',
    kind: 'expense',
    color: '#8b98a9',
    categories: [{ name: 'Uncategorized', icon: 'help-circle', bucket: 'wants', isSystem: true }],
  },
];

export const EMPTY_GROUPS: readonly SeedGroup[] = [
  {
    name: 'Income',
    kind: 'income',
    color: '#2fbf71',
    categories: [{ name: 'Income', icon: 'briefcase' }],
  },
  {
    name: 'Other',
    kind: 'expense',
    color: '#8b98a9',
    categories: [{ name: 'Uncategorized', icon: 'help-circle', bucket: 'wants', isSystem: true }],
  },
];

export type CategoryPreset = 'full' | 'minimal' | 'empty';

const PRESET_GROUPS: Record<CategoryPreset, readonly SeedGroup[]> = {
  full: STARTER_GROUPS,
  minimal: MINIMAL_GROUPS,
  empty: EMPTY_GROUPS,
};

function translateGroup(group: SeedGroup, locale: Locale): SeedGroup {
  if (locale !== 'ru') return group;
  return {
    ...group,
    name: SEED_NAME_RU[group.name] ?? group.name,
    categories: group.categories.map((category) => ({
      ...category,
      name: SEED_NAME_RU[category.name] ?? category.name,
    })),
  };
}

export async function seedCategoriesForPreset(preset: CategoryPreset, locale: Locale = 'ru'): Promise<void> {
  await seedGroups(PRESET_GROUPS[preset].map((group) => translateGroup(group, locale)));
}

export async function seedStarterCategories(): Promise<void> {
  await seedGroups(STARTER_GROUPS);
}

async function seedGroups(groups: readonly SeedGroup[]): Promise<void> {
  const now = Date.now();
  await db.transaction('rw', db.categoryGroups, db.categories, async () => {
    for (const [groupOrder, group] of groups.entries()) {
      const groupId = uuidv4();
      await db.categoryGroups.add({
        id: groupId,
        name: group.name,
        kind: group.kind,
        bucket: group.bucket,
        color: group.color,
        order: groupOrder,
        archived: false,
        updatedAt: now,
        rev: 1,
        deleted: false,
      });
      for (const [catOrder, category] of group.categories.entries()) {
        await db.categories.add({
          id: uuidv4(),
          groupId,
          name: category.name,
          icon: category.icon,
          color: group.color,
          bucket: category.bucket,
          order: catOrder,
          archived: false,
          isSystem: category.isSystem ?? false,
          updatedAt: now,
          rev: 1,
          deleted: false,
        });
      }
    }
  });
}

function defaultSettings(): Settings {
  return {
    id: 'singleton',
    baseCurrency: 'USD',
    firstDayOfMonth: 1,
    theme: 'light',
    aiModel: 'gpt-5.6-luna',
    onboardingComplete: false,
    flags: {},
  };
}

export async function ensureSettingsSeeded(): Promise<Settings> {
  const existing = await db.settings.get('singleton');
  if (existing) return existing;
  const settings = defaultSettings();
  await db.settings.add(settings);
  return settings;
}

export async function ensureSeeded(): Promise<Settings> {
  return ensureSettingsSeeded();
}
