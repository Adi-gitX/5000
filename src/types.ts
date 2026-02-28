export type Lead = {
  id: number;
  lead_id: string;
  business_name: string;
  niche: string;
  city: string;
  website: string;
  email: string;
  linkedin_url: string;
  pain_signal: string;
  status: string;
  last_touch_at: string | null;
  next_touch_at: string | null;
  owner: string;
  timezone: string;
  optout_at: string | null;
  do_not_contact_reason: string;
  suppression_source: string;
  last_error: string;
  created_at: string;
  updated_at: string;
};

export type OutreachMessage = {
  subject: string;
  body: string;
};

export type JobRunResult = {
  job: string;
  processed: number;
  sent?: number;
  skipped?: number;
  details?: string;
};

export type SettingsMap = Record<string, string>;

export type ProviderAttempt = {
  provider: string;
  success: boolean;
  error?: string;
};

export type ModelGenerationResult = {
  text: string;
  providerUsed: string;
  attempts: ProviderAttempt[];
  fallbackUsed: boolean;
};

export type StripeWebhookPayload = {
  webhook_token: string;
  event_id: string;
  payment_id: string;
  amount: number | string;
  status: string;
  deal_id?: string;
  prospect_id?: string;
  client_id?: string;
  paid_at?: string;
  metadata?: Record<string, string>;
  [key: string]: unknown;
};

export type ReplyWebhookPayload = {
  reply_id: string;
  prospect_id?: string;
  email: string;
  body: string;
  received_at: string;
  message_id: string;
  [key: string]: unknown;
};
