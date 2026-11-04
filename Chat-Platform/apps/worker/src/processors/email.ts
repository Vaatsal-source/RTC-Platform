import nodemailer, { type Transporter } from 'nodemailer';
import type { EmailJobData } from '@repo/queue';
import { config, logger } from '../env.js';

// Email Queue:  Event → Queue → Worker → Email
// With SMTP_HOST unset (local dev) we use nodemailer's JSON transport: the fully
// rendered message is logged instead of sent, so the whole pipeline is testable offline.

let transporter: Transporter | null = null;

export function getTransporter(): Transporter {
  if (!transporter) {
    transporter = config.SMTP_HOST
      ? nodemailer.createTransport({
          host: config.SMTP_HOST,
          port: config.SMTP_PORT,
          secure: config.SMTP_PORT === 465,
          auth: config.SMTP_USER ? { user: config.SMTP_USER, pass: config.SMTP_PASS } : undefined,
        })
      : nodemailer.createTransport({ jsonTransport: true });
  }
  return transporter;
}

export async function processEmail({ to, subject, body }: EmailJobData): Promise<void> {
  const info = await getTransporter().sendMail({ from: config.EMAIL_FROM, to, subject, text: body });
  if (!config.SMTP_HOST) logger.info('email (dev: not actually sent)', { to, subject });
  else logger.info('email sent', { to, subject, messageId: info.messageId });
}
