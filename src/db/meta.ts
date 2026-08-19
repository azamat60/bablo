import { v4 as uuidv4 } from 'uuid';
import type { SyncMeta } from './types';

export function newMeta(): SyncMeta {
  return { id: uuidv4(), updatedAt: Date.now(), rev: 1, deleted: false };
}

export function touchMeta(rev: number): Pick<SyncMeta, 'updatedAt' | 'rev'> {
  return { updatedAt: Date.now(), rev: rev + 1 };
}
