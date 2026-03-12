import { Request, Response, NextFunction } from 'express';
import { currencyService } from './currency.service';
import respond from '../../shared/utils/response';

export async function getCurrencies(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const activeOnly = req.query.activeOnly !== 'false';
    const currencies = await currencyService.getCurrencies(req.user?.tenantId ?? 'default', activeOnly);
    respond.success(res, { message: 'Currencies retrieved', data: { currencies } });
  } catch (e) { next(e); }
}

export async function addCurrency(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const currency = await currencyService.addCurrency(
      req.body, req.user?.tenantId ?? 'default', req.user?.userId ?? ''
    );
    respond.created(res, { message: 'Currency added', data: { currency } });
  } catch (e) { next(e); }
}

export async function updateExchangeRates(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await currencyService.updateExchangeRates(
      req.body.rates, req.user?.tenantId ?? 'default', req.user?.userId ?? ''
    );
    respond.success(res, { message: `${result.updated} exchange rate(s) updated`, data: result });
  } catch (e) { next(e); }
}

export async function toggleCurrency(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const currency = await currencyService.toggleCurrency(req.params.id, req.user?.tenantId ?? 'default');
    respond.success(res, { message: `Currency ${currency.isActive ? 'activated' : 'deactivated'}`, data: { currency } });
  } catch (e) { next(e); }
}

export async function convertCurrency(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { amount, fromCode, toCode } = req.body;
    const result = await currencyService.convert(amount, fromCode, toCode, req.user?.tenantId ?? 'default');
    respond.success(res, { message: 'Conversion result', data: { conversion: result } });
  } catch (e) { next(e); }
}

export async function seedCurrencies(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await currencyService.seedDefaults(req.user?.tenantId ?? 'default', req.user?.userId ?? '');
    respond.success(res, { message: 'Default currencies seeded', data: null });
  } catch (e) { next(e); }
}
