import { Request, Response, NextFunction } from 'express';
import { paystackService } from './paystack.service';
import respond from '../../shared/utils/response';
import Joi from 'joi';
import { joiSchemas } from '../../shared/middleware/validate.middleware';

// ── Validation ────────────────────────────────────────────────────────────────
const initSchema = Joi.object({
  email:        Joi.string().email().lowercase().required(),
  amountNGN:    Joi.number().positive().required(),
  entityType:   Joi.string().valid('sale','booking','purchase','expense','other').required(),
  entityId:     joiSchemas.mongoId.optional(),
  entityRef:    Joi.string().max(100).optional(),
  customerName: Joi.string().max(150).optional(),
  customerPhone:Joi.string().max(20).optional(),
  callbackUrl:  Joi.string().uri().optional(),
  metadata:     Joi.object().optional(),
});

export async function initializePayment(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { error, value } = initSchema.validate(req.body, { abortEarly: false });
    if (error) { res.status(400).json({ success: false, message: error.details.map(d => d.message).join('; ') }); return; }

    const result = await paystackService.initializeTransaction(
      value,
      req.user?.tenantId ?? 'default',
      req.user?.userId
    );
    respond.created(res, {
      message: 'Payment initialized',
      data: {
        reference:        result.reference,
        authorizationUrl: result.authorizationUrl,
        accessCode:       result.accessCode,
      },
    });
  } catch (e) { next(e); }
}

export async function verifyPayment(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const payment = await paystackService.verifyTransaction(
      req.params.reference,
      req.user?.tenantId ?? 'default'
    );
    respond.success(res, { message: `Payment ${payment.status}`, data: { payment } });
  } catch (e) { next(e); }
}

export async function getPayment(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const payment = await paystackService.getPayment(
      req.params.reference,
      req.user?.tenantId ?? 'default'
    );
    respond.success(res, { message: 'Payment retrieved', data: { payment } });
  } catch (e) { next(e); }
}

export async function listPayments(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await paystackService.listPayments(
      req.query as Record<string, string>,
      req.user?.tenantId ?? 'default'
    );
    respond.success(res, { message: 'Payments retrieved', data: result });
  } catch (e) { next(e); }
}

// ── Webhook — no auth middleware, raw body required ───────────────────────────
export async function paystackWebhook(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const signature = req.headers['x-paystack-signature'] as string;
    if (!signature) { res.status(400).json({ message: 'Missing signature' }); return; }

    const payload = JSON.stringify(req.body);
    // tenantId from metadata or header fallback
    const tenantId = (req.body?.data?.metadata?.tenantId as string) ?? 'default';

    const result = await paystackService.handleWebhook(payload, signature, tenantId);

    // Always return 200 to Paystack to prevent retries
    res.status(200).json({ received: true, ...result });
  } catch (e) {
    // Still 200 — log but don't fail
    res.status(200).json({ received: true, error: (e as Error).message });
  }
}
