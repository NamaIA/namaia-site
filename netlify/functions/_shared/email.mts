import { optionalEnv } from './env.mts';

type EmailInput = {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
};

export function hasEmailConfig() {
  return Boolean(optionalEnv('RESEND_API_KEY') && optionalEnv('EMAIL_FROM'));
}

export function adminEmail() {
  return optionalEnv('ADMIN_EMAIL') || 'namaiab2b@gmail.com';
}

export async function sendEmail(input: EmailInput) {
  const apiKey = optionalEnv('RESEND_API_KEY');
  const from = optionalEnv('EMAIL_FROM');

  if (!apiKey || !from) {
    throw new Error('Email service is not configured. Missing RESEND_API_KEY or EMAIL_FROM.');
  }

  const payload: Record<string, unknown> = {
    from,
    to: Array.isArray(input.to) ? input.to : [input.to],
    subject: input.subject,
    text: input.text,
  };

  if (input.html) payload.html = input.html;
  if (input.replyTo) payload.reply_to = input.replyTo;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Email send failed: ${response.status} ${body.slice(0, 500)}`);
  }
}
