
import React, { useState, useEffect, useRef, useCallback, memo, useMemo } from 'react';
import { generateImage, upscaler, createVideoTaskHF, uploadToGradio, QWEN_IMAGE_EDIT_BASE_API_URL } from './services/hfService';
import { generateGiteeImage, optimizePromptGitee, createVideoTask, getGiteeTaskStatus } from './services/giteeService';
import { generateMSImage, optimizePromptMS } from './services/msService';
import { generateCustomImage, generateCustomVideo, optimizePromptCustom, fetchServerModels, getCustomTaskStatus, upscaleImageCustom } from './services/customService';
import { generateOpenRouterImage, optimizePromptOpenRouter } from './services/openrouterService';
import { generateOpenAICompatImage, optimizePromptOpenAICompat } from './services/openaiCompatService';
import { translatePrompt, generateUUID, getLiveModelConfig, getTextModelConfig, getUpscalerModelConfig, optimizeEditPrompt, getCustomProviders, getVideoSettings, getServiceMode, saveServiceMode, addCustomProvider, fetchBlob, downloadImage } from './services/utils';
import { uploadToCloud, isStorageConfigured } from './services/storageService';
import {
    initDB,
    saveImageToDB,
    getAllImagesFromDB,
    deleteImageFromDB,
    updateImageInDB,
    migrateFromLocalStorage,
    isIndexedDBAvailable
} from './services/indexedDBService';
import { GeneratedImage, AspectRatioOption, ModelOption, ProviderOption, CloudImage, CustomProvider, ServiceMode, ImageSizeOption } from './types';
import { HistoryGallery } from './components/HistoryGallery';
import { SettingsModal } from './components/SettingsModal';
import { FAQModal } from './components/FAQModal';
import { translations, Language } from './translations';
import { ImageEditor } from './components/ImageEditor';
import { CloudGallery } from './components/CloudGallery';
import { Header, AppView } from './components/Header';
import {
    Sparkles,
    Loader2,
    RotateCcw,
    Lock,
} from 'lucide-react';
import { getModelConfig, getGuidanceScaleConfig, FLUX_MODELS, HF_MODEL_OPTIONS, GITEE_MODEL_OPTIONS, MS_MODEL_OPTIONS, LIVE_MODELS, getOpenRouterModelConfig, OPENAI_COMPAT_MODEL_OPTIONS, getOpenAICompatModelConfig } from './constants';
import { PromptInput } from './components/PromptInput';
import { ControlPanel } from './components/ControlPanel';
import { PreviewStage } from './components/PreviewStage';
import { ImageToolbar } from './components/ImageToolbar';
import { Tooltip } from './components/Tooltip';

// Memoize Header to prevent re-renders when App re-renders (e.g. timer)
const MemoizedHeader = memo(Header);

