export const STATUS = {
  READY: 'ready',
  FOLLOWUP_1_DUE: 'followup_1_due',
  FOLLOWUP_2_DUE: 'followup_2_due',
  COMPLETED_OUTREACH: 'completed_outreach',
  POSITIVE_REPLY: 'positive_reply',
  NEUTRAL_REPLY: 'neutral_reply',
  NEGATIVE_REPLY: 'negative_reply',
  SUPPRESSED_OPTOUT: 'suppressed_optout',
  SUPPRESSED_BOUNCE: 'suppressed_bounce',
  HOLD: 'hold',
  CLOSED_WON: 'closed_won',
  CLOSED_LOST: 'closed_lost'
} as const;

export const OUTREACH_STEPS = {
  STEP_1: 'step_1',
  STEP_2: 'step_2',
  STEP_3: 'step_3',
  REPLY_AUTOMATION: 'reply_automation'
} as const;

export const TERMINAL_SUPPRESSED = new Set<string>([STATUS.SUPPRESSED_OPTOUT, STATUS.SUPPRESSED_BOUNCE]);

export const SYSTEM_DEFAULT_SETTINGS: Record<string, string> = {
  OPERATOR_EMAIL: '',
  ADMIN_BOOTSTRAP_TOKEN: '',
  SENDER_NAME: 'Lead Reactivation Desk',
  OFFER_NAME: '14-Day Lead Reactivation Sprint + AI Booking Assistant',
  CALENDLY_LINK: '',
  STRIPE_DEPOSIT_LINK: '',
  STRIPE_FULL_LINK: '',
  STRIPE_WEBHOOK_TOKEN: '',
  DAILY_NEW_OUTREACH_CAP: '250',
  RUN_NEW_OUTREACH_CAP: '40',
  RUN_FOLLOWUP_CAP: '60',
  MAX_SENDS_PER_HOUR: '20',
  WARMUP_DAILY_LIMIT: '80',
  QUIET_HOURS_START: '20',
  QUIET_HOURS_END: '08',
  DEFAULT_OWNER_TZ: 'America/New_York',
  DRY_RUN: 'TRUE',
  DEFAULT_QUOTED_PRICE: '1500',
  PIVOT_REPLY_RATE_FLOOR: '0.01',
  AUTO_RUN_ENABLED: 'TRUE',
  N8N_WEBHOOK_BASE: '',
  N8N_WEBHOOK_URL: '',
  MAKE_WEBHOOK_URL: '',
  WEBHOOK_SIGNING_SECRET: '',
  OPENAI_API_KEY: '',
  OPENAI_BASE_URL: 'https://api.openai.com/v1',
  OPENAI_MODEL: 'gpt-4.1-mini',
  OPENCLAW_API_KEY: '',
  OPENCLAW_BASE_URL: 'https://api.openclaw.example/v1',
  OPENCLAW_MODEL: 'openclaw-chat',
  ANTHROPIC_API_KEY: '',
  ANTHROPIC_MODEL: 'claude-3-5-sonnet-latest',
  MODEL_PROVIDER_CHAIN: 'openclaw,openai,anthropic',
  MODEL_CB_FAILURE_THRESHOLD: '3',
  MODEL_CB_OPEN_SECONDS: '120',
  SMTP_HOST: '',
  SMTP_PORT: '587',
  SMTP_USER: '',
  SMTP_PASS: '',
  SMTP_SECURE: 'FALSE',
  SENTRY_DSN: '',
  LANGFUSE_BASE_URL: 'https://cloud.langfuse.com',
  LANGFUSE_PUBLIC_KEY: '',
  LANGFUSE_SECRET_KEY: ''
};

export const REQUIRED_REPLY_WEBHOOK_FIELDS = ['reply_id', 'email', 'body', 'received_at', 'message_id'] as const;
export const REQUIRED_STRIPE_WEBHOOK_FIELDS = ['webhook_token', 'event_id', 'payment_id', 'amount', 'status'] as const;

export const DB_PATH = process.env.DB_PATH ?? 'data/prototype.db';
export const PORT = Number(process.env.PORT ?? 8787);
