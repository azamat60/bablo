import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Settings2, Sparkles } from 'lucide-react';
import { Tile } from '@/components/Tile';
import { TileGrid } from '@/components/TileGrid';
import { SectionHeader } from '@/components/SectionHeader';
import { Collapse } from '@/components/Collapse';
import { PeriodSwitcher } from '@/components/PeriodSwitcher';
import { AiCaptureSheet } from '@/components/AiCaptureSheet';
import { usePeriodStore } from '@/store/period';
import { useDragStore } from '@/store/drag';
import { useTxDraftStore } from '@/store/txDraft';
import { useDragGesture } from '@/hooks/useDragGesture';
import { useScrollContainer } from '@/components/ScrollContainer';
import { dropToDraft, type DragItem, type DropOutcome } from '@/domain/dragRules';
import { formatMoney, formatNumberCompact } from '@/domain/money';
import { useT } from '@/i18n';
import { useDashboardData } from './useDashboardData';
import type { DashboardSection, DashboardTile } from './DashboardPage.types';
import type { TileState } from '@/components/Tile';
import styles from './DashboardPage.module.css';

const ADD_TILE_ID = {
  income: 'add-income-group',
  accounts: 'add-account',
  expenses: 'add-expense-group',
} as const;

export function DashboardPage() {
  const t = useT();
  const navigate = useNavigate();
  const period = usePeriodStore((s) => s.period);
  const setPeriod = usePeriodStore((s) => s.setPeriod);
  const { sections } = useDashboardData(period);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const [capture, setCapture] = useState(false);

  const beginDraft = useTxDraftStore((s) => s.begin);
  const scrollRef = useScrollContainer();

  const dragPhase = useDragStore((s) => s.phase);
  const dragSourceId = useDragStore((s) => s.source?.id ?? null);
  const hoverTargetId = useDragStore((s) => s.hoverTargetId);
  const validTargetIds = useDragStore((s) => s.validTargetIds);

  // Flat lookup so the gesture can turn a tile id back into a draggable item.
  const tilesById = useMemo(() => {
    const map = new Map<string, DashboardTile>();
    for (const section of sections) for (const tile of section.tiles) map.set(tile.id, tile);
    return map;
  }, [sections]);

  const resolveItem = useCallback(
    (tileId: string): DragItem | null => {
      const tile = tilesById.get(tileId);
      if (!tile || tile.kind === 'add') return null;
      return { id: tile.id, kind: tile.kind, color: tile.color, icon: tile.icon, label: tile.label };
    },
    [tilesById],
  );

  const handleDrop = useCallback(
    (outcome: DropOutcome) => {
      beginDraft(dropToDraft(outcome));
      void navigate('/add/tx');
    },
    [beginDraft, navigate],
  );

  const gestureRef = useDragGesture({ resolveItem, onDrop: handleDrop, scrollRef });

  const tileState = (tileId: string): TileState => {
    if (dragPhase !== 'dragging') return 'idle';
    if (tileId === dragSourceId) return 'lifted';
    if (tileId === hoverTargetId) return 'hover';
    return validTargetIds.has(tileId) ? 'valid' : 'invalid';
  };

  const toggle = useCallback((id: string) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  /**
   * Tapping a tile opens the composer with that tile as one endpoint. This is
   * the keyboard- and screen-reader-reachable path to the same outcome as
   * dragging, so it must keep working once drag lands.
   */
  const handleTile = useCallback(
    (section: DashboardSection, tileId: string) => {
      if (tileId === ADD_TILE_ID.accounts) return void navigate('/accounts');
      if (tileId === ADD_TILE_ID.income || tileId === ADD_TILE_ID.expenses) {
        return void navigate('/settings/categories');
      }
      const route =
        section.id === 'income' ? '/add/income' : section.id === 'expenses' ? '/add/expense' : '/add/expense';
      void navigate(route);
    },
    [navigate],
  );

  const addLabel = (section: DashboardSection) =>
    section.id === 'accounts' ? t.dashboard.addAccount : t.dashboard.addGroup;

  /**
   * Tiles are 82px wide, so a full "25 088,00 сом" truncates. The section
   * header already states the currency, so tiles carry the number alone.
   */
  const tileAmount = (tile: DashboardTile) => formatNumberCompact(tile.amount);

  return (
    <div className={styles.root} ref={gestureRef as React.RefObject<HTMLDivElement>}>
      <div className={styles.topRow}>
        <PeriodSwitcher period={period} onChange={setPeriod} />
        <div className={styles.topActions}>
          <button
            type="button"
            className={`${styles.iconButton} ${styles.iconButtonAccent}`}
            onClick={() => setCapture(true)}
            aria-label={t.fab.openAria}
          >
            <Sparkles size={18} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={styles.iconButton}
            onClick={() => void navigate('/settings')}
            aria-label={t.settings.title}
          >
            <Settings2 size={18} aria-hidden="true" />
          </button>
        </div>
      </div>

      {sections.map((section) => {
        const isOpen = !collapsed.has(section.id);
        const regionId = `dashboard-section-${section.id}`;
        return (
          <section key={section.id} className={`${styles.section} ${isOpen ? '' : styles.sectionCollapsed}`}>
            <SectionHeader
              title={section.title}
              total={
                section.total === undefined
                  ? undefined
                  : `${formatMoney(section.total, section.currency)}${section.incomplete ? ' *' : ''}`
              }
              secondaryTotal={
                section.incomplete
                  ? t.dashboard.mixedCurrencies
                  : section.assignedTotal === undefined
                    ? undefined
                    : t.dashboard.ofBudget(formatMoney(section.assignedTotal, section.currency))
              }
              open={isOpen}
              onToggle={() => toggle(section.id)}
              controls={regionId}
            />
            <Collapse id={regionId} open={isOpen}>
              <TileGrid>
                {section.tiles.map((tile) => (
                  <Tile
                    key={tile.id}
                    id={tile.id}
                    kind={tile.kind}
                    color={tile.color}
                    icon={tile.icon}
                    label={tile.label}
                    amountText={tileAmount(tile)}
                    secondaryText={tile.assigned === undefined ? undefined : formatNumberCompact(tile.assigned)}
                    state={tileState(tile.id)}
                    onClick={(id) => handleTile(section, id)}
                  />
                ))}
                <Tile
                  id={ADD_TILE_ID[section.id]}
                  kind="add"
                  label={addLabel(section)}
                  onClick={(id) => handleTile(section, id)}
                />
              </TileGrid>
            </Collapse>
          </section>
        );
      })}
      <AiCaptureSheet open={capture} onClose={() => setCapture(false)} />
    </div>
  );
}
