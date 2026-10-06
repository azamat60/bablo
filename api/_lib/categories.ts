import type { AiCategoryContext } from './types.js';

export type CategoryLabels = {
  /** What the model sees and returns, in the same order as the context. */
  labels: string[];
  idByLabel: Map<string, string>;
  kindByLabel: Map<string, AiCategoryContext['kind']>;
};

const UNCATEGORIZED_HINTS = ['uncategorized', 'без категории'];

/**
 * The model picks categories by a readable "Group / Name" label rather than by
 * id. Ids are opaque UUIDs, and a model copying one out of a sixty-line list
 * mixes them up far more often than it mixes up names; the group also makes
 * generic names like "Other" or "Health" meaningful.
 */
export function labelCategories(categories: AiCategoryContext[]): CategoryLabels {
  const labels: string[] = [];
  const idByLabel = new Map<string, string>();
  const kindByLabel = new Map<string, AiCategoryContext['kind']>();
  for (const category of categories) {
    const base = category.group ? `${category.group} / ${category.name}` : category.name;
    let label = base;
    for (let n = 2; idByLabel.has(label); n += 1) label = `${base} (${n})`;
    labels.push(label);
    idByLabel.set(label, category.id);
    kindByLabel.set(label, category.kind);
  }
  return { labels, idByLabel, kindByLabel };
}

export function categoryListText(labels: CategoryLabels): string {
  return labels.labels.map((label) => `- ${label} [${labels.kindByLabel.get(label)}]`).join('\n');
}

/** Falls back to an "Uncategorized"-style category, then the first of the kind, so a row is never left without one. */
export function resolveCategoryId(
  label: string,
  labels: CategoryLabels,
  kind: AiCategoryContext['kind'],
): string | undefined {
  const direct = labels.idByLabel.get(label);
  if (direct) return direct;
  const ofKind = labels.labels.filter((l) => labels.kindByLabel.get(l) === kind);
  const fallback =
    ofKind.find((l) => UNCATEGORIZED_HINTS.some((hint) => l.toLowerCase().includes(hint))) ??
    ofKind[0] ??
    labels.labels[0];
  return fallback ? labels.idByLabel.get(fallback) : undefined;
}
