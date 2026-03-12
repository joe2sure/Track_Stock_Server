import { Request, Response, NextFunction } from 'express';
import { settingsService } from './settings.service';
import respond from '../../shared/utils/response';
import { BadRequestError } from '../../shared/utils/errors';
import { SECTION_SCHEMAS } from './settings.validation';
import Joi from 'joi';

const VALID_SECTIONS = ['businessInfo','tax','receipt','invoice','pos','notifications','hotel','general','all'] as const;
type Section = typeof VALID_SECTIONS[number];

export async function getSettings(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const settings = await settingsService.getSettings(req.user?.tenantId ?? 'default');
    respond.success(res, { message: 'Settings retrieved', data: { settings } });
  } catch (e) { next(e); }
}

export async function updateSettings(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const section = (req.params.section ?? 'all') as Section;
    if (!VALID_SECTIONS.includes(section)) {
      throw new BadRequestError(`Invalid settings section. Valid: ${VALID_SECTIONS.join(', ')}`);
    }

    // Validate body against section schema when available
    const schema = SECTION_SCHEMAS[section];
    if (schema && section !== 'all') {
      const { error, value } = schema.validate(req.body, { abortEarly: false, stripUnknown: true });
      if (error) throw new BadRequestError(error.details.map(d => d.message).join('; '));
      req.body = value;
    }

    const settings = await settingsService.updateSettings(
      section, req.body, req.user?.tenantId ?? 'default', req.user?.userId ?? ''
    );
    respond.success(res, { message: `Settings (${section}) updated`, data: { settings } });
  } catch (e) { next(e); }
}

export async function bootstrapTenant(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await settingsService.bootstrapTenant(
      req.user?.tenantId ?? 'default',
      req.body.businessName,
      req.user?.userId ?? ''
    );
    respond.success(res, { message: result.message, data: { settings: result.settings } });
  } catch (e) { next(e); }
}

export async function resetInvoiceCounter(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const settings = await settingsService.resetInvoiceCounter(
      req.user?.tenantId ?? 'default',
      req.body.nextNumber,
      req.user?.userId ?? ''
    );
    respond.success(res, { message: 'Invoice counter reset', data: { invoice: settings.invoice } });
  } catch (e) { next(e); }
}

export async function getNextInvoiceNumber(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const invoiceNumber = await settingsService.nextInvoiceNumber(req.user?.tenantId ?? 'default');
    respond.success(res, { message: 'Next invoice number', data: { invoiceNumber } });
  } catch (e) { next(e); }
}
