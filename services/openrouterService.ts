import { GeneratedImage, AspectRatioOption, ImageSizeOption } from "../types";
import { generateUUID, getSystemPromptContent, FIXED_SYSTEM_PROMPT_SUFFIX } from "./utils";

// 从环境变量读取默认值，如果未配置则使用默认 URL
const ENV_OPENROUTER_API_URL = process.env.OPENROUTER_API_URL || '';
const ENV_OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
const DEFAULT_OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

// Default text model for prompt optimization (can be overridden by utils DEFAULT_OPTIMIZATION_MODELS)
const DEFAULT_TEXT_MODEL = "openai/gpt-4o-mini";

// Token Management
const TOKEN_STORAGE_KEY = 'openrouterToken';

// 代理模式配置
// 当部署在 Docker 中时，通过 /api/proxy/openrouter/ 路径调用后端代理
const PROXY_API_URL = "/api/proxy/openrouter/chat/completions";

// 检测是否应该使用代理模式
// 条件：没有配置环境变量中的 API Key（说明是生产环境，需要使用后端代理）
const shouldUseProxy = (): boolean => {
  // 如果用户在前端填写了 Token，则直接使用（不走代理）
  if (typeof localStorage !== 'undefined') {
    const userToken = localStorage.getItem(TOKEN_STORAGE_KEY) || '';
    if (userToken) return false;
  }
  // 如果环境变量中有 Key（开发环境），则不使用代理
  if (ENV_OPENROUTER_API_KEY) return false;
  // 否则使用代理
  return true;
};

// 获取实际使用的 API URL
export const getOpenRouterApiUrl = (): string => {
  if (shouldUseProxy()) {
    return PROXY_API_URL;
  }
  return ENV_OPENROUTER_API_URL || DEFAULT_OPENROUTER_API_URL;
};

// 检查是否有环境变量配置的 Token（用于 UI 显示状态）
export const hasEnvOpenRouterToken = (): boolean => {
  // 在代理模式下，也认为"有 Token"（由后端提供）
  if (shouldUseProxy()) return true;
  return !!ENV_OPENROUTER_API_KEY;
};

// 检查是否有环境变量配置的 API URL（用于 UI 显示状态）
export const hasEnvOpenRouterApiUrl = (): boolean => {
  // 在代理模式下，也认为"有配置"
  if (shouldUseProxy()) return true;
  return !!ENV_OPENROUTER_API_URL;
};

export const getOpenRouterToken = (): string => {
  // 在代理模式下，不需要前端提供 Token（返回占位符）
  if (shouldUseProxy()) return 'PROXY_MODE';

  if (typeof localStorage === 'undefined') return ENV_OPENROUTER_API_KEY;
  // 优先使用用户在前端填写的 Token，其次使用环境变量配置的 Token
  const userToken = localStorage.getItem(TOKEN_STORAGE_KEY) || '';
  return userToken || ENV_OPENROUTER_API_KEY;
};

export const saveOpenRouterToken = (token: string) => {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
  }
};

// Helper to build base headers
const buildHeaders = (token: string) => ({
  'Authorization': `Bearer ${token}`,
  'Content-Type': 'application/json',
  'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : '',
  'X-Title': 'Peinture AI'
});

// Helper function to extract image URL from OpenRouter response
const extractImageFromResponse = (data: any): string => {
  const messageContent = data.choices?.[0]?.message?.content;

  let imageUrl = '';

  // Check if content is array (multimodal response)
  if (Array.isArray(messageContent)) {
    const imageBlock = messageContent.find((block: any) =>
      block.type === 'image_url' || block.type === 'image'
    );
    if (imageBlock) {
      imageUrl = imageBlock.image_url?.url || imageBlock.url || '';
    }
  } else if (data.choices?.[0]?.message?.images) {
    // Alternative format: images array
    const images = data.choices[0].message.images;
    if (images && images.length > 0) {
      imageUrl = images[0].image_url?.url || images[0].url || images[0];
    }
  }

  return imageUrl;
};

// Helper function to convert Blob to base64 data URL
const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

