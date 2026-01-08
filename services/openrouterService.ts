import { GeneratedImage, AspectRatioOption, ImageSizeOption } from "../types";
import { generateUUID } from "./utils";

// 从环境变量读取默认值，如果未配置则使用默认 URL
const ENV_OPENROUTER_API_URL = process.env.OPENROUTER_API_URL || '';
const ENV_OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
const DEFAULT_OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

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

// Generate Image via OpenRouter
export const generateOpenRouterImage = async (
  model: string,
  prompt: string,
  aspectRatio: AspectRatioOption,
  seed?: number,
  imageSize?: ImageSizeOption
): Promise<GeneratedImage> => {
  const token = getOpenRouterToken();
  
  if (!token) {
    throw new Error("error_openrouter_token_missing");
  }

  try {
    const response = await fetch(getOpenRouterApiUrl(), {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': window.location.origin,
        'X-Title': 'Peinture AI'
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'user',
            content: prompt
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
    
    // Extract image from response
    // Response format: data.choices[0].message.content contains image data
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
