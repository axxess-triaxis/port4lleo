/**
 * Curated registry mapping package names to the product/integration they represent.
 * Keys ending in "*" are prefix matches. Add entries freely -- this is the part
 * of the project most likely to need community contributions.
 */
export interface IntegrationDef {
  name: string;
  category: string;
}

const REGISTRY: Record<string, IntegrationDef> = {
  // AI
  openai: { name: "OpenAI", category: "AI" },
  "@anthropic-ai/sdk": { name: "Anthropic", category: "AI" },
  anthropic: { name: "Anthropic", category: "AI" },
  "@google/generative-ai": { name: "Google Gemini", category: "AI" },
  "@google/genai": { name: "Google Gemini", category: "AI" },
  "google-generativeai": { name: "Google Gemini", category: "AI" },
  "google-genai": { name: "Google Gemini", category: "AI" },
  ai: { name: "Vercel AI SDK", category: "AI" },
  "@ai-sdk/*": { name: "Vercel AI SDK", category: "AI" },
  langchain: { name: "LangChain", category: "AI" },
  "@langchain/*": { name: "LangChain", category: "AI" },
  "langchain-*": { name: "LangChain", category: "AI" },
  groq: { name: "Groq", category: "AI" },
  "groq-sdk": { name: "Groq", category: "AI" },
  "@huggingface/*": { name: "Hugging Face", category: "AI" },
  transformers: { name: "Hugging Face", category: "AI" },
  "huggingface-hub": { name: "Hugging Face", category: "AI" },
  "@pinecone-database/pinecone": { name: "Pinecone", category: "AI" },
  "pinecone-client": { name: "Pinecone", category: "AI" },
  replicate: { name: "Replicate", category: "AI" },
  "@mistralai/mistralai": { name: "Mistral", category: "AI" },
  mistralai: { name: "Mistral", category: "AI" },
  // Data / backend
  "@supabase/supabase-js": { name: "Supabase", category: "Backend" },
  "@supabase/ssr": { name: "Supabase", category: "Backend" },
  supabase: { name: "Supabase", category: "Backend" },
  firebase: { name: "Firebase", category: "Backend" },
  "firebase-admin": { name: "Firebase", category: "Backend" },
  "@prisma/client": { name: "Prisma", category: "Database" },
  prisma: { name: "Prisma", category: "Database" },
  "drizzle-orm": { name: "Drizzle", category: "Database" },
  mongoose: { name: "MongoDB", category: "Database" },
  mongodb: { name: "MongoDB", category: "Database" },
  pymongo: { name: "MongoDB", category: "Database" },
  pg: { name: "PostgreSQL", category: "Database" },
  "psycopg2*": { name: "PostgreSQL", category: "Database" },
  psycopg: { name: "PostgreSQL", category: "Database" },
  redis: { name: "Redis", category: "Database" },
  ioredis: { name: "Redis", category: "Database" },
  "@upstash/*": { name: "Upstash", category: "Database" },
  "@neondatabase/serverless": { name: "Neon", category: "Database" },
  "@planetscale/database": { name: "PlanetScale", category: "Database" },
  "convex": { name: "Convex", category: "Backend" },
  // Cloud
  "@aws-sdk/*": { name: "AWS", category: "Cloud" },
  "aws-sdk": { name: "AWS", category: "Cloud" },
  boto3: { name: "AWS", category: "Cloud" },
  "aws-cdk-lib": { name: "AWS", category: "Cloud" },
  "@azure/*": { name: "Azure", category: "Cloud" },
  "azure-*": { name: "Azure", category: "Cloud" },
  "@google-cloud/*": { name: "Google Cloud", category: "Cloud" },
  "google-cloud-*": { name: "Google Cloud", category: "Cloud" },
  "@vercel/*": { name: "Vercel", category: "Cloud" },
  "@cloudflare/*": { name: "Cloudflare", category: "Cloud" },
  wrangler: { name: "Cloudflare", category: "Cloud" },
  // Payments
  stripe: { name: "Stripe", category: "Payments" },
  "@stripe/*": { name: "Stripe", category: "Payments" },
  razorpay: { name: "Razorpay", category: "Payments" },
  "@paypal/*": { name: "PayPal", category: "Payments" },
  "@lemonsqueezy/*": { name: "Lemon Squeezy", category: "Payments" },
  // Auth
  "@clerk/*": { name: "Clerk", category: "Auth" },
  "next-auth": { name: "Auth.js", category: "Auth" },
  "@auth/*": { name: "Auth.js", category: "Auth" },
  "@auth0/*": { name: "Auth0", category: "Auth" },
  "better-auth": { name: "Better Auth", category: "Auth" },
  // Comms
  twilio: { name: "Twilio", category: "Communication" },
  resend: { name: "Resend", category: "Communication" },
  "@sendgrid/*": { name: "SendGrid", category: "Communication" },
  sendgrid: { name: "SendGrid", category: "Communication" },
  "@slack/*": { name: "Slack", category: "Communication" },
  "slack-sdk": { name: "Slack", category: "Communication" },
  "discord.js": { name: "Discord", category: "Communication" },
  "discord.py": { name: "Discord", category: "Communication" },
  telegraf: { name: "Telegram", category: "Communication" },
  "python-telegram-bot": { name: "Telegram", category: "Communication" },
  // Observability / analytics
  "@sentry/*": { name: "Sentry", category: "Observability" },
  "sentry-sdk": { name: "Sentry", category: "Observability" },
  "posthog-js": { name: "PostHog", category: "Analytics" },
  "posthog-node": { name: "PostHog", category: "Analytics" },
  posthog: { name: "PostHog", category: "Analytics" },
  "mixpanel*": { name: "Mixpanel", category: "Analytics" },
  // Dev platforms
  "@octokit/*": { name: "GitHub API", category: "Dev platform" },
  octokit: { name: "GitHub API", category: "Dev platform" },
  pygithub: { name: "GitHub API", category: "Dev platform" },
  "@linear/sdk": { name: "Linear", category: "Dev platform" },
  "@notionhq/client": { name: "Notion", category: "Dev platform" },
  "notion-client": { name: "Notion", category: "Dev platform" },
  "@modelcontextprotocol/sdk": { name: "MCP", category: "AI" },
  mcp: { name: "MCP", category: "AI" },
};

const EXACT = new Map<string, IntegrationDef>();
const PREFIXES: [string, IntegrationDef][] = [];
for (const [key, def] of Object.entries(REGISTRY)) {
  if (key.endsWith("*")) PREFIXES.push([key.slice(0, -1), def]);
  else EXACT.set(key, def);
}

export function lookupIntegration(pkg: string): IntegrationDef | null {
  const name = pkg.trim().toLowerCase();
  const exact = EXACT.get(name);
  if (exact) return exact;
  for (const [prefix, def] of PREFIXES) if (name.startsWith(prefix)) return def;
  return null;
}
