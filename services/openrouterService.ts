import { GeneratedImage, AspectRatioOption } from "../types";
import { generateUUID } from "./utils";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

// Token Management
const TOKEN_STORAGE_KEY = 'openrouterToken';

export const getOpenRouterToken = (): string => {
  if (typeof localStorage === 'undefined') return '';
  return localStorage.getItem(TOKEN_STORAGE_KEY) || '';
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
  seed?: number
): Promise<GeneratedImage> => {
  const token = getOpenRouterToken();
  
  if (!token) {
    throw new Error("error_openrouter_token_missing");
  }

  try {
    const response = await fetch(OPENROUTER_API_URL, {
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
        modalities: ['image', 'text']
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
