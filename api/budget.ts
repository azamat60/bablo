import { LEDGER_MAX_BYTES, emptyLedger, validateLedger } from '../shared/ledger.js';
import { ApiError, apiError, noStore, owner, readJson } from './_lib/security.js';
export async function GET(request: Request) {
  try {
    const { userId, client } = await owner(request);
    const { data, error } = await client
      .from('budget_ledgers')
      .select('state,revision')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw error;
    return Response.json(data ?? { state: emptyLedger(), revision: 0 }, { headers: noStore });
  } catch (error) {
    return apiError(error);
  }
}
export async function PUT(request: Request) {
  try {
    const value = await readJson(request, LEDGER_MAX_BYTES + 200);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiError('Неверные данные бюджета.');
    const { state, revision } = value as { state: unknown; revision: unknown };
    if (
      typeof revision !== 'number' ||
      !Number.isSafeInteger(revision) ||
      revision < 0 ||
      revision >= Number.MAX_SAFE_INTEGER
    )
      throw new ApiError('Неверная ревизия.');
    let parsed;
    try {
      parsed = validateLedger(state);
    } catch {
      throw new ApiError('Неверные данные бюджета.');
    }
    if (new TextEncoder().encode(JSON.stringify(parsed)).length > LEDGER_MAX_BYTES)
      throw new ApiError('Бюджет превышает 3 МБ.', 413);
    const { userId, client } = await owner(request);
    const query =
      revision === 0
        ? client.from('budget_ledgers').insert({ user_id: userId, state: parsed, revision: 1 })
        : client
            .from('budget_ledgers')
            .update({ state: parsed, revision: revision + 1 })
            .eq('user_id', userId)
            .eq('revision', revision);
    const { data, error } = await query.select('revision').maybeSingle();
    if (error?.code === '23505' || (!error && !data)) throw new ApiError('Бюджет изменён в другом окне.', 409);
    if (error?.code === '23514') throw new ApiError('Бюджет превышает допустимый размер.', 413);
    if (error) throw error;
    const saved: unknown = data;
    if (
      !saved ||
      typeof saved !== 'object' ||
      !('revision' in saved) ||
      typeof saved.revision !== 'number' ||
      !Number.isSafeInteger(saved.revision)
    )
      throw new ApiError('Сервер не подтвердил сохранение.', 503);
    return Response.json({ state: parsed, revision: saved.revision }, { headers: noStore });
  } catch (error) {
    return apiError(error);
  }
}
