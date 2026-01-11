import { GeneratedImage, AspectRatioOption, ImageSizeOption } from "../types";
import { generateUUID, getSystemPromptContent, FIXED_SYSTEM_PROMPT_SUFFIX } from "./utils";

// Env + defaults
const ENV_OPENAI_COMPAT_API_URL = process.env.OPENAI_COMPAT_API_URL || '';
const ENV_OPENAI_COMPAT_API_KEY = process.env.OPENAI_COMPAT_API_KEY || '';

const TOKEN_STORAGE_KEY = 'openaiCompatToken';
const API_URL_STORAGE_KEY = 'openaiCompatApiUrl';
const PROXY_API_URL = "/api/proxy/openai-compat/chat/completions";

// Decide whether to use proxy
const shouldUseProxy = (): boolean => {
  // If user provided token in browser, do not proxy
  if (typeof localStorage !== 'undefined') {
    const userToken = localStorage.getItem(TOKEN_STORAGE_KEY) || '';
    if (userToken) return false;
  }
  // If env key exists (dev), no proxy
  if (ENV_OPENAI_COMPAT_API_KEY) return false;
  // Otherwise proxy
  return true;
};

export const getOpenAICompatApiUrl = (): string => {
  if (shouldUseProxy()) return PROXY_API_URL;
  // User-provided URL takes priority
  let baseUrl = '';
  if (typeof localStorage !== 'undefined') {
    baseUrl = localStorage.getItem(API_URL_STORAGE_KEY) || '';
  }
  if (!baseUrl) {
    baseUrl = ENV_OPENAI_COMPAT_API_URL;
  }
  if (!baseUrl) return '';
  // Auto-append /v1/chat/completions if not already present
  baseUrl = baseUrl.replace(/\/+$/, ''); // Remove trailing slashes
  if (!baseUrl.endsWith('/v1/chat/completions')) {
    baseUrl = `${baseUrl}/v1/chat/completions`;
  }
  return baseUrl;
};

export const saveOpenAICompatApiUrl = (url: string) => {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(API_URL_STORAGE_KEY, url);
  }
};

export const hasEnvOpenAICompatToken = (): boolean => {
  if (shouldUseProxy()) return true; // proxy implies server key
  return !!ENV_OPENAI_COMPAT_API_KEY;
};

export const hasEnvOpenAICompatApiUrl = (): boolean => {
  if (shouldUseProxy()) return true;
  return !!ENV_OPENAI_COMPAT_API_URL;
};

export const getOpenAICompatToken = (): string => {
  if (shouldUseProxy()) return 'PROXY_MODE';
  if (typeof localStorage === 'undefined') return ENV_OPENAI_COMPAT_API_KEY;
  const userToken = localStorage.getItem(TOKEN_STORAGE_KEY) || '';
  return userToken || ENV_OPENAI_COMPAT_API_KEY;
};

export const saveOpenAICompatToken = (token: string) => {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
  }
};

// Basic headers (no OpenRouter-specific headers)
const buildHeaders = (token: string) => ({
  'Authorization': `Bearer ${token}`,
  'Content-Type': 'application/json'
});

// Extract image URL from OpenAI-compatible response
// Supports: structured image_url blocks, images array, markdown format, and base64
const extractImageFromResponse = (data: any): string => {
  const messageContent = data.choices?.[0]?.message?.content;

  let imageUrl = '';

  // Case 1: Structured array with image_url blocks
  if (Array.isArray(messageContent)) {
    const imageBlock = messageContent.find((block: any) => block.type === 'image_url' || block.type === 'image');
    if (imageBlock) {
      imageUrl = imageBlock.image_url?.url || imageBlock.url || '';
    }
  }
  // Case 2: Separate images array in message
  else if (data.choices?.[0]?.message?.images) {
    const images = data.choices[0].message.images;
    if (images && images.length > 0) {
      imageUrl = images[0].image_url?.url || images[0].url || images[0];
    }
  }
  // Case 3: Markdown image format in content string: ![alt](url)
  else if (typeof messageContent === 'string') {
    const markdownMatch = messageContent.match(/!\[.*?\]\((https?:\/\/[^\s\)]+)\)/);
    if (markdownMatch) {
      imageUrl = markdownMatch[1];
    }
  }

  // Support base64 format: if string doesn't start with http or data:, treat as base64
  if (imageUrl && !imageUrl.startsWith('http') && !imageUrl.startsWith('data:')) {
    // Detect format from base64 header or default to PNG
    if (imageUrl.startsWith('/9j/')) {
      imageUrl = `data:image/jpeg;base64,${imageUrl}`;
    } else if (imageUrl.startsWith('iVBOR')) {
      imageUrl = `data:image/png;base64,${imageUrl}`;
    } else if (imageUrl.startsWith('R0lGOD')) {
      imageUrl = `data:image/gif;base64,${imageUrl}`;
    } else if (imageUrl.startsWith('UklGR')) {
      imageUrl = `data:image/webp;base64,${imageUrl}`;
    } else {
      // Default to PNG
      imageUrl = `data:image/png;base64,${imageUrl}`;
    }
  }

  return imageUrl;
};

