import crypto from 'crypto';
import axios, { AxiosInstance } from 'axios';
import Payment, { IPayment } from './payment.model';
import Sale from '../sales/sale.model';
import Booking from '../hotel/booking.model';
import env from '../../config/env';
import logger from '../../config/logger';
import { NotFoundError, BadRequestError } from '../../shared/utils/errors';
import { Types } from 'mongoose';

// ── Paystack API Response Types ─────────────────────────────────────────────
interface PaystackCustomer {
  id: number;
  first_name?: string;
  last_name?: string;
  email: string;
  phone?: string;
}

interface PaystackAuthorization {
  authorization_code: string;
  card_type: string;
  last4: string;
  bank: string;
  bin: string;
  exp_month: string;
  exp_year: string;
  channel: string;
  signature: string;
  reusable: boolean;
  country_code: string;
}

// interface PaystackTransactionData {
//   id: number;
//   reference: string;
//   status: 'success' | 'failed' | 'abandoned' | 'pending';
//   amount: number;
//   currency: string;
//   channel: string;
//   fees?: number;
//   paid_at?: string;
//   created_at: string;
//   customer?: PaystackCustomer;
//   authorization?: PaystackAuthorization;
//   metadata?: Record<string, unknown>;
//   gateway_response?: string;
//   transaction_date: string;
// }

// Update the PaystackTransactionData interface to include an index signature
interface PaystackTransactionData {
  id: number;
  reference: string;
  status: 'success' | 'failed' | 'abandoned' | 'pending';
  amount: number;
  currency: string;
  channel: string;
  fees?: number;
  paid_at?: string;
  created_at: string;
  customer?: PaystackCustomer;
  authorization?: PaystackAuthorization;
  metadata?: Record<string, unknown>;
  gateway_response?: string;
  transaction_date: string;
  [key: string]: unknown;  // Add index signature
}

interface PaystackInitializeResponse {
  status: boolean;
  message: string;
  data: {
    authorization_url: string;
    access_code: string;
    reference: string;
  };
}

interface PaystackVerifyResponse {
  status: boolean;
  message: string;
  data: PaystackTransactionData;
}

interface PaystackWebhookPayload {
  event: string;
  data: PaystackTransactionData;
}

