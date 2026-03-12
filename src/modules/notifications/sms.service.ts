import twilio from 'twilio';
import env from '../../config/env';
import logger from '../../config/logger';

let twilioClient: ReturnType<typeof twilio> | null = null;

if (env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN) {
  twilioClient = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
}

export class SmsService {
  // ── Core send method ────────────────────────────────────────────────────────
  async sendSms(to: string, message: string): Promise<boolean> {
    if (!twilioClient) {
      logger.warn(`SMS skipped (Twilio not configured): ${to}`);
      if (env.NODE_ENV === 'development') {
        logger.info(`[DEV SMS] To: ${to}\nMessage: ${message}`);
      }
      return false;
    }

    try {
      await twilioClient.messages.create({
        body: message,
        from: env.TWILIO_PHONE_NUMBER,
        to,
      });

      logger.info(`SMS sent to ${to}`);
      return true;
    } catch (error) {
      logger.error(`SMS send failed to ${to}: ${(error as Error).message}`);
      return false;
    }
  }

  // ── WhatsApp Message ─────────────────────────────────────────────────────────
  async sendWhatsApp(to: string, message: string): Promise<boolean> {
    if (!twilioClient) {
      logger.warn(`WhatsApp skipped (Twilio not configured): ${to}`);
      return false;
    }

    try {
      await twilioClient.messages.create({
        body: message,
        from: env.TWILIO_WHATSAPP_NUMBER,
        to: `whatsapp:${to}`,
      });

      logger.info(`WhatsApp sent to ${to}`);
      return true;
    } catch (error) {
      logger.error(`WhatsApp send failed to ${to}: ${(error as Error).message}`);
      return false;
    }
  }

  // ── Send OTP ──────────────────────────────────────────────────────────────
  async sendOTP(phone: string, otp: string): Promise<boolean> {
    const message = `Your Ebeano Inventory OTP is: ${otp}. Valid for ${env.OTP_EXPIRES_MINUTES} minutes. Do not share with anyone.`;
    return this.sendSms(phone, message);
  }

  // ── Low Stock Alert ─────────────────────────────────────────────────────────
  async sendLowStockSms(phone: string, productCount: number): Promise<boolean> {
    const message = `⚠️ Ebeano Alert: ${productCount} product(s) are running low on stock. Login to restock.`;
    return this.sendSms(phone, message);
  }

  // ── Payment Received ─────────────────────────────────────────────────────────
  async sendPaymentConfirmation(
    phone: string,
    amount: number,
    reference: string
  ): Promise<boolean> {
    const message = `✅ Payment of ₦${amount.toLocaleString()} received. Ref: ${reference}. Thank you for shopping at Ebeano!`;
    return this.sendSms(phone, message);
  }

  // ── Order Notification ────────────────────────────────────────────────────
  async sendOrderNotification(
    phone: string,
    orderNumber: string,
    total: number
  ): Promise<boolean> {
    const message = `🛍️ Order ${orderNumber} confirmed. Total: ₦${total.toLocaleString()}. Thank you for shopping at Ebeano Supermarket!`;
    return this.sendSms(phone, message);
  }

  // ── Room Booking Confirmation ─────────────────────────────────────────────
  async sendBookingConfirmation(
    phone: string,
    guestName: string,
    roomNumber: string,
    checkIn: string,
    checkOut: string
  ): Promise<boolean> {
    const message = `🏨 Booking confirmed for ${guestName}!\nRoom ${roomNumber}\nCheck-in: ${checkIn}\nCheck-out: ${checkOut}\nEbeano Hotel`;
    return this.sendSms(phone, message);
  }
}

export const smsService = new SmsService();