// Convert Blob to base64 data URL
const blobToBase64 = (blob: Blob): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onloadend = () => resolve(reader.result as string);
  reader.onerror = reject;
  reader.readAsDataURL(blob);
});

// Ensure API URL is configured
const ensureApiUrl = (url: string) => {
  if (!url) throw new Error("error_openai_compat_api_url_missing");
};

export const generateOpenAICompatImage = async (
  model: string,
  prompt: string,
  aspectRatio: AspectRatioOption,
  seed?: number,
  imageSize?: ImageSizeOption
): Promise<GeneratedImage> => {
  const token = getOpenAICompatToken();
  if (!token) throw new Error("error_openai_compat_token_missing");

  const apiUrl = getOpenAICompatApiUrl();
  ensureApiUrl(apiUrl);

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: buildHeaders(token),
    body: JSON.stringify({
      model,
      messages: [
        { role: 'user', content: prompt }
      ],
      // Optional: aspect ratio as metadata (some gateways honor it)
      metadata: { aspect_ratio: aspectRatio, image_size: imageSize },
      // For image-capable chat models, ask for image output
      modalities: ['image', 'text'],
      ...(seed !== undefined ? { seed } : {})
    })
  });

  if (!response.ok) {
    if (response.status === 401) throw new Error("error_openai_compat_unauthorized");
    if (response.status === 429) throw new Error("error_quota_exhausted");
    throw new Error("error_api_connection");
  }

  const data = await response.json();
  const imageUrl = extractImageFromResponse(data);
  if (!imageUrl) throw new Error("error_invalid_response");

  return {
    id: generateUUID(),
    url: imageUrl,
    model,
    prompt,
    aspectRatio,
    timestamp: Date.now(),
    seed,
    provider: 'openai-compat'
  };
};

export const editImageOpenAICompat = async (
  model: string,
  imageBlobs: Blob[],
  prompt: string,
  signal?: AbortSignal
): Promise<GeneratedImage> => {
  const token = getOpenAICompatToken();
  if (!token) throw new Error("error_openai_compat_token_missing");

  const apiUrl = getOpenAICompatApiUrl();
  ensureApiUrl(apiUrl);

  // Convert images to base64 data URLs
  const imageBase64List = await Promise.all(imageBlobs.map(blob => blobToBase64(blob)));
  const contentBlocks: any[] = [];
  imageBase64List.forEach(base64 => {
    contentBlocks.push({
      type: 'image_url',
      image_url: { url: base64 }
    });
  });
  contentBlocks.push({ type: 'text', text: prompt });

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: buildHeaders(token),
    body: JSON.stringify({
      model,
      messages: [
        { role: 'user', content: contentBlocks }
      ],
      modalities: ['image', 'text']
    }),
    signal
  });

  if (!response.ok) {
    if (response.status === 401) throw new Error("error_openai_compat_unauthorized");
    if (response.status === 429) throw new Error("error_quota_exhausted");
    throw new Error("error_api_connection");
  }

  const data = await response.json();
  const imageUrl = extractImageFromResponse(data);
  if (!imageUrl) throw new Error("error_invalid_response");

  return {
    id: generateUUID(),
    url: imageUrl,
    model,
    prompt,
    aspectRatio: '1:1',
    timestamp: Date.now(),
    provider: 'openai-compat'
  };
};

export const optimizePromptOpenAICompat = async (
  originalPrompt: string,
  modelOverride?: string
): Promise<string> => {
  const token = getOpenAICompatToken();
  if (!token) throw new Error("error_openai_compat_token_missing");

  const apiUrl = getOpenAICompatApiUrl();
  ensureApiUrl(apiUrl);

  const model = modelOverride || 'gpt-4o-mini';
  const systemInstruction = getSystemPromptContent() + FIXED_SYSTEM_PROMPT_SUFFIX;

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: buildHeaders(token),
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemInstruction },
        { role: 'user', content: originalPrompt }
      ],
      stream: false
    })
  });

  if (!response.ok) {
    if (response.status === 401) throw new Error("error_openai_compat_unauthorized");
    if (response.status === 429) throw new Error("error_quota_exhausted");
    throw new Error("error_api_connection");
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("error_invalid_response");
  return content;
};
