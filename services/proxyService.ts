/**
 * Backend Proxy Configuration Service
 * 
 * This service detects whether the backend has configured various services
 * and provides proxy URLs for frontend to use.
 */

export interface ServerConfig {
    providers: {
        huggingface: boolean;
        gitee: boolean;
        modelscope: boolean;
        openrouter: boolean;
        'openai-compat': boolean;
    };
    storage: {
        type: 'off' | 's3' | 'webdav';
        configured: boolean;
    };
}

let cachedConfig: ServerConfig | null = null;
let configFetchPromise: Promise<ServerConfig | null> | null = null;

/**
 * Fetch server configuration (cached)
 */
export async function getServerConfig(): Promise<ServerConfig | null> {
    // Return cached config if available
    if (cachedConfig) return cachedConfig;

    // Return existing promise if fetch is in progress
    if (configFetchPromise) return configFetchPromise;

    // Fetch config from server
    configFetchPromise = (async () => {
        try {
            const response = await fetch('/api/config');
            if (!response.ok) return null;
            cachedConfig = await response.json();
            return cachedConfig;
        } catch (e) {
            console.warn('[ProxyService] Failed to fetch server config:', e);
            return null;
        } finally {
            configFetchPromise = null;
        }
    })();

    return configFetchPromise;
}

/**
 * Check if a specific provider is configured on the server
 */
export async function hasServerProvider(provider: keyof ServerConfig['providers']): Promise<boolean> {
    const config = await getServerConfig();
    return config?.providers[provider] ?? false;
}

/**
 * Check if server storage is configured
 */
export async function hasServerStorage(): Promise<boolean> {
    const config = await getServerConfig();
    return config?.storage?.configured ?? false;
}

/**
 * Get server storage type
 */
export async function getServerStorageType(): Promise<'off' | 's3' | 'webdav'> {
    const config = await getServerConfig();
    return config?.storage?.type ?? 'off';
}

/**
 * Clear cached config (useful after settings change)
 */
export function clearServerConfigCache() {
    cachedConfig = null;
    configFetchPromise = null;
}

/**
 * Get proxy URL for a provider
 */
export function getProxyUrl(provider: string, path: string): string {
    return `/api/proxy/${provider}/${path}`;
}
