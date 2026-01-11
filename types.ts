
export interface GeneratedImage {
    id: string;
    url: string;
    prompt: string;
    aspectRatio: string;
    timestamp: number;
    model: string;
    seed?: number;
    steps?: number;
    guidanceScale?: number;
    duration?: number;
    isBlurred?: boolean;
    isUpscaled?: boolean;
    width?: number;
    height?: number;
    provider?: ProviderOption;
    // Video Generation Properties
    videoUrl?: string;
    videoTaskId?: string;
    videoStatus?: 'generating' | 'success' | 'failed';
    videoError?: string;
    videoProvider?: ProviderOption;
    videoNextPollTime?: number; // Timestamp for next poll attempt
    // Batch Generation Properties
    groupId?: string; // ID to group batch-generated images
    groupImages?: GeneratedImage[]; // Array of images in a batch group
    groupIndex?: number; // Index of this image within the batch (0-based)
}

export interface CloudImage {
    id: string;
    url: string; // Cloud URL
    thumbnailUrl?: string;
    prompt: string;
    timestamp: number;
    fileName: string;
}

export interface CloudFile {
    key: string;
    lastModified: Date;
    size: number;
    url: string;
    type: 'image' | 'video' | 'unknown';
}

// Deprecated: Alias for backward compatibility if needed, but CloudFile is preferred
export type S3Object = CloudFile;

export type StorageType = 'off' | 's3' | 'webdav';

export interface S3Config {
    accessKeyId: string;
    secretAccessKey: string;
    bucket?: string; // Optional
    region?: string; // Optional
    endpoint?: string; // Optional custom endpoint
    publicDomain?: string; // Optional CDN/Public domain
    prefix?: string; // Optional prefix, default 'peinture/'
}

export interface WebDAVConfig {
    url: string;
    username: string;
    password: string;
    directory: string;
}

export type AspectRatioOption = "1:1" | "3:2" | "2:3" | "3:4" | "4:3" | "4:5" | "5:4" | "9:16" | "16:9";

export type ImageSizeOption = "1K" | "2K" | "4K";

// OpenRouter model capabilities configuration
export interface OpenRouterModelCapabilities {
    imageSize?: {
        options: ImageSizeOption[];
        default: ImageSizeOption;
    };
    aspectRatio?: {
        options: AspectRatioOption[];
        default: AspectRatioOption;
    };
}

export interface OpenRouterModelConfig {
    value: string;
    label: string;
    capabilities: OpenRouterModelCapabilities;
}

export type ModelOption =
    | "z-image-turbo"
    | "qwen-image"
    | "ovis-image"
    | "flux-2"
    | "flux-1-schnell"
    | "flux-1-krea"
    | "flux-1"
    | string; // Allow custom model strings

export type ProviderOption = "huggingface" | "openrouter" | "openai-compat" | string;

export interface GenerationParams {
    model: ModelOption;
    prompt: string;
    aspectRatio: AspectRatioOption;
    seed?: number;
    steps?: number;
    guidanceScale?: number;
}

export interface RemoteModel {
    id: string;
    name: string;
    type: string[];
    steps?: {
        range: [number, number];
        default: number;
    };
    guidance?: {
        range: [number, number];
        default: number;
    };
}

export interface RemoteModelList {
    generate?: RemoteModel[];
    edit?: RemoteModel[];
    video?: RemoteModel[];
    text?: RemoteModel[];
    upscaler?: RemoteModel[];
}

export interface CustomProvider {
    id: string;
    name: string;
    apiUrl: string;
    token?: string;
    models: RemoteModelList;
    enabled: boolean;
}

export type ServiceMode = 'local' | 'server' | 'hydration';
