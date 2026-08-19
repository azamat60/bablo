import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/db';
import type { Settings } from '@/db/types';

export function useSettings(): Settings | undefined {
  return useLiveQuery(() => db.settings.get('singleton'), []);
}

export async function updateSettings(patch: Partial<Omit<Settings, 'id'>>): Promise<void> {
  await db.settings.update('singleton', patch);
}
