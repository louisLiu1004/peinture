
import { GeneratedImage, AspectRatioOption, ModelOption } from "../types";
import { generateUUID, getSystemPromptContent, FIXED_SYSTEM_PROMPT_SUFFIX, getOptimizationModel, getVideoSettings } from "./utils";

const ZIMAGE_BASE_API_URL = "https://luca115-z-image-turbo.hf.space";
const QWEN_IMAGE_BASE_API_URL = "https://mcp-tools-qwen-image-fast.hf.space";
const OVIS_IMAGE_BASE_API_URL = "https://aidc-ai-ovis-image-7b.hf.space";
const FLUX_SCHNELL_BASE_API_URL = "https://black-forest-labs-flux-1-schnell.hf.space";
const UPSCALER_BASE_API_URL = "https://tuan2308-upscaler.hf.space";
const POLLINATIONS_API_URL = "https://text.pollinations.ai/openai";
const WAN2_VIDEO_API_URL = "https://fradeck619-wan2-2-fp8da-aoti-faster.hf.space";
export const QWEN_IMAGE_EDIT_BASE_API_URL = "https://linoyts-qwen-image-edit-2509-fast.hf.space";

// --- Token Management System ---

const TOKEN_STORAGE_KEY = 'huggingFaceToken';
const TOKEN_STATUS_KEY = 'hf_token_status';
const QUOTA_ERROR_KEY = "error_quota_exhausted";

interface TokenStatusStore {
  date: string; // YYYY-MM-DD
  exhausted: Record<string, boolean>;
}

const getUTCDatesString = () => new Date().toISOString().split('T')[0];

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const getTokenStatusStore = (): TokenStatusStore => {
  const defaultStore = { date: getUTCDatesString(), exhausted: {} };
  if (typeof localStorage === 'undefined') return defaultStore;

  try {
    const raw = localStorage.getItem(TOKEN_STATUS_KEY);
    if (!raw) return defaultStore;
    const store = JSON.parse(raw);
    // Reset if it's a new day (UTC)
    if (store.date !== getUTCDatesString()) {
      return defaultStore;
    }
    return store;
  } catch {
    return defaultStore;
  }
};

const saveTokenStatusStore = (store: TokenStatusStore) => {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(TOKEN_STATUS_KEY, JSON.stringify(store));
  }
};

export const getTokens = (rawInput?: string | null): string[] => {
  const input = rawInput !== undefined
    ? rawInput
    : (typeof localStorage !== 'undefined' ? localStorage.getItem(TOKEN_STORAGE_KEY) : null)
    || import.meta.env.VITE_HF_TOKEN
    || '';
  if (!input) return [];
  return input.split(',').map(t => t.trim()).filter(t => t.length > 0);
};

export const getTokenStats = (rawInput: string) => {
  const tokens = getTokens(rawInput);
  const store = getTokenStatusStore();
  const total = tokens.length;
  // A token is exhausted only if it's in the store's exhausted list for today
  const exhausted = tokens.filter(t => store.exhausted[t]).length;
  return {
    total,
    exhausted,
    active: total - exhausted
  };
};

const getNextAvailableToken = (): string | null => {
  const tokens = getTokens();
  const store = getTokenStatusStore();
  // Return the first token that is NOT marked as exhausted
  return tokens.find(t => !store.exhausted[t]) || null;
};

const markTokenExhausted = (token: string) => {
  const store = getTokenStatusStore();
  store.exhausted[token] = true;
  saveTokenStatusStore(store);
};

// --- API Execution Wrapper ---