export default function App() {
    // Language Initialization
    const [lang, setLang] = useState<Language>(() => {
        const saved = localStorage.getItem('app_language');
        if (saved === 'en' || saved === 'zh') return saved;
        const browserLang = navigator.language.toLowerCase();
        return browserLang.startsWith('zh') ? 'zh' : 'en';
    });

    const t = translations[lang];

    // Navigation State
    const [currentView, setCurrentView] = useState<AppView>('creation');

    // Dynamic Aspect Ratio Options based on language
    const aspectRatioOptions = [
        { value: '1:1', label: t.ar_square },
        { value: '9:16', label: t.ar_photo_9_16 },
        { value: '16:9', label: t.ar_movie },
        { value: '3:4', label: t.ar_portrait_3_4 },
        { value: '4:3', label: t.ar_landscape_4_3 },
        { value: '3:2', label: t.ar_portrait_3_2 },
        { value: '2:3', label: t.ar_landscape_2_3 },
    ];

    const [prompt, setPrompt] = useState<string>('');

    // --- Persistence Logic Start ---

    const [provider, setProvider] = useState<ProviderOption>(() => {
        if (typeof localStorage === 'undefined') return 'huggingface';
        const saved = localStorage.getItem('app_provider') as ProviderOption;
        return saved || 'huggingface';
    });

    const [model, setModel] = useState<ModelOption>(() => {
        let effectiveProvider: ProviderOption = 'huggingface';
        if (typeof localStorage !== 'undefined') {
            const savedProvider = localStorage.getItem('app_provider') as ProviderOption;
            if (savedProvider) {
                effectiveProvider = savedProvider;
            }
        }

        const savedModel = typeof localStorage !== 'undefined' ? localStorage.getItem('app_model') : null;

        // Validate if saved model belongs to the current provider logic (basic check)
        // For custom providers, we blindly trust the saved model ID if the provider matches a custom ID
        if (savedModel) return savedModel as ModelOption;

        return HF_MODEL_OPTIONS[0].value as ModelOption;
    });

    const [aspectRatio, setAspectRatio] = useState<AspectRatioOption>(() => {
        const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('app_aspect_ratio') : null;
        // Basic validation could be added, but relying on stored string is generally safe with fallback
        return (saved as AspectRatioOption) || '1:1';
    });

    // Effects to save settings
    useEffect(() => {
        localStorage.setItem('app_provider', provider);
    }, [provider]);

    useEffect(() => {
        localStorage.setItem('app_model', model);
    }, [model]);

    useEffect(() => {
        localStorage.setItem('app_aspect_ratio', aspectRatio);
    }, [aspectRatio]);

    // --- Persistence Logic End ---

    const [seed, setSeed] = useState<string>('');
    const [steps, setSteps] = useState<number>(9);
    const [guidanceScale, setGuidanceScale] = useState<number>(3.5);
    const [imageSize, setImageSize] = useState<ImageSizeOption>('1K');
    const [batchCount, setBatchCount] = useState<number>(1);
    const [autoTranslate, setAutoTranslate] = useState<boolean>(false);

    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [isTranslating, setIsTranslating] = useState<boolean>(false);
    const [isOptimizing, setIsOptimizing] = useState<boolean>(false);
    const [isUpscaling, setIsUpscaling] = useState<boolean>(false);
    const [isDownloading, setIsDownloading] = useState<boolean>(false);
    // Cloud Upload State
    const [isUploading, setIsUploading] = useState<boolean>(false);

    const [currentImage, setCurrentImage] = useState<GeneratedImage | null>(null);
    const [elapsedTime, setElapsedTime] = useState<number>(0);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Transition state for upscaling
    const [isComparing, setIsComparing] = useState<boolean>(false);
    const [tempUpscaledImage, setTempUpscaledImage] = useState<string | null>(null);

    // Video State
    const [isLiveMode, setIsLiveMode] = useState<boolean>(false);

    // Batch Generation State
    const [batchImages, setBatchImages] = useState<(GeneratedImage | null)[]>([]);
    const [batchProgress, setBatchProgress] = useState<{ status: 'idle' | 'loading' | 'success' | 'error'; error?: string }[]>([]);
    const [selectedBatchIndex, setSelectedBatchIndex] = useState<number | null>(null);

    // Password Modal State
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [accessPassword, setAccessPassword] = useState('');
    const [passwordError, setPasswordError] = useState(false);

    // Initialize history state (will be loaded from IndexedDB)
    const [history, setHistory] = useState<GeneratedImage[]>([]);
    const [isHistoryLoaded, setIsHistoryLoaded] = useState(false);

    // Cloud History State
    const [cloudHistory, setCloudHistory] = useState<CloudImage[]>(() => {
        try {
            const saved = localStorage.getItem('ai_cloud_history');
            if (!saved) return [];
            return JSON.parse(saved);
        } catch (e) {
            return [];
        }
    });

    // Save cloud history when changed
    useEffect(() => {
        localStorage.setItem('ai_cloud_history', JSON.stringify(cloudHistory));
    }, [cloudHistory]);

    // Load history from IndexedDB on mount
    useEffect(() => {
        const loadHistory = async () => {
            if (!isIndexedDBAvailable()) {
                console.warn('IndexedDB not available, falling back to localStorage');
                try {
                    const saved = localStorage.getItem('ai_image_gen_history');
                    if (saved) {
                        const parsed = JSON.parse(saved);
                        const now = Date.now();
                        const oneDayInMs = 24 * 60 * 60 * 1000;
                        setHistory(parsed.filter((img: GeneratedImage) => (now - img.timestamp) < oneDayInMs));
                    }
                } catch (e) {
                    console.error('Failed to load from localStorage', e);
                }
                setIsHistoryLoaded(true);
                return;
            }

            try {
                // Initialize DB
                await initDB();

                // Migrate from localStorage if needed
                await migrateFromLocalStorage();

                // Load all images
                const images = await getAllImagesFromDB();
                setHistory(images);
            } catch (e) {
                console.error('Failed to load history from IndexedDB', e);
            } finally {
                setIsHistoryLoaded(true);
            }
        };

        loadHistory();
    }, []);

    const [error, setError] = useState<string | null>(null);

    // New state for Info Popover
    const [showInfo, setShowInfo] = useState<boolean>(false);
    const [imageDimensions, setImageDimensions] = useState<{ width: number, height: number } | null>(null);
    const [copiedPrompt, setCopiedPrompt] = useState<boolean>(false);

    // Settings State
    const [showSettings, setShowSettings] = useState<boolean>(false);

    // FAQ State
    const [showFAQ, setShowFAQ] = useState<boolean>(false);

    // Use refs for polling to avoid stale closures and constant interval resetting
    const historyRef = useRef(history);
    const currentImageRef = useRef(currentImage);

    // Sync refs with state
    useEffect(() => {
        historyRef.current = history;
    }, [history]);

    useEffect(() => {
        currentImageRef.current = currentImage;
    }, [currentImage]);

    // Server Mode Initialization Logic
    useEffect(() => {
        const initServiceMode = async () => {
            const mode = getServiceMode();

            if (mode === 'server') {
                try {
                    // Attempt to find an existing "Server" provider to reuse its token
                    const customProviders = getCustomProviders();
                    const existingServer = customProviders.find(p => p.name === 'Server' && p.apiUrl === '/api');
                    const storedToken = existingServer?.token;

                    // Call API with stored token (if any)
                    const models = await fetchServerModels(storedToken);

                    // If successful, update or create the "Server" provider in storage
                    const serverProvider: CustomProvider = {
                        id: existingServer ? existingServer.id : generateUUID(),
                        name: 'Server',
                        apiUrl: '/api',
                        token: storedToken || '', // Persist the working token
                        models,
                        enabled: true
                    };

                    // This updates the storage with fresh models and confirms the token is valid
                    addCustomProvider(serverProvider);

                    // Trigger storage event to update control panel if it wasn't there
                    if (!existingServer) {
                        window.dispatchEvent(new Event("storage"));
                    }

                    // Force selection of first model if not set
                    if (models.generate && models.generate.length > 0) {
                        // Check if current selection is invalid
                        const currentProviderIsCustom = customProviders.some(p => p.id === provider);
                        if (!provider || provider === 'huggingface' || (currentProviderIsCustom && !existingServer)) {
                            setProvider(serverProvider.id);
                            setModel(models.generate[0].id);
                        }
                    }

                } catch (e: any) {
                    if (e.message === '401') {
                        setShowPasswordModal(true);
                    } else {
                        console.error("Failed to init server mode", e);
                    }
                }
            }
        };

        // Only run if not already handled password modal or other interactions
        if (!showPasswordModal) {
            initServiceMode();
        }
    }, []);

    const handlePasswordSubmit = async () => {
        setPasswordError(false);
        try {
            const models = await fetchServerModels(accessPassword);

            // Success!
            // Find existing to preserve ID if possible
            const customProviders = getCustomProviders();
            const existing = customProviders.find(p => p.name === 'Server' && p.apiUrl === '/api');

            const serverProvider: CustomProvider = {
                id: existing ? existing.id : generateUUID(),
                name: 'Server',
                apiUrl: '/api',
                token: accessPassword, // Important: Save the new password
                models,
                enabled: true
            };

            addCustomProvider(serverProvider); // This saves to localStorage
            saveServiceMode('server');
            window.dispatchEvent(new Event("storage"));

            // Set default model
            if (models.generate && models.generate.length > 0) {
                setProvider(serverProvider.id);
                setModel(models.generate[0].id);
            }

            setShowPasswordModal(false);
        } catch (e) {
            setPasswordError(true);
        }
    };

    const handleSwitchToLocal = () => {
        saveServiceMode('local');
        window.dispatchEvent(new Event("storage"));
        setShowPasswordModal(false);
        // Reset to defaults
        setProvider('huggingface');
        setModel(HF_MODEL_OPTIONS[0].value);
    };

    // Handle initialization/reset of model when switching to creation view
    useEffect(() => {
        if (currentView === 'creation') {
            let options: { value: string; label: string }[] = [];
            if (provider === 'gitee') options = GITEE_MODEL_OPTIONS;
            else if (provider === 'modelscope') options = MS_MODEL_OPTIONS;
            else if (provider === 'huggingface') options = HF_MODEL_OPTIONS;
            else {
                // Custom provider
                const customProviders = getCustomProviders();
                const activeCustom = customProviders.find(p => p.id === provider);
                if (activeCustom?.models?.generate) {
                    options = activeCustom.models.generate.map(m => ({ value: m.id, label: m.name }));
                }
            }

            if (options.length > 0) {
                const isValid = options.some(o => o.value === model);
                if (!isValid) {
                    const defaultModel = options[0].value as ModelOption;
                    setModel(defaultModel);

                    // Force parameter update for the new default model
                    const config = getModelConfig(provider, defaultModel);
                    setSteps(config.default);
                    const gsConfig = getGuidanceScaleConfig(defaultModel, provider);
                    if (gsConfig) setGuidanceScale(gsConfig.default);
                }
            }
        }
    }, [currentView, provider, model]);

    // Robust Polling for Video Tasks using Recursive Timeout
    useEffect(() => {
        let isMounted = true;
        let timeoutId: any;

        const poll = async () => {
            if (!isMounted) return;

            const currentHist = historyRef.current;
            // Filter items that are generating AND have a task ID
            const pendingVideos = currentHist.filter(img =>
                img.videoStatus === 'generating' &&
                img.videoTaskId
            );

            if (pendingVideos.length === 0) {
                // Check again later
                timeoutId = setTimeout(poll, 5000);
                return;
            }

            const now = Date.now();
            // Determine which are ready to poll (handling predict delay)
            const readyToPoll = pendingVideos.filter(img => !img.videoNextPollTime || now >= img.videoNextPollTime);

            if (readyToPoll.length === 0) {
                // Nothing ready yet, wait for the earliest next time or 5s minimum
                const nextTimes = pendingVideos.map(img => img.videoNextPollTime || 5000);
                const minTime = Math.min(...nextTimes);
                const delay = Math.max(5000, minTime - now);
                timeoutId = setTimeout(poll, delay);
                return;
            }

            // Fetch updates for ready items in parallel (but next cycle waits for this to finish)
            const updates = await Promise.all(readyToPoll.map(async (img) => {
                if (!img.videoTaskId) return null;
                try {
                    if (img.videoProvider === 'gitee') {
                        const result = await getGiteeTaskStatus(img.videoTaskId);
                        if (result.status === 'success' || result.status === 'failed') {
                            return { id: img.id, ...result };
                        }
                    } else if (img.videoProvider) {
                        // Try Custom Provider
                        const customProviders = getCustomProviders();
                        const provider = customProviders.find(p => p.id === img.videoProvider);
                        if (provider) {
                            const result = await getCustomTaskStatus(provider, img.videoTaskId);
                            if (result.status === 'success' || result.status === 'failed') {
                                return { id: img.id, ...result };
                            }
                        }
                    }
                    return null;
                } catch (e) {
                    console.error("Failed to poll task", img.videoTaskId, e);
                    return null;
                }
            }));

            const validUpdates = updates.filter(u => u !== null) as { id: string, status: string, videoUrl?: string, error?: string }[];

            if (validUpdates.length > 0 && isMounted) {
                setHistory(prev => prev.map(item => {
                    const update = validUpdates.find(u => u.id === item.id);
                    if (!update) return item;

                    if (update.status === 'success' && update.videoUrl) {
                        return { ...item, videoStatus: 'success', videoUrl: update.videoUrl };
                    } else if (update.status === 'failed') {
                        const failMsg = update.error || 'Video generation failed';
                        return { ...item, videoStatus: 'failed', videoError: failMsg };
                    }
                    return item;
                }));

                // Sync currentImage if needed
                const currImg = currentImageRef.current;
                if (currImg) {
                    const relevantUpdate = validUpdates.find(u => u.id === currImg.id);
                    if (relevantUpdate) {
                        if (relevantUpdate.status === 'success' && relevantUpdate.videoUrl) {
                            setCurrentImage(prev => prev ? { ...prev, videoStatus: 'success', videoUrl: relevantUpdate.videoUrl } : null);
                            setIsLiveMode(true);
                        } else if (relevantUpdate.status === 'failed') {
                            setCurrentImage(prev => prev ? { ...prev, videoStatus: 'failed', videoError: relevantUpdate.error || 'Video generation failed' } : null);
                            setError(relevantUpdate.error || 'Video generation failed');
                        }
                    }
                }
            }

            // Schedule next poll cycle
            if (isMounted) timeoutId = setTimeout(poll, 5000);
        };

        poll();

        return () => {
            isMounted = false;
            clearTimeout(timeoutId);
        };
    }, []); // Empty dependency array ensures poll only starts once on mount


    // Language Persistence
    useEffect(() => {
        localStorage.setItem('app_language', lang);
    }, [lang]);

    // Note: Image History is now persisted to IndexedDB on individual operations
    // No longer using localStorage for bulk history storage

    // Update steps and guidance scale when model/provider changes
    useEffect(() => {
        const config = getModelConfig(provider, model);
        setSteps(config.default);

        const gsConfig = getGuidanceScaleConfig(model, provider);
        if (gsConfig) {
            setGuidanceScale(gsConfig.default);
        }
    }, [provider, model]);

    // Handle Auto Translate default state based on model
    useEffect(() => {
        if (FLUX_MODELS.includes(model)) {
            setAutoTranslate(true);
        } else {
            setAutoTranslate(false);
        }
    }, [model]);

    // Initial Selection Effect
    useEffect(() => {
        if (!currentImage && history.length > 0) {
            const firstImg = history[0];
            setCurrentImage(firstImg);
            if (firstImg.videoUrl && firstImg.videoStatus === 'success') {
                setIsLiveMode(true);
            }
        }
    }, [history.length]);

    // Cleanup timer on unmount
    useEffect(() => {
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, []);

    const startTimer = () => {
        setElapsedTime(0);
        const startTime = Date.now();
        timerRef.current = setInterval(() => {
            setElapsedTime((Date.now() - startTime) / 1000);
        }, 100);
        return startTime;
    };

    const stopTimer = () => {
        if (timerRef.current) clearInterval(timerRef.current);
    };

    const addToPromptHistory = (text: string) => {
        const trimmed = text.trim();
        if (!trimmed) return;

        // Read current history from session storage
        let currentHistory: string[] = [];
        try {
            const saved = sessionStorage.getItem('prompt_history');
            currentHistory = saved ? JSON.parse(saved) : [];
        } catch (e) { }

        // Update
        const filtered = currentHistory.filter(p => p !== trimmed);
        const newHistory = [trimmed, ...filtered].slice(0, 50);

        // Save
        sessionStorage.setItem('prompt_history', JSON.stringify(newHistory));
    };

    const handleGenerate = async () => {
        if (!prompt.trim()) return;

        addToPromptHistory(prompt);

        setIsLoading(true);
        setError(null);
        setShowInfo(false);
        setImageDimensions(null);
        setIsComparing(false);
        setTempUpscaledImage(null);
        setIsLiveMode(false);

        // Reset batch state
        setBatchImages(Array(batchCount).fill(null));
        setBatchProgress(Array(batchCount).fill({ status: 'loading' }));
        setSelectedBatchIndex(0);

        let finalPrompt = prompt;

        // Handle Auto Translate
        if (autoTranslate) {
            setIsTranslating(true);
            try {
                finalPrompt = await translatePrompt(prompt);
                setPrompt(finalPrompt); // Update UI with translated text
            } catch (err: any) {
                console.error("Translation failed", err);
            } finally {
                setIsTranslating(false);
            }
        }

        const startTime = startTimer();

        try {
            const baseSeed = seed.trim() === '' ? undefined : parseInt(seed, 10);
            const gsConfig = getGuidanceScaleConfig(model, provider);
            const currentGuidanceScale = gsConfig ? guidanceScale : undefined;

            // Always request HD if the service supports it, removing the UI toggle
            const requestHD = true;

            // Generate groupId for batch
            const groupId = generateUUID();

            // Create generation function
            const generateSingle = async (index: number) => {
                // Each image in batch uses different seed (base + index) or random if no seed
                const seedNumber = baseSeed !== undefined ? baseSeed + index : undefined;

                let result;

                if (provider === 'gitee') {
                    result = await generateGiteeImage(model, finalPrompt, aspectRatio, seedNumber, steps, requestHD, currentGuidanceScale);
                } else if (provider === 'modelscope') {
                    result = await generateMSImage(model, finalPrompt, aspectRatio, seedNumber, steps, requestHD, currentGuidanceScale);
                } else if (provider === 'huggingface') {
                    result = await generateImage(model, finalPrompt, aspectRatio, seedNumber, requestHD, steps, currentGuidanceScale);
                } else if (provider === 'openrouter') {
                    // Get model capabilities for OpenRouter
                    const modelConfig = getOpenRouterModelConfig(model);
                    const imageSizeParam = modelConfig?.capabilities.imageSize ? imageSize : undefined;
                    result = await generateOpenRouterImage(model, finalPrompt, aspectRatio, seedNumber, imageSizeParam);
                } else if (provider === 'openai-compat') {
                    result = await generateOpenAICompatImage(model, finalPrompt, aspectRatio, seedNumber, imageSize);
                } else {
                    // Custom Provider
                    const customProviders = getCustomProviders();
                    const activeProvider = customProviders.find(p => p.id === provider);
                    if (activeProvider) {
                        result = await generateCustomImage(activeProvider, model, finalPrompt, aspectRatio, seedNumber, steps, currentGuidanceScale, requestHD);
                    } else {
                        throw new Error("Invalid provider");
                    }
                }

                return result;
            };

            // Execute batch generation in parallel
            const batchPromises = Array.from({ length: batchCount }, (_, index) =>
                generateSingle(index)
                    .then(result => {
                        const endTime = Date.now();
                        const duration = (endTime - startTime) / 1000;

                        const newImage: GeneratedImage = {
                            ...result,
                            duration,
                            provider,
                            guidanceScale: currentGuidanceScale,
                            groupId,
                            groupIndex: index
                        };

                        // Update batch state for this index
                        setBatchImages(prev => {
                            const updated = [...prev];
                            updated[index] = newImage;
                            return updated;
                        });
                        setBatchProgress(prev => {
                            const updated = [...prev];
                            updated[index] = { status: 'success' };
                            return updated;
                        });

                        return newImage;
                    })
                    .catch(err => {
                        // Update progress for failed item
                        setBatchProgress(prev => {
                            const updated = [...prev];
                            updated[index] = { status: 'error', error: err.message };
                            return updated;
                        });
                        return null;
                    })
            );

            const results = await Promise.all(batchPromises);

            // Filter successful results
            const successfulImages = results.filter((img): img is GeneratedImage => img !== null);

            if (successfulImages.length > 0) {
                // Add groupImages reference to each image
                const imagesWithGroup = successfulImages.map(img => ({
                    ...img,
                    groupImages: successfulImages
                }));

                // Set first successful image as current
                setCurrentImage(imagesWithGroup[0]);

                // Add all successful images to history (newest first)
                setHistory(prev => [...imagesWithGroup.reverse(), ...prev]);

                // Save to IndexedDB
                if (isIndexedDBAvailable()) {
                    imagesWithGroup.forEach(img => {
                        saveImageToDB(img).catch(e => console.error('Failed to save image to IndexedDB', e));
                    });
                }
            } else {
                // All failed
                setError(t.generationFailed);
            }

        } catch (err: any) {
            const errorMessage = (t as any)[err.message] || err.message || t.generationFailed;
            setError(errorMessage);
        } finally {
            stopTimer();
            setIsLoading(false);
        }
    };

    const handleReset = () => {
        setPrompt('');
        if (provider === 'gitee') {
            setModel(GITEE_MODEL_OPTIONS[0].value as ModelOption);
        } else if (provider === 'modelscope') {
            setModel(MS_MODEL_OPTIONS[0].value as ModelOption);
        } else if (provider === 'huggingface') {
            setModel(HF_MODEL_OPTIONS[0].value as ModelOption);
        } else {
            // Custom
            const customProviders = getCustomProviders();
            const activeCustom = customProviders.find(p => p.id === provider);
            if (activeCustom?.models?.generate && activeCustom.models.generate.length > 0) {
                setModel(activeCustom.models.generate[0].id as ModelOption);
            }
        }
        setAspectRatio('1:1');
        setSeed('');
        const config = getModelConfig(provider, model);
        setSteps(config.default);
        // Removed setEnableHD(false);
        setCurrentImage(null);
        setIsComparing(false);
        setTempUpscaledImage(null);
        setIsLiveMode(false);
        setError(null);
    };

    const handleUpscale = async () => {
        if (!currentImage || isUpscaling) return;
        setIsUpscaling(true);
        setError(null);
        try {
            const config = getUpscalerModelConfig(); // { provider, model }

            let newUrl = '';

            if (config.provider === 'huggingface') {
                // Default HF logic (RealESRGAN)
                const result = await upscaler(currentImage.url);
                newUrl = result.url;
            } else {
                // Check for Custom Provider
                const customProviders = getCustomProviders();
                const activeProvider = customProviders.find(p => p.id === config.provider);

                if (activeProvider) {
                    const result = await upscaleImageCustom(activeProvider, config.model, currentImage.url);
                    newUrl = result.url;
                } else {
                    // Fallback to HF
                    const result = await upscaler(currentImage.url);
                    newUrl = result.url;
                }
            }

            setTempUpscaledImage(newUrl);
            setIsComparing(true);
        } catch (err: any) {
            setTempUpscaledImage(null);
            const errorMessage = (t as any)[err.message] || err.message || t.error_upscale_failed;
            setError(errorMessage);
        } finally {
            setIsUpscaling(false);
        }
    };

    const handleApplyUpscale = () => {
        if (!currentImage || !tempUpscaledImage) return;

        // Create image element to get new dimensions
        const img = new Image();
        img.onload = () => {
            const updatedImage = {
                ...currentImage,
                url: tempUpscaledImage,
                isUpscaled: true,
                width: img.naturalWidth,
                height: img.naturalHeight
            };
            setCurrentImage(updatedImage);
            setHistory(prev => prev.map(img =>
                img.id === updatedImage.id ? updatedImage : img
            ));
            setIsComparing(false);
            setTempUpscaledImage(null);
        };
        img.src = tempUpscaledImage;
    };

    const handleCancelUpscale = () => {
        setIsComparing(false);
        setTempUpscaledImage(null);
    };

    const handleOptimizePrompt = async () => {
        if (!prompt.trim()) return;
        addToPromptHistory(prompt);
        setIsOptimizing(true);
        setError(null);
        try {
            const config = getTextModelConfig(); // { provider, model }
            let optimized = '';

            if (config.provider === 'gitee') {
                optimized = await optimizePromptGitee(prompt);
            } else if (config.provider === 'modelscope') {
                optimized = await optimizePromptMS(prompt);
            } else if (config.provider === 'huggingface') {
                // Default HF uses simple internal logic or Pollinations
                const { optimizePrompt } = await import('./services/hfService');
                optimized = await optimizePrompt(prompt);
            } else if (config.provider === 'openrouter') {
                optimized = await optimizePromptOpenRouter(prompt, config.model);
            } else if (config.provider === 'openai-compat') {
                optimized = await optimizePromptOpenAICompat(prompt, config.model);
            } else {
                // Custom Provider
                const customProviders = getCustomProviders();
                const activeProvider = customProviders.find(p => p.id === config.provider);
                if (activeProvider) {
                    optimized = await optimizePromptCustom(activeProvider, config.model, prompt);
                } else {
                    // Fallback
                    const { optimizePrompt } = await import('./services/hfService');
                    optimized = await optimizePrompt(prompt);
                }
            }
            setPrompt(optimized);
        } catch (err: any) {
            console.error("Optimization failed", err);
            const errorMessage = (t as any)[err.message] || err.message || t.error_prompt_optimization_failed;
            setError(errorMessage);
        } finally {
            setIsOptimizing(false);
        }
    };

    const handleHistorySelect = (image: GeneratedImage) => {
        setCurrentImage(image);
        setShowInfo(false);
        setImageDimensions(null);
        setIsComparing(false);
        setTempUpscaledImage(null);
        // Automatically switch to Live Mode if video is available
        if (image.videoUrl && image.videoStatus === 'success') {
            setIsLiveMode(true);
        } else {
            setIsLiveMode(false);
        }
        setError(null);
    };

    const handleDelete = () => {
        if (!currentImage) return;

        // Delete from IndexedDB
        if (isIndexedDBAvailable()) {
            deleteImageFromDB(currentImage.id).catch(e => console.error('Failed to delete from IndexedDB', e));
        }

        const newHistory = history.filter(img => img.id !== currentImage.id);
        setHistory(newHistory);

        setShowInfo(false);
        setIsComparing(false);
        setTempUpscaledImage(null);
        setError(null);

        if (newHistory.length > 0) {
            const nextImg = newHistory[0];
            setCurrentImage(nextImg);
            if (nextImg.videoUrl && nextImg.videoStatus === 'success') {
                setIsLiveMode(true);
            } else {
                setIsLiveMode(false);
            }
        } else {
            setCurrentImage(null);
            setIsLiveMode(false);
        }
    };

    const handleToggleBlur = () => {
        if (!currentImage) return;
        const newStatus = !currentImage.isBlurred;
        const updatedImage = { ...currentImage, isBlurred: newStatus };
        setCurrentImage(updatedImage);
        setHistory(prev => prev.map(img =>
            img.id === currentImage.id ? updatedImage : img
        ));

        // Update in IndexedDB
        if (isIndexedDBAvailable()) {
            updateImageInDB(currentImage.id, { isBlurred: newStatus })
                .catch(e => console.error('Failed to update in IndexedDB', e));
        }
    };

    const handleCopyPrompt = async () => {
        if (!currentImage?.prompt) return;
        try {
            await navigator.clipboard.writeText(currentImage.prompt);
            setCopiedPrompt(true);
            setTimeout(() => setCopiedPrompt(false), 2000);
        } catch (err) {
            console.error("Failed to copy", err);
        }
    };

    const handleLiveClick = async () => {
        if (!currentImage) return;

        // If already generating, do nothing
        if (currentImage.videoStatus === 'generating') return;

        // Get configured Live Model
        let liveConfig = getLiveModelConfig(); // { provider, model }

        // --- NEW LOGIC: Dynamic fallback to available live models ---
        const serviceMode = getServiceMode();
        const customProviders = getCustomProviders();
        let availableLiveModels: { provider: string, model: string }[] = [];

        // 1. Base Providers
        if (serviceMode === 'local' || serviceMode === 'hydration') {
            LIVE_MODELS.forEach(m => {
                // m.value is "provider:modelId"
                const parts = m.value.split(':');
                if (parts.length >= 2) {
                    availableLiveModels.push({ provider: parts[0], model: parts.slice(1).join(':') });
                }
            });
        }

        // 2. Custom Providers
        if (serviceMode === 'server' || serviceMode === 'hydration') {
            customProviders.forEach(cp => {
                if (cp.models.video) {
                    cp.models.video.forEach(m => {
                        availableLiveModels.push({ provider: cp.id, model: m.id });
                    });
                }
            });
        }

        // Check if configured model is in available list
        const isConfigValid = availableLiveModels.some(
            m => m.provider === liveConfig.provider && m.model === liveConfig.model
        );

        if (!isConfigValid && availableLiveModels.length > 0) {
            // Fallback to first available
            liveConfig = availableLiveModels[0];
            console.log("Live model fallback to:", liveConfig);
        } else if (availableLiveModels.length === 0) {
            setError(t.liveNotSupported || "No Live models available");
            return;
        }
        // --- END NEW LOGIC ---

        // Start Generation
        let width = imageDimensions?.width || 1024;
        let height = imageDimensions?.height || 1024;

        const currentVideoProvider = liveConfig.provider as ProviderOption;

        // Prepare Image Input
        // Use unified fetchBlob which handles proxy fallback automatically for string URLs
        let imageInput: string | Blob = currentImage.url;
        try {
            if (currentImage.provider === 'gitee' || currentImage.provider === 'modelscope') {
                // Fetch blob using unified utility which handles proxy fallback
                imageInput = await fetchBlob(currentImage.url);
            }
        } catch (e) {
            console.warn("Failed to fetch image blob for Live gen, using original URL", e);
        }

        // Resolution scaling logic (Specific to Gitee)
        if (currentVideoProvider === 'gitee') {
            // Enforce 720p (Short edge 720px)
            const imgAspectRatio = width / height;
            if (width >= height) {
                // Landscape or Square: Set Height to 720
                height = 720;
                width = Math.round(height * imgAspectRatio);
            } else {
                // Portrait: Set Width to 720
                width = 720;
                height = Math.round(width / imgAspectRatio);
            }

            // Ensure even numbers (common requirement for video encoding)
            if (width % 2 !== 0) width -= 1;
            if (height % 2 !== 0) height -= 1;
        }

        try {
            const loadingImage = {
                ...currentImage,
                videoStatus: 'generating',
                videoProvider: currentVideoProvider
            } as GeneratedImage;

            setCurrentImage(loadingImage);
            setHistory(prev => prev.map(img => img.id === loadingImage.id ? loadingImage : img));

            if (currentVideoProvider === 'gitee') {
                // Gitee: Create Task and let polling handle it
                // Prompt is fetched from settings inside the service
                const taskId = await createVideoTask(imageInput, width, height);
                const nextPollTime = Date.now() + 400 * 1000;
                const taskedImage = {
                    ...loadingImage,
                    videoTaskId: taskId,
                    videoNextPollTime: nextPollTime
                } as GeneratedImage;
                setCurrentImage(taskedImage);
                setHistory(prev => prev.map(img => img.id === taskedImage.id ? taskedImage : img));
            } else if (currentVideoProvider === 'huggingface') {
                // HF: Create Task handles the waiting internally (Long Connection)
                // Prompt is fetched from settings inside the service
                // Updated createVideoTaskHF supports Blob input
                const videoUrl = await createVideoTaskHF(imageInput, currentImage.seed);
                // Success
                const successImage = { ...loadingImage, videoStatus: 'success', videoUrl } as GeneratedImage;
                setHistory(prev => prev.map(img => img.id === successImage.id ? successImage : img));
                // Update current if user hasn't switched away
                setCurrentImage(prev => (prev && prev.id === successImage.id) ? successImage : prev);

                if (currentImageRef.current?.id === successImage.id) {
                    setIsLiveMode(true);
                }
            } else {
                // Custom Video Provider
                const customProviders = getCustomProviders();
                const activeProvider = customProviders.find(p => p.id === currentVideoProvider);
                if (activeProvider) {
                    const settings = getVideoSettings(currentVideoProvider);
                    // generateCustomVideo now returns object with url or taskId and optional predict time
                    const result = await generateCustomVideo(
                        activeProvider,
                        liveConfig.model,
                        currentImage.url, // Pass original URL for custom
                        settings.prompt,
                        settings.duration,
                        currentImage.seed ?? 42,
                        settings.steps,
                        settings.guidance
                    );

                    if (result.taskId) {
                        // Async: Task created
                        // Handle 'predict' time if provided (seconds)
                        const nextPollTime = result.predict ? Date.now() + result.predict * 1000 : undefined;
                        const taskedImage = {
                            ...loadingImage,
                            videoTaskId: result.taskId,
                            videoNextPollTime: nextPollTime
                        } as GeneratedImage;
                        setCurrentImage(taskedImage);
                        setHistory(prev => prev.map(img => img.id === taskedImage.id ? taskedImage : img));
                    } else if (result.url) {
                        // Sync: URL returned immediately
                        const successImage = { ...loadingImage, videoStatus: 'success', videoUrl: result.url } as GeneratedImage;
                        setHistory(prev => prev.map(img => img.id === successImage.id ? successImage : img));
                        setCurrentImage(prev => (prev && prev.id === successImage.id) ? successImage : prev);

                        if (currentImageRef.current?.id === successImage.id) {
                            setIsLiveMode(true);
                        }
                    } else {
                        throw new Error("Invalid response from video provider");
                    }
                } else {
                    throw new Error(t.liveNotSupported || "Live provider not supported");
                }
            }

        } catch (e: any) {
            console.error("Video Generation Failed", e);
            const failedImage = { ...currentImage, videoStatus: 'failed', videoError: e.message } as GeneratedImage;
            setCurrentImage(prev => (prev && prev.id === failedImage.id) ? failedImage : prev);
            setHistory(prev => prev.map(img => img.id === failedImage.id ? failedImage : img));
            setError(t.liveError);
        }
    };

    const handleDownload = async (imageUrl: string, fileName: string) => {
        // If Live mode is active and we have a video URL, download that instead
        if (isLiveMode && currentImage?.videoUrl) {
            imageUrl = currentImage.videoUrl;
            fileName = fileName.replace(/\.(png|jpg|webp)$/, '') + '.mp4';
        }

        if (isDownloading) return;
        setIsDownloading(true);

        try {
            // Handle Extension and NSFW Suffix
            // Determine if filename already has an extension
            const hasExtension = fileName.match(/\.[a-zA-Z0-9]+$/);
            // Default extension if missing (usually handled by downloadImage via Blob type, but we prep filename here)
            // If extension is missing, we append a placeholder or let user agent handle if possible, 
            // but explicit extension is better. We'll guess png if unknown.
            let base = hasExtension ? fileName.replace(/\.[a-zA-Z0-9]+$/, '') : fileName;
            let ext = hasExtension ? hasExtension[0] : '.png';

            // Inject NSFW suffix if needed
            if (currentImage?.isBlurred && !base.toUpperCase().endsWith('.NSFW')) {
                base += '.NSFW';
            }

            fileName = base + ext;

            // Use unified download utility
            await downloadImage(imageUrl, fileName);

        } catch (e) {
            console.error("Download failed", e);
            window.open(imageUrl, '_blank');
        } finally {
            setIsDownloading(false);
        }
    };

    const handleUploadToCloud = async (imageBlobOrUrl: Blob | string, fileName?: string, metadata?: any) => {
        if (isUploading) return;
        setIsUploading(true);

        try {
            if (!isStorageConfigured()) {
                throw new Error("error_storage_config_missing");
            }

            let blob: Blob;
            let finalFileName = fileName || `generated-${generateUUID()}`;

            // Extract metadata and context
            // If uploading specific resource type (like video), metadata might already have type set
            const context = metadata || (currentImage ? { ...currentImage } : {});

            if (typeof imageBlobOrUrl === 'string') {
                // Use unified fetchBlob which handles proxy fallback automatically
                blob = await fetchBlob(imageBlobOrUrl);
            } else {
                blob = imageBlobOrUrl;
            }

            // Use provided metadata or extract from currentImage if uploading from creation view
            const finalMetadata = metadata || (currentImage ? { ...currentImage } : null);

            // Ensure dimensions are present in metadata if possible
            if (finalMetadata && imageDimensions && !finalMetadata.width && !finalMetadata.height) {
                finalMetadata.width = imageDimensions.width;
                finalMetadata.height = imageDimensions.height;
            }

            const uploadedUrl = await uploadToCloud(blob, finalFileName, finalMetadata);

            // Add to Cloud History (Keep local history in sync if needed, but CloudGallery fetches from cloud now)
            const cloudImage: CloudImage = {
                id: generateUUID(),
                url: uploadedUrl,
                prompt: finalFileName, // Use filename as fallback prompt
                timestamp: Date.now(),
                fileName: finalFileName
            };

            setCloudHistory(prev => [cloudImage, ...prev]);

            console.log("Upload Success:", uploadedUrl);

        } catch (e: any) {
            console.error("Cloud Upload Failed", e);
            const msg = (t as any)[e.message] || t.error_s3_upload_failed; // Fallback to S3 message or general error
            setError(msg);
            throw e; // Re-throw for caller to handle UI updates (e.g., CloudGallery)
        } finally {
            setIsUploading(false);
        }
    };

    const isWorking = isLoading;
    const isLiveGenerating = currentImage?.videoStatus === 'generating';

    // Toolbar Visibility Logic:
    // Hide if:
    // 1. Image generation is working (isLoading/isWorking)
    // 2. Video generation is working (isLiveGenerating)
    // So we ONLY hide if isWorking (main image gen).
    const shouldHideToolbar = isWorking;

    // Check if current image OR video is already uploaded based on mode
    const isCurrentUploaded = useMemo(() => {
        if (!currentImage) return false;
        if (isLiveMode && currentImage.videoUrl) {
            // Check for video filename match in cloud history
            return cloudHistory.some(ci => ci.fileName && ci.fileName.includes(`video-${currentImage.id}`));
        } else {
            // Check for image filename match in cloud history (exclude video prefix to be safe)
            return cloudHistory.some(ci => ci.fileName && ci.fileName.includes(currentImage.id) && !ci.fileName.includes('video-'));
        }
    }, [currentImage, cloudHistory, isLiveMode]);

    // Stable callbacks for Header
    const handleOpenSettings = useCallback(() => setShowSettings(true), []);
    const handleOpenFAQ = useCallback(() => setShowFAQ(true), []);

    return (
        <div className="relative flex h-auto min-h-screen w-full flex-col overflow-x-hidden bg-gradient-brilliant">
            <div className="flex h-full grow flex-col">
                {/* Header Component */}
                <MemoizedHeader
                    currentView={currentView}
                    setCurrentView={setCurrentView}
                    onOpenSettings={handleOpenSettings}
                    onOpenFAQ={handleOpenFAQ}
                    t={t}
                />

                {/* Main Content Area */}
                {currentView === 'creation' ? (
                    <main className="w-full max-w-7xl flex-1 flex flex-col-reverse md:items-stretch md:mx-auto md:flex-row gap-4 md:gap-6 px-4 md:px-8 pb-4 md:pb-8 pt-4 md:pt-6 animate-in fade-in duration-300">

                        {/* Left Column: Controls */}
                        <aside className="w-full md:max-w-sm flex-shrink-0 flex flex-col gap-4 md:gap-6">
                            <div className="flex-grow space-y-4 md:space-y-6">
                                <div className="relative z-10 bg-black/20 p-4 md:p-6 rounded-xl backdrop-blur-xl border border-white/10 flex flex-col gap-4 md:gap-6 shadow-2xl shadow-black/20">

                                    {/* Prompt Input Component */}
                                    <PromptInput
                                        prompt={prompt}
                                        setPrompt={setPrompt}
                                        isOptimizing={isOptimizing}
                                        onOptimize={handleOptimizePrompt}
                                        isTranslating={isTranslating}
                                        autoTranslate={autoTranslate}
                                        setAutoTranslate={setAutoTranslate}
                                        t={t}
                                        addToPromptHistory={addToPromptHistory}
                                    />

                                    {/* Control Panel Component */}
                                    <ControlPanel
                                        provider={provider}
                                        setProvider={setProvider}
                                        model={model}
                                        setModel={setModel}
                                        aspectRatio={aspectRatio}
                                        setAspectRatio={setAspectRatio}
                                        steps={steps}
                                        setSteps={setSteps}
                                        guidanceScale={guidanceScale}
                                        setGuidanceScale={setGuidanceScale}
                                        seed={seed}
                                        setSeed={setSeed}
                                        imageSize={imageSize}
                                        setImageSize={setImageSize}
                                        batchCount={batchCount}
                                        setBatchCount={setBatchCount}
                                        t={t}
                                        aspectRatioOptions={aspectRatioOptions}
                                    />
                                </div>

                                {/* Generate Button & Reset Button */}
                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={handleGenerate}
                                        disabled={isWorking || !prompt.trim() || isTranslating}
                                        className="group relative flex-1 flex min-w-[84px] cursor-pointer items-center justify-center overflow-hidden rounded-xl h-12 px-4 text-white text-lg font-bold leading-normal tracking-[0.015em] transition-all shadow-lg shadow-purple-900/40 generate-button-gradient hover:shadow-purple-700/50 disabled:opacity-70 disabled:cursor-not-allowed disabled:grayscale"
                                    >
                                        {isLoading || isTranslating ? (
                                            <div className="flex items-center gap-2">
                                                <Loader2 className="animate-spin w-5 h-5" />
                                                <span>{isTranslating ? t.translating : t.dreaming}</span>
                                            </div>
                                        ) : (
                                            <span className="flex items-center gap-2">
                                                <Sparkles className="w-5 h-5 group-hover:animate-pulse" />
                                                <span className="truncate">{t.generate}</span>
                                            </span>
                                        )}
                                    </button>

                                    {currentImage && (
                                        <Tooltip content={t.reset}>
                                            <button
                                                onClick={handleReset}
                                                className="flex-shrink-0 flex items-center justify-center w-12 h-12 rounded-xl bg-white/5 border border-white/10 text-white/70 hover:text-white hover:bg-white/10 hover:border-white/20 transition-all shadow-lg active:scale-95"
                                            >
                                                <RotateCcw className="w-5 h-5" />
                                            </button>
                                        </Tooltip>
                                    )}
                                </div>

                            </div>
                        </aside>

                        {/* Right Column: Preview & Gallery */}
                        <div className="flex-1 flex flex-col flex-grow overflow-x-hidden">

                            {/* Main Preview Area */}
                            <div className="relative group w-full">
                                <PreviewStage
                                    currentImage={currentImage}
                                    isWorking={isWorking}
                                    isTranslating={isTranslating}
                                    elapsedTime={elapsedTime}
                                    error={error}
                                    onCloseError={() => setError(null)}
                                    isComparing={isComparing}
                                    tempUpscaledImage={tempUpscaledImage}
                                    showInfo={showInfo}
                                    setShowInfo={setShowInfo}
                                    imageDimensions={imageDimensions}
                                    setImageDimensions={setImageDimensions}
                                    t={t}
                                    isLiveMode={isLiveMode}
                                    onToggleLiveMode={() => setIsLiveMode(!isLiveMode)}
                                    batchCount={batchCount}
                                    batchImages={batchImages}
                                    batchProgress={batchProgress}
                                    selectedBatchIndex={selectedBatchIndex}
                                    onBatchImageSelect={(index) => {
                                        setSelectedBatchIndex(index);
                                        const selectedImage = batchImages[index];
                                        if (selectedImage) {
                                            setCurrentImage(selectedImage);
                                        }
                                    }}
                                >
                                    {/* No children passed as toolbar is moved out */}
                                </PreviewStage>

                                {!shouldHideToolbar && (
                                    <ImageToolbar
                                        currentImage={currentImage}
                                        isComparing={isComparing}
                                        showInfo={showInfo}
                                        setShowInfo={setShowInfo}
                                        isUpscaling={isUpscaling}
                                        isDownloading={isDownloading}
                                        handleUpscale={handleUpscale}
                                        handleToggleBlur={handleToggleBlur}
                                        handleDownload={() => currentImage && handleDownload(currentImage.url, `generated-${currentImage.id}`)}
                                        handleDelete={handleDelete}
                                        handleCancelUpscale={handleCancelUpscale}
                                        handleApplyUpscale={handleApplyUpscale}
                                        t={t}
                                        isLiveMode={isLiveMode}
                                        onLiveClick={handleLiveClick}
                                        isLiveGenerating={isLiveGenerating}
                                        provider={provider}
                                        // Cloud Upload Props
                                        handleUploadToS3={async () => {
                                            if (currentImage) {
                                                // Mode-specific upload logic
                                                if (isLiveMode && currentImage.videoUrl) {
                                                    // Upload Video
                                                    const ext = currentImage.videoUrl.includes('.mp4') ? '.mp4' : '.webm';
                                                    const fileName = `video-${currentImage.id}${ext}`;
                                                    await handleUploadToCloud(currentImage.videoUrl, fileName, { ...currentImage, type: 'video' });
                                                } else {
                                                    // Upload Image
                                                    let fileName = currentImage.id || `image-${Date.now()}`;
                                                    if (currentImage.isBlurred) {
                                                        fileName += '.NSFW';
                                                    }
                                                    const getExt = (url: string) => new URL(url).pathname.split('.').pop();
                                                    fileName += `.${getExt(currentImage.url)}`
                                                    await handleUploadToCloud(currentImage.url, fileName);
                                                }
                                            }
                                        }}
                                        isUploading={isUploading}
                                        isUploaded={isCurrentUploaded}
                                        imageDimensions={imageDimensions}
                                        copiedPrompt={copiedPrompt}
                                        handleCopyPrompt={handleCopyPrompt}
                                    />
                                )}
                            </div>

                            {/* Gallery Strip */}
                            <HistoryGallery
                                images={history}
                                onSelect={handleHistorySelect}
                                selectedId={currentImage?.id}
                            />

                        </div>
                    </main>
                ) : currentView === 'editor' ? (
                    <main className="w-full flex-1 flex flex-col items-center justify-center md:p-4">
                        <ImageEditor
                            t={t}
                            provider={provider}
                            setProvider={setProvider}
                            onOpenSettings={handleOpenSettings}
                            history={history}
                            handleUploadToS3={handleUploadToCloud}
                            isUploading={isUploading}
                        />
                    </main>
                ) : (
                    <main className="w-full max-w-7xl mx-auto flex-1 flex flex-col gap-4 px-4 md:px-8 pb-8 pt-6">
                        <CloudGallery
                            t={t}
                            handleUploadToS3={handleUploadToCloud}
                            onOpenSettings={handleOpenSettings}
                        />
                    </main>
                )}

                {/* Settings Modal */}
                <SettingsModal
                    isOpen={showSettings}
                    onClose={() => setShowSettings(false)}
                    lang={lang}
                    setLang={setLang}
                    t={t}
                    provider={provider}
                    setProvider={setProvider}
                    setModel={setModel}
                    currentModel={model}
                />

                {/* FAQ Modal */}
                <FAQModal
                    isOpen={showFAQ}
                    onClose={() => setShowFAQ(false)}
                    t={t}
                />

                {/* Access Password Modal */}
                {showPasswordModal && (
                    <div className="fixed inset-0 z-[200] flex items-center justify-center px-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
                        <div className="w-full max-w-sm bg-[#0D0B14] border border-white/10 rounded-2xl p-6 shadow-2xl flex flex-col items-center gap-4">
                            <div className="p-3 bg-red-500/10 rounded-full">
                                <Lock className="w-8 h-8 text-red-400" />
                            </div>
                            <div className="text-center">
                                <h3 className="text-xl font-bold text-white mb-2">{t.access_password_title}</h3>
                                <p className="text-white/60 text-sm">{t.access_password_desc}</p>
                            </div>

                            <input
                                type="password"
                                value={accessPassword}
                                onChange={(e) => setAccessPassword(e.target.value)}
                                placeholder={t.access_password_placeholder}
                                className={`w-full px-4 py-3 bg-white/5 border rounded-xl text-white text-center focus:outline-none transition-colors ${passwordError ? 'border-red-500/50 focus:border-red-500' : 'border-white/10 focus:border-purple-500'}`}
                                onKeyDown={(e) => e.key === 'Enter' && handlePasswordSubmit()}
                            />

                            {passwordError && (
                                <p className="text-red-400 text-xs font-medium">{t.access_password_invalid}</p>
                            )}

                            <div className="flex flex-col w-full gap-2 mt-2">
                                <button
                                    onClick={handlePasswordSubmit}
                                    disabled={!accessPassword}
                                    className="w-full py-3 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {t.confirm}
                                </button>
                                <button
                                    onClick={handleSwitchToLocal}
                                    className="w-full py-3 bg-transparent hover:bg-white/5 text-white/60 hover:text-white font-medium rounded-xl transition-all text-sm"
                                >
                                    {t.switch_to_local}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
