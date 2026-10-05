import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Sparkles, Split, X } from 'lucide-react';
import { NumberPad } from '@/components/NumberPad';
import { NUMBER_PAD_DISMISS_KEY } from '@/components/NumberPad/NumberPad.constants';
import { AmountDisplay } from '@/components/AmountDisplay';
import { ChipRow, type ChipItem } from '@/components/ChipRow';
import { DateChips } from '@/components/DateChips';
import { AccountPickerSheet } from '@/components/AccountPickerSheet';
import { GroupPickerSheet } from '@/components/GroupPickerSheet';
import { AppIcon } from '@/components/AppIcon';
import { deleteTransaction, restoreTransaction } from '@/db/queries/transactions';
import { useAccountBalances } from '@/db/queries/transactions';
import { useNumberPad } from '@/hooks/useNumberPad';
import { decimalFromMinor, formatMoney } from '@/domain/money';
import { CURRENCY_SYMBOL } from '@/domain/money.constants';
import { groupIcon } from '@/domain/groups';
import { useT } from '@/i18n';
import { useTxDraftStore, type TxDraftKind } from '@/store/txDraft';
import { useComposerDraft, useComposerHydration } from './useComposerDraft';
import { ComposerEndpoints } from './ComposerEndpoints';
import { SplitsEditor } from '../SplitsEditor';
import { SuggestionChip } from '@/components/SuggestionChip';
import { useSuggestion } from './useSuggestion';
import { ComposerAiBar } from './ComposerAiBar';
import { aiDraftToPatch } from '../ai/applyAiDraft';
import { useCategoryGroups } from '@/db/queries/categories';
import type { AiParseResult } from '../ai/useAiParse';
import type { TransactionSource } from '@/db/types';
import styles from './Composer.module.css';

export type ComposerPageProps = {
  /** Seeds a fresh draft when arriving from /add/expense and friends. */
  seedKind?: TxDraftKind;
  editingId?: string;
};

const ADD_CHIP_ID = '__add__';
const NEW_DRAFT_KEY = '__new__';

export function ComposerPage({ seedKind, editingId }: ComposerPageProps) {
  const navigate = useNavigate();
  const clear = useTxDraftStore((s) => s.clear);
  const ready = useComposerHydration(seedKind, editingId);
  const leavingRef = useRef(false);

  // The draft is cleared only once the page is gone. Clearing while still
  // mounted would re-run hydration and refill the store with the transaction
  // being closed, and a picker round trip must keep the draft anyway.
  useEffect(
    () => () => {
      if (leavingRef.current) clear();
    },
    [clear],
  );

  const leave = () => {
    leavingRef.current = true;
    void navigate(-1);
  };

  if (!ready) return <div className={styles.root} />;
  return <ComposerForm key={editingId ?? NEW_DRAFT_KEY} onLeave={leave} />;
}