const runWithTokenRetry = async <T>(operation: (token: string | null) => Promise<T>): Promise<T> => {
  const tokens = getTokens();

  // If no tokens configured, run once with no token (public quota)
  if (tokens.length === 0) {
    return operation(null);
  }

  let lastError: any;
  let attempts = 0;
  // Limit loops to number of tokens
  const maxAttempts = tokens.length + 1;

  while (attempts < maxAttempts) {
    attempts++;
    const token = getNextAvailableToken();

    // If we have tokens configured but all are exhausted
    if (!token) {
      throw new Error(QUOTA_ERROR_KEY);
    }

    try {
      return await operation(token);
    } catch (error: any) {
      lastError = error;

      // Don't retry if aborted by user
      if (error.name === 'AbortError') {
        throw error;
      }

      const isQuotaError =
        error.message === QUOTA_ERROR_KEY ||
        error.message?.includes("429") ||
        error.status === 429;

      if (isQuotaError && token) {
        console.warn(`Token ${token.substring(0, 8)}... exhausted. Switching to next token.`);
        markTokenExhausted(token);
        continue; // Retry loop with next token
      }

      // If it's not a quota error, or we are not using a token, rethrow immediately
      throw error;
    }
  }

  throw lastError || new Error("error_api_connection");
};

// --- Gradio File Upload Helper ---

