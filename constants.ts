
import { ModelOption, ProviderOption, OpenRouterModelConfig, AspectRatioOption, ImageSizeOption } from './types';

// Map standardized UI IDs to Provider Specific API Strings
export const API_MODEL_MAP: Record<ProviderOption, Record<string, string>> = {
  huggingface: {
    'z-image-turbo': 'z-image-turbo',
    'qwen-image': 'qwen-image-fast',
    'ovis-image': 'ovis-image',
    'flux-1-schnell': 'flux-1-schnell',
    'openai-fast': 'openai-fast', // text
    'qwen-image-edit': 'qwen-image-edit', // edit (placeholder/internal)
    'wan2_2-i2v': 'wan2.2', // video (internal/HF space convention)
    'RealESRGAN_x4plus': 'RealESRGAN_x4plus', // upscaler
  },
};

export const HF_MODEL_OPTIONS = [
  { value: 'z-image-turbo', label: 'Z-Image Turbo' }
];



// Gemini supported aspect ratios
const GEMINI_ASPECT_RATIOS: AspectRatioOption[] = ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9'];

export const OPENROUTER_MODEL_OPTIONS: OpenRouterModelConfig[] = [
  {
    value: 'google/gemini-3-pro-image-preview',
    label: 'Gemini 3 Pro Image',
    capabilities: {
      imageSize: { options: ['1K', '2K', '4K'], default: '1K' },
      aspectRatio: { options: GEMINI_ASPECT_RATIOS, default: '1:1' }
    }
  }
];

// Helper function to get OpenRouter model config by model ID
export const getOpenRouterModelConfig = (modelId: string): OpenRouterModelConfig | undefined => {
  return OPENROUTER_MODEL_OPTIONS.find(m => m.value === modelId);
};

// OpenAI Compatible model options with capabilities
export interface OpenAICompatModelConfig {
  value: string;
  label: string;
  capabilities: {
    imageSize?: { options: ImageSizeOption[]; default: ImageSizeOption };
  };
}

export const OPENAI_COMPAT_MODEL_OPTIONS: OpenAICompatModelConfig[] = [
  {
    value: 'nano-banana-2',
    label: 'Nano Banana 2',
    capabilities: {
      imageSize: { options: ['1K', '2K', '4K'], default: '1K' }
    }
  }
];

// Helper function to get OpenAI Compat model config by model ID
export const getOpenAICompatModelConfig = (modelId: string): OpenAICompatModelConfig | undefined => {
  return OPENAI_COMPAT_MODEL_OPTIONS.find(m => m.value === modelId);
};

export const PROVIDER_OPTIONS = [
  { value: 'huggingface', label: 'Hugging Face' },
  { value: 'openrouter', label: 'OpenRouter' },
  { value: 'openai-compat', label: 'OpenAI Compatible' }
];

export const FLUX_MODELS = [
  'flux-1-schnell',
  'flux-1-krea',
  'flux-1',
  'flux-2'
];

export const Z_IMAGE_MODELS = ['z-image-turbo'];

export const getModelConfig = (provider: ProviderOption, model: ModelOption) => {
  if (provider === 'huggingface') {
    if (model === 'z-image-turbo') return { min: 1, max: 20, default: 9 };
    if (model === 'flux-1-schnell') return { min: 1, max: 50, default: 8 };
    if (model === 'qwen-image') return { min: 4, max: 28, default: 8 };
    if (model === 'ovis-image') return { min: 1, max: 50, default: 20 };
  }
  return { min: 1, max: 20, default: 9 }; // fallback
};

export const getGuidanceScaleConfig = (model: ModelOption, provider: ProviderOption) => {
  return null;
};

// --- Unified Model Lists ---

export interface UnifiedModelOption {
  label: string;
  value: string; // provider:modelId
  provider: ProviderOption;
}

export const EDIT_MODELS: UnifiedModelOption[] = [
  { label: 'Qwen Image Edit', value: 'huggingface:qwen-image-edit', provider: 'huggingface' },
  { label: 'Gemini 3 Pro Image', value: 'openrouter:google/gemini-3-pro-image-preview', provider: 'openrouter' },
  { label: 'Nano Banana 2', value: 'openai-compat:nano-banana-2', provider: 'openai-compat' },
];

export const LIVE_MODELS: UnifiedModelOption[] = [
  { label: 'Wan 2.2', value: 'huggingface:wan2_2-i2v', provider: 'huggingface' },
];

export const TEXT_MODELS: UnifiedModelOption[] = [
  { label: 'OpenAI 4o mini', value: 'huggingface:openai-fast', provider: 'huggingface' },
  { label: 'OpenAI 4o mini', value: 'openrouter:openai/gpt-4o-mini', provider: 'openrouter' },
];

export const UPSCALER_MODELS: UnifiedModelOption[] = [
  { label: 'RealESRGAN x4 Plus', value: 'huggingface:RealESRGAN_x4plus', provider: 'huggingface' },
];
