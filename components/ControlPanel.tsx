
import React, { useState, useEffect, useMemo } from 'react';
import { Select, OptionGroup } from './Select';
import { Tooltip } from './Tooltip';
import { Settings, ChevronUp, ChevronDown, Minus, Plus, Dices, Cpu } from 'lucide-react';
import { ModelOption, ProviderOption, AspectRatioOption, ImageSizeOption } from '../types';
import { 
    HF_MODEL_OPTIONS, 
    GITEE_MODEL_OPTIONS, 
    MS_MODEL_OPTIONS, 
    OPENROUTER_MODEL_OPTIONS,
    Z_IMAGE_MODELS, 
    FLUX_MODELS, 
    getModelConfig, 
    getGuidanceScaleConfig,
    getOpenRouterModelConfig
} from '../constants';
import { getCustomProviders, getServiceMode } from '../services/utils';

interface ControlPanelProps {
    provider: ProviderOption;
    setProvider: (val: ProviderOption) => void;
    model: ModelOption;
    setModel: (val: ModelOption) => void;
    aspectRatio: AspectRatioOption;
    setAspectRatio: (val: AspectRatioOption) => void;
    steps: number;
    setSteps: (val: number) => void;
    guidanceScale: number;
    setGuidanceScale: (val: number) => void;
    seed: string;
    setSeed: (val: string) => void;
    imageSize: ImageSizeOption;
    setImageSize: (val: ImageSizeOption) => void;
    t: any;
    aspectRatioOptions: { value: string; label: string }[];
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
    provider,
    setProvider,
    model,
    setModel,
    aspectRatio,
    setAspectRatio,
    steps,
    setSteps,
    guidanceScale,
    setGuidanceScale,
    seed,
    setSeed,
    imageSize,
    setImageSize,
    t,
    aspectRatioOptions
}) => {
    const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
    const [modelOptions, setModelOptions] = useState<OptionGroup[]>([]);

    // Build grouped model options dynamically
    useEffect(() => {
        const updateModelOptions = () => {
            const serviceMode = getServiceMode();
            const groups: OptionGroup[] = [];
            
            const showBase = serviceMode === 'local' || serviceMode === 'hydration';
            const showCustom = serviceMode === 'server' || serviceMode === 'hydration';

            // 1. Default Providers
            if (showBase) {
                // Hugging Face (Always visible)
                groups.push({
                    label: t.provider_huggingface,
                    options: HF_MODEL_OPTIONS.map(m => ({ label: m.label, value: `huggingface:${m.value}` }))
                });

                // Gitee (Only if token exists)
                const hasGiteeToken = localStorage.getItem('giteeToken');
                if (hasGiteeToken) {
                    groups.push({
                        label: t.provider_gitee,
                        options: GITEE_MODEL_OPTIONS.map(m => ({ label: m.label, value: `gitee:${m.value}` }))
                    });
                }

                // Model Scope (Only if token exists)
                const hasMsToken = localStorage.getItem('msToken');
                if (hasMsToken) {
                    groups.push({
                        label: t.provider_modelscope,
                        options: MS_MODEL_OPTIONS.map(m => ({ label: m.label, value: `modelscope:${m.value}` }))
                    });
                }

                // OpenRouter (Only if token exists)
                const hasOpenRouterToken = localStorage.getItem('openrouterToken');
                if (hasOpenRouterToken) {
                    groups.push({
                        label: t.provider_openrouter || 'OpenRouter',
                        options: OPENROUTER_MODEL_OPTIONS.map(m => ({ label: m.label, value: `openrouter:${m.value}` }))
                    });
                }
            }

            // 2. Custom Providers
            if (showCustom) {
                const customProviders = getCustomProviders();
                customProviders.forEach(cp => {
                    const models = cp.models.generate;
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

            setModelOptions(groups);
        };

        updateModelOptions();
        // Listen for storage changes to update list dynamically (e.g. after adding token in settings)
        window.addEventListener('storage', updateModelOptions);
        return () => window.removeEventListener('storage', updateModelOptions);
    }, [t]);

    // Determine current model configuration (Standard or Custom)
    const activeConfig = useMemo(() => {
        const customProviders = getCustomProviders();
        // Try to find custom provider matching the ID
        const activeCustomProvider = customProviders.find(p => p.id === provider);
        
        if (activeCustomProvider) {
            // It's a custom provider
            const customModel = activeCustomProvider.models.generate?.find(m => m.id === model);
            
            if (customModel) {
                return {
                    isCustom: true,
                    steps: customModel.steps ? {
                        min: customModel.steps.range[0],
                        max: customModel.steps.range[1],
                        default: customModel.steps.default
                    } : null,
                    guidance: customModel.guidance ? {
                        min: customModel.guidance.range[0],
                        max: customModel.guidance.range[1],
                        step: 0.1,
                        default: customModel.guidance.default
                    } : null,
                    imageSize: null // Custom providers don't support imageSize yet
                };
            }
        }

        // Check for OpenRouter model capabilities
        if (provider === 'openrouter') {
            const openRouterConfig = getOpenRouterModelConfig(model);
            return {
                isCustom: false,
                steps: null, // OpenRouter doesn't use steps
                guidance: null, // OpenRouter doesn't use guidance
                imageSize: openRouterConfig?.capabilities.imageSize || null
            };
        }

        // Fallback to standard config
        return {
            isCustom: false,
            steps: getModelConfig(provider, model),
            guidance: getGuidanceScaleConfig(model, provider),
            imageSize: null
        };
    }, [provider, model]);

    // Initialize defaults when model changes
    useEffect(() => {
        if (activeConfig.isCustom) {
            if (activeConfig.steps) {
                setSteps(activeConfig.steps.default);
            }
            if (activeConfig.guidance) {
                setGuidanceScale(activeConfig.guidance.default);
            }
        }
        // Initialize imageSize for OpenRouter models
        if (activeConfig.imageSize) {
            setImageSize(activeConfig.imageSize.default);
        }
        // Standard provider defaults are handled in App.tsx effects, 
        // but custom ones need explicit handling here since App.tsx 
        // mainly relies on getModelConfig/constants.
    }, [activeConfig, setSteps, setGuidanceScale, setImageSize]);

    const handleRandomizeSeed = () => {
        setSeed(Math.floor(Math.random() * 2147483647).toString());
    };

    const handleAdjustSeed = (amount: number) => {
        const current = parseInt(seed || '0', 10);
        if (isNaN(current)) {
            setSeed((0 + amount).toString());
        } else {
            setSeed((current + amount).toString());
        }
    };

    // Handle Model Change: Parse "provider:modelId"
    const onModelChange = (val: string) => {
        // value format is "provider:modelId"
        const parts = val.split(':');
        if (parts.length >= 2) {
            const newProvider = parts[0] as ProviderOption;
            const newModel = parts.slice(1).join(':') as ModelOption; // Join back in case model ID has colons
            
            setProvider(newProvider);
            setModel(newModel);
        }
    };

    // Construct current value for Select
    const currentSelectValue = `${provider}:${model}`;

    return (
        <div className="space-y-4 md:space-y-6">
            {/* Model Selection (Grouped) */}
            <Select
                label={t.model}
                value={currentSelectValue}
                onChange={onModelChange}
                options={modelOptions}
                icon={<Cpu className="w-5 h-5" />}
            />

            {/* Aspect Ratio */}
            <Select
                label={t.aspectRatio}
                value={aspectRatio}
                onChange={(val) => setAspectRatio(val as AspectRatioOption)}
                options={aspectRatioOptions}
            />

            {/* Advanced Settings */}
            <div className="border-t border-white/5 pt-4">
                <button
                    type="button"
                    onClick={() => setIsAdvancedOpen(!isAdvancedOpen)}
                    className="flex items-center justify-between w-full text-left text-white/60 hover:text-purple-400 transition-colors group"
                >
                    <span className="text-sm font-medium flex items-center gap-2">
                        <Settings className="w-4 h-4 group-hover:rotate-45 transition-transform duration-300" />
                        {t.advancedSettings}
                    </span>
                    {isAdvancedOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>

                <div className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${isAdvancedOpen ? 'grid-rows-[1fr] mt-4' : 'grid-rows-[0fr]'}`}>
                    <div className="overflow-hidden">
                        <div className="space-y-5">
                            {/* Steps - Hide if not configured in custom model */}
                            {activeConfig.steps && (
                                <div className="group">
                                    <div className="flex items-center justify-between pb-2">
                                        <p className="text-white/80 text-sm font-medium">{t.steps}</p>
                                        <span className="text-white/50 text-xs bg-white/5 px-2 py-0.5 rounded font-mono">{steps}</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <input
                                            type="range"
                                            min={activeConfig.steps.min}
                                            max={activeConfig.steps.max}
                                            value={steps}
                                            onChange={(e) => setSteps(Number(e.target.value))}
                                            className="custom-range text-purple-500"
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Guidance Scale - Hide if not configured in custom model (or standard model doesn't support it) */}
                            {activeConfig.guidance && (
                                <div className="group">
                                    <div className="flex items-center justify-between pb-2">
                                        <p className="text-white/80 text-sm font-medium">{t.guidanceScale}</p>
                                        <span className="text-white/50 text-xs bg-white/5 px-2 py-0.5 rounded font-mono">{guidanceScale.toFixed(1)}</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <input
                                            type="range"
                                            min={activeConfig.guidance.min}
                                            max={activeConfig.guidance.max}
                                            step={activeConfig.guidance.step || 0.1}
                                            value={guidanceScale}
                                            onChange={(e) => setGuidanceScale(Number(e.target.value))}
                                            className="custom-range text-purple-500"
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Image Size (Resolution) - Only for OpenRouter models that support it */}
                            {activeConfig.imageSize && (
                                <div className="group">
                                    <div className="flex items-center justify-between pb-2">
                                        <p className="text-white/80 text-sm font-medium">{t.imageSize || 'Resolution'}</p>
                                        <span className="text-white/50 text-xs bg-white/5 px-2 py-0.5 rounded font-mono">{imageSize}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {activeConfig.imageSize.options.map((size) => (
                                            <button
                                                key={size}
                                                type="button"
                                                onClick={() => setImageSize(size)}
                                                className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                                                    imageSize === size
                                                        ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30'
                                                        : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'
                                                }`}
                                            >
                                                {size}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Seed */}
                            <div className="group">
                                <div className="flex items-center justify-between pb-2">
                                    <p className="text-white/80 text-sm font-medium">{t.seed}</p>
                                    <span className="text-white/40 text-xs">{t.seedOptional}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="flex flex-1 items-center rounded-lg border border-white/10 bg-white/5 focus-within:ring-2 focus-within:ring-purple-500/50 focus-within:border-purple-500 transition-all h-10 overflow-hidden">
                                        <button
                                            onClick={() => handleAdjustSeed(-1)}
                                            className="h-full px-2 text-white/40 hover:text-white hover:bg-white/5 transition-colors border-r border-white/5"
                                        >
                                            <Minus className="w-3.5 h-3.5" />
                                        </button>
                                        <input
                                            type="number"
                                            value={seed}
                                            onChange={(e) => setSeed(e.target.value)}
                                            className="form-input flex-1 h-full bg-transparent border-none text-white/90 focus:ring-0 placeholder:text-white/30 px-2 text-xs font-mono text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                            placeholder={t.seedPlaceholder}
                                        />
                                        <button
                                            onClick={() => handleAdjustSeed(1)}
                                            className="h-full px-2 text-white/40 hover:text-white hover:bg-white/5 transition-colors border-l border-white/5"
                                        >
                                            <Plus className="w-3.5 h-3.5" />
                                        </button>
                                    </div>

                                    <Tooltip content={t.seedPlaceholder}>
                                        <button
                                            onClick={handleRandomizeSeed}
                                            className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-lg bg-white/10 text-white/60 hover:bg-white/20 hover:text-white transition-colors active:scale-95"
                                        >
                                            <Dices className="w-4 h-4" />
                                        </button>
                                    </Tooltip>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
