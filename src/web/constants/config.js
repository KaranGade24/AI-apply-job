export const API_BASE_URL = '/api';

export const RESUME_TEMPLATES = [
  {
    id: 'ATS Modern',
    name: 'ATS Modern',
    description: 'Clean, professional, ATS friendly',
    tag: 'Recommended',
  },
  {
    id: 'ATS Minimal',
    name: 'ATS Minimal',
    description: 'Simple and elegant',
  },
  {
    id: 'Tech Resume',
    name: 'Tech Resume',
    description: 'Modern for tech professionals',
  },
];

export const APPLICATION_STATUSES = {
  APPLIED: 'Applied',
  INTERVIEW: 'Interview',
  OFFER: 'Offer',
  REJECTED: 'Rejected',
  PENDING: 'Pending',
};

export const AI_PROVIDERS = [
  { id: 'googleGemini', name: 'Google Gemini' },
  { id: 'openai', name: 'OpenAI (Custom)' },
  { id: 'anthropic', name: 'Anthropic Claude' },
];

export const AI_MODELS = {
  googleGemini: [
    { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash' },
    { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash' },
    { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' },
  ],
  openai: [
    { id: 'gpt-4o', name: 'GPT-4o' },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
  ],
  anthropic: [
    { id: 'claude-3-5-sonnet', name: 'Claude 3.5 Sonnet' },
  ],
};
