import nodemailer, { type Transporter } from 'nodemailer';

import type { SettingsMap } from '../types.js';
import { buildId, isValidEmail, parseBoolean, parseNumber } from '../utils.js';

export type SendEmailResult = {
  deliveryStatus: 'sent' | 'dry_run' | 'failed';
  messageId: string;
  errorCode?: string;
};

let transporterCache: { key: string; transporter: Transporter } | null = null;

function createTransporter(settings: SettingsMap): Transporter | null {
  if (!settings.SMTP_HOST || !settings.SMTP_USER || !settings.SMTP_PASS) {
    return null;
  }

  const transportKey = [
    settings.SMTP_HOST,
    settings.SMTP_PORT,
    settings.SMTP_USER,
    settings.SMTP_SECURE,
    settings.SMTP_PASS
  ].join('|');

  if (transporterCache && transporterCache.key === transportKey) {
    return transporterCache.transporter;
  }

  const transporter = nodemailer.createTransport({
    host: settings.SMTP_HOST,
    port: parseNumber(settings.SMTP_PORT, 587),
    secure: parseBoolean(settings.SMTP_SECURE, false),
    auth: {
      user: settings.SMTP_USER,
      pass: settings.SMTP_PASS
    }
  });

  transporterCache = { key: transportKey, transporter };
  return transporter;
}

function classifyEmailFailure(errorText: string): string {
  const text = errorText.toLowerCase();
  if (text.includes('invalid') || text.includes('mailbox') || text.includes('recipient')) {
    return 'bounce';
  }
  if (text.includes('auth') || text.includes('credentials')) {
    return 'smtp_auth';
  }
  return 'send_error';
}

export async function sendEmail(
  to: string,
  subject: string,
  body: string,
  settings: SettingsMap,
  messageId: string = buildId('MSG')
): Promise<SendEmailResult> {
  if (!isValidEmail(to)) {
    return {
      deliveryStatus: 'failed',
      messageId,
      errorCode: 'invalid_email_format'
    };
  }

  const isDryRun = String(settings.DRY_RUN ?? 'TRUE').toUpperCase() === 'TRUE';
  if (isDryRun) {
    console.log(`[DRY_RUN] To=${to} Subject=${subject}`);
    return {
      deliveryStatus: 'dry_run',
      messageId
    };
  }

  const transporter = createTransporter(settings);
  if (!transporter) {
    return {
      deliveryStatus: 'failed',
      messageId,
      errorCode: 'smtp_not_configured'
    };
  }

  try {
    const result = await transporter.sendMail({
      from: settings.SMTP_USER,
      to,
      subject,
      text: body
    });

    return {
      deliveryStatus: 'sent',
      messageId: result.messageId || messageId
    };
  } catch (error) {
    return {
      deliveryStatus: 'failed',
      messageId,
      errorCode: classifyEmailFailure(String(error))
    };
  }
}
