export const AI_MODELS = {
  parse: process.env.OPENAI_MODEL || 'gpt-5.6-luna',
  parseAccurate: process.env.OPENAI_MODEL_ACCURATE || 'gpt-5.6-terra',
  transcribe: process.env.OPENAI_TRANSCRIBE_MODEL || 'gpt-transcribe',
} as const;