// ── Paystack HTTP client ──────────────────────────────────────────────────────
const paystackHttp: AxiosInstance = axios.create({
  baseURL: env.PAYSTACK_BASE_URL,
  headers: {
    Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`,
    'Content-Type': 'application/json',
  },
  timeout: 30_000,
});

// ── Reference generator ───────────────────────────────────────────────────────
function genReference(tenantId: string): string {
  const ts   = Date.now().toString(36).toUpperCase();
  const rand = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `EBN-${tenantId.slice(0, 4).toUpperCase()}-${ts}-${rand}`;
}

// ── Kobo ↔ NGN helpers ────────────────────────────────────────────────────────
const toKobo  = (ngn: number): number => Math.round(ngn * 100);
const fromKobo = (kobo: number): number => parseFloat((kobo / 100).toFixed(2));

export class PaystackService {

  // ── 1. Initialize transaction ─────────────────────────────────────────────
  async initializeTransaction(
    input: {
      email: string;
      amountNGN: number;
      entityType: IPayment['entityType'];
      entityId?: string;
      entityRef?: string;
      customerName?: string;
      customerPhone?: string;
      metadata?: Record<string, unknown>;
      callbackUrl?: string;
    },
    tenantId: string,
    userId?: string
  ): Promise<{ reference: string; authorizationUrl: string; accessCode: string; payment: IPayment }> {

    if (!env.PAYSTACK_SECRET_KEY) {
      throw new BadRequestError('Paystack is not configured — add PAYSTACK_SECRET_KEY to environment');
    }

    const reference = genReference(tenantId);
    const amountKobo = toKobo(input.amountNGN);

    // Create local payment record first (pending)
    const payment = await Payment.create({
      reference,
      gateway:       'paystack',
      status:        'pending',
      amount:        amountKobo,
      amountNGN:     input.amountNGN,
      currency:      'NGN',
      entityType:    input.entityType,
      entityId:      input.entityId ? new Types.ObjectId(input.entityId) : undefined,
      entityRef:     input.entityRef,
      customerEmail: input.email,
      customerName:  input.customerName,
      customerPhone: input.customerPhone,
      metadata:      input.metadata,
      tenantId,
      createdBy:     userId,
    });

    try {
      const { data } = await paystackHttp.post<PaystackInitializeResponse>('/transaction/initialize', {
        email:        input.email,
        amount:       amountKobo,
        reference,
        callback_url: input.callbackUrl ?? `${env.API_BASE_URL}/payments/paystack/callback`,
        metadata:     {
          tenantId,
          entityType: input.entityType,
          entityId:   input.entityId,
          entityRef:  input.entityRef,
          customerName: input.customerName,
          ...(input.metadata ?? {}),
        },
        channels: ['card', 'bank', 'ussd', 'qr', 'bank_transfer'],
      });

      if (!data.status) throw new Error(data.message ?? 'Paystack initialization failed');

      // Update with Paystack reference
      await Payment.findByIdAndUpdate(payment._id, { paystackRef: data.data.reference });

      logger.info(`Paystack init: ref=${reference} amount=₦${input.amountNGN} entity=${input.entityType}`);

      return {
        reference,
        authorizationUrl: data.data.authorization_url,
        accessCode:       data.data.access_code,
        payment,
      };
    } catch (err) {
      // Mark as failed if Paystack call itself fails
      await Payment.findByIdAndUpdate(payment._id, {
        status:        'failed',
        failureReason: (err as Error).message,
      });
      throw err;
    }
  }

  // ── 2. Verify transaction ─────────────────────────────────────────────────
  async verifyTransaction(reference: string, tenantId: string): Promise<IPayment> {
    const payment = await Payment.findOne({ reference, tenantId });
    if (!payment) throw new NotFoundError('Payment');

    if (payment.status === 'success') return payment; // Already verified

    if (!env.PAYSTACK_SECRET_KEY) {
      throw new BadRequestError('Paystack is not configured');
    }

    const { data } = await paystackHttp.get<PaystackVerifyResponse>(`/transaction/verify/${reference}`);

    if (!data.status) throw new BadRequestError(data.message ?? 'Verification failed');

    const txn = data.data;
    const isSuccess = txn.status === 'success';

    const updates: Partial<IPayment> = {
      status:        isSuccess ? 'success' : txn.status,
      paystackId:    String(txn.id),
      paystackRef:   txn.reference,
      channel:       txn.channel as IPayment['channel'], // Type assertion since Paystack channels match our enum
      fee:           txn.fees ? fromKobo(txn.fees) : undefined,
      netAmount:     txn.fees ? fromKobo(txn.amount - txn.fees) : undefined,
      paidAt:        isSuccess ? new Date(txn.paid_at as string) : undefined,
      authorizationCode: txn.authorization?.authorization_code,
      cardType:          txn.authorization?.card_type,
      cardLast4:         txn.authorization?.last4,
      bank:              txn.authorization?.bank,
      webhookData:       txn,
    };

    const updated = await Payment.findByIdAndUpdate(payment._id, updates, { new: true }) as IPayment;

    // Post-payment actions
    if (isSuccess) {
      await this._postPaymentSuccess(updated);
    }

    logger.info(`Paystack verify: ref=${reference} status=${txn.status} channel=${txn.channel}`);
    return updated;
  }

  // ── 3. Charge authorization (recurring) ──────────────────────────────────
  async chargeAuthorization(
    input: {
      authorizationCode: string;
      email: string;
      amountNGN: number;
      entityType: IPayment['entityType'];
      entityId?: string;
      entityRef?: string;
    },
    tenantId: string,
    userId?: string
  ): Promise<IPayment> {
    const reference  = genReference(tenantId);
    const amountKobo = toKobo(input.amountNGN);

    const payment = await Payment.create({
      reference,
      gateway:       'paystack',
      status:        'pending',
      amount:        amountKobo,
      amountNGN:     input.amountNGN,
      currency:      'NGN',
      entityType:    input.entityType,
      entityId:      input.entityId ? new Types.ObjectId(input.entityId) : undefined,
      entityRef:     input.entityRef,
      customerEmail: input.email,
      tenantId,
      createdBy:     userId,
    });

    const { data } = await paystackHttp.post<PaystackVerifyResponse>('/transaction/charge_authorization', {
      authorization_code: input.authorizationCode,
      email:      input.email,
      amount:     amountKobo,
      reference,
    });

    const txn = data.data;
    const isSuccess = txn.status === 'success';

    const updates: Partial<IPayment> = {
      status:    isSuccess ? 'success' : txn.status,
      paystackId: String(txn.id),
      channel:   txn.channel as IPayment['channel'],
      paidAt:     isSuccess ? new Date() : undefined,
    };

    const updated = await Payment.findByIdAndUpdate(payment._id, updates, { new: true }) as IPayment;
    if (isSuccess) await this._postPaymentSuccess(updated);

    return updated;
  }

  // ── 4. Webhook handler ────────────────────────────────────────────────────
  async handleWebhook(payload: string, signature: string, tenantId: string): Promise<{ handled: boolean; event: string }> {
    // Verify signature
    const hash = crypto
      .createHmac('sha512', env.PAYSTACK_WEBHOOK_SECRET)
      .update(payload)
      .digest('hex');

    if (hash !== signature) {
      logger.warn('Paystack webhook signature mismatch');
      return { handled: false, event: 'invalid_signature' };
    }

    const webhookData = JSON.parse(payload) as PaystackWebhookPayload;
    logger.info(`Paystack webhook: ${webhookData.event} ref=${webhookData.data?.reference}`);

    switch (webhookData.event) {
      case 'charge.success':
        await this._handleChargeSuccess(webhookData.data, tenantId);
        break;
      case 'charge.failed':
        await Payment.findOneAndUpdate(
          { reference: webhookData.data.reference },
          { status: 'failed', failureReason: webhookData.data.gateway_response, webhookData: webhookData.data }
        );
        break;
      case 'refund.processed':
        await Payment.findOneAndUpdate(
          { reference: webhookData.data.reference },
          { status: 'reversed', webhookData: webhookData.data }
        );
        break;
      default:
        logger.debug(`Unhandled Paystack event: ${webhookData.event}`);
    }

    return { handled: true, event: webhookData.event };
  }

  // ── 5. Get payment by reference ───────────────────────────────────────────
  async getPayment(reference: string, tenantId: string): Promise<IPayment> {
    const p = await Payment.findOne({ reference, tenantId });
    if (!p) throw new NotFoundError('Payment');
    return p;
  }

  // ── 6. List payments ──────────────────────────────────────────────────────
  async listPayments(
    query: {
      entityType?: string; entityId?: string; status?: string;
      from?: string; to?: string; page?: string; limit?: string;
    },
    tenantId: string
  ) {
    const page  = parseInt(query.page  ?? '1', 10);
    const limit = parseInt(query.limit ?? '20', 10);
    const skip  = (page - 1) * limit;

    const filter: Record<string, unknown> = { tenantId, gateway: 'paystack' };
    if (query.entityType) filter.entityType = query.entityType;
    if (query.entityId)   filter.entityId   = query.entityId;
    if (query.status)     filter.status     = query.status;
    if (query.from || query.to) {
      filter.createdAt = {
        ...(query.from ? { $gte: new Date(query.from) } : {}),
        ...(query.to   ? { $lte: new Date(query.to)   } : {}),
      };
    }

    const [data, total] = await Promise.all([
      Payment.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Payment.countDocuments(filter),
    ]);

    return {
      data,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  // ── Private: post-payment success handler ─────────────────────────────────
  private async _postPaymentSuccess(payment: IPayment): Promise<void> {
    try {
      if (payment.entityType === 'sale' && payment.entityId) {
        await Sale.findByIdAndUpdate(payment.entityId, {
          $push: { payments: { method: 'card', amount: payment.amountNGN, reference: payment.reference, paidAt: payment.paidAt } },
        });
      } else if (payment.entityType === 'booking' && payment.entityId) {
        await Booking.findByIdAndUpdate(payment.entityId, {
          $push: {
            folioPayments: {
              method: 'card', amount: payment.amountNGN,
              reference: payment.reference, paidAt: payment.paidAt,
              notes: `Paystack ${payment.channel ?? 'card'} — ${payment.reference}`,
            },
          },
        });
      }
    } catch (err) {
      logger.error(`Post-payment update failed: ${(err as Error).message}`);
    }
  }

  private async _handleChargeSuccess(txnData: PaystackTransactionData, tenantId: string): Promise<void> {
    const reference = txnData.reference;
    const existing  = await Payment.findOne({ reference });

    if (existing) {
      await Payment.findOneAndUpdate({ reference }, {
        status:    'success',
        paystackId: String(txnData.id),
        paidAt:    new Date(txnData.paid_at as string),
        channel:   txnData.channel as IPayment['channel'],
        webhookData: txnData,
      });
      await this._postPaymentSuccess(await Payment.findOne({ reference }) as IPayment);
    } else {
      // Payment initiated outside the system (e.g. direct Paystack link)
      const meta = txnData.metadata ?? {};
      const p = await Payment.create({
        reference,
        gateway:       'paystack',
        status:        'success',
        amount:        txnData.amount,
        amountNGN:     fromKobo(txnData.amount),
        currency:      txnData.currency,
        channel:       txnData.channel as IPayment['channel'],
        customerEmail: txnData.customer?.email,
        paystackId:    String(txnData.id),
        entityType:    (meta.entityType as IPayment['entityType']) ?? 'other',
        entityId:      meta.entityId ? new Types.ObjectId(meta.entityId as string) : undefined,
        paidAt:        new Date(txnData.paid_at as string),
        webhookData:   txnData,
        tenantId:      (meta.tenantId as string) ?? tenantId,
      });
      await this._postPaymentSuccess(p);
    }
  }
}

export const paystackService = new PaystackService();




// import crypto from 'crypto';
// import axios, { AxiosInstance } from 'axios';
// import Payment, { IPayment } from './payment.model';
// import Sale from '../sales/sale.model';
// import Booking from '../hotel/booking.model';
// import env from '../../config/env';
// import logger from '../../config/logger';
// import { NotFoundError, BadRequestError } from '../../shared/utils/errors';
// import { Types } from 'mongoose';

// // ── Paystack HTTP client ──────────────────────────────────────────────────────
// const paystackHttp: AxiosInstance = axios.create({
//   baseURL: env.PAYSTACK_BASE_URL,
//   headers: {
//     Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`,
//     'Content-Type': 'application/json',
//   },
//   timeout: 30_000,
// });

// // ── Reference generator ───────────────────────────────────────────────────────
// function genReference(tenantId: string): string {
//   const ts   = Date.now().toString(36).toUpperCase();
//   const rand = crypto.randomBytes(4).toString('hex').toUpperCase();
//   return `EBN-${tenantId.slice(0, 4).toUpperCase()}-${ts}-${rand}`;
// }

// // ── Kobo ↔ NGN helpers ────────────────────────────────────────────────────────
// const toKobo  = (ngn: number): number => Math.round(ngn * 100);
// const fromKobo = (kobo: number): number => parseFloat((kobo / 100).toFixed(2));

// export class PaystackService {

//   // ── 1. Initialize transaction ─────────────────────────────────────────────
//   async initializeTransaction(
//     input: {
//       email: string;
//       amountNGN: number;
//       entityType: IPayment['entityType'];
//       entityId?: string;
//       entityRef?: string;
//       customerName?: string;
//       customerPhone?: string;
//       metadata?: Record<string, unknown>;
//       callbackUrl?: string;
//     },
//     tenantId: string,
//     userId?: string
//   ): Promise<{ reference: string; authorizationUrl: string; accessCode: string; payment: IPayment }> {

//     if (!env.PAYSTACK_SECRET_KEY) {
//       throw new BadRequestError('Paystack is not configured — add PAYSTACK_SECRET_KEY to environment');
//     }

//     const reference = genReference(tenantId);
//     const amountKobo = toKobo(input.amountNGN);

//     // Create local payment record first (pending)
//     const payment = await Payment.create({
//       reference,
//       gateway:       'paystack',
//       status:        'pending',
//       amount:        amountKobo,
//       amountNGN:     input.amountNGN,
//       currency:      'NGN',
//       entityType:    input.entityType,
//       entityId:      input.entityId ? new Types.ObjectId(input.entityId) : undefined,
//       entityRef:     input.entityRef,
//       customerEmail: input.email,
//       customerName:  input.customerName,
//       customerPhone: input.customerPhone,
//       metadata:      input.metadata,
//       tenantId,
//       createdBy:     userId,
//     });

//     try {
//       const { data } = await paystackHttp.post('/transaction/initialize', {
//         email:        input.email,
//         amount:       amountKobo,
//         reference,
//         callback_url: input.callbackUrl ?? `${env.API_BASE_URL}/payments/paystack/callback`,
//         metadata:     {
//           tenantId,
//           entityType: input.entityType,
//           entityId:   input.entityId,
//           entityRef:  input.entityRef,
//           customerName: input.customerName,
//           ...(input.metadata ?? {}),
//         },
//         channels: ['card', 'bank', 'ussd', 'qr', 'bank_transfer'],
//       });

//       if (!data.status) throw new Error(data.message ?? 'Paystack initialization failed');

//       // Update with Paystack reference
//       await Payment.findByIdAndUpdate(payment._id, { paystackRef: data.data.reference });

//       logger.info(`Paystack init: ref=${reference} amount=₦${input.amountNGN} entity=${input.entityType}`);

//       return {
//         reference,
//         authorizationUrl: data.data.authorization_url,
//         accessCode:       data.data.access_code,
//         payment,
//       };
//     } catch (err) {
//       // Mark as failed if Paystack call itself fails
//       await Payment.findByIdAndUpdate(payment._id, {
//         status:        'failed',
//         failureReason: (err as Error).message,
//       });
//       throw err;
//     }
//   }

//   // ── 2. Verify transaction ─────────────────────────────────────────────────
//   async verifyTransaction(reference: string, tenantId: string): Promise<IPayment> {
//     const payment = await Payment.findOne({ reference, tenantId });
//     if (!payment) throw new NotFoundError('Payment');

//     if (payment.status === 'success') return payment; // Already verified

//     if (!env.PAYSTACK_SECRET_KEY) {
//       throw new BadRequestError('Paystack is not configured');
//     }

//     const { data } = await paystackHttp.get(`/transaction/verify/${reference}`);

//     if (!data.status) throw new BadRequestError(data.message ?? 'Verification failed');

//     const txn = data.data;
//     const isSuccess = txn.status === 'success';

//     const updates: Partial<IPayment> = {
//       status:        isSuccess ? 'success' : txn.status,
//       paystackId:    String(txn.id),
//       paystackRef:   txn.reference,
//       channel:       txn.channel,
//       fee:           txn.fees ? fromKobo(txn.fees) : undefined,
//       netAmount:     txn.fees ? fromKobo(txn.amount - txn.fees) : undefined,
//       paidAt:        isSuccess ? new Date(txn.paid_at) : undefined,
//       authorizationCode: txn.authorization?.authorization_code,
//       cardType:          txn.authorization?.card_type,
//       cardLast4:         txn.authorization?.last4,
//       bank:              txn.authorization?.bank,
//       webhookData:       txn,
//     };

//     const updated = await Payment.findByIdAndUpdate(payment._id, updates, { new: true }) as IPayment;

//     // Post-payment actions
//     if (isSuccess) {
//       await this._postPaymentSuccess(updated);
//     }

//     logger.info(`Paystack verify: ref=${reference} status=${txn.status} channel=${txn.channel}`);
//     return updated;
//   }

//   // ── 3. Charge authorization (recurring) ──────────────────────────────────
//   async chargeAuthorization(
//     input: {
//       authorizationCode: string;
//       email: string;
//       amountNGN: number;
//       entityType: IPayment['entityType'];
//       entityId?: string;
//       entityRef?: string;
//     },
//     tenantId: string,
//     userId?: string
//   ): Promise<IPayment> {
//     const reference  = genReference(tenantId);
//     const amountKobo = toKobo(input.amountNGN);

//     const payment = await Payment.create({
//       reference,
//       gateway:       'paystack',
//       status:        'pending',
//       amount:        amountKobo,
//       amountNGN:     input.amountNGN,
//       currency:      'NGN',
//       entityType:    input.entityType,
//       entityId:      input.entityId ? new Types.ObjectId(input.entityId) : undefined,
//       entityRef:     input.entityRef,
//       customerEmail: input.email,
//       tenantId,
//       createdBy:     userId,
//     });

//     const { data } = await paystackHttp.post('/transaction/charge_authorization', {
//       authorization_code: input.authorizationCode,
//       email:      input.email,
//       amount:     amountKobo,
//       reference,
//     });

//     const txn = data.data;
//     const isSuccess = txn.status === 'success';

//     const updates: Partial<IPayment> = {
//       status:    isSuccess ? 'success' : txn.status,
//       paystackId: String(txn.id),
//       channel:    txn.channel,
//       paidAt:     isSuccess ? new Date() : undefined,
//     };

//     const updated = await Payment.findByIdAndUpdate(payment._id, updates, { new: true }) as IPayment;
//     if (isSuccess) await this._postPaymentSuccess(updated);

//     return updated;
//   }

//   // ── 4. Webhook handler ────────────────────────────────────────────────────
//   async handleWebhook(payload: string, signature: string, tenantId: string): Promise<{ handled: boolean; event: string }> {
//     // Verify signature
//     const hash = crypto
//       .createHmac('sha512', env.PAYSTACK_WEBHOOK_SECRET)
//       .update(payload)
//       .digest('hex');

//     if (hash !== signature) {
//       logger.warn('Paystack webhook signature mismatch');
//       return { handled: false, event: 'invalid_signature' };
//     }

//     const event = JSON.parse(payload);
//     logger.info(`Paystack webhook: ${event.event} ref=${event.data?.reference}`);

//     switch (event.event) {
//       case 'charge.success':
//         await this._handleChargeSuccess(event.data, tenantId);
//         break;
//       case 'charge.failed':
//         await Payment.findOneAndUpdate(
//           { reference: event.data.reference },
//           { status: 'failed', failureReason: event.data.gateway_response, webhookData: event.data }
//         );
//         break;
//       case 'refund.processed':
//         await Payment.findOneAndUpdate(
//           { reference: event.data.transaction_reference },
//           { status: 'reversed', webhookData: event.data }
//         );
//         break;
//       default:
//         logger.debug(`Unhandled Paystack event: ${event.event}`);
//     }

//     return { handled: true, event: event.event };
//   }

//   // ── 5. Get payment by reference ───────────────────────────────────────────
//   async getPayment(reference: string, tenantId: string): Promise<IPayment> {
//     const p = await Payment.findOne({ reference, tenantId });
//     if (!p) throw new NotFoundError('Payment');
//     return p;
//   }

//   // ── 6. List payments ──────────────────────────────────────────────────────
//   async listPayments(
//     query: {
//       entityType?: string; entityId?: string; status?: string;
//       from?: string; to?: string; page?: string; limit?: string;
//     },
//     tenantId: string
//   ) {
//     const page  = parseInt(query.page  ?? '1', 10);
//     const limit = parseInt(query.limit ?? '20', 10);
//     const skip  = (page - 1) * limit;

//     const filter: Record<string, unknown> = { tenantId, gateway: 'paystack' };
//     if (query.entityType) filter.entityType = query.entityType;
//     if (query.entityId)   filter.entityId   = query.entityId;
//     if (query.status)     filter.status     = query.status;
//     if (query.from || query.to) {
//       filter.createdAt = {
//         ...(query.from ? { $gte: new Date(query.from) } : {}),
//         ...(query.to   ? { $lte: new Date(query.to)   } : {}),
//       };
//     }

//     const [data, total] = await Promise.all([
//       Payment.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
//       Payment.countDocuments(filter),
//     ]);

//     return {
//       data,
//       pagination: { page, limit, total, pages: Math.ceil(total / limit) },
//     };
//   }

//   // ── Private: post-payment success handler ─────────────────────────────────
//   private async _postPaymentSuccess(payment: IPayment): Promise<void> {
//     try {
//       if (payment.entityType === 'sale' && payment.entityId) {
//         await Sale.findByIdAndUpdate(payment.entityId, {
//           $push: { payments: { method: 'card', amount: payment.amountNGN, reference: payment.reference, paidAt: payment.paidAt } },
//         });
//       } else if (payment.entityType === 'booking' && payment.entityId) {
//         await Booking.findByIdAndUpdate(payment.entityId, {
//           $push: {
//             folioPayments: {
//               method: 'card', amount: payment.amountNGN,
//               reference: payment.reference, paidAt: payment.paidAt,
//               notes: `Paystack ${payment.channel ?? 'card'} — ${payment.reference}`,
//             },
//           },
//         });
//       }
//     } catch (err) {
//       logger.error(`Post-payment update failed: ${(err as Error).message}`);
//     }
//   }

//   private async _handleChargeSuccess(data: Record<string, unknown>, tenantId: string): Promise<void> {
//     const reference = data.reference as string;
//     const existing  = await Payment.findOne({ reference });

//     if (existing) {
//       await Payment.findOneAndUpdate({ reference }, {
//         status:    'success',
//         paystackId: String(data.id),
//         paidAt:    new Date(data.paid_at as string),
//         channel:   data.channel,
//         webhookData: data,
//       });
//       await this._postPaymentSuccess(await Payment.findOne({ reference }) as IPayment);
//     } else {
//       // Payment initiated outside the system (e.g. direct Paystack link)
//       const meta = (data.metadata as Record<string, unknown>) ?? {};
//       const p = await Payment.create({
//         reference,
//         gateway:       'paystack',
//         status:        'success',
//         amount:        data.amount as number,
//         amountNGN:     fromKobo(data.amount as number),
//         currency:      'NGN',
//         channel:       data.channel,
//         customerEmail: (data.customer as Record<string, unknown>)?.email,
//         paystackId:    String(data.id),
//         entityType:    (meta.entityType as IPayment['entityType']) ?? 'other',
//         entityId:      meta.entityId ? new Types.ObjectId(meta.entityId as string) : undefined,
//         paidAt:        new Date(data.paid_at as string),
//         webhookData:   data,
//         tenantId:      (meta.tenantId as string) ?? tenantId,
//       });
//       await this._postPaymentSuccess(p);
//     }
//   }
// }

// export const paystackService = new PaystackService();
