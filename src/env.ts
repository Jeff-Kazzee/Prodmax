/**
 * Environment access with defaults (M0).
 * All values are optional: the app is keyless-first and the default AI
 * provider is the deterministic local engine (architecture §6).
 */
export const env = {
  /** AI provider id; "deterministic" = offline local engine. */
  aiProvider: process.env.AI_PROVIDER ?? "deterministic",
  /** BYOK API key; empty unless a hosted provider is configured. */
  aiApiKey: process.env.AI_API_KEY ?? "",
  /** Hosted model identifier; empty for the deterministic engine. */
  aiModel: process.env.AI_MODEL ?? "",
} as const;

export type Env = typeof env;
