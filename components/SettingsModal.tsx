
import React, { useState, useEffect, useRef } from 'react';
import { X, Save, KeyRound, Languages, ShieldCheck, ShieldAlert, Database, Eye, EyeOff, MessageSquare, RotateCcw, Settings2, MessageSquareText, Brain, Film, Clock, Layers, Sparkles, HardDrive, Server, Loader2, Check, AlertCircle, PlugZap, Cpu, ChevronDown, ChevronUp, Plus, Trash2, Globe, ChevronRight, Github, Router } from 'lucide-react';
import { Language } from '../translations';
import { getTokenStats } from '../services/hfService';
import { getGiteeTokenStats } from '../services/giteeService';
import { getMsTokenStats } from '../services/msService';
import { transformModelList } from '../services/customService';
import { ProviderOption, S3Config, WebDAVConfig, StorageType, ModelOption, CustomProvider, RemoteModelList, ServiceMode } from '../types';
import { 
    getSystemPromptContent,
    saveSystemPromptContent,
    DEFAULT_SYSTEM_PROMPT_CONTENT,
    getTranslationPromptContent,
    saveTranslationPromptContent,
    DEFAULT_TRANSLATION_SYSTEM_PROMPT,
    getVideoSettings,
    saveVideoSettings,
    DEFAULT_VIDEO_SETTINGS,
    VideoSettings,
    getEditModelConfig,
    saveEditModelConfig,
    getLiveModelConfig,
    saveLiveModelConfig,
    getTextModelConfig,
    saveTextModelConfig,
    getUpscalerModelConfig,
    saveUpscalerModelConfig,
    getCustomProviders,
    addCustomProvider,
    removeCustomProvider,
    generateUUID,
    getServiceMode,
    saveServiceMode,
    saveCustomProviders
} from '../services/utils';
import { 
    getS3Config, 
    saveS3Config, 
    DEFAULT_S3_CONFIG,
    getWebDAVConfig,
    saveWebDAVConfig,
    DEFAULT_WEBDAV_CONFIG,
    getStorageType,
    saveStorageType,
    testWebDAVConnection,
    testS3Connection
} from '../services/storageService';
import { Select, Option, OptionGroup } from './Select';
import { 
    HF_MODEL_OPTIONS, 
    GITEE_MODEL_OPTIONS, 
    MS_MODEL_OPTIONS, 
    EDIT_MODELS, 
    LIVE_MODELS, 
    TEXT_MODELS, 
    UPSCALER_MODELS,
    UnifiedModelOption
} from '../constants';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    lang: Language;
    setLang: (lang: Language) => void;
    t: any;
    provider: ProviderOption;
    // New props for updating creation model
    setProvider?: (p: ProviderOption) => void;
    setModel?: (m: ModelOption) => void;
    currentModel?: ModelOption;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, lang, setLang, t, provider, setProvider, setModel, currentModel }) => {
    // Tab State
    const [activeTab, setActiveTab] = useState<'general' | 'provider' | 'models' | 'prompt' | 'live' | 's3' | 'webdav'>('general');
    const tabsRef = useRef<HTMLDivElement>(null);
    const [canScrollTabs, setCanScrollTabs] = useState(false);

    // Provider Collapse State
    const [openProvider, setOpenProvider] = useState<string>('huggingface');

    // Service Mode
    const [serviceMode, setServiceModeState] = useState<ServiceMode>('local');

    // HF Token State
    const [token, setToken] = useState('');
    const [stats, setStats] = useState({ total: 0, active: 0, exhausted: 0 });
    const [showToken, setShowToken] = useState(false);

    // Gitee Token State
    const [giteeToken, setGiteeToken] = useState('');
    const [giteeStats, setGiteeStats] = useState({ total: 0, active: 0, exhausted: 0 });
    const [showGiteeToken, setShowGiteeToken] = useState(false);

    // Model Scope Token State
    const [msToken, setMsToken] = useState('');
    const [msStats, setMsStats] = useState({ total: 0, active: 0, exhausted: 0 });
    const [showMsToken, setShowMsToken] = useState(false);

    // OpenRouter Token State
    const [openrouterToken, setOpenrouterToken] = useState('');
    const [showOpenrouterToken, setShowOpenrouterToken] = useState(false);

    // Custom Providers State
    const [customProviders, setCustomProviders] = useState<CustomProvider[]>([]);
    const [newProviderName, setNewProviderName] = useState('');
    const [newProviderUrl, setNewProviderUrl] = useState('');
    const [newProviderToken, setNewProviderToken] = useState('');
    const [showNewProviderToken, setShowNewProviderToken] = useState(false);
    const [showCustomProviderTokens, setShowCustomProviderTokens] = useState<Record<string, boolean>>({});
    const [fetchStatus, setFetchStatus] = useState<'idle' | 'loading' | 'success' | 'failed'>('idle');
    const [fetchedModels, setFetchedModels] = useState<RemoteModelList | null>(null);

    // Refresh states for existing providers
    const [refreshingProviders, setRefreshingProviders] = useState<Record<string, boolean>>({});
    const [refreshSuccessProviders, setRefreshSuccessProviders] = useState<Record<string, boolean>>({});

    // System Prompt State
    const [systemPrompt, setSystemPrompt] = useState('');
    const [translationPrompt, setTranslationPrompt] = useState('');

    // Unified Model States
    const [creationModelValue, setCreationModelValue] = useState<string>('');
    const [editModelValue, setEditModelValue] = useState<string>('');
    const [liveModelValue, setLiveModelValue] = useState<string>('');
    const [textModelValue, setTextModelValue] = useState<string>('');
    const [upscalerModelValue, setUpscalerModelValue] = useState<string>('');

    // Video Settings State
    const [videoSettings, setVideoSettings] = useState<VideoSettings>(DEFAULT_VIDEO_SETTINGS['huggingface']);

    // Storage Config State
    const [storageType, setStorageType] = useState<StorageType>('off');
    const [s3Config, setS3Config] = useState<S3Config>(DEFAULT_S3_CONFIG);
    const [showS3Secret, setShowS3Secret] = useState(false);
    const [webdavConfig, setWebdavConfig] = useState<WebDAVConfig>(DEFAULT_WEBDAV_CONFIG);
    const [showWebdavPass, setShowWebdavPass] = useState(false);
    
    // WebDAV Test State
    const [isTestingWebDAV, setIsTestingWebDAV] = useState(false);
    const [testWebDAVResult, setTestWebDAVResult] = useState<{ success: boolean; message: string } | null>(null);

    // S3 Test State
    const [isTestingS3, setIsTestingS3] = useState(false);
    const [testS3Result, setTestS3Result] = useState<{ success: boolean; message: string } | null>(null);

    // Clear Data Confirmation State
    const [showClearConfirm, setShowClearConfirm] = useState(false);

    useEffect(() => {
        if (isOpen) {
            // Load Service Mode
            setServiceModeState(getServiceMode());

            // Load Tokens
            const storedToken = localStorage.getItem('huggingFaceToken') || '';
            setToken(storedToken);
            setStats(getTokenStats(storedToken));

            const storedGiteeToken = localStorage.getItem('giteeToken') || '';
            setGiteeToken(storedGiteeToken);
            setGiteeStats(getGiteeTokenStats(storedGiteeToken));

            const storedMsToken = localStorage.getItem('msToken') || '';
            setMsToken(storedMsToken);
            setMsStats(getMsTokenStats(storedMsToken));

            const storedOpenrouterToken = localStorage.getItem('openrouterToken') || '';
            setOpenrouterToken(storedOpenrouterToken);

            // Load Custom Providers
            setCustomProviders(getCustomProviders());

            // Load System Prompts
            setSystemPrompt(getSystemPromptContent());
            setTranslationPrompt(getTranslationPromptContent());

            // Load Video Settings for current provider (or default)
            setVideoSettings(getVideoSettings(provider));

            // Load Storage Config
            setStorageType(getStorageType());
            setS3Config(getS3Config());
            setWebdavConfig(getWebDAVConfig());
            
            // Reset test state
            setTestWebDAVResult(null);
            setTestS3Result(null);

            // Load Unified Models
            const editConfig = getEditModelConfig();
            setEditModelValue(`${editConfig.provider}:${editConfig.model}`);

            const liveConfig = getLiveModelConfig();
            setLiveModelValue(`${liveConfig.provider}:${liveConfig.model}`);

            const textConfig = getTextModelConfig();
            setTextModelValue(`${textConfig.provider}:${textConfig.model}`);

            const upscalerConfig = getUpscalerModelConfig();
            setUpscalerModelValue(`${upscalerConfig.provider}:${upscalerConfig.model}`);

            // Initialize Creation Model Value from props
            if (provider && currentModel) {
                setCreationModelValue(`${provider}:${currentModel}`);
            }
            
            // Check tabs scroll on open
            setTimeout(checkTabsScroll, 100);
        } else {
            // Reset Tab to Provider (Default)
            setActiveTab('general');
            setShowClearConfirm(false);
            setShowNewProviderToken(false);
            setShowCustomProviderTokens({});
        }
    }, [isOpen, provider, currentModel]);

    // Validation Effect: Check if current models exist in available list, if not, reset to first available
    useEffect(() => {
        const getValidValues = (type: 'generate' | 'edit' | 'video' | 'text' | 'upscaler', baseList: UnifiedModelOption[]) => {
            const valid = new Set<string>();
            const isLocal = serviceMode === 'local' || serviceMode === 'hydration';
            const isServer = serviceMode === 'server' || serviceMode === 'hydration';

            // Base Providers
            if (isLocal) {
                // HF (Always available)
                baseList.filter(m => m.provider === 'huggingface').forEach(m => valid.add(m.value));
                
                // Gitee (Needs token)
                if (giteeToken || localStorage.getItem('giteeToken')) {
                     baseList.filter(m => m.provider === 'gitee').forEach(m => valid.add(m.value));
                }
                
                // MS (Needs token)
                if (msToken || localStorage.getItem('msToken')) {
                     baseList.filter(m => m.provider === 'modelscope').forEach(m => valid.add(m.value));
                }
            }

            // Custom Providers
            if (isServer) {
                customProviders.forEach(cp => {
                    const models = cp.models[type];
                    if (models) {
                        models.forEach(m => valid.add(`${cp.id}:${m.id}`));
                    }
                });
            }
            return Array.from(valid);
        };

        // 1. Validate Creation Model
        const baseCreationList: UnifiedModelOption[] = [
            ...HF_MODEL_OPTIONS.map(m => ({ label: m.label, value: `huggingface:${m.value}`, provider: 'huggingface' as ProviderOption })),
            ...GITEE_MODEL_OPTIONS.map(m => ({ label: m.label, value: `gitee:${m.value}`, provider: 'gitee' as ProviderOption })),
            ...MS_MODEL_OPTIONS.map(m => ({ label: m.label, value: `modelscope:${m.value}`, provider: 'modelscope' as ProviderOption }))
        ];
        const validCreation = getValidValues('generate', baseCreationList);
        // Only reset if we have options but current is invalid
        if (validCreation.length > 0) {
            if (creationModelValue && !validCreation.includes(creationModelValue)) {
                setCreationModelValue(validCreation[0]);
            } else if (!creationModelValue) {
                setCreationModelValue(validCreation[0]);
            }
        }

        // 2. Validate Edit Model
        const validEdit = getValidValues('edit', EDIT_MODELS);
        if (validEdit.length > 0) {
            if (editModelValue && !validEdit.includes(editModelValue)) {
                setEditModelValue(validEdit[0]);
            } else if (!editModelValue) {
                setEditModelValue(validEdit[0]);
            }
        }

        // 3. Validate Live Model
        const validLive = getValidValues('video', LIVE_MODELS);
        if (validLive.length > 0) {
            if (liveModelValue && !validLive.includes(liveModelValue)) {
                setLiveModelValue(validLive[0]);
            } else if (!liveModelValue) {
                setLiveModelValue(validLive[0]);
            }
        }

        // 4. Validate Text Model
        const validText = getValidValues('text', TEXT_MODELS);
        if (validText.length > 0) {
            if (textModelValue && !validText.includes(textModelValue)) {
                setTextModelValue(validText[0]);
            } else if (!textModelValue) {
                setTextModelValue(validText[0]);
            }
        }

        // 5. Validate Upscaler Model
        const validUpscaler = getValidValues('upscaler', UPSCALER_MODELS);
        if (validUpscaler.length > 0) {
            if (upscalerModelValue && !validUpscaler.includes(upscalerModelValue)) {
                setUpscalerModelValue(validUpscaler[0]);
            } else if (!upscalerModelValue) {
                setUpscalerModelValue(validUpscaler[0]);
            }
        }

    }, [customProviders, serviceMode, giteeToken, msToken]);

    // Handle Service Mode Change
    const handleServiceModeChange = (newMode: ServiceMode) => {
        setServiceModeState(newMode);
        
        // Reset selections if switching to incompatible modes logic
        if (newMode === 'local') {
            // If user previously selected a custom provider model, reset to HF default
            const customList = getCustomProviders();
            const currentProviderIsCustom = customList.some(cp => cp.id === provider);
            
            if (currentProviderIsCustom && setProvider && setModel) {
                setProvider('huggingface');
                setModel(HF_MODEL_OPTIONS[0].value as ModelOption);
                setCreationModelValue(`huggingface:${HF_MODEL_OPTIONS[0].value}`);
            }
        }
    };

    // Check Tabs Scroll Logic
    const checkTabsScroll = () => {
        if (tabsRef.current) {
            const { scrollLeft, scrollWidth, clientWidth } = tabsRef.current;
            // Use a small tolerance (5px)
            setCanScrollTabs(scrollLeft + clientWidth < scrollWidth - 5);
        }
    };

    useEffect(() => {
        window.addEventListener('resize', checkTabsScroll);
        return () => window.removeEventListener('resize', checkTabsScroll);
    }, []);

    const handleScrollTabsRight = () => {
        if (tabsRef.current) {
            tabsRef.current.scrollBy({ left: 150, behavior: 'smooth' });
            setTimeout(checkTabsScroll, 300);
        }
    };

    // Helper to clean labels
    const cleanLabel = (label: string) => {
        return label.replace(/\s*\(HF\)$/, '').replace(/\s*\(Gitee\)$/, '').replace(/\s*\(MS\)$/, '');
    };

    // Group Options including Custom Providers based on Service Mode
    const getAvailableModelGroups = (baseList: UnifiedModelOption[], type: 'generate' | 'edit' | 'video' | 'text' | 'upscaler'): OptionGroup[] => {
        const groups: OptionGroup[] = [];
        const isServer = serviceMode === 'server';
        const isLocal = serviceMode === 'local';
        const isHydration = serviceMode === 'hydration';

        // 1. Default Providers (HF, Gitee, MS)
        // Show if Local or Hydration
        if (isLocal || isHydration) {
            const hfOptions = baseList.filter(m => m.provider === 'huggingface').map(m => ({ value: m.value, label: cleanLabel(m.label) }));
            if (hfOptions.length > 0) {
                groups.push({ label: t.provider_huggingface, options: hfOptions });
            }
            
            if (giteeToken || localStorage.getItem('giteeToken')) {
                const giteeOptions = baseList.filter(m => m.provider === 'gitee').map(m => ({ value: m.value, label: cleanLabel(m.label) }));
                if (giteeOptions.length > 0) {
                    groups.push({ label: t.provider_gitee, options: giteeOptions });
                }
            }
            
            if (msToken || localStorage.getItem('msToken')) {
                const msOptions = baseList.filter(m => m.provider === 'modelscope').map(m => ({ value: m.value, label: cleanLabel(m.label) }));
                if (msOptions.length > 0) {
                    groups.push({ label: t.provider_modelscope, options: msOptions });
                }
            }
        }

        // 2. Custom Providers
        // Show if Server or Hydration
        if (isServer || isHydration) {
            customProviders.forEach(cp => {
                const models = cp.models[type];
                if (models && models.length > 0) {
                    groups.push({
                        label: cp.name,
                        options: models.map(m => ({
                            label: m.name,
                            value: `${cp.id}:${m.id}`
                        }))
                    });
                }
            });
        }

        return groups;
    };

    // HF Handlers
    const handleTokenChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newVal = e.target.value;
        setToken(newVal);
        setStats(getTokenStats(newVal));
    };

    // Gitee Handlers
    const handleGiteeTokenChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newVal = e.target.value;
        setGiteeToken(newVal);
        setGiteeStats(getGiteeTokenStats(newVal));
    };

    // Model Scope Handlers
    const handleMsTokenChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newVal = e.target.value;
        setMsToken(newVal);
        setMsStats(getMsTokenStats(newVal));
    };

    // OpenRouter Handlers
    const handleOpenrouterTokenChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setOpenrouterToken(e.target.value);
    };

    // Custom Provider Handlers
    const handleFetchModels = async () => {
        if (!newProviderUrl) return;
        setFetchStatus('loading');
        try {
            const url = newProviderUrl.replace(/\/$/, '') + '/v1/models';
            const headers: Record<string, string> = {};
            if (newProviderToken) {
                headers['Authorization'] = `Bearer ${newProviderToken}`;
            }
            
            const response = await fetch(url, { headers });
            if (!response.ok) throw new Error('Fetch failed');
            
            const rawData = await response.json();
            const transformedData = transformModelList(rawData);
            
            setFetchedModels(transformedData);
            setFetchStatus('success');
        } catch (e) {
            console.error("Failed to fetch models", e);
            setFetchStatus('failed');
            setFetchedModels(null);
        }
    };

    const handleClearAddForm = () => {
        setNewProviderName('');
        setNewProviderUrl('');
        setNewProviderToken('');
        setFetchStatus('idle');
        setFetchedModels(null);
        setOpenProvider('');
    };

    const handleAddCustomProvider = () => {
        if (!newProviderUrl || !fetchedModels) return;
        
        let finalName = newProviderName.trim();
        if (!finalName) {
            try {
                const urlStr = newProviderUrl.startsWith('http') ? newProviderUrl : `https://${newProviderUrl}`;
                const url = new URL(urlStr);
                const hostname = url.hostname;
                const parts = hostname.split('.');
                if (parts.length >= 2) {
                    finalName = parts[parts.length - 2];
                } else {
                    finalName = hostname;
                }
                // Capitalize first letter
                finalName = finalName.charAt(0).toUpperCase() + finalName.slice(1);
            } catch {
                finalName = 'Custom';
            }
        }
        
        const newProvider: CustomProvider = {
            id: generateUUID(),
            name: finalName,
            apiUrl: newProviderUrl,
            token: newProviderToken,
            models: fetchedModels,
            enabled: true
        };
        
        addCustomProvider(newProvider);
        setCustomProviders(getCustomProviders());
        
        // Dispatch storage event to update ControlPanel immediately
        window.dispatchEvent(new Event("storage"));
        
        handleClearAddForm();
    };

    const handleDeleteCustomProvider = (id: string) => {
        removeCustomProvider(id);
        setCustomProviders(getCustomProviders());
        window.dispatchEvent(new Event("storage"));
    };

    const handleUpdateCustomProvider = (id: string, updates: Partial<CustomProvider>) => {
        setCustomProviders(prev => prev.map(cp => cp.id === id ? { ...cp, ...updates } : cp));
    };

    const handleRefreshCustomModels = async (id: string) => {
        const provider = customProviders.find(p => p.id === id);
        if (!provider) return;
        
        setRefreshingProviders(prev => ({ ...prev, [id]: true }));
        setRefreshSuccessProviders(prev => ({ ...prev, [id]: false })); // Reset success

        try {
            const url = provider.apiUrl.replace(/\/$/, '') + '/v1/models';
            const headers: Record<string, string> = {};
            if (provider.token) {
                headers['Authorization'] = `Bearer ${provider.token}`;
            }
            const response = await fetch(url, { headers });
            if (!response.ok) throw new Error('Fetch failed');
            const rawData = await response.json();
            const transformedData = transformModelList(rawData);
            
            handleUpdateCustomProvider(id, { models: transformedData });
            
            // Success Feedback
            setRefreshSuccessProviders(prev => ({ ...prev, [id]: true }));
            setTimeout(() => {
                setRefreshSuccessProviders(prev => ({ ...prev, [id]: false }));
            }, 2500);
        } catch (e) {
            console.error(e);
        } finally {
            setRefreshingProviders(prev => ({ ...prev, [id]: false }));
        }
    };

    // Video Settings Handlers
    const handleRestoreVideoDefaults = () => {
        setVideoSettings(DEFAULT_VIDEO_SETTINGS[provider] || DEFAULT_VIDEO_SETTINGS['huggingface']);
    };

    const handleSave = () => {
        localStorage.setItem('huggingFaceToken', token.trim());
        localStorage.setItem('giteeToken', giteeToken.trim());
        localStorage.setItem('msToken', msToken.trim());
        localStorage.setItem('openrouterToken', openrouterToken.trim());
        
        saveSystemPromptContent(systemPrompt);
        saveTranslationPromptContent(translationPrompt);
        saveVideoSettings(provider, videoSettings);
        
        saveStorageType(storageType);
        saveS3Config(s3Config);
        saveWebDAVConfig(webdavConfig);

        // Save Unified Models
        saveEditModelConfig(editModelValue);
        saveLiveModelConfig(liveModelValue);
        saveTextModelConfig(textModelValue);
        saveUpscalerModelConfig(upscalerModelValue);
        
        // Save Service Mode
        saveServiceMode(serviceMode);
        
        // Save Custom Providers (persists edits)
        saveCustomProviders(customProviders);

        // Update Creation Model if changed
        if (creationModelValue && setProvider && setModel) {
            const [newProvider, newModel] = creationModelValue.split(':');
            setProvider(newProvider as ProviderOption);
            setModel(newModel as ModelOption);
        }
        
        // Dispatch storage event to notify components
        window.dispatchEvent(new Event("storage"));
        
        onClose();
    };

    const handleRestoreDefault = () => {
        setSystemPrompt(DEFAULT_SYSTEM_PROMPT_CONTENT);
    };

    const handleRestoreTranslationDefault = () => {
        setTranslationPrompt(DEFAULT_TRANSLATION_SYSTEM_PROMPT);
    };
    
    const handleTestWebDAV = async () => {
        // Mixed Content Check
        if (window.location.protocol === 'https:' && webdavConfig.url.startsWith('http:')) {
            setTestWebDAVResult({ success: false, message: t.mixed_content_error });
            return;
        }

        setIsTestingWebDAV(true);
        setTestWebDAVResult(null);
        try {
            const result = await testWebDAVConnection(webdavConfig);
            setTestWebDAVResult({
                success: result.success,
                message: result.success ? t.test_success : `${t.test_fail}: ${result.message}`
            });
        } catch (e) {
            setTestWebDAVResult({ success: false, message: t.test_fail });
        } finally {
            setIsTestingWebDAV(false);
        }
    };

    const handleTestS3 = async () => {
        setIsTestingS3(true);
        setTestS3Result(null);
        try {
            const result = await testS3Connection(s3Config);
            setTestS3Result({
                success: result.success,
                message: result.success ? t.test_success : `${t.test_fail}: ${result.message}`
            });
        } catch (e) {
            setTestS3Result({ success: false, message: t.test_fail });
        } finally {
            setIsTestingS3(false);
        }
    };

    const handleClearData = () => {
        localStorage.clear();
        sessionStorage.clear();
        window.location.reload();
    };

    const getEndpointPlaceholder = () => {
         const region = s3Config.region || 'us-east-1';
         return `https://s3.${region}.amazonaws.com`;
    };

    // Render Collapsible Provider Section
    const renderProviderPanel = (
        id: string,
        title: string,
        dotColorClass: string,
        children: React.ReactNode
    ) => (
        <div className="border-b border-white/5 last:border-0">
            <div className="flex items-center w-full group">
                <button
                    onClick={() => setOpenProvider(openProvider === id ? '' : id)}
                    className="flex-1 flex items-center justify-between py-4 text-left"
                >
                    <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full ${dotColorClass} ring-4 ring-white/[0.02] group-hover:ring-white/[0.05] transition-all`} />
                        <span className={`text-sm font-medium transition-colors ${openProvider === id ? 'text-white' : 'text-white/60 group-hover:text-white'}`}>
                            {title}
                        </span>
                    </div>
                    <div className={`text-white/40 transition-transform duration-300 mr-2 ${openProvider === id ? 'rotate-180 text-white/80' : 'rotate-0 group-hover:text-white/60'}`}>
                        <ChevronDown className="w-4 h-4" />
                    </div>
                </button>
            </div>
            
            <div className={`grid transition-[grid-template-rows] duration-300 ease-out ${openProvider === id ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                <div className="overflow-hidden">
                    <div className="p-2 space-y-4 mb-2">
                        {children}
                    </div>
                </div>
            </div>
        </div>
    );

    // Helper to Render Token Section (Reused inside panels)
    const renderTokenInput = (
        value: string,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => void,
        isShow: boolean,
        toggleShow: () => void,
        statsObj: { total: number, active: number, exhausted: number },
        placeholder: string,
        helpStart: string,
        linkText: string,
        helpEnd: string,
        linkUrl: string
    ) => (
        <div className="space-y-4">
            <div className="relative group">
                <input
                    type={isShow ? "text" : "password"}
                    value={value}
                    onChange={onChange}
                    onPaste={(e) => {
                        e.preventDefault();
                        const text = e.clipboardData.getData('text');
                        const processed = text.replace(/[\r\n]+/g, ',');
                        
                        const input = e.currentTarget;
                        const start = input.selectionStart || 0;
                        const end = input.selectionEnd || 0;
                        const currentValue = input.value;
                        
                        const newValue = currentValue.substring(0, start) + processed + currentValue.substring(end);
                        
                        const event = {
                            target: { value: newValue }
                        } as React.ChangeEvent<HTMLInputElement>;
                        
                        onChange(event);
                    }}
                    placeholder={placeholder}
                    className="w-full pl-4 pr-10 py-2.5 bg-[#1A1625] border border-white/10 rounded-xl text-white placeholder:text-white/20 focus:outline-none focus:border-purple-500/50 transition-all font-mono text-sm"
                />
                <button
                    type="button"
                    onClick={toggleShow}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/5"
                >
                    {isShow ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
            </div>
            
            {statsObj.total > 1 && (
                <div className="grid grid-cols-3 gap-3">
                    <div className="bg-white/5 border border-white/5 rounded-xl p-2.5 text-center">
                        <div className="text-[10px] text-white/40 uppercase tracking-wider mb-0.5">{t.tokenTotal}</div>
                        <div className="text-sm font-bold text-white font-mono">{statsObj.total}</div>
                    </div>
                    <div className="bg-green-500/10 border border-green-500/10 rounded-xl p-2.5 text-center">
                        <div className="text-[10px] text-green-400/60 uppercase tracking-wider mb-0.5">{t.tokenActive}</div>
                        <div className="text-sm font-bold text-green-400 font-mono flex items-center justify-center gap-1">
                           <ShieldCheck className="w-3 h-3" /> {statsObj.active}
                        </div>
                    </div>
                    <div className="bg-red-500/10 border border-red-500/10 rounded-xl p-2.5 text-center">
                        <div className="text-[10px] text-red-400/60 uppercase tracking-wider mb-0.5">{t.tokenExhausted}</div>
                        <div className="text-sm font-bold text-red-400 font-mono flex items-center justify-center gap-1">
                           <ShieldAlert className="w-3 h-3" /> {statsObj.exhausted}
                        </div>
                    </div>
                </div>
            )}

            <p className="text-xs text-white/40 leading-relaxed">
                {helpStart} <a href={linkUrl} target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:text-purple-300 hover:underline transition-colors">{linkText}</a> {helpEnd}
            </p>
        </div>
    );

    // Tabs Config
    const tabs = [
        { id: 'general', icon: Settings2, label: t.tab_general },
        { id: 'provider', icon: Server, label: t.tab_provider },
        { id: 'models', icon: Cpu, label: t.model },
        { id: 'prompt', icon: MessageSquareText, label: t.tab_prompt },
        { id: 'live', icon: Film, label: t.tab_live }
    ];

    if (storageType === 's3') {
        tabs.push({ id: 's3', icon: HardDrive, label: t.tab_storage });
    } else if (storageType === 'webdav') {
        tabs.push({ id: 'webdav', icon: Database, label: t.tab_webdav });
    }

    const activeTabIndex = tabs.findIndex(tab => tab.id === activeTab);

    // Determine visibility based on Service Mode
    const showBaseProviders = serviceMode === 'local' || serviceMode === 'hydration';
    const showCustomProviders = serviceMode === 'server' || serviceMode === 'hydration';
    // Local mode hides "Add" button and custom provider list
    const showAddCustomProvider = serviceMode !== 'local'; 

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
             <div className="w-full max-w-md bg-[#0D0B14]/95 backdrop-blur-xl border border-white/[0.08] rounded-2xl shadow-[0_0_50px_-12px_rgba(124,58,237,0.15)] ring-1 ring-white/[0.05] overflow-hidden animate-in zoom-in-95 duration-300 flex flex-col max-h-[90vh]">
                <div className="flex items-center justify-between px-5 py-2 border-b border-white/[0.06] bg-white/[0.02] flex-shrink-0">
                    <h2 className="text-lg font-bold text-white tracking-wide">{t.settings}</h2>
                    <button onClick={onClose} className="group p-2 rounded-lg text-white/40 hover:text-white hover:bg-white/[0.08] transition-all duration-200">
                        <X className="w-5 h-5 transition-transform duration-500 ease-out group-hover:rotate-180" />
                    </button>
                </div>

                {/* Tab Navigation with Scroll Button */}
                <div className="relative border-b border-white/[0.06]">
                    <div 
                        ref={tabsRef}
                        onScroll={checkTabsScroll}
                        className="flex items-center px-5 space-x-6 overflow-x-auto scrollbar-hide pr-12"
                    >
                        {tabs.map((tab) => (
                            <button 
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as any)}
                                className={`group relative py-4 text-sm font-medium transition-colors duration-300 flex items-center gap-2 flex-shrink-0 ${activeTab === tab.id ? 'text-white' : 'text-white/40 hover:text-white/80'}`}
                            >
                                <tab.icon className={`w-4 h-4 transition-colors duration-300 ${activeTab === tab.id ? 'text-purple-400' : 'text-current group-hover:text-purple-400/70'}`} />
                                {tab.label}
                                <span className={`absolute bottom-0 left-0 w-full h-0.5 bg-gradient-to-r from-purple-500 to-indigo-500 rounded-full shadow-[0_-2px_10px_rgba(168,85,247,0.1)] transition-all duration-300 ease-out origin-center ${activeTab === tab.id ? 'opacity-100 scale-x-100' : 'opacity-0 scale-x-0'}`} />
                            </button>
                        ))}
                    </div>
                    {/* Right Scroll Button */}
                    <div className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-[#0D0B14] via-[#0D0B14]/80 to-transparent flex items-center justify-center pointer-events-none">
                        <button
                            onClick={handleScrollTabsRight}
                            disabled={!canScrollTabs}
                            className={`pointer-events-auto p-1.5 rounded-full transition-all duration-300 ${canScrollTabs ? 'text-white bg-white/10 hover:bg-white/20 shadow-lg' : 'text-white/20'}`}
                        >
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
                
                {/* Tab Content Container */}
                <div className="flex-1 overflow-x-hidden overflow-y-auto relative">
                    <div 
                        className="flex h-full transition-transform duration-500 ease-in-out"
                        style={{ transform: `translateX(-${activeTabIndex * 100}%)` }}
                    >
                        {tabs.map((tab) => (
                            <div key={tab.id} className="w-full h-full flex-shrink-0 custom-scrollbar p-5">
                                {/* Tab 1: General */}
                                {tab.id === 'general' && (
                                    <div className="space-y-6">
                                        {/* ... General Tab content (Language, Service Mode, etc.) ... */}
                                        {/* Language Selector */}
                                        <div>
                                            <label className="flex items-center gap-2 text-xs font-medium text-white/80 mb-2">
                                                <Languages className="w-3.5 h-3.5 text-purple-400" />
                                                {t.language}
                                            </label>
                                            <div className="grid grid-cols-2 gap-2">
                                                <button
                                                    onClick={() => setLang('en')}
                                                    className={`px-3 py-2.5 rounded-xl text-xs font-medium transition-all duration-200 border ${
                                                        lang === 'en' 
                                                        ? 'bg-purple-600/90 border-purple-500/50 text-white shadow-lg shadow-purple-900/20' 
                                                        : 'bg-white/[0.03] border-white/10 text-white/60 hover:bg-white/[0.06] hover:text-white hover:border-white/20'
                                                    }`}
                                                >
                                                    English
                                                </button>
                                                <button
                                                    onClick={() => setLang('zh')}
                                                    className={`px-3 py-2.5 rounded-xl text-xs font-medium transition-all duration-200 border ${
                                                        lang === 'zh' 
                                                        ? 'bg-purple-600/90 border-purple-500/50 text-white shadow-lg shadow-purple-900/20' 
                                                        : 'bg-white/[0.03] border-white/10 text-white/60 hover:bg-white/[0.06] hover:text-white hover:border-white/20'
                                                    }`}
                                                >
                                                    中文
                                                </button>
                                            </div>
                                        </div>

                                        {/* Service Mode Selector */}
                                        <div>
                                            <label className="flex items-center gap-2 text-xs font-medium text-white/80 mb-2">
                                                <Router className="w-3.5 h-3.5 text-blue-400" />
                                                {t.service_mode}
                                            </label>
                                            <div className="grid grid-cols-3 gap-2">
                                                {[
                                                    { id: 'local', label: t.mode_local },
                                                    { id: 'server', label: t.mode_server },
                                                    { id: 'hydration', label: t.mode_hydration }
                                                ].map(option => (
                                                    <button
                                                        key={option.id}
                                                        onClick={() => handleServiceModeChange(option.id as ServiceMode)}
                                                        className={`px-2 py-2.5 rounded-xl text-xs font-medium transition-all duration-200 border truncate ${
                                                            serviceMode === option.id
                                                            ? 'bg-blue-600/90 border-blue-500/50 text-white shadow-lg shadow-blue-900/20'
                                                            : 'bg-white/[0.03] border-white/10 text-white/60 hover:bg-white/[0.06] hover:text-white hover:border-white/20'
                                                        }`}
                                                    >
                                                        {option.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Storage Service Selector */}
                                        <div>
                                            <label className="flex items-center gap-2 text-xs font-medium text-white/80 mb-2">
                                                <HardDrive className="w-3.5 h-3.5 text-green-400" />
                                                {t.storage_service}
                                            </label>
                                            <div className="grid grid-cols-3 gap-2">
                                                {[
                                                    { id: 'off', label: t.storage_off },
                                                    { id: 's3', label: t.storage_s3 },
                                                    { id: 'webdav', label: t.storage_webdav }
                                                ].map(option => (
                                                    <button
                                                        key={option.id}
                                                        onClick={() => {
                                                            setStorageType(option.id as StorageType)
                                                            if (option.id === 's3') setActiveTab('s3');
                                                            if (option.id === 'webdav') setActiveTab('webdav');
                                                            setTimeout(() => handleScrollTabsRight(), 300)
                                                        }}
                                                        className={`px-3 py-2.5 rounded-xl text-xs font-medium transition-all duration-200 border ${
                                                            storageType === option.id
                                                            ? 'bg-green-600/90 border-green-500/50 text-white shadow-lg shadow-green-900/20'
                                                            : 'bg-white/[0.03] border-white/10 text-white/60 hover:bg-white/[0.06] hover:text-white hover:border-white/20'
                                                        }`}
                                                    >
                                                        {option.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Clear Data */}
                                        <div className="pt-2 border-t border-white/5">
                                            <label className="flex items-center gap-2 text-xs font-medium text-red-400 mb-2">
                                                <Trash2 className="w-3.5 h-3.5" />
                                                {t.clearData}
                                            </label>
                                            <p className="text-xs text-white/40 mb-3">{t.clearDataDesc}</p>
                                            
                                            {!showClearConfirm ? (
                                                <button
                                                    onClick={() => setShowClearConfirm(true)}
                                                    className="w-full py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-xl text-xs font-medium transition-colors"
                                                >
                                                    {t.clearData}
                                                </button>
                                            ) : (
                                                <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                                                    <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3">
                                                        <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
                                                        <span className="text-xs text-red-200 leading-relaxed">
                                                            {t.clearDataConfirm}
                                                        </span>
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <button
                                                            onClick={() => setShowClearConfirm(false)}
                                                            className="flex-1 py-2 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white rounded-lg text-xs font-medium transition-colors"
                                                        >
                                                            {t.cancel}
                                                        </button>
                                                        <button
                                                            onClick={handleClearData}
                                                            className="flex-1 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-bold transition-colors shadow-lg shadow-red-900/20"
                                                        >
                                                            {t.confirm}
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Tab 2: Provider */}
                                {tab.id === 'provider' && (
                                    // ... Existing provider tab logic ...
                                    <div>
                                        {/* Default Providers - Only show if mode supports it */}
                                        {showBaseProviders && (
                                            <>
                                                {renderProviderPanel(
                                                    'huggingface', 
                                                    t.provider_huggingface, 
                                                    'bg-yellow-500',
                                                    renderTokenInput(
                                                        token, 
                                                        handleTokenChange, 
                                                        showToken, 
                                                        () => setShowToken(!showToken), 
                                                        stats, 
                                                        'hf_...,hf_...', 
                                                        t.hfTokenHelp, 
                                                        t.hfTokenLink, 
                                                        t.hfTokenHelpEnd, 
                                                        "https://huggingface.co/settings/tokens"
                                                    )
                                                )}

                                                {renderProviderPanel(
                                                    'gitee', 
                                                    t.provider_gitee, 
                                                    'bg-red-500',
                                                    renderTokenInput(
                                                        giteeToken,
                                                        handleGiteeTokenChange,
                                                        showGiteeToken,
                                                        () => setShowGiteeToken(!showGiteeToken),
                                                        giteeStats,
                                                        '...,...',
                                                        t.giteeTokenHelp,
                                                        t.giteeTokenLink,
                                                        t.giteeTokenHelpEnd,
                                                        "https://ai.gitee.com/dashboard/settings/tokens"
                                                    )
                                                )}

                                                {renderProviderPanel(
                                                    'modelscope', 
                                                    t.provider_modelscope, 
                                                    'bg-blue-500',
                                                    renderTokenInput(
                                                        msToken,
                                                        handleMsTokenChange,
                                                        showMsToken,
                                                        () => setShowMsToken(!showMsToken),
                                                        msStats,
                                                        'ms-...,ms-...',
                                                        t.msTokenHelp,
                                                        t.msTokenLink,
                                                        t.msTokenHelpEnd,
                                                        "https://modelscope.cn/my/myaccesstoken"
                                                    )
                                                )}

                                                {renderProviderPanel(
                                                    'openrouter', 
                                                    t.provider_openrouter, 
                                                    'bg-cyan-500',
                                                    (
                                                        <div className="space-y-4">
                                                            <div className="relative group">
                                                                <input
                                                                    type={showOpenrouterToken ? "text" : "password"}
                                                                    value={openrouterToken}
                                                                    onChange={handleOpenrouterTokenChange}
                                                                    placeholder="sk-or-..."
                                                                    className="w-full pl-4 pr-10 py-2.5 bg-[#1A1625] border border-white/10 rounded-xl text-white placeholder:text-white/20 focus:outline-none focus:border-purple-500/50 transition-all font-mono text-sm"
                                                                />
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setShowOpenrouterToken(!showOpenrouterToken)}
                                                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/5"
                                                                >
                                                                    {showOpenrouterToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                                                </button>
                                                            </div>
                                                            <p className="text-xs text-white/40 leading-relaxed">
                                                                {t.openrouterTokenHelp || "Required. Get"} <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:text-purple-300 hover:underline transition-colors">{t.openrouterTokenLink || "API Key"}</a> {t.openrouterTokenHelpEnd || "from dashboard."}
                                                            </p>
                                                        </div>
                                                    )
                                                )}
                                            </>
                                        )}

                                        {/* Custom Providers List - Only show if mode supports it */}
                                        {showCustomProviders && (
                                            <div>
                                                <div>
                                                    {customProviders.map(cp => renderProviderPanel(
                                                        cp.id,
                                                        cp.name,
                                                        'bg-purple-500',
                                                        (
                                                            <div className="space-y-4">
                                                                {/* Name */}
                                                                <div className="space-y-2">
                                                                    <label className="text-xs font-medium text-white/60">{t.provider_name}</label>
                                                                    <input 
                                                                        type="text"
                                                                        value={cp.name}
                                                                        onChange={(e) => handleUpdateCustomProvider(cp.id, { name: e.target.value })}
                                                                        className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500/50"
                                                                    />
                                                                </div>
                                                                {/* URL */}
                                                                <div className="space-y-2">
                                                                    <label className="text-xs font-medium text-white/60">{t.api_url}</label>
                                                                    <div className="flex items-center gap-2">
                                                                        <input 
                                                                            type="text"
                                                                            value={cp.apiUrl}
                                                                            onChange={(e) => handleUpdateCustomProvider(cp.id, { apiUrl: e.target.value })}
                                                                            className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500/50 font-mono"
                                                                        />
                                                                        <button
                                                                            onClick={() => handleRefreshCustomModels(cp.id)}
                                                                            disabled={refreshingProviders[cp.id]}
                                                                            className={`px-3 py-2 rounded-lg text-xs font-medium border transition-all flex items-center gap-1.5 ${
                                                                                refreshingProviders[cp.id] 
                                                                                ? 'bg-white/5 text-white/40 border-white/5 cursor-not-allowed' 
                                                                                : 'bg-white/10 text-white/80 border-white/10 hover:bg-white/20'
                                                                            }`}
                                                                            title={t.get_models || "Update Models"}
                                                                        >
                                                                            {refreshingProviders[cp.id] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                                {/* Token */}
                                                                <div className="space-y-2">
                                                                    <label className="text-xs font-medium text-white/60">{t.api_token}</label>
                                                                    <div className="relative w-full">
                                                                        <input 
                                                                            type={showCustomProviderTokens[cp.id] ? "text" : "password"}
                                                                            value={cp.token || ''}
                                                                            onChange={(e) => handleUpdateCustomProvider(cp.id, { token: e.target.value })}
                                                                            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500/50 font-mono pr-8"
                                                                        />
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => setShowCustomProviderTokens(prev => ({ ...prev, [cp.id]: !prev[cp.id] }))}
                                                                            className="absolute right-2 top-1/2 -translate-y-1/2 text-white/30 hover:text-white p-1"
                                                                        >
                                                                            {showCustomProviderTokens[cp.id] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                                
                                                                {/* Stats & Delete */}
                                                                <div className="flex items-center justify-between">
                                                                     <div className={`text-xs transition-colors duration-300 flex items-center gap-1.5 ${refreshSuccessProviders[cp.id] ? 'text-green-400 font-medium' : 'text-white/40'}`}>
                                                                        {refreshSuccessProviders[cp.id] && <Check className="w-3 h-3" />}
                                                                        {t.models_count.replace('{count}', (
                                                                            (cp.models.generate?.length || 0) + 
                                                                            (cp.models.edit?.length || 0) + 
                                                                            (cp.models.video?.length || 0) + 
                                                                            (cp.models.text?.length || 0) +
                                                                            (cp.models.upscaler?.length || 0)
                                                                        ))}
                                                                     </div>
                                                                     <button 
                                                                        onClick={() => handleDeleteCustomProvider(cp.id)}
                                                                        className="p-2 text-white/40 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                                                                        title={t.delete || "Delete"}
                                                                    >
                                                                        <Trash2 className="w-4 h-4" />
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        )
                                                    ))}

                                                    {/* Add Provider as Collapsible Panel */}
                                                    {showAddCustomProvider && renderProviderPanel(
                                                        'add_custom',
                                                        t.add_provider,
                                                        'bg-white/20',
                                                        (
                                                            <div className="space-y-4">
                                                                <div className="space-y-2">
                                                                    <label className="text-xs font-medium text-white/60">
                                                                        {t.provider_name} <span className="text-white/30">({t.seedOptional})</span>
                                                                    </label>
                                                                    <input 
                                                                        type="text"
                                                                        value={newProviderName}
                                                                        onChange={e => setNewProviderName(e.target.value)}
                                                                        className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500/50"
                                                                    />
                                                                </div>
                                                                <div className="space-y-2">
                                                                    <label className="text-xs font-medium text-white/60">{t.api_url}</label>
                                                                    <div className="flex items-center gap-2">
                                                                        <input 
                                                                            type="text"
                                                                            value={newProviderUrl}
                                                                            onChange={e => setNewProviderUrl(e.target.value)}
                                                                            className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500/50 font-mono"
                                                                            placeholder="https://example.com/api"
                                                                        />
                                                                        <button
                                                                            onClick={handleFetchModels}
                                                                            disabled={!newProviderUrl || fetchStatus === 'loading'}
                                                                            className={`px-3 py-2 rounded-lg text-xs font-medium border transition-all flex items-center gap-1.5 ${
                                                                                fetchStatus === 'success' 
                                                                                ? 'bg-green-500/20 text-green-400 border-green-500/30' 
                                                                                : fetchStatus === 'failed'
                                                                                ? 'bg-red-500/20 text-red-400 border-red-500/30'
                                                                                : 'bg-white/10 text-white/80 border-white/10 hover:bg-white/20'
                                                                            }`}
                                                                        >
                                                                            {fetchStatus === 'loading' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Globe className="w-3.5 h-3.5" />}
                                                                            {fetchStatus === 'loading' ? t.fetch_status_loading : (fetchStatus === 'success' ? t.fetch_status_success : (fetchStatus === 'failed' ? t.fetch_status_failed : t.get_models))}
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                                <div className="space-y-2">
                                                                    <label className="text-xs font-medium text-white/60">{t.api_token}</label>
                                                                    <div className="relative w-full">
                                                                        <input 
                                                                            type={showNewProviderToken ? "text" : "password"}
                                                                            value={newProviderToken}
                                                                            onChange={e => setNewProviderToken(e.target.value)}
                                                                            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500/50 font-mono pr-8"
                                                                        />
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => setShowNewProviderToken(!showNewProviderToken)}
                                                                            className="absolute right-2 top-1/2 -translate-y-1/2 text-white/30 hover:text-white p-1"
                                                                        >
                                                                            {showNewProviderToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                                                        </button>
                                                                    </div>
                                                                </div>

                                                                {fetchedModels && (
                                                                    <div className="p-3 bg-white/5 rounded-lg text-xs text-green-400 border border-green-500/20 flex items-center gap-2">
                                                                        <Check className="w-3 h-3" />
                                                                        {t.models_count.replace('{count}', (
                                                                            (fetchedModels.generate?.length || 0) + 
                                                                            (fetchedModels.edit?.length || 0) + 
                                                                            (fetchedModels.video?.length || 0) + 
                                                                            (fetchedModels.text?.length || 0) +
                                                                            (fetchedModels.upscaler?.length || 0)
                                                                        ))}
                                                                    </div>
                                                                )}

                                                                <div className="flex justify-between">
                                                                    <button
                                                                        onClick={handleClearAddForm}
                                                                        className="p-2 text-white/40 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                                                                        title={t.cancel || "Clear"}
                                                                    >
                                                                        <Trash2 className="w-4 h-4" />
                                                                    </button>
                                                                    <button
                                                                        onClick={handleAddCustomProvider}
                                                                        disabled={!newProviderUrl || !fetchedModels}
                                                                        className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-sm font-bold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                                    >
                                                                        {t.confirm}
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        )
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Tab 3: Models Selection */}
                                {tab.id === 'models' && (
                                    <div className="space-y-6">
                                        {/* Creation Model - Temporarily Hidden */}
                                        {/* <Select
                                            label={t.model_creation}
                                            value={creationModelValue}
                                            onChange={setCreationModelValue}
                                            options={getCreationModelGroups()}
                                            icon={<Sparkles className="w-4 h-4" />}
                                            dense
                                        /> */}

                                        {/* Edit Model */}
                                        <Select
                                            label={t.model_edit}
                                            value={editModelValue}
                                            onChange={setEditModelValue}
                                            options={getAvailableModelGroups(EDIT_MODELS, 'edit')}
                                            icon={<Layers className="w-4 h-4" />}
                                            dense
                                        />

                                        {/* Live Model */}
                                        <Select
                                            label={t.model_live}
                                            value={liveModelValue}
                                            onChange={setLiveModelValue}
                                            options={getAvailableModelGroups(LIVE_MODELS, 'video')}
                                            icon={<Film className="w-4 h-4" />}
                                            dense
                                        />

                                        {/* Upscaler Model - Added per request */}
                                        <Select
                                            label={t.upscale}
                                            value={upscalerModelValue}
                                            onChange={setUpscalerModelValue}
                                            options={getAvailableModelGroups(UPSCALER_MODELS, 'upscaler')}
                                            icon={<Plus className="w-4 h-4" />}
                                            dense
                                        />

                                        {/* Text Model */}
                                        <Select
                                            label={t.model_text}
                                            value={textModelValue}
                                            onChange={setTextModelValue}
                                            options={getAvailableModelGroups(TEXT_MODELS, 'text')}
                                            icon={<Brain className="w-4 h-4" />}
                                            dense
                                        />
                                    </div>
                                )}

                                {/* Rest of the tabs... (prompt, live settings, s3, webdav) - unchanged logic */}
                                {/* Tab 4: Prompt */}
                                {tab.id === 'prompt' && (
                                    <div className="space-y-6">
                                        {/* Prompt Optimization */}
                                        <div className="space-y-4">
                                            <div className="flex items-center justify-between">
                                                <label className="flex items-center gap-2 text-sm font-medium text-white/80">
                                                    <MessageSquare className="w-4 h-4 text-pink-400" />
                                                    {t.systemPrompts}
                                                </label>
                                                
                                                <button
                                                    onClick={handleRestoreDefault}
                                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white/50 hover:text-white bg-white/5 hover:bg-white/10 transition-colors border border-transparent hover:border-white/10"
                                                    title={t.restoreDefault}
                                                >
                                                    <RotateCcw className="w-3.5 h-3.5" />
                                                    {t.restoreDefault}
                                                </button>
                                            </div>

                                            <div className="relative group">
                                                <textarea 
                                                    value={systemPrompt}
                                                    onChange={(e) => setSystemPrompt(e.target.value)}
                                                    placeholder={t.promptContent}
                                                    className="w-full h-28 bg-white/[0.03] border border-white/10 rounded-xl p-4 text-sm text-white/80 placeholder:text-white/20 focus:outline-0 focus:ring-4 focus:ring-pink-500/10 focus:border-pink-500/50 hover:border-white/20 resize-none custom-scrollbar leading-relaxed font-mono transition-all duration-300 ease-out"
                                                />
                                            </div>
                                        </div>

                                        {/* Translation Prompt */}
                                        <div className="space-y-4">
                                            <div className="flex items-center justify-between pt-2">
                                                <label className="flex items-center gap-2 text-sm font-medium text-white/80">
                                                    <Languages className="w-4 h-4 text-blue-400" />
                                                    {t.translationPrompt}
                                                </label>
                                                
                                                <button
                                                    onClick={handleRestoreTranslationDefault}
                                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white/50 hover:text-white bg-white/5 hover:bg-white/10 transition-colors border border-transparent hover:border-white/10"
                                                    title={t.restoreDefault}
                                                >
                                                    <RotateCcw className="w-3.5 h-3.5" />
                                                    {t.restoreDefault}
                                                </button>
                                            </div>

                                            <div className="relative group">
                                                <textarea 
                                                    value={translationPrompt}
                                                    onChange={(e) => setTranslationPrompt(e.target.value)}
                                                    placeholder={t.promptContent}
                                                    className="w-full h-28 bg-white/[0.03] border border-white/10 rounded-xl p-4 text-sm text-white/80 placeholder:text-white/20 focus:outline-0 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500/50 hover:border-white/20 resize-none custom-scrollbar leading-relaxed font-mono transition-all duration-300 ease-out"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Tab 5: Live Settings */}
                                {tab.id === 'live' && (
                                    <div className="space-y-6">
                                        <div className="space-y-4">
                                            <div className="flex items-center justify-between">
                                                <label className="flex items-center gap-2 text-sm font-medium text-white/80">
                                                    <MessageSquare className="w-4 h-4 text-purple-400" />
                                                    {t.videoPrompt}
                                                </label>
                                                <button
                                                    onClick={handleRestoreVideoDefaults}
                                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white/50 hover:text-white bg-white/5 hover:bg-white/10 transition-colors border border-transparent hover:border-white/10"
                                                >
                                                    <RotateCcw className="w-3.5 h-3.5" />
                                                    {t.restoreDefault}
                                                </button>
                                            </div>
                                            <textarea 
                                                value={videoSettings.prompt}
                                                onChange={(e) => setVideoSettings({ ...videoSettings, prompt: e.target.value })}
                                                className="w-full h-24 bg-white/[0.03] border border-white/10 rounded-xl p-4 text-sm text-white/90 placeholder:text-white/20 focus:outline-0 focus:ring-4 focus:ring-purple-500/10 focus:border-purple-500/50 hover:border-white/20 resize-none custom-scrollbar leading-relaxed font-mono transition-all duration-300 ease-out"
                                            />
                                        </div>

                                        <div className="space-y-6">
                                            {/* Duration */}
                                            <div className="flex items-center justify-between gap-4">
                                                <label className="flex items-center gap-2 text-sm font-medium text-white/80 min-w-[6rem]">
                                                    <Clock className="w-4 h-4 text-blue-400" />
                                                    {t.videoDuration}
                                                </label>
                                                <div className="flex flex-1 items-center gap-3">
                                                    <input
                                                        type="range"
                                                        min="0.5"
                                                        max="5"
                                                        step="0.5"
                                                        value={videoSettings.duration}
                                                        onChange={(e) => setVideoSettings({ ...videoSettings, duration: Number(e.target.value) })}
                                                        className="custom-range text-blue-500 flex-1"
                                                    />
                                                    <span className="text-xs font-mono text-white/50 bg-white/5 px-2 py-0.5 rounded min-w-[3.5rem] text-center">
                                                        {videoSettings.duration} {t.seconds}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Steps */}
                                            <div className="flex items-center justify-between gap-4">
                                                <label className="flex items-center gap-2 text-sm font-medium text-white/80 min-w-[6rem]">
                                                    <Layers className="w-4 h-4 text-green-400" />
                                                    {t.videoSteps}
                                                </label>
                                                <div className="flex flex-1 items-center gap-3">
                                                    <input
                                                        type="range"
                                                        min="1"
                                                        max="30"
                                                        step="1"
                                                        value={videoSettings.steps}
                                                        onChange={(e) => setVideoSettings({ ...videoSettings, steps: Number(e.target.value) })}
                                                        className="custom-range text-green-500 flex-1"
                                                    />
                                                    <span className="text-xs font-mono text-white/50 bg-white/5 px-2 py-0.5 rounded min-w-[2rem] text-center">
                                                        {videoSettings.steps}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Guidance */}
                                            <div className="flex items-center justify-between gap-4">
                                                <label className="flex items-center gap-2 text-sm font-medium text-white/80 min-w-[6rem]">
                                                    <Sparkles className="w-4 h-4 text-yellow-400" />
                                                    {t.videoGuidance}
                                                </label>
                                                <div className="flex flex-1 items-center gap-3">
                                                    <input
                                                        type="range"
                                                        min="0"
                                                        max="10"
                                                        step="1"
                                                        value={videoSettings.guidance}
                                                        onChange={(e) => setVideoSettings({ ...videoSettings, guidance: Number(e.target.value) })}
                                                        className="custom-range text-yellow-500 flex-1"
                                                    />
                                                    <span className="text-xs font-mono text-white/50 bg-white/5 px-2 py-0.5 rounded min-w-[2rem] text-center">
                                                        {videoSettings.guidance}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Tab 6: Cloud Storage (S3) */}
                                {tab.id === 's3' && (
                                     <div className="space-y-6">
                                        <div className="space-y-4">
                                            {/* Access Key */}
                                            <div className="flex items-center justify-between gap-4">
                                                <label className="text-sm font-medium text-white/80 w-1/3 flex-shrink-0">{t.s3_access_key}</label>
                                                <input 
                                                    type="text"
                                                    value={s3Config.accessKeyId}
                                                    onChange={(e) => setS3Config({ ...s3Config, accessKeyId: e.target.value })}
                                                    className="w-full px-3 py-2 bg-white/[0.03] border border-white/10 rounded-lg text-white text-sm focus:outline-0 focus:border-green-500/50 transition-all font-mono"
                                                />
                                            </div>

                                            {/* Secret Key */}
                                            <div className="flex items-center justify-between gap-4">
                                                <label className="text-sm font-medium text-white/80 w-1/3 flex-shrink-0">{t.s3_secret_key}</label>
                                                <div className="relative w-full">
                                                    <input 
                                                        type={showS3Secret ? "text" : "password"}
                                                        value={s3Config.secretAccessKey}
                                                        onChange={(e) => setS3Config({ ...s3Config, secretAccessKey: e.target.value })}
                                                        className="w-full px-3 py-2 bg-white/[0.03] border border-white/10 rounded-lg text-white text-sm focus:outline-0 focus:border-green-500/50 transition-all font-mono pr-8"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => setShowS3Secret(!showS3Secret)}
                                                        className="absolute right-2 top-1/2 -translate-y-1/2 text-white/30 hover:text-white"
                                                    >
                                                        {showS3Secret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Bucket & Region */}
                                            <div className="flex gap-4">
                                                <div className="flex-1 space-y-1">
                                                    <label className="text-xs font-medium text-white/60 block">{t.s3_bucket}</label>
                                                    <input 
                                                        type="text"
                                                        value={s3Config.bucket || ''}
                                                        onChange={(e) => setS3Config({ ...s3Config, bucket: e.target.value })}
                                                        className="w-full px-3 py-2 bg-white/[0.03] border border-white/10 rounded-lg text-white text-sm focus:outline-0 focus:border-green-500/50 transition-all"
                                                    />
                                                </div>
                                                <div className="w-1/3 space-y-1">
                                                    <label className="text-xs font-medium text-white/60 block">{t.s3_region}</label>
                                                    <input 
                                                        type="text"
                                                        value={s3Config.region || ''}
                                                        onChange={(e) => setS3Config({ ...s3Config, region: e.target.value })}
                                                        className="w-full px-3 py-2 bg-white/[0.03] border border-white/10 rounded-lg text-white text-sm focus:outline-0 focus:border-green-500/50 transition-all"
                                                    />
                                                </div>
                                            </div>

                                            {/* Endpoint */}
                                            <div className="flex-1 space-y-1">
                                                <label className="text-xs font-medium text-white/60 block">{t.s3_endpoint}</label>
                                                <input 
                                                    type="text"
                                                    value={s3Config.endpoint || ''}
                                                    onChange={(e) => setS3Config({ ...s3Config, endpoint: e.target.value })}
                                                    placeholder={getEndpointPlaceholder()}
                                                    className="w-full px-3 py-2 bg-white/[0.03] border border-white/10 rounded-lg text-white text-sm focus:outline-0 focus:border-green-500/50 transition-all"
                                                />
                                            </div>
                                            
                                             <div className="flex gap-4">
                                                {/* Domain */}
                                                <div className="flex-1 space-y-1">
                                                    <label className="text-xs font-medium text-white/60 block">{t.s3_domain}</label>
                                                    <input 
                                                        type="text"
                                                        value={s3Config.publicDomain || ''}
                                                        onChange={(e) => setS3Config({ ...s3Config, publicDomain: e.target.value })}
                                                        placeholder={t.s3_domain_placeholder}
                                                        className="w-full px-3 py-2 bg-white/[0.03] border border-white/10 rounded-lg text-white text-sm focus:outline-0 focus:border-green-500/50 transition-all"
                                                    />
                                                </div>

                                                {/* File Prefix */}
                                                <div className="flex-1 space-y-1">
                                                    <label className="text-xs font-medium text-white/60 block">{t.s3_prefix}</label>
                                                    <input 
                                                        type="text"
                                                        value={s3Config.prefix ?? 'peinture/'}
                                                        onChange={(e) => setS3Config({ ...s3Config, prefix: e.target.value })}
                                                        placeholder={t.s3_prefix_placeholder}
                                                        className="w-full px-3 py-2 bg-white/[0.03] border border-white/10 rounded-lg text-white text-sm focus:outline-0 focus:border-green-500/50 transition-all font-mono"
                                                    />
                                                </div>
                                            </div>

                                            {/* Test Connection Button */}
                                            <div className="flex flex-col gap-2">
                                                <div className="flex justify-end">
                                                    <button 
                                                        onClick={handleTestS3}
                                                        disabled={isTestingS3}
                                                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-600/20 text-green-400 hover:bg-green-600/30 border border-green-500/30 transition-all text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                                                    >
                                                        {isTestingS3 ? (
                                                            <>
                                                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                                {t.testing}
                                                            </>
                                                        ) : (
                                                            <>
                                                                <PlugZap className="w-3.5 h-3.5" />
                                                                {t.test_connection}
                                                            </>
                                                        )}
                                                    </button>
                                                </div>
                                                {testS3Result && (
                                                    <div className={`p-3 rounded-lg border text-xs flex items-start gap-2 ${testS3Result.success ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
                                                        {testS3Result.success ? <Check className="w-4 h-4 mt-0.5 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />}
                                                        <span>{testS3Result.message}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Tab 7: WebDAV Storage */}
                                {tab.id === 'webdav' && (
                                     <div className="space-y-6">
                                        <div className="space-y-4">
                                            {/* URL */}
                                            <div className="flex items-center justify-between gap-4">
                                                <label className="text-sm font-medium text-white/80 w-1/3 flex-shrink-0">{t.webdav_url}</label>
                                                <input 
                                                    type="text"
                                                    value={webdavConfig.url}
                                                    onChange={(e) => setWebdavConfig({ ...webdavConfig, url: e.target.value })}
                                                    placeholder={t.webdav_url_placeholder}
                                                    className="w-full px-3 py-2 bg-white/[0.03] border border-white/10 rounded-lg text-white text-sm focus:outline-0 focus:border-blue-500/50 transition-all font-mono"
                                                />
                                            </div>

                                            {/* Username */}
                                            <div className="flex items-center justify-between gap-4">
                                                <label className="text-sm font-medium text-white/80 w-1/3 flex-shrink-0">{t.webdav_username}</label>
                                                <input 
                                                    type="text"
                                                    value={webdavConfig.username}
                                                    onChange={(e) => setWebdavConfig({ ...webdavConfig, username: e.target.value })}
                                                    className="w-full px-3 py-2 bg-white/[0.03] border border-white/10 rounded-lg text-white text-sm focus:outline-0 focus:border-blue-500/50 transition-all font-mono"
                                                />
                                            </div>

                                            {/* Password */}
                                            <div className="flex items-center justify-between gap-4">
                                                <label className="text-sm font-medium text-white/80 w-1/3 flex-shrink-0">{t.webdav_password}</label>
                                                <div className="relative w-full">
                                                    <input 
                                                        type={showWebdavPass ? "text" : "password"}
                                                        value={webdavConfig.password}
                                                        onChange={(e) => setWebdavConfig({ ...webdavConfig, password: e.target.value })}
                                                        className="w-full px-3 py-2 bg-white/[0.03] border border-white/10 rounded-lg text-white text-sm focus:outline-0 focus:border-blue-500/50 transition-all font-mono pr-8"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => setShowWebdavPass(!showWebdavPass)}
                                                        className="absolute right-2 top-1/2 -translate-y-1/2 text-white/30 hover:text-white"
                                                    >
                                                        {showWebdavPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Directory */}
                                            <div className="flex items-center justify-between gap-4">
                                                <label className="text-sm font-medium text-white/80 w-1/3 flex-shrink-0">{t.webdav_directory}</label>
                                                <input 
                                                    type="text"
                                                    value={webdavConfig.directory}
                                                    onChange={(e) => setWebdavConfig({ ...webdavConfig, directory: e.target.value })}
                                                    className="w-full px-3 py-2 bg-white/[0.03] border border-white/10 rounded-lg text-white text-sm focus:outline-0 focus:border-blue-500/50 transition-all font-mono"
                                                />
                                            </div>

                                            {/* Test Connection Button */}
                                            <div className="flex flex-col gap-2">
                                                <div className="flex justify-end">
                                                    <button 
                                                        onClick={handleTestWebDAV}
                                                        disabled={isTestingWebDAV}
                                                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 border border-blue-500/30 transition-all text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                                                    >
                                                        {isTestingWebDAV ? (
                                                            <>
                                                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                                {t.testing}
                                                            </>
                                                        ) : (
                                                            <>
                                                                <PlugZap className="w-3.5 h-3.5" />
                                                                {t.test_connection}
                                                            </>
                                                        )}
                                                    </button>
                                                </div>
                                                {testWebDAVResult && (
                                                    <div className={`p-3 rounded-lg border text-xs flex items-start gap-2 ${testWebDAVResult.success ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
                                                        {testWebDAVResult.success ? <Check className="w-4 h-4 mt-0.5 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />}
                                                        <span>{testWebDAVResult.message}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                <div className="flex items-center justify-end gap-3 px-5 py-2 border-t border-white/[0.06] bg-white/[0.02] flex-shrink-0">
                    <button
                        onClick={onClose}
                        className="px-5 py-2.5 text-sm font-medium text-white/60 hover:text-white hover:bg-white/[0.06] rounded-lg transition-all duration-200"
                    >
                        {t.cancel}
                    </button>
                    <button
                        onClick={handleSave}
                        className="flex items-center gap-2 px-6 py-2.5 text-sm font-bold text-white bg-purple-600 hover:bg-purple-500 active:bg-purple-700 active:scale-95 rounded-lg transition-all shadow-[0_4px_20px_-4px_rgba(147,51,234,0.5)] hover:shadow-[0_4px_25px_-4px_rgba(147,51,234,0.6)]"
                    >
                        <Save className="w-4 h-4" />
                        {t.save}
                    </button>
                </div>
            </div>
        </div>
    );
};
