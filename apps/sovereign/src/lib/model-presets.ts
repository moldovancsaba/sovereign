export const LOCAL_MODEL_PRESETS = [
  "Granite-4.0-H-1B",
  "deepseek-r1:1.5b",
  "llama3.2:1b",
  "qwen2.5-coder:1.5b-base"
] as const;

export const CLOUD_MODEL_PRESETS = [
  "gpt-4.1-nano",
  "gpt-4o-mini"
] as const;

export const AGENT_MODEL_PRESETS = [
  ...LOCAL_MODEL_PRESETS,
  ...CLOUD_MODEL_PRESETS
] as const;
