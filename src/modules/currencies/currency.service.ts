import Currency, { ICurrency } from './currency.model';
// import Settings from '../settings/settings.model';
import { NotFoundError, BadRequestError, ConflictError } from '../../shared/utils/errors';
import { getOrSet, deleteCache, CachePrefix } from '../../shared/utils/cache';

// ── Common currencies to pre-seed ─────────────────────────────────────────────
const COMMON_CURRENCIES = [
  { code: 'NGN', name: 'Nigerian Naira',  symbol: '₦',  exchangeRate: 1,        isBase: true,  decimalPlaces: 2 },
  { code: 'USD', name: 'US Dollar',        symbol: '$',  exchangeRate: 0.00065,  isBase: false, decimalPlaces: 2 },
  { code: 'GBP', name: 'British Pound',    symbol: '£',  exchangeRate: 0.00052,  isBase: false, decimalPlaces: 2 },
  { code: 'EUR', name: 'Euro',             symbol: '€',  exchangeRate: 0.00060,  isBase: false, decimalPlaces: 2 },
  { code: 'GHS', name: 'Ghanaian Cedi',    symbol: '₵',  exchangeRate: 0.0095,   isBase: false, decimalPlaces: 2 },
  { code: 'XOF', name: 'West African CFA', symbol: 'CFA',exchangeRate: 0.394,    isBase: false, decimalPlaces: 0 },
  { code: 'KES', name: 'Kenyan Shilling',  symbol: 'KSh',exchangeRate: 0.095,    isBase: false, decimalPlaces: 2 },
  { code: 'ZAR', name: 'South African Rand',symbol: 'R', exchangeRate: 0.012,    isBase: false, decimalPlaces: 2 },
];

export class CurrencyService {

  // ── Seed defaults for new tenant ──────────────────────────────────────────
  async seedDefaults(tenantId: string, userId: string): Promise<void> {
    for (const c of COMMON_CURRENCIES) {
      await Currency.updateOne(
        { code: c.code, tenantId },
        { $setOnInsert: { ...c, lastUpdatedAt: new Date(), tenantId, updatedBy: userId } },
        { upsert: true }
      );
    }
  }

  // ── Get all currencies for tenant ─────────────────────────────────────────
  async getCurrencies(tenantId: string, activeOnly = true): Promise<ICurrency[]> {
    return getOrSet(`currencies:${tenantId}:${activeOnly}`, async () => {
      const filter: Record<string, unknown> = { tenantId };
      if (activeOnly) filter.isActive = true;
      return Currency.find(filter).sort({ isBase: -1, code: 1 }).lean() as Promise<ICurrency[]>;
    }, { prefix: CachePrefix.DASHBOARD, ttl: 300 });
  }

  // ── Get base currency ─────────────────────────────────────────────────────
  async getBaseCurrency(tenantId: string): Promise<ICurrency> {
    const c = await Currency.findOne({ tenantId, isBase: true });
    if (!c) throw new NotFoundError('Base currency');
    return c;
  }

  // ── Add new currency ──────────────────────────────────────────────────────
  async addCurrency(
    input: { code: string; name: string; symbol: string; exchangeRate: number; decimalPlaces?: number },
    tenantId: string,
    userId: string
  ): Promise<ICurrency> {
    const exists = await Currency.findOne({ code: input.code.toUpperCase(), tenantId });
    if (exists) throw new ConflictError(`Currency "${input.code}" already exists`);

    return Currency.create({
      ...input,
      code:          input.code.toUpperCase(),
      isBase:        false,
      isActive:      true,
      decimalPlaces: input.decimalPlaces ?? 2,
      lastUpdatedAt: new Date(),
      tenantId,
      updatedBy:     userId,
    });
  }

  // ── Update exchange rate(s) ───────────────────────────────────────────────
  async updateExchangeRates(
    rates: Array<{ code: string; exchangeRate: number }>,
    tenantId: string,
    userId: string
  ): Promise<{ updated: number }> {
    let updated = 0;
    for (const r of rates) {
      const result = await Currency.updateOne(
        { code: r.code.toUpperCase(), tenantId, isBase: false },
        { exchangeRate: r.exchangeRate, lastUpdatedAt: new Date(), updatedBy: userId }
      );
      if (result.modifiedCount) updated++;
    }
    await deleteCache(`currencies:${tenantId}:true`, CachePrefix.DASHBOARD);
    await deleteCache(`currencies:${tenantId}:false`, CachePrefix.DASHBOARD);
    return { updated };
  }

  // ── Toggle currency active/inactive ──────────────────────────────────────
  async toggleCurrency(id: string, tenantId: string): Promise<ICurrency> {
    const c = await Currency.findOne({ _id: id, tenantId });
    if (!c) throw new NotFoundError('Currency');
    if (c.isBase) throw new BadRequestError('Cannot deactivate the base currency');
    const updated = await Currency.findByIdAndUpdate(id, { isActive: !c.isActive }, { new: true });
    await deleteCache(`currencies:${tenantId}:true`, CachePrefix.DASHBOARD);
    return updated!;
  }

  // ── Convert amount ────────────────────────────────────────────────────────
  async convert(amount: number, fromCode: string, toCode: string, tenantId: string): Promise<{
    amount: number; fromCode: string; toCode: string; rate: number; result: number;
  }> {
    const [from, to] = await Promise.all([
      Currency.findOne({ code: fromCode.toUpperCase(), tenantId }),
      Currency.findOne({ code: toCode.toUpperCase(), tenantId }),
    ]);
    if (!from) throw new NotFoundError(`Currency ${fromCode}`);
    if (!to)   throw new NotFoundError(`Currency ${toCode}`);

    // Convert: from → base (NGN) → to
    const inBase = amount / from.exchangeRate;
    const result = parseFloat((inBase * to.exchangeRate).toFixed(to.decimalPlaces));
    const rate   = parseFloat((to.exchangeRate / from.exchangeRate).toFixed(6));

    return { amount, fromCode: from.code, toCode: to.code, rate, result };
  }
}

export const currencyService = new CurrencyService();