function ComposerForm({ onLeave }: { onLeave: () => void }) {
  const t = useT();
  const navigate = useNavigate();
  const balances = useAccountBalances();
  const composer = useComposerDraft();
  const { draft, patch, account, toAccount, group, subcategories, categoryId, currency, validation } = composer;
  const { splitMode, splits, setSplits, minorUnits } = composer;

  const pad = useNumberPad(draft.amountText);
  const savingRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const changeDeletion = async (undo: boolean) => {
    if (!draft.editingId || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      if (undo) await restoreTransaction(draft.editingId);
      else await deleteTransaction(draft.editingId);
      setDeleted(!undo);
      setConfirmDelete(false);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Ошибка удаления.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };
  const [accountPicker, setAccountPicker] = useState<'from' | 'to' | null>(null);
  const [groupPicker, setGroupPicker] = useState(false);
  const [padOpen, setPadOpen] = useState(true);
  const [suggestionDismissed, setSuggestionDismissed] = useState(false);
  const groups = useCategoryGroups();

  // What the last AI capture did, so the user can see and undo a category switch.
  const [aiNotice, setAiNotice] = useState<{
    text: string;
    warn: boolean;
    revert?: { groupId?: string; categoryId?: string };
  } | null>(null);

  // One-way sync: the calculator owns its own runningTotal/pendingOp, the
  // draft only mirrors the resulting text so it survives navigation.
  useEffect(() => {
    patch({ amountText: pad.amountText });
  }, [pad.amountText, patch]);

  const isTransfer = draft.kind === 'transfer';
  const isIncome = draft.kind === 'income';

  // Only worth suggesting before the user has chosen a subcategory themselves.
  const suggestionEnabled = !isTransfer && !splitMode && Boolean(group) && !draft.categoryId && !suggestionDismissed;
  const suggestion = useSuggestion({
    enabled: suggestionEnabled,
    categories: subcategories,
    accountId: account?.id,
    direction: isIncome ? 'income' : 'expense',
    memo: draft.memo,
  });
  const suggestedCategory = subcategories.find((category) => category.id === suggestion?.categoryId);

  const applySuggestion = () => {
    if (!suggestion) return;
    patch({ categoryId: suggestion.categoryId });
    if (suggestion.amountMinor !== undefined) pad.reset(decimalFromMinor(suggestion.amountMinor));
  };

  const applyAiResult = (result: AiParseResult, source: TransactionSource) => {
    if (result.draft.currency && result.draft.currency !== currency) {
      setAiNotice({ text: 'Валюта распознавания не совпадает с валютой кошелька.', warn: true });
      return;
    }
    const applied = aiDraftToPatch(result.draft, {
      groups,
      kind: draft.kind,
      currentGroupId: draft.groupId,
      currentMemo: draft.memo,
      currentDate: draft.date,
    });
    if (!applied) {
      setAiNotice({ text: t.composerAi.nothingFound, warn: true });
      return;
    }
    const previous = { groupId: draft.groupId, categoryId: draft.categoryId };
    const confidences = result.draft.transactions.map((tx) => tx.confidence);
    patch({ ...applied.patch, source, aiConfidence: Math.min(...confidences) });
    pad.reset(applied.amountMajor);
    setSuggestionDismissed(true);

    const changedGroup = applied.categoryChanged ? groups.find((g) => g.id === applied.patch.groupId) : undefined;
    const changedCategory = changedGroup?.categories.find((c) => c.id === applied.patch.categoryId);
    const lines = [
      changedGroup ? t.composerAi.categoryChanged(`${changedGroup.name} / ${changedCategory?.name ?? ''}`) : null,
      applied.lowConfidence ? t.composerAi.lowConfidence : null,
      applied.ignoredCount > 0 ? t.composerAi.extraIgnored(applied.ignoredCount) : null,
    ].filter((line): line is string => line !== null);
    setAiNotice(
      lines.length > 0
        ? { text: lines.join(' · '), warn: applied.lowConfidence, revert: changedGroup ? previous : undefined }
        : null,
    );
  };

  const revertAi = () => {
    if (aiNotice?.revert)
      patch({ groupId: aiNotice.revert.groupId, categoryId: aiNotice.revert.categoryId, splits: [] });
    setAiNotice(null);
  };

  const title = composer.isEditing
    ? t.addTx.titleEdit
    : isTransfer
      ? t.composer.titleTransfer
      : isIncome
        ? t.addTx.titleIncome
        : t.addTx.titleExpense;

  const handleSave = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      if (await composer.save()) onLeave();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Не удалось сохранить.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const accountEndpoint = {
    label: isTransfer ? t.transfer.from : t.addTx.account,
    name: account?.name ?? t.common.choose,
    color: account?.color,
    icon: account?.icon,
    sub: account ? formatMoney(balances.get(account.id) ?? 0, account.currency) : undefined,
    onClick: () => setAccountPicker('from'),
  };

  const targetEndpoint = isTransfer
    ? {
        label: t.transfer.to,
        name: toAccount?.name ?? t.common.choose,
        color: toAccount?.color,
        icon: toAccount?.icon,
        sub: toAccount ? formatMoney(balances.get(toAccount.id) ?? 0, toAccount.currency) : undefined,
        onClick: () => setAccountPicker('to'),
      }
    : {
        label: t.addTx.category,
        name: group?.name ?? t.common.choose,
        color: group?.color,
        icon: group ? groupIcon(group, group.categories) : undefined,
        onClick: () => setGroupPicker(true),
      };

  const subcategoryChips: ChipItem[] = [
    ...subcategories.map((category) => ({
      id: category.id,
      glyph: <AppIcon name={category.icon} size={18} />,
      label: category.name,
    })),
    { id: ADD_CHIP_ID, glyph: '+', label: t.composer.addSubcategory },
  ];

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <span className={styles.title}>{title}</span>
        {!isTransfer && (
          <button
            type="button"
            className={styles.splitToggle}
            aria-label={t.composer.splits}
            aria-pressed={splitMode}
            onClick={() => setSplits(splitMode ? [] : [{ localId: crypto.randomUUID(), amountText: '' }])}
          >
            <Split size={16} aria-hidden="true" />
          </button>
        )}
        <button type="button" className={styles.close} onClick={onLeave} aria-label={t.common.close}>
          <X size={18} aria-hidden="true" />
        </button>
      </div>

      <div className={styles.body}>
        <AmountDisplay
          caption={t.composer.amount}
          text={pad.displayText}
          symbol={CURRENCY_SYMBOL[currency] ?? currency}
          tone={isIncome ? 'income' : 'expense'}
          computing={pad.isComputing}
          onClick={() => setPadOpen(true)}
        />

        {!isTransfer && <ComposerAiBar groupId={draft.groupId} memo={draft.memo} onResult={applyAiResult} />}

        {aiNotice && (
          <div className={`${styles.aiNotice} ${aiNotice.warn ? styles.aiNoticeWarn : ''}`} role="status">
            <Sparkles size={14} aria-hidden="true" />
            <span className={styles.aiNoticeText}>{aiNotice.text}</span>
            <button type="button" className={styles.aiNoticeAction} onClick={revertAi}>
              {aiNotice.revert ? t.composerAi.revert : t.common.close}
            </button>
          </div>
        )}

        <ComposerEndpoints
          left={isIncome ? targetEndpoint : accountEndpoint}
          right={isIncome ? accountEndpoint : targetEndpoint}
          direction="right"
        />

        {suggestion && suggestedCategory && (
          <SuggestionChip
            text={t.suggest[suggestion.reason](suggestedCategory.name)}
            amountText={
              suggestion.amountMinor === undefined ? undefined : formatMoney(suggestion.amountMinor, currency)
            }
            onApply={applySuggestion}
            onDismiss={() => setSuggestionDismissed(true)}
          />
        )}

        {!isTransfer && group && !splitMode && (
          <>
            <span className={styles.fieldLabel}>{t.composer.subcategory}</span>
            <ChipRow
              items={subcategoryChips}
              activeId={categoryId}
              ariaLabel={t.composer.subcategory}
              onSelect={(id) =>
                id === ADD_CHIP_ID ? void navigate('/settings/categories') : patch({ categoryId: id })
              }
            />
          </>
        )}

        {splitMode && (
          <>
            <span className={styles.fieldLabel}>{t.composer.splits}</span>
            <SplitsEditor
              rows={splits}
              onChange={setSplits}
              totalMinorUnits={minorUnits}
              currency={currency}
              kind={isIncome ? 'income' : 'expense'}
            />
          </>
        )}

        <span className={styles.fieldLabel}>{t.addTx.date}</span>
        <DateChips value={draft.date} onChange={(date) => patch({ date })} />

        <span className={styles.fieldLabel}>{t.composer.comment}</span>
        <input
          className={styles.commentInput}
          value={draft.memo}
          placeholder={t.composer.commentPlaceholder}
          onChange={(event) => patch({ memo: event.target.value })}
          onFocus={() => setPadOpen(false)}
        />
      </div>

      <div className={styles.footer}>
        {saveError && (
          <div role="alert" className={styles.reason}>
            {saveError}
          </div>
        )}
        {!validation.canSave && validation.reason && <div className={styles.reason}>{validation.reason}</div>}
        <button
          type="button"
          className={styles.save}
          disabled={deleted || saving || !validation.canSave}
          onClick={() => void handleSave()}
        >
          {t.addTx.save}
        </button>
        {draft.editingId &&
          (deleted ? (
            <div role="status">
              Операция удалена.{' '}
              <button type="button" disabled={saving} onClick={() => void changeDeletion(true)}>
                Отменить удаление
              </button>
            </div>
          ) : confirmDelete ? (
            <div role="alert">
              Удалить операцию{isTransfer ? ' и обе стороны перевода' : ''}?{' '}
              <button type="button" disabled={saving} onClick={() => void changeDeletion(false)}>
                Да, удалить
              </button>
              <button type="button" onClick={() => setConfirmDelete(false)}>
                Отмена
              </button>
            </div>
          ) : (
            <button type="button" className={styles.delete} onClick={() => setConfirmDelete(true)}>
              Удалить операцию
            </button>
          ))}
        {padOpen && !deleted && (
          <NumberPad
            labels={{ [NUMBER_PAD_DISMISS_KEY]: t.composer.closeKey }}
            onKey={(key) => (key === NUMBER_PAD_DISMISS_KEY ? setPadOpen(false) : pad.press(key))}
          />
        )}
      </div>

      <AccountPickerSheet
        open={accountPicker !== null}
        excludeAccountId={accountPicker === 'to' ? draft.accountId : undefined}
        onClose={() => setAccountPicker(null)}
        onSelect={(id) => {
          patch(accountPicker === 'to' ? { toAccountId: id } : { accountId: id });
          setAccountPicker(null);
        }}
      />
      <GroupPickerSheet
        open={groupPicker}
        kind={isIncome ? 'income' : 'expense'}
        onClose={() => setGroupPicker(false)}
        onSelect={(id) => {
          // Changing group invalidates the chosen subcategory.
          patch({ groupId: id, categoryId: undefined });
          setGroupPicker(false);
        }}
      />
    </div>
  );
}
