import { Sheet } from '@/components/Sheet';
import { Tile } from '@/components/Tile';
import { TileGrid } from '@/components/TileGrid';
import { useCategoryGroups } from '@/db/queries/categories';
import { groupIcon } from '@/domain/groups';
import { useT } from '@/i18n';
import type { CategoryGroupKind } from '@/db/types';

export type GroupPickerSheetProps = {
  open: boolean;
  kind: CategoryGroupKind;
  onClose: () => void;
  onSelect: (groupId: string) => void;
};

/**
 * Picks a CategoryGroup — the level Budget OK calls a category. The
 * subcategory (our Category) is then chosen inline with chips.
 */
export function GroupPickerSheet({ open, kind, onClose, onSelect }: GroupPickerSheetProps) {
  const t = useT();
  const groups = useCategoryGroups().filter((group) => group.kind === kind);

  return (
    <Sheet open={open} onClose={onClose} title={kind === 'income' ? t.dashboard.income : t.dashboard.expenses}>
      <TileGrid>
        {groups.map((group) => (
          <Tile
            key={group.id}
            id={group.id}
            kind={kind === 'income' ? 'incomeGroup' : 'expenseGroup'}
            color={group.color}
            icon={groupIcon(group, group.categories)}
            label={group.name}
            onClick={onSelect}
          />
        ))}
      </TileGrid>
    </Sheet>
  );
}
