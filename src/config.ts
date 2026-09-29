// Runtime configuration, all from environment variables.
const required = (name: string): string => {
  const v = process.env[name];
  if (!v) throw new Error(`missing required env var ${name}`);
  return v;
};

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  dbPath: process.env.DATABASE_PATH || './tldr.db',
  baseUrl: (process.env.BASE_URL || 'http://localhost:3000').replace(/\/+$/, ''),
  stripeSecretKey: required('STRIPE_SECRET_KEY'),
  stripeWebhookSecret: required('STRIPE_WEBHOOK_SECRET'),
  llmApiKey: required('LLM_API_KEY'),
  llmEndpoint: (process.env.LLM_ENDPOINT || 'https://generativelanguage.googleapis.com/v1beta/openai/').replace(/\/+$/, ''),
  llmModel: process.env.LLM_MODEL || 'gemini-3.8-flash',
  // Fair-use cap for "unlimited" Pro plans, summaries per license per day.
  dailyCap: parseInt(process.env.DAILY_CAP || '100', 10),
  // Hard cap on transcript characters per request, bounds per-summary cost.
  maxTranscriptChars: parseInt(process.env.MAX_TRANSCRIPT_CHARS || '60000', 10),
};