export const generateOpenRouterImage = async (
  model: string,
  prompt: string,
  aspectRatio: AspectRatioOption,
  seed?: number,
  imageSize?: ImageSizeOption,
  referenceImages?: string[]  // New: base64 reference images for image-to-image
): Promise<GeneratedImage> => {
  const token = getOpenRouterToken();

  if (!token) {
    throw new Error("error_openrouter_token_missing");
  }

  try {
    // Build message content - use multimodal format if reference images exist
    let messageContent: any;
    if (referenceImages && referenceImages.length > 0) {
      // Multimodal content format for image-to-image
      const contentBlocks: any[] = [];
      referenceImages.forEach(base64 => {
        contentBlocks.push({
          type: 'image_url',
          image_url: { url: base64 }
        });
      });
      contentBlocks.push({ type: 'text', text: prompt });
      messageContent = contentBlocks;
    } else {
      // Simple text prompt for text-to-image
      messageContent = prompt;
    }

    const response = await fetch(getOpenRouterApiUrl(), {
      method: 'POST',
      headers: buildHeaders(token),
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'user',
            content: messageContent
          }
        ],
        // OpenRouter image generation requires modalities parameter
        modalities: ['image', 'text'],
        // Image configuration for Gemini models (aspect_ratio and image_size)
        // Docs: https://openrouter.ai/docs/guides/overview/multimodal/image-generation
        image_config: {
          aspect_ratio: aspectRatio,
          ...(imageSize && { image_size: imageSize })
        }
      })
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error("error_openrouter_unauthorized");
      }
      if (response.status === 429) {
        throw new Error("error_quota_exhausted");
      }
      throw new Error("error_api_connection");
    }

    const data = await response.json();

    // Extract image from response using helper function
    const imageUrl = extractImageFromResponse(data);

    if (!imageUrl) {
      throw new Error("error_invalid_response");
    }

    return {
      id: generateUUID(),
      url: imageUrl,
      model,
      prompt,
      aspectRatio,
      timestamp: Date.now(),
      seed,
      provider: 'openrouter'
    };
  } catch (error: any) {
    console.error("OpenRouter Generation Error:", error);
    throw error;
  }
};

// Edit Image via OpenRouter (supports multimodal models like Gemini)
export const editImageOpenRouter = async (
  model: string,
  imageBlobs: Blob[],
  prompt: string,
  signal?: AbortSignal
): Promise<GeneratedImage> => {
  const token = getOpenRouterToken();

  if (!token) {
    throw new Error("error_openrouter_token_missing");
  }

  try {
    // Convert all image blobs to base64
    const imageBase64List = await Promise.all(
      imageBlobs.map(blob => blobToBase64(blob))
    );

    // Build multimodal content array
    // Format: array of content blocks with text and images
    const contentBlocks: any[] = [];

    // Add images first
    imageBase64List.forEach((base64, index) => {
      contentBlocks.push({
        type: 'image_url',
        image_url: {
          url: base64
        }
      });
    });

    // Add text prompt
    contentBlocks.push({
      type: 'text',
      text: prompt
    });

    const response = await fetch(getOpenRouterApiUrl(), {
      method: 'POST',
      headers: buildHeaders(token),
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'user',
            content: contentBlocks
          }
        ],
        // Request image output
        modalities: ['image', 'text']
      }),
      signal
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error("error_openrouter_unauthorized");
      }
      if (response.status === 429) {
        throw new Error("error_quota_exhausted");
      }
      throw new Error("error_api_connection");
    }

    const data = await response.json();

    // Extract image from response using helper function
    const imageUrl = extractImageFromResponse(data);

    if (!imageUrl) {
      throw new Error("error_invalid_response");
    }

    return {
      id: generateUUID(),
      url: imageUrl,
      model,
      prompt,
      aspectRatio: '1:1', // Edit doesn't use aspect ratio
      timestamp: Date.now(),
      provider: 'openrouter'
    };
  } catch (error: any) {
    if (error.name === 'AbortError') {
      throw error;
    }
    console.error("OpenRouter Edit Error:", error);
    throw error;
  }
};

// --- Prompt Optimization via OpenRouter ---
export const optimizePromptOpenRouter = async (
  originalPrompt: string,
  modelOverride?: string
): Promise<string> => {
  const token = getOpenRouterToken();
  if (!token) {
    throw new Error("error_openrouter_token_missing");
  }

  const model = modelOverride || DEFAULT_TEXT_MODEL;
  const systemInstruction = getSystemPromptContent() + FIXED_SYSTEM_PROMPT_SUFFIX;

  try {
    const response = await fetch(getOpenRouterApiUrl(), {
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
      if (response.status === 401) throw new Error("error_openrouter_unauthorized");
      if (response.status === 429) throw new Error("error_quota_exhausted");
      throw new Error("error_api_connection");
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("error_invalid_response");
    return content;
  } catch (error) {
    console.error("OpenRouter Prompt Optimization Error:", error);
    throw error;
  }
};