export const uploadToGradio = async (baseUrl: string, image: string | Blob, token: string | null, signal?: AbortSignal): Promise<string> => {
  const formData = new FormData();
  formData.append('files', image);

  const headers: Record<string, string> = {};
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${baseUrl}/gradio_api/upload`, {
    method: 'POST',
    headers,
    body: formData,
    signal
  });

  if (!response.ok) {
    throw new Error(`Failed to upload image to Gradio: ${response.statusText}`);
  }

  const result = await response.json();
  if (!result || !result[0]) {
    throw new Error('Invalid upload response from Gradio');
  }

  return result[0]; // Returns the filename/path relative to the Gradio space
};

// --- Service Logic ---

const getBaseDimensions = (ratio: AspectRatioOption) => {
  switch (ratio) {
    case "16:9": return { width: 1024, height: 576 };
    case "4:3": return { width: 1024, height: 768 };
    case "3:2": return { width: 960, height: 640 };
    case "9:16": return { width: 576, height: 1024 };
    case "3:4": return { width: 768, height: 1024 };
    case "2:3": return { width: 640, height: 960 };
    case "1:1": default: return { width: 1024, height: 1024 };
  }
}

const getDimensions = (ratio: AspectRatioOption, enableHD: boolean): { width: number; height: number } => {
  const base = getBaseDimensions(ratio);

  if (enableHD) {
    // Both Z-Image Turbo and Flux models use 2x multiplier for HD
    return {
      width: Math.round(base.width * 2),
      height: Math.round(base.height * 2)
    };
  }

  return base;
}

const getAuthHeaders = (token: string | null): Record<string, string> => {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
};

function extractCompleteEventData(sseStream: string): any | null {
  const lines = sseStream.split('\n');
  let isCompleteEvent = false;

  for (const line of lines) {
    if (line.startsWith('event:')) {
      if (line.substring(6).trim() === 'complete') {
        isCompleteEvent = true;
      } else if (line.substring(6).trim() === 'error') {
        isCompleteEvent = false;
        throw new Error(QUOTA_ERROR_KEY);
      } else {
        isCompleteEvent = false; // Reset if it's another event type
      }
    } else if (line.startsWith('data:') && isCompleteEvent) {
      const jsonData = line.substring(5).trim();
      try {
        return JSON.parse(jsonData);
      } catch (e) {
        console.error("Error parsing JSON data:", e);
        return null;
      }
    }
  }
  return null; // No complete event with data found
}

const generateZImage = async (
  prompt: string,
  aspectRatio: AspectRatioOption,
  seed: number = Math.round(Math.random() * 2147483647),
  enableHD: boolean = false,
  steps: number = 9
): Promise<GeneratedImage> => {
  let { width, height } = getDimensions(aspectRatio, enableHD);

  return runWithTokenRetry(async (token) => {
    try {
      const queue = await fetch(ZIMAGE_BASE_API_URL + '/gradio_api/call/generate_image', {
        method: "POST",
        headers: getAuthHeaders(token),
        body: JSON.stringify({
          data: [prompt, height, width, steps, seed, false]
        })
      });
      const { event_id } = await queue.json();
      const response = await fetch(ZIMAGE_BASE_API_URL + '/gradio_api/call/generate_image/' + event_id, {
        headers: getAuthHeaders(token)
      });
      const result = await response.text();
      const data = extractCompleteEventData(result);

      if (!data) throw new Error("error_invalid_response");

      return {
        id: generateUUID(),
        url: data[0].url,
        model: 'z-image-turbo',
        prompt,
        aspectRatio,
        timestamp: Date.now(),
        seed,
        steps
      };
    } catch (error) {
      console.error("Z-Image Turbo Generation Error:", error);
      throw error;
    }
  });
};

const generateFluxSchnellImage = async (
  prompt: string,
  aspectRatio: AspectRatioOption,
  seed: number = Math.round(Math.random() * 2147483647),
  enableHD: boolean = false,
  steps: number = 4
): Promise<GeneratedImage> => {
  let { width, height } = getDimensions(aspectRatio, enableHD);

  return runWithTokenRetry(async (token) => {
    try {
      // Data: ["Prompt", Seed, Randomize seed (false), Width, Height, steps]
      const queue = await fetch(FLUX_SCHNELL_BASE_API_URL + '/gradio_api/call/infer', {
        method: "POST",
        headers: getAuthHeaders(token),
        body: JSON.stringify({
          data: [prompt, seed, false, width, height, steps]
        })
      });
      const { event_id } = await queue.json();
      const response = await fetch(FLUX_SCHNELL_BASE_API_URL + '/gradio_api/call/infer/' + event_id, {
        headers: getAuthHeaders(token)
      });
      const result = await response.text();
      const data = extractCompleteEventData(result);

      if (!data) throw new Error("error_invalid_response");

      return {
        id: generateUUID(),
        url: data[0].url,
        model: 'flux-1-schnell',
        prompt,
        aspectRatio,
        timestamp: Date.now(),
        seed,
        steps
      };
    } catch (error) {
      console.error("Flux Schnell Generation Error:", error);
      throw error;
    }
  });
};

const generateQwenImage = async (
  prompt: string,
  aspectRatio: AspectRatioOption,
  seed?: number,
  steps: number = 8
): Promise<GeneratedImage> => {

  return runWithTokenRetry(async (token) => {
    try {
      const queue = await fetch(QWEN_IMAGE_BASE_API_URL + '/gradio_api/call/generate_image', {
        method: "POST",
        headers: getAuthHeaders(token),
        body: JSON.stringify({
          data: [prompt, seed || 42, seed === undefined, aspectRatio, 3, steps]
        })
      });
      const { event_id } = await queue.json();
      const response = await fetch(QWEN_IMAGE_BASE_API_URL + '/gradio_api/call/generate_image/' + event_id, {
        headers: getAuthHeaders(token)
      });
      const result = await response.text();
      const data = extractCompleteEventData(result);

      if (!data) throw new Error("error_invalid_response");

      return {
        id: generateUUID(),
        url: data[0].url,
        model: 'qwen-image', // Standardized ID
        prompt,
        aspectRatio,
        timestamp: Date.now(),
        seed: parseInt(data[1].replace('Seed used for generation: ', '')),
        steps
      };
    } catch (error) {
      console.error("Qwen Image Fast Generation Error:", error);
      throw error;
    }
  });
};

const generateOvisImage = async (
  prompt: string,
  aspectRatio: AspectRatioOption,
  seed: number = Math.round(Math.random() * 2147483647),
  enableHD: boolean = false,
  steps: number = 24
): Promise<GeneratedImage> => {
  let { width, height } = getDimensions(aspectRatio, enableHD);

  return runWithTokenRetry(async (token) => {
    try {
      const queue = await fetch(OVIS_IMAGE_BASE_API_URL + '/gradio_api/call/generate', {
        method: "POST",
        headers: getAuthHeaders(token),
        body: JSON.stringify({
          data: [prompt, height, width, seed, steps, 4]
        })
      });
      const { event_id } = await queue.json();
      const response = await fetch(OVIS_IMAGE_BASE_API_URL + '/gradio_api/call/generate/' + event_id, {
        headers: getAuthHeaders(token)
      });
      const result = await response.text();
      const data = extractCompleteEventData(result);

      if (!data) throw new Error("error_invalid_response");

      return {
        id: generateUUID(),
        url: data[0].url,
        model: 'ovis-image',
        prompt,
        aspectRatio,
        timestamp: Date.now(),
        seed,
        steps
      };
    } catch (error) {
      console.error("Ovis Image Generation Error:", error);
      throw error;
    }
  });
};

export const editImageQwen = async (
  imageBlobs: Blob[],
  prompt: string,
  width: number,
  height: number,
  steps: number = 4,
  guidanceScale: number = 1,
  signal?: AbortSignal
): Promise<GeneratedImage> => {
  return runWithTokenRetry(async (token) => {
    try {
      const seed = Math.round(Math.random() * 2147483647);

      // 1. Upload all Blobs to Gradio first to get temporary paths
      const imagePayloadPromises = imageBlobs.map(async (blob) => {
        const path = await uploadToGradio(QWEN_IMAGE_EDIT_BASE_API_URL, blob, token, signal);
        return { image: { path, meta: { _type: "gradio.FileData" } } };
      });

      const imagePayload = await Promise.all(imagePayloadPromises);

      // 2. Call Inference
      const queue = await fetch(QWEN_IMAGE_EDIT_BASE_API_URL + '/gradio_api/call/infer', {
        method: "POST",
        headers: getAuthHeaders(token),
        body: JSON.stringify({
          data: [
            imagePayload,
            prompt,
            seed,
            false, // Randomize seed
            guidanceScale,
            steps,
            height,
            width,
            true // Rewrite prompt
          ]
        }),
        signal
      });
      const { event_id } = await queue.json();

      await sleep(30);

      const response = await fetch(QWEN_IMAGE_EDIT_BASE_API_URL + '/gradio_api/call/infer/' + event_id, {
        headers: {
          "Accept": "text/event-stream",
          ...getAuthHeaders(token)
        },
        signal
      });
      const result = await response.text();
      const data = extractCompleteEventData(result);

      if (!data || !data[0] || !data[0][0]?.image?.url) {
        throw new Error("error_invalid_response");
      }

      return {
        id: generateUUID(),
        url: data[0][0].image.url,
        model: 'qwen-image-edit', // Unified ID
        prompt,
        aspectRatio: 'custom',
        timestamp: Date.now(),
        seed,
        steps,
        provider: 'huggingface'
      };
    } catch (error) {
      console.error("Qwen Image Edit Error:", error);
      throw error;
    }
  });
};

export const generateImage = async (
  model: ModelOption,
  prompt: string,
  aspectRatio: AspectRatioOption,
  seed?: number,
  enableHD: boolean = false,
  steps?: number,
  guidanceScale?: number
): Promise<GeneratedImage> => {
  const finalSeed = seed ?? Math.round(Math.random() * 2147483647);

  if (model === 'flux-1-schnell') {
    return generateFluxSchnellImage(prompt, aspectRatio, finalSeed, enableHD, steps);
  } else if (model === 'qwen-image') {
    return generateQwenImage(prompt, aspectRatio, seed, steps);
  } else if (model === 'ovis-image') {
    return generateOvisImage(prompt, aspectRatio, finalSeed, enableHD, steps)
  } else {
    // Default to z-image-turbo
    return generateZImage(prompt, aspectRatio, finalSeed, enableHD, steps);
  }
};

export const upscaler = async (url: string): Promise<{ url: string }> => {
  return runWithTokenRetry(async (token) => {
    try {
      const queue = await fetch(UPSCALER_BASE_API_URL + '/gradio_api/call/realesrgan', {
        method: "POST",
        headers: getAuthHeaders(token),
        body: JSON.stringify({
          data: [{ "path": url, "meta": { "_type": "gradio.FileData" } }, 'RealESRGAN_x4plus', 0.5, false, 4]
        })
      });
      const { event_id } = await queue.json();

      await sleep(30);

      const response = await fetch(UPSCALER_BASE_API_URL + '/gradio_api/call/realesrgan/' + event_id, {
        headers: getAuthHeaders(token)
      });
      const result = await response.text();
      const data = extractCompleteEventData(result);

      if (!data) throw new Error("error_invalid_response");

      return { url: data[0].url };
    } catch (error) {
      console.error("Upscaler Error:", error);
      throw new Error("error_upscale_failed");
    }
  });
};

export const optimizePrompt = async (originalPrompt: string): Promise<string> => {
  try {
    const model = getOptimizationModel('huggingface');
    // Append the fixed suffix to the user's custom system prompt
    const systemInstruction = getSystemPromptContent() + FIXED_SYSTEM_PROMPT_SUFFIX;

    const response = await fetch(POLLINATIONS_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model,
        messages: [
          {
            role: 'system',
            content: systemInstruction
          },
          {
            role: 'user',
            content: originalPrompt
          }
        ],
        stream: false
      }),
    });

    if (!response.ok) {
      throw new Error("error_prompt_optimization_failed");
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    return content || originalPrompt;
  } catch (error) {
    console.error("Prompt Optimization Error:", error);
    throw new Error("error_prompt_optimization_failed");
  }
};

// --- Video Generation Services (HF) ---

const VIDEO_NEGATIVE_PROMPT = "Vivid colors, overexposed, static, blurry details, subtitles, style, artwork, painting, image, still, overall grayish tone, worst quality, low quality, JPEG compression artifacts, ugly, incomplete, extra fingers, poorly drawn hands, poorly drawn face, deformed, disfigured, malformed limbs, fused fingers, still image, cluttered background, three legs, many people in the background, walking backward, Screen shaking";

export const createVideoTaskHF = async (imageInput: string | Blob, seed: number = 42): Promise<string> => {
  return runWithTokenRetry(async (token) => {
    try {
      const finalSeed = seed ?? Math.floor(Math.random() * 2147483647);
      const settings = getVideoSettings('huggingface');

      let filePath = '';

      if (typeof imageInput === 'string') {
        filePath = imageInput;
      } else {
        filePath = await uploadToGradio(WAN2_VIDEO_API_URL, imageInput, token);
      }

      // Step 1: POST to queue
      const queue = await fetch(WAN2_VIDEO_API_URL + '/gradio_api/call/generate_video', {
        method: "POST",
        headers: getAuthHeaders(token),
        body: JSON.stringify({
          data: [
            { "path": filePath, "meta": { "_type": "gradio.FileData" } },
            settings.prompt,
            settings.steps, // Steps from settings
            VIDEO_NEGATIVE_PROMPT,
            settings.duration, // Duration from settings
            settings.guidance, // Guidance 1 from settings
            settings.guidance, // Guidance 2 from settings
            finalSeed,
            false // Randomize seed
          ]
        })
      });
      const { event_id } = await queue.json();

      await sleep(40);

      // Step 2: Loop to check status. Since HF API relies on event stream which might be long-lived,
      // we use fetch without abort controller to read the stream until it ends (server closes).
      try {
        // Standard fetch will wait for the response body to fully arrive if we use .text()
        // This effectively waits for the stream to complete or close.
        const response = await fetch(WAN2_VIDEO_API_URL + '/gradio_api/call/generate_video/' + event_id, {
          headers: getAuthHeaders(token)
        });

        const text = await response.text();
        const data = extractCompleteEventData(text);

        if (data) {
          const vid = data[0];
          if (vid?.video?.url) return vid.video.url;
          if (vid?.url) return vid.url;
          return vid;
        }

        // If we reach here, the stream closed but no complete event was found.
        // This could be a network glitch or server timeout. We retry the connection.
      } catch (e: any) {
        if (e.message === QUOTA_ERROR_KEY) throw e;
        // Ignore other errors (timeout, network) and retry after sleep
        console.warn("HF Video Stream interrupted, retrying...", e);
      }

    } catch (error) {
      console.error("Create Video Task HF Error:", error);
      throw error;
    }
  });
};
