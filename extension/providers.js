// Capture Pro — AI provider presets, shared by background.js (importScripts) and options.js.
// Any API that speaks the Anthropic Messages format or the OpenAI Chat Completions format works;
// pick "Custom" in Options for anything not listed (Groq, Together, a local Ollama or LM Studio, …).
const PROVIDERS = {
  anthropic:  { label: 'Anthropic',  format: 'anthropic', endpoint: 'https://api.anthropic.com/v1/messages', model: 'claude-opus-5' },
  openai:     { label: 'OpenAI',     format: 'openai',    endpoint: 'https://api.openai.com/v1/chat/completions', model: '' },
  openrouter: { label: 'OpenRouter', format: 'openai',    endpoint: 'https://openrouter.ai/api/v1/chat/completions', model: '' },
  zenmux:     { label: 'ZenMux',     format: 'anthropic', endpoint: 'https://zenmux.ai/api/anthropic/v1/messages', model: 'anthropic/claude-sonnet-4.5' },
  custom:     { label: 'Custom',     format: 'openai',    endpoint: '', model: '' },
};

const DEFAULT_PROVIDER = 'anthropic';

// Resolve stored settings into the endpoint + format actually used for a request.
function resolveProvider(settings) {
  const preset = PROVIDERS[settings.provider] || PROVIDERS[DEFAULT_PROVIDER];
  const custom = settings.provider === 'custom';
  return {
    endpoint: (custom ? settings.endpoint : preset.endpoint) || '',
    format: custom ? (settings.format === 'anthropic' ? 'anthropic' : 'openai') : preset.format,
    model: settings.model || preset.model,
  };
}

// Host permission pattern for an endpoint URL ("https://api.example.com/*"). Ports aren't part of match patterns.
function originPattern(endpoint) {
  try {
    const u = new URL(endpoint);
    return /^https?:$/.test(u.protocol) ? `${u.protocol}//${u.hostname}/*` : null;
  } catch {
    return null;
  }
}
