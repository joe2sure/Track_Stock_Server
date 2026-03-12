import sgMail from '@sendgrid/mail';
import env from '../../config/env';
import logger from '../../config/logger';

if (env.SENDGRID_API_KEY) {
  sgMail.setApiKey(env.SENDGRID_API_KEY);
}

interface EmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  attachments?: Array<{
    content: string;
    filename: string;
    type: string;
    disposition: string;
  }>;
}

// ── Email templates ──────────────────────────────────────────────────────────
function emailWrapper(content: string, title: string): string {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title}</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f8fafc; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 40px auto; background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
        .header { background: linear-gradient(135deg, #2563eb, #1d4ed8); padding: 32px 40px; text-align: center; }
        .header h1 { color: #fff; margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.5px; }
        .header p { color: #bfdbfe; margin: 8px 0 0; font-size: 14px; }
        .body { padding: 40px; }
        .body p { color: #374151; line-height: 1.6; font-size: 15px; margin: 0 0 16px; }
        .btn { display: inline-block; background: #2563eb; color: #fff; padding: 14px 32px; border-radius: 10px; text-decoration: none; font-weight: 700; font-size: 15px; margin: 8px 0; }
        .code { background: #eff6ff; border: 2px solid #bfdbfe; border-radius: 10px; padding: 20px; text-align: center; font-size: 32px; font-weight: 900; letter-spacing: 8px; color: #1d4ed8; margin: 20px 0; }
        .divider { height: 1px; background: #f1f5f9; margin: 24px 0; }
        .footer { background: #f8fafc; padding: 24px 40px; text-align: center; }
        .footer p { color: #94a3b8; font-size: 12px; margin: 0; }
        .warning { background: #fef3c7; border: 1px solid #fcd34d; border-radius: 8px; padding: 12px 16px; font-size: 13px; color: #92400e; margin: 16px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🏪 Ebeano Inventory</h1>
          <p>AI-Integrated Inventory Management</p>
        </div>
        <div class="body">${content}</div>
        <div class="footer">
          <p>© ${new Date().getFullYear()} Ebeano Supermarket. All rights reserved.</p>
          <p>This email was sent from an automated system. Please do not reply.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

export class EmailService {
  private readonly from = {
    email: env.SENDGRID_FROM_EMAIL,
    name: env.SENDGRID_FROM_NAME,
  };

  // ── Core send method ────────────────────────────────────────────────────────
  async sendEmail(options: EmailOptions): Promise<boolean> {
    if (!env.SENDGRID_API_KEY) {
      logger.warn(`Email skipped (no API key): ${options.subject} → ${options.to}`);
      if (env.NODE_ENV === 'development') {
        logger.info(`[DEV EMAIL] To: ${options.to}\nSubject: ${options.subject}`);
      }
      return false;
    }

    try {
      const to = Array.isArray(options.to) ? options.to : [options.to];
      await sgMail.send({
        to,
        from: this.from,
        subject: options.subject,
        html: options.html,
        text: options.text ?? options.subject,
        ...(options.attachments && { attachments: options.attachments }),
      });

      logger.info(`Email sent: "${options.subject}" → ${to.join(', ')}`);
      return true;
    } catch (error) {
      logger.error(`Email send failed: ${(error as Error).message}`, {
        to: options.to,
        subject: options.subject,
      });
      return false;
    }
  }

  // ── Verification Email ──────────────────────────────────────────────────────
  async sendVerificationEmail(
    email: string,
    name: string,
    token: string
  ): Promise<boolean> {
    const verifyUrl = `${env.API_BASE_URL}/verify-email?token=${token}`;

    const content = `
      <p>Hi <strong>${name}</strong>,</p>
      <p>Welcome to Ebeano Inventory! Please verify your email address to activate your account.</p>
      <p style="text-align:center;">
        <a href="${verifyUrl}" class="btn">Verify Email Address</a>
      </p>
      <p>Or copy this link into your browser:</p>
      <p style="word-break:break-all; color:#2563eb; font-size:13px;">${verifyUrl}</p>
      <div class="warning">⚠️ This link expires in <strong>24 hours</strong>.</div>
      <p>If you did not create an account, please ignore this email.</p>
    `;

    return this.sendEmail({
      to: email,
      subject: 'Verify Your Email – Ebeano Inventory',
      html: emailWrapper(content, 'Verify Email'),
    });
  }

  // ── Password Reset ──────────────────────────────────────────────────────────
  async sendPasswordResetEmail(
    email: string,
    name: string,
    token: string
  ): Promise<boolean> {
    const resetUrl = `${env.API_BASE_URL}/reset-password?token=${token}`;

    const content = `
      <p>Hi <strong>${name}</strong>,</p>
      <p>You requested a password reset for your Ebeano Inventory account.</p>
      <p style="text-align:center;">
        <a href="${resetUrl}" class="btn">Reset My Password</a>
      </p>
      <p>Or copy this link:</p>
      <p style="word-break:break-all; color:#2563eb; font-size:13px;">${resetUrl}</p>
      <div class="warning">⚠️ This link expires in <strong>1 hour</strong>. If you did not request this, please secure your account immediately.</div>
    `;

    return this.sendEmail({
      to: email,
      subject: 'Password Reset Request – Ebeano Inventory',
      html: emailWrapper(content, 'Reset Password'),
    });
  }

  // ── Password Changed Confirmation ───────────────────────────────────────────
  async sendPasswordChangedEmail(email: string, name: string): Promise<boolean> {
    const content = `
      <p>Hi <strong>${name}</strong>,</p>
      <p>Your Ebeano Inventory account password was changed successfully.</p>
      <p>If you made this change, no action is required.</p>
      <div class="warning">⚠️ If you did NOT make this change, please <a href="${env.API_BASE_URL}/forgot-password" style="color:#dc2626;">reset your password immediately</a> and contact support.</div>
      <div class="divider"></div>
      <p style="font-size:13px; color:#6b7280;">Changed at: ${new Date().toLocaleString('en-NG', { timeZone: 'Africa/Lagos' })} (WAT)</p>
    `;

    return this.sendEmail({
      to: email,
      subject: 'Password Changed – Ebeano Inventory',
      html: emailWrapper(content, 'Password Changed'),
    });
  }

  // ── Low Stock Alert ─────────────────────────────────────────────────────────
  async sendLowStockAlert(
    email: string,
    products: Array<{ name: string; currentStock: number; minStockLevel: number; sku: string }>
  ): Promise<boolean> {
    const rows = products.map(p => `
      <tr>
        <td style="padding:10px; border-bottom:1px solid #f1f5f9;">${p.name}</td>
        <td style="padding:10px; border-bottom:1px solid #f1f5f9; font-family:monospace;">${p.sku}</td>
        <td style="padding:10px; border-bottom:1px solid #f1f5f9; color:#dc2626; font-weight:700;">${p.currentStock}</td>
        <td style="padding:10px; border-bottom:1px solid #f1f5f9;">${p.minStockLevel}</td>
      </tr>
    `).join('');

    const content = `
      <p>🚨 The following products are running <strong>low on stock</strong>:</p>
      <table style="width:100%; border-collapse:collapse; margin:16px 0;">
        <thead>
          <tr style="background:#eff6ff;">
            <th style="padding:10px; text-align:left; font-size:12px; color:#6b7280; text-transform:uppercase;">Product</th>
            <th style="padding:10px; text-align:left; font-size:12px; color:#6b7280; text-transform:uppercase;">SKU</th>
            <th style="padding:10px; text-align:left; font-size:12px; color:#6b7280; text-transform:uppercase;">Current</th>
            <th style="padding:10px; text-align:left; font-size:12px; color:#6b7280; text-transform:uppercase;">Minimum</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p>Please review and restock these items to avoid stock-outs.</p>
    `;

    return this.sendEmail({
      to: email,
      subject: `⚠️ Low Stock Alert – ${products.length} Product(s) Need Attention`,
      html: emailWrapper(content, 'Low Stock Alert'),
    });
  }

  // ── Daily Sales Summary ─────────────────────────────────────────────────────
  async sendDailySalesSummary(
    email: string,
    summary: {
      date: string;
      totalSales: number;
      totalOrders: number;
      totalRevenue: number;
      topProduct: string;
    }
  ): Promise<boolean> {
    const content = `
      <p>Here is your daily sales summary for <strong>${summary.date}</strong>:</p>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin:20px 0;">
        <div style="background:#f0fdf4; border-radius:10px; padding:16px;">
          <p style="margin:0; font-size:12px; color:#6b7280; text-transform:uppercase;">Total Orders</p>
          <p style="margin:4px 0 0; font-size:28px; font-weight:900; color:#16a34a;">${summary.totalOrders}</p>
        </div>
        <div style="background:#eff6ff; border-radius:10px; padding:16px;">
          <p style="margin:0; font-size:12px; color:#6b7280; text-transform:uppercase;">Revenue</p>
          <p style="margin:4px 0 0; font-size:28px; font-weight:900; color:#2563eb;">₦${summary.totalRevenue.toLocaleString()}</p>
        </div>
      </div>
      <p>🏆 <strong>Top Product:</strong> ${summary.topProduct}</p>
    `;

    return this.sendEmail({
      to: email,
      subject: `📊 Daily Sales Summary – ${summary.date}`,
      html: emailWrapper(content, 'Daily Summary'),
    });
  }

  // ── Generic Notification ────────────────────────────────────────────────────
  async sendNotification(
    email: string,
    name: string,
    subject: string,
    message: string
  ): Promise<boolean> {
    const content = `
      <p>Hi <strong>${name}</strong>,</p>
      <p>${message}</p>
    `;

    return this.sendEmail({
      to: email,
      subject,
      html: emailWrapper(content, subject),
    });
  }
}

export const emailService = new EmailService();
