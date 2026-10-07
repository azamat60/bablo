import { serverVariable } from './environment.js';
export const AI_MODELS = {
  get parse() {
    return serverVariable('OPENAI_MODEL') || 'gpt-6-luna';
  },
  get parseAccurate() {
    return serverVariable('OPENAI_MODEL_ACCURATE') || 'gpt-6.1-sol';
  },
  get transcribe() {
    return serverVariable('OPENAI_TRANSCRIBE_MODEL') || 'gpt-transcribe';
  },
} as const;
