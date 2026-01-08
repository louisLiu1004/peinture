
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
    Hand, 
    Brush, 
    Eraser, 
    Square, 
    Undo2, 
    ImagePlus, 
    Sparkles, 
    ArrowRight,
    Upload,
    X, 
    LogOut,
    Keyboard,
    Minus,
    Plus,
    Loader2,
    Image as ImageIcon,
    AlignCenter,
    Download,
    ChevronDown,
    RotateCcw,
    LoaderCircle,
    Clock,
    History,
    Paintbrush,
    CloudUpload,
    Cloud
} from 'lucide-react';
import { Tooltip } from './Tooltip';
import { editImageQwen } from '../services/hfService';
import { editImageGitee, optimizePromptGitee } from '../services/giteeService';
import { editImageMS, optimizePromptMS } from '../services/msService';
import { editImageCustom, optimizePromptCustom } from '../services/customService';
import { editImageOpenRouter } from '../services/openrouterService';
import { optimizeEditPrompt, getEditModelConfig, getCustomProviders, fetchBlob, downloadImage, getTextModelConfig } from '../services/utils';
import { isStorageConfigured, listCloudFiles, fetchCloudBlob, getStorageType } from '../services/storageService';
import { ProviderOption, GeneratedImage, CloudFile } from '../types';
import { PROVIDER_OPTIONS } from '../constants';
import { ImageComparison } from './ImageComparison';

interface ImageEditorProps {
    t: any;
    provider: ProviderOption;
    setProvider: (p: ProviderOption) => void;
    onOpenSettings: () => void;
    history: GeneratedImage[];
    handleUploadToS3?: (blob: Blob, fileName: string, metadata?: any) => Promise<void>;
    isUploading?: boolean;
}

type ToolType = 'select' | 'move' | 'brush' | 'eraser' | 'rect';

export const ImageEditor: React.FC<ImageEditorProps> = ({ t, provider, setProvider, onOpenSettings, history, handleUploadToS3, isUploading }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const snapshotRef = useRef<ImageData | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const abortControllerRef = useRef<AbortController | null>(null);
    const activeObjectUrlRef = useRef<string | null>(null);
    
    // Core State
    const [image, setImage] = useState<HTMLImageElement | null>(null);
    const [historyStates, setHistoryStates] = useState<ImageData[]>([]);
    const [historyIndex, setHistoryIndex] = useState(-1);

    // UI State
    const [isDragOver, setIsDragOver] = useState(false);
    const [showExitDialog, setShowExitDialog] = useState(false);
    const [showShortcuts, setShowShortcuts] = useState(false);
    const [showHistoryModal, setShowHistoryModal] = useState(false);
    const [showGalleryModal, setShowGalleryModal] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [generatedResult, setGeneratedResult] = useState<string | null>(null);
    const [elapsedTime, setElapsedTime] = useState(0);
    const [isOptimizing, setIsOptimizing] = useState(false);
    
    // NSFW State
    const [isSourceNSFW, setIsSourceNSFW] = useState(false);
    
    // Gallery State
    const [galleryFiles, setGalleryFiles] = useState<CloudFile[]>([]);
    const [galleryLoading, setGalleryLoading] = useState(false);
    const [galleryLimit, setGalleryLimit] = useState(20);
    const [galleryLocalUrls, setGalleryLocalUrls] = useState<Record<string, string>>({});

    // Storage Check
    const [isStorageEnabled, setIsStorageEnabled] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);

    useEffect(() => {
        const checkStorage = () => {
            setIsStorageEnabled(isStorageConfigured());
        };
        checkStorage();
        window.addEventListener('storage', checkStorage);
        const interval = setInterval(checkStorage, 2000);
        return () => {
            window.removeEventListener('storage', checkStorage);
            clearInterval(interval);
        };
    }, []);

    // Load Gallery Files when modal opens
    useEffect(() => {
        if (showGalleryModal && isStorageEnabled) {
            const loadGallery = async () => {
                setGalleryLoading(true);
                try {
                    const files = await listCloudFiles();
                    // Filter images only and sort by date
                    const images = files
                        .filter(f => f.type === 'image')
                        .sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());
                    setGalleryFiles(images);
                } catch (e: any) {
                    // Outputting system error messages is prohibited.
                    console.error("Failed to load gallery files");
                } finally {
                    setGalleryLoading(false);
                }
            };
            loadGallery();
        }
    }, [showGalleryModal, isStorageEnabled]);

    // WebDAV Preloading Logic for Gallery Modal (Consistent with CloudGallery)
    useEffect(() => {
        if (!showGalleryModal || getStorageType() !== 'webdav') return;
        
        let isCancelled = false;
        const visibleFiles = galleryFiles.slice(0, galleryLimit);

        const loadImagesSequentially = async () => {
            for (const file of visibleFiles) {
                if (isCancelled) break;
                if (galleryLocalUrls[file.key]) continue;

                try {
                    const blob = await fetchCloudBlob(file.url);
                    if (!isCancelled) {
                        const url = URL.createObjectURL(blob);
                        setGalleryLocalUrls(prev => ({ ...prev, [file.key]: url }));
                    }
                } catch (error: any) {
                    // Outputting system error messages is prohibited.
                    console.error(`Failed to load WebDAV image: ${file.key}`);
                }
            }
        };

        if (visibleFiles.length > 0) {
            loadImagesSequentially();
        }

        return () => { isCancelled = true; };
    }, [showGalleryModal, galleryFiles, galleryLimit]);

    // Cleanup ObjectURLs on unmount
    useEffect(() => {
        return () => {
            Object.keys(galleryLocalUrls).forEach(key => {
                URL.revokeObjectURL(galleryLocalUrls[key]);
            });
            if (activeObjectUrlRef.current) {
                URL.revokeObjectURL(activeObjectUrlRef.current);
            }
        };
    }, []);

    // Initialize provider from unified config
    useEffect(() => {
        const config = getEditModelConfig();
        if (config.provider) {
            setProvider(config.provider as ProviderOption);
        }
    }, []);

    // Context Menu State
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number } | null>(null);

    // Tool State
    const [activeTool, setActiveTool] = useState<ToolType>('move');
    const [systemColor, setSystemColor] = useState<string>('#60A5FA'); // Default Light Blue (blue-400)
    
    // Transform State
    const [scale, setScale] = useState<number>(1);
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [isDrawing, setIsDrawing] = useState(false);
    const [lastPosition, setLastPosition] = useState({ x: 0, y: 0 });
    const [startPosition, setStartPosition] = useState({ x: 0, y: 0 });
    
    // Touch Zoom State
    const lastTouchDistance = useRef<number | null>(null);

    // AI Command State
    const [command, setCommand] = useState('');
    const [attachedImages, setAttachedImages] = useState<string[]>([]);

    // Determine Platform for Shortcuts
    const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const MOD_KEY = isMac ? 'Cmd' : 'Alt'; 

    // Timer Logic
    useEffect(() => {
        let interval: ReturnType<typeof setInterval>;
        if (isGenerating) {
            setElapsedTime(0);
            const startTime = Date.now();
            interval = setInterval(() => {
                setElapsedTime((Date.now() - startTime) / 1000);
            }, 100);
        }
        return () => {
            if (interval) clearInterval(interval);
        };
    }, [isGenerating]);

    // Clean up AbortController on unmount
    useEffect(() => {
        return () => {
            abortControllerRef.current?.abort();
        };
    }, []);

    // Helper to cleanup active object URL
    const cleanupActiveObjectUrl = () => {
        if (activeObjectUrlRef.current) {
            URL.revokeObjectURL(activeObjectUrlRef.current);
            activeObjectUrlRef.current = null;
        }
    };

    // --- History Management ---
    
    const saveToHistory = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
        const imageData = ctx.getImageData(0, 0, width, height);
        const newHistory = historyStates.slice(0, historyIndex + 1);
        newHistory.push(imageData);
        if (newHistory.length > 20) {
            newHistory.shift();
        } else {
            setHistoryIndex(newHistory.length - 1);
        }
        setHistoryStates(newHistory);
    };

    const handleUndo = useCallback(() => {
        if (historyIndex > 0 && canvasRef.current) {
            const newIndex = historyIndex - 1;
            setHistoryIndex(newIndex);
            const ctx = canvasRef.current.getContext('2d');
            if (ctx) {
                ctx.putImageData(historyStates[newIndex], 0, 0);
            }
        }
    }, [historyStates, historyIndex]);

    const handleRedo = useCallback(() => {
        if (historyIndex < historyStates.length - 1 && canvasRef.current) {
            const newIndex = historyIndex + 1;
            setHistoryIndex(newIndex);
            const ctx = canvasRef.current.getContext('2d');
            if (ctx) {
                ctx.putImageData(historyStates[newIndex], 0, 0);
            }
        }
    }, [historyStates, historyIndex]);

    const processFile = useCallback((file: File) => {
        if (!file.type.startsWith('image/')) return;
        setIsSourceNSFW(file.name.toUpperCase().includes('.NSFW'));
        
        // Cleanup previous Blob URL if exists
        cleanupActiveObjectUrl();

        const objectUrl = URL.createObjectURL(file);
        activeObjectUrlRef.current = objectUrl;

        const img = new Image();
        // Remove crossOrigin setting for local blob URLs to avoid CORS issues
        img.onload = () => {
            setImage(img);
            setGeneratedResult(null);
            if (canvasRef.current && containerRef.current) {
                 canvasRef.current.width = img.width;
                 canvasRef.current.height = img.height;
                 const ctx = canvasRef.current.getContext('2d');
                 if (ctx) {
                     ctx.clearRect(0, 0, img.width, img.height);
                     const initialData = ctx.getImageData(0, 0, img.width, img.height);
                     setHistoryStates([initialData]); 
                     setHistoryIndex(0);
                 }
                 const { width: contW, height: contH } = containerRef.current.getBoundingClientRect();
                 const scaleH = contH / img.height;
                 const scaleW = contW / img.width;
                 const newScale = Math.min(scaleH, scaleW, 1);
                 setScale(newScale);
                 setOffset({
                     x: (contW - img.width * newScale) / 2,
                     y: (contH - img.height * newScale) / 2
                 });
            }
        };
        img.onerror = () => {
            console.error("Failed to load image from file");
            cleanupActiveObjectUrl();
        };
        img.src = objectUrl;
    }, []);

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            processFile(e.target.files[0]);
            e.target.value = '';
        }
    };

    const loadEditorImage = async (url: string) => {
        try {
            // Use unified fetchBlob to handle potential CORS issues via proxy fallback
            const blob = await fetchBlob(url);
            
            // Cleanup previous active URL
            cleanupActiveObjectUrl();

            const objectUrl = URL.createObjectURL(blob);
            activeObjectUrlRef.current = objectUrl;
            
            const img = new Image();
            // Removed crossOrigin = 'anonymous' for blob URLs created locally to prevent loading issues
            
            img.onload = () => {
                setImage(img);
                setGeneratedResult(null);
                setCommand('');
                setAttachedImages([]);
                if (canvasRef.current && containerRef.current) {
                     canvasRef.current.width = img.width;
                     canvasRef.current.height = img.height;
                     const ctx = canvasRef.current.getContext('2d');
                     if (ctx) {
                         ctx.clearRect(0, 0, img.width, img.height);
                         try {
                            const initialData = ctx.getImageData(0, 0, img.width, img.height);
                            setHistoryStates([initialData]); 
                            setHistoryIndex(0);
                         } catch (e: any) {
                            console.error("Failed to read image data (CORS restriction):");
                            setHistoryStates([]);
                            setHistoryIndex(-1);
                         }
                     }
                     const { width: contW, height: contH } = containerRef.current.getBoundingClientRect();
                     const scaleH = contH / img.height;
                     const scaleW = contW / img.width;
                     const newScale = Math.min(scaleH, scaleW, 1);
                     setScale(newScale);
                     setOffset({
                         x: (contW - img.width * newScale) / 2,
                         y: (contH - img.height * newScale) / 2
                     });
                }
                // Do NOT revoke object URL immediately to allow React render to use it
            };
            img.onerror = () => {
                console.error("Failed to load image via object URL:", url);
                cleanupActiveObjectUrl();
                alert(t.error_api_connection || "Failed to load image");
            };
            img.src = objectUrl;
        } catch (e: any) {
            console.error("Failed to fetch image for editor:", e);
            alert(t.error_api_connection || "Failed to fetch image");
        }
    };

    const handleHistorySelect = (historyItem: GeneratedImage) => {
        setIsSourceNSFW(!!historyItem.isBlurred);
        loadEditorImage(historyItem.url);
        setShowHistoryModal(false);
    };

    const handleGallerySelect = (file: CloudFile) => {
        setIsSourceNSFW(file.key.toUpperCase().includes('.NSFW'));
        // Use local blob URL if available (WebDAV), otherwise use file.url directly
        const urlToUse = galleryLocalUrls[file.key] || file.url;
        loadEditorImage(urlToUse);
        setShowGalleryModal(false);
    };

    const handleExit = () => {
        cleanupActiveObjectUrl();
        setImage(null);
        setHistoryStates([]);
        setHistoryIndex(-1);
        setCommand('');
        setAttachedImages([]);
        setScale(1);
        setOffset({ x: 0, y: 0 });
        setIsSourceNSFW(false);
        setShowExitDialog(false);
        setGeneratedResult(null);
    };

    const zoomIn = useCallback(() => {
        if (!containerRef.current) return;
        const newScale = Math.min(scale * 1.1, 10);
        setScale(newScale);
    }, [scale]);

    const zoomOut = useCallback(() => {
        if (!containerRef.current) return;
        const newScale = Math.max(scale * 0.9, 0.1);
        setScale(newScale);
    }, [scale]);

    const zoomReset = useCallback(() => {
        if (image && containerRef.current) {
             const { width: contW, height: contH } = containerRef.current.getBoundingClientRect();
             const scaleH = contH / image.height;
             const scaleW = contW / image.width;
             const newScale = Math.min(scaleH, scaleW, 1);
             setScale(newScale);
             setOffset({
                 x: (contW - image.width * newScale) / 2,
                 y: (contH - image.height * newScale) / 2
             });
        } else {
            setScale(1);
            setOffset({ x: 0, y: 0 });
        }
    }, [image]);

    const handleCenterView = () => {
        if (image && containerRef.current) {
            const { width: contW, height: contH } = containerRef.current.getBoundingClientRect();
            setOffset({
                x: (contW - image.width * scale) / 2,
                y: (contH - image.height * scale) / 2
            });
        }
        setContextMenu(null);
    };

    const handleWheel = useCallback((e: WheelEvent) => {
        e.preventDefault(); 
        e.stopPropagation(); 
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const cx = rect.width / 2;
        const cy = rect.height / 2;
        const delta = e.deltaY > 0 ? 0.95 : 1.05;
        const newScale = Math.min(Math.max(0.1, scale * delta), 10);
        const newOffsetX = cx - (cx - offset.x) * (newScale / scale);
        const newOffsetY = cy - (cy - offset.y) * (newScale / scale);
        setScale(newScale);
        setOffset({ x: newOffsetX, y: newOffsetY });
    }, [scale, offset]);

    // Attach non-passive wheel listener
    useEffect(() => {
        const container = containerRef.current;
        if (container) {
            container.addEventListener('wheel', handleWheel, { passive: false });
        }
        return () => {
            if (container) {
                container.removeEventListener('wheel', handleWheel);
            }
        };
    }, [handleWheel]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const isMod = isMac ? e.metaKey : e.altKey;
            const target = e.target as HTMLElement;
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
                if (e.key === 'Enter' && e.shiftKey) {
                    e.preventDefault();
                }
                return;
            }
            if (e.key === 'Escape') {
                if (generatedResult) setGeneratedResult(null);
                else if (contextMenu) setContextMenu(null);
                else if (showShortcuts) setShowShortcuts(false);
                else if (showHistoryModal) setShowHistoryModal(false);
                else if (showGalleryModal) setShowGalleryModal(false);
                else if (showExitDialog) setShowExitDialog(false);
                else if (image) setShowExitDialog(true);
                return;
            }
            const key = e.key.toLowerCase();
            if (isMod) {
                switch(key) {
                    case '0':
                        e.preventDefault();
                        zoomReset();
                        break;
                    case 'z':
                        e.preventDefault();
                        if (e.shiftKey) handleRedo();
                        else handleUndo();
                        break;
                }
            } 
            switch(e.key) {
                case '+':
                case '=':
                    if (!isMod) { e.preventDefault(); zoomIn(); }
                    break;
                case '-':
                    if (!isMod) { e.preventDefault(); zoomOut(); }
                    break;
                case '0':
                    if (!isMod) { e.preventDefault(); setActiveTool(prev => prev === 'move' ? 'select' : 'move'); }
                    break;
                case 'm':
                case 'M':
                    if (!isMod) { e.preventDefault(); setActiveTool(prev => prev === 'move' ? 'select' : 'move'); }
                    break;
                case 'd':
                case 'D':
                case '1':
                    if (!isMod) { e.preventDefault(); setActiveTool('brush'); }
                    break;
                case 'r':
                case 'R':
                case '2':
                    if (!isMod) { e.preventDefault(); setActiveTool('rect'); }
                    break;
                case 'e':
                case '3':
                    if (!isMod) { e.preventDefault(); setActiveTool('eraser'); }
                    break;
                case 'c':
                case 'C':
                case '5':
                     if (!isMod) {
                        e.preventDefault();
                        const colorInput = document.getElementById('editor-color-picker');
                        if (colorInput) (colorInput as HTMLElement).click();
                     }
                     break;
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isMac, zoomIn, zoomOut, zoomReset, handleUndo, handleRedo, image, showExitDialog, showShortcuts, showHistoryModal, showGalleryModal, contextMenu, generatedResult]);

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            processFile(e.dataTransfer.files[0]);
        }
    };

    useEffect(() => {
        const handlePaste = (e: ClipboardEvent) => {
            if (e.clipboardData && e.clipboardData.files.length > 0) {
                const file = e.clipboardData.files[0];
                if (file.type.startsWith('image/')) {
                    e.preventDefault();
                    processFile(file);
                }
            }
        };
        window.addEventListener('paste', handlePaste);
        return () => window.removeEventListener('paste', handlePaste);
    }, [processFile]);

    const getCanvasCoordinates = (e: React.MouseEvent | React.TouchEvent) => {
        if (!canvasRef.current) return { x: 0, y: 0 };
        const rect = canvasRef.current.getBoundingClientRect();
        const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
        return {
            x: (clientX - rect.left) * (canvasRef.current.width / rect.width),
            y: (clientY - rect.top) * (canvasRef.current.height / rect.height)
        };
    };

    const getDynamicLineWidth = (baseSize: number) => {
        return baseSize / scale;
    };

    const handleMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
        if (contextMenu) setContextMenu(null);
        if (!canvasRef.current) return;
        const ctx = canvasRef.current.getContext('2d');
        if (!ctx) return;
        const coords = getCanvasCoordinates(e);
        if (activeTool === 'move') {
            setIsDragging(true);
            const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
            const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
            setLastPosition({ x: clientX, y: clientY });
        } else if (['brush', 'eraser', 'rect'].includes(activeTool)) {
            setIsDrawing(true);
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            if (activeTool === 'brush') {
                ctx.globalCompositeOperation = 'source-over';
                ctx.lineWidth = getDynamicLineWidth(2); 
                ctx.strokeStyle = systemColor;
                ctx.beginPath();
                ctx.moveTo(coords.x, coords.y);
            } else if (activeTool === 'eraser') {
                ctx.globalCompositeOperation = 'destination-out';
                ctx.lineWidth = getDynamicLineWidth(16); 
                ctx.beginPath();
                ctx.moveTo(coords.x, coords.y);
            } else if (activeTool === 'rect') {
                ctx.globalCompositeOperation = 'source-over';
                ctx.lineWidth = getDynamicLineWidth(2);
                ctx.strokeStyle = systemColor;
                setStartPosition(coords);
                snapshotRef.current = ctx.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height);
            }
        }
    };

    const handleMouseMove = (e: React.MouseEvent | React.TouchEvent) => {
        if (!canvasRef.current) return;
        if (isDragging && activeTool === 'move') {
            const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
            const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
            const dx = clientX - lastPosition.x;
            const dy = clientY - lastPosition.y;
            setOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
            setLastPosition({ x: clientX, y: clientY });
        } else if (isDrawing) {
             const ctx = canvasRef.current.getContext('2d');
             if (!ctx) return;
             const coords = getCanvasCoordinates(e);
             if (['brush', 'eraser'].includes(activeTool)) {
                 ctx.lineTo(coords.x, coords.y);
                 ctx.stroke();
             } else if (activeTool === 'rect' && snapshotRef.current) {
                 ctx.putImageData(snapshotRef.current, 0, 0);
                 const width = coords.x - startPosition.x;
                 const height = coords.y - startPosition.y;
                 ctx.strokeRect(startPosition.x, startPosition.y, width, height);
             }
        }
    };

    const handleMouseUp = () => {
        setIsDragging(false);
        lastTouchDistance.current = null;
        if (isDrawing) {
            setIsDrawing(false);
            const ctx = canvasRef.current?.getContext('2d');
            if (ctx && canvasRef.current) {
                if (['brush', 'eraser'].includes(activeTool)) {
                     ctx.closePath();
                }
                ctx.globalCompositeOperation = 'source-over'; 
                saveToHistory(ctx, canvasRef.current.width, canvasRef.current.height);
                snapshotRef.current = null;
            }
        }
    };

    const handleTouchStart = (e: React.TouchEvent) => {
        if (e.touches.length === 2) {
            e.preventDefault();
            const dist = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
            lastTouchDistance.current = dist;
        } else {
            handleMouseDown(e);
        }
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (e.touches.length === 2 && lastTouchDistance.current && containerRef.current) {
            e.preventDefault();
            const dist = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
            const delta = dist / lastTouchDistance.current;
            const newScale = Math.min(Math.max(0.1, scale * delta), 10);
            const rect = containerRef.current.getBoundingClientRect();
            const touchCx = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
            const touchCy = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
            const newOffsetX = touchCx - (touchCx - offset.x) * (newScale / scale);
            const newOffsetY = touchCy - (touchCy - offset.y) * (newScale / scale);
            setScale(newScale);
            setOffset({ x: newOffsetX, y: newOffsetY });
            lastTouchDistance.current = dist;
        } else {
            handleMouseMove(e);
        }
    };

    const handleContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        if (image) {
            setContextMenu({ x: e.clientX, y: e.clientY });
        }
    };

    const canvasToBlob = (canvas: HTMLCanvasElement): Promise<Blob> => {
        return new Promise((resolve, reject) => {
            canvas.toBlob((blob) => {
                if (blob) resolve(blob);
                else reject(new Error('Canvas conversion failed'));
            }, 'image/png');
        });
    };

    const dataURLToBlob = (dataurl: string): Blob => {
        const arr = dataurl.split(',');
        const mimeMatch = arr[0].match(/:(.*?);/);
        const mime = mimeMatch ? mimeMatch[1] : 'image/png';
        const bstr = atob(arr[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while(n--){
            u8arr[n] = bstr.charCodeAt(n);
        }
        return new Blob([u8arr], {type:mime});
    };

    const scaleToConstraints = (w: number, h: number, maxVal: number = 2048) => {
        let width = w;
        let height = h;
        const MAX = maxVal;
        const MIN = 256;
        if (width > MAX || height > MAX) {
            const ratio = Math.min(MAX / width, MAX / height);
            width = Math.floor(width * ratio);
            height = Math.floor(height * ratio);
        }
        if (width < MIN || height < MIN) {
            const ratio = Math.max(MIN / width, MIN / height);
            width = Math.ceil(width * ratio);
            height = Math.ceil(height * ratio);
        }
        const normalize = (v: number) => Math.floor(v / 8) * 8;
        return {
            width: normalize(width),
            height: normalize(height),
        };
    };

    const handleRefImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            if (attachedImages.length >= 3) return;
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.onload = (event) => {
                if (event.target?.result) {
                    setAttachedImages(prev => [...prev, event.target!.result as string]);
                }
            };
            reader.readAsDataURL(file);
        }
    };

    const removeAttachedImage = (index: number) => {
        setAttachedImages(prev => [...prev].filter((_, i) => i !== index));
    };

    const getMergedLayer = (): HTMLCanvasElement | null => {
        if (!image || !canvasRef.current) return null;
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        ctx.drawImage(image, 0, 0);
        ctx.drawImage(canvasRef.current, 0, 0);
        return canvas;
    }

    const handleDownloadResult = async (url: string) => {
        setIsDownloading(true);
        let fileName = `edited_image_${Date.now()}`;
        
        try {
            // Filename prep
            let base = fileName;
            let ext = '.png';
            
            // Check original URL/Blob for details if possible, but unified logic suggests standard download
            if (isSourceNSFW && !base.toUpperCase().endsWith('.NSFW')) {
                base += '.NSFW';
            }
            fileName = base + ext;

            // Use unified download utility
            await downloadImage(url, fileName);

        } catch (e: any) {
            console.error("Download failed", e);
            window.open(url, '_blank');
        } finally {
            setIsDownloading(false);
        }
    };

    const onCloudUpload = async () => {
        if (!generatedResult || !handleUploadToS3) return;
        try {
            // Use unified fetchBlob which handles proxy fallback
            const blob = await fetchBlob(generatedResult);
            // Construct metadata object
            const metadata = {
                prompt: command,
                provider: provider,
                model: 'Qwen-Image-Edit',
                timestamp: Date.now()
            };
            
            // Generate a filename based on timestamp if none
            let fileName = `edited-${Date.now()}`;
            if (isSourceNSFW) {
                fileName += '.NSFW';
            }
            const getExt = (url: string) => new URL(url).pathname.split('.').pop();
            fileName += `.${getExt(generatedResult)}`

            await handleUploadToS3(blob, fileName, metadata);
        } catch (e: any) {
            // Outputting system error messages is prohibited.
            console.error("Failed to prepare blob for upload");
        }
    };

    const handleOptimize = async () => {
        if (!image || !command.trim()) return;
        setIsOptimizing(true);
        try {
            const mergedCanvas = getMergedLayer();
            if (!mergedCanvas) throw new Error("Could not get image data");
            const maxDim = 1024;
            let w = mergedCanvas.width;
            let h = mergedCanvas.height;
            if (w > maxDim || h > maxDim) {
                const ratio = Math.min(maxDim / w, maxDim / h);
                w = Math.round(w * ratio);
                h = Math.round(h * ratio);
            }
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = w;
            tempCanvas.height = h;
            const ctx = tempCanvas.getContext('2d');
            if(ctx) {
                ctx.drawImage(mergedCanvas, 0, 0, w, h);
            }
            const base64 = tempCanvas.toDataURL('image/jpeg', 0.8); 
            
            // NEW LOGIC: Dispatch optimization based on Text Model setting
            const textConfig = getTextModelConfig();
            let optimized = '';

            if (textConfig.provider === 'huggingface') {
                 // Use optimizeEditPrompt (Vision supported via Pollinations) with dynamic model
                 optimized = await optimizeEditPrompt(base64, command, textConfig.model);
            } else if (textConfig.provider === 'gitee') {
                 // Use text-only prompt optimization
                 optimized = await optimizePromptGitee(command);
            } else if (textConfig.provider === 'modelscope') {
                 // Use text-only prompt optimization
                 optimized = await optimizePromptMS(command);
            } else {
                 // Custom Provider
                 const customProviders = getCustomProviders();
                 const activeCustom = customProviders.find(p => p.id === textConfig.provider);
                 if (activeCustom) {
                     // Custom optimization (usually text-only)
                     optimized = await optimizePromptCustom(activeCustom, textConfig.model, command);
                 } else {
                     // Fallback to default Pollinations
                     optimized = await optimizeEditPrompt(base64, command);
                 }
            }

            if (optimized) setCommand(optimized);
        } catch (e: any) {
            // Outputting system error messages is prohibited.
            console.error("Command optimization failed");
        } finally {
            setIsOptimizing(false);
        }
    };

    const handleGenerate = async () => {
        if (isGenerating) {
            abortControllerRef.current?.abort();
            setIsGenerating(false);
            return;
        }
        if (!image || !command.trim()) return;
        setIsGenerating(true);
        const controller = new AbortController();
        abortControllerRef.current = controller;
        try {        
            const maxDimension = 2048;
            const { width, height } = scaleToConstraints(image.naturalWidth, image.naturalHeight, maxDimension);
            const hasDrawings = historyIndex > 0;
            const imageBlobs: Blob[] = [];
            let promptSuffix = `\n${t.prompt_original_image}`;
            let currentImageIndexInAPI = 1;
            // Use fetchBlob for robustness
            const originalBlob = await fetchBlob(image.src);
            imageBlobs.push(originalBlob);
            if (hasDrawings) {
                const mergedCanvas = getMergedLayer();
                if (mergedCanvas) {
                    const mergedBlob = await canvasToBlob(mergedCanvas);
                    imageBlobs.push(mergedBlob);
                    currentImageIndexInAPI++;
                    const editLayerDesc = t.prompt_edit_layer.replace('{n}', currentImageIndexInAPI.toString());
                    promptSuffix += `\n${editLayerDesc}`;
                }
            }
            for (let i = 0; i < attachedImages.length; i++) {
                // attachedImages are dataURLs, fetchBlob handles this fine too
                const refBlob = await fetchBlob(attachedImages[i]);
                imageBlobs.push(refBlob);
                currentImageIndexInAPI++;
                const refNumInUI = i + 1;
                const refDesc = t.prompt_ref_image.replace('{n}', currentImageIndexInAPI.toString()).replace('{i}', refNumInUI.toString());
                promptSuffix += `\n${refDesc}`;
            }
            const finalPrompt = command + promptSuffix;
            let result;

            // Get Configured Edit Model
            const config = getEditModelConfig(); // { provider, model }
            const activeProvider = config.provider;

            if (activeProvider === 'gitee') {
                result = await editImageGitee(imageBlobs, finalPrompt, width, height, 16, 4, controller.signal);
            } else if (activeProvider === 'modelscope') {
                result = await editImageMS(imageBlobs, finalPrompt, width, height, 16, 4, controller.signal);
            } else if (activeProvider === 'huggingface') {
                // Default to HF
                result = await editImageQwen(imageBlobs, finalPrompt, width, height, 4, 1, controller.signal);
            } else if (activeProvider === 'openrouter') {
                // OpenRouter (Gemini models)
                result = await editImageOpenRouter(config.model, imageBlobs, finalPrompt, controller.signal);
            } else {
                // Custom Provider
                const customProviders = getCustomProviders();
                const activeCustom = customProviders.find(p => p.id === activeProvider);
                if (activeCustom) {
                    // Explicitly pass config.model
                    result = await editImageCustom(activeCustom, config.model, imageBlobs, finalPrompt, undefined, undefined, undefined);
                } else {
                    // Fallback to HF if config is stale
                    result = await editImageQwen(imageBlobs, finalPrompt, width, height, 4, 1, controller.signal);
                }
            }
            setGeneratedResult(result.url);
            setIsGenerating(false);
        } catch (e: any) {
            // Outputting system error messages is prohibited.
            if (e.name === 'AbortError') {
                console.log('Generation cancelled by user');
                setIsGenerating(false);
                return;
            }
            console.error("Generation failed");
            setIsGenerating(false);
        } finally {
            abortControllerRef.current = null;
        }
    };

    const handleDownloadExport = async () => {
        const merged = getMergedLayer();
        if (merged) {
            const dataUrl = merged.toDataURL('image/png');
            handleDownloadResult(dataUrl);
        }
        setContextMenu(null);
    };

    const drawingTools = [
        { id: 'brush', icon: Brush, label: t.tool_brush, shortcut: '1' },
        { id: 'rect', icon: Square, label: t.tool_rect, shortcut: '2' },
        { id: 'eraser', icon: Eraser, label: t.tool_eraser, shortcut: '3' },
    ];

    const shortcutsList = [
        { label: t.sc_send, combos: [['Shift', 'Enter']] },
        { label: t.sc_zoom_in, combos: [['+']] },
        { label: t.sc_zoom_out, combos: [['-']] },
        { label: t.sc_reset_view, combos: [[MOD_KEY, '0']] },
        { label: t.sc_move, combos: [['M'], ['0']] },
        { label: t.sc_draw, combos: [['D'], ['1']] },
        { label: t.sc_rect, combos: [['R'], ['2']] },
        { label: t.sc_eraser, combos: [['E'], ['3']] },
        { label: t.sc_undo, combos: [[MOD_KEY, 'Z']] }, 
        { label: t.sc_redo, combos: [[MOD_KEY, 'Shift', 'Z']] },
        { label: t.sc_color, combos: [['C'], ['5']] },
        { label: t.sc_exit, combos: [['ESC']] },
    ];

    const visibleGalleryFiles = galleryFiles.slice(0, galleryLimit);
    const getStorageTypeForGallery = getStorageType();

    return (
        <div className="w-full h-full flex flex-grow flex-col md:max-w-7xl md:mx-auto relative animate-in fade-in duration-300">
            {/* Main Editor Area */}
            <div 
                ref={containerRef}
                onContextMenu={handleContextMenu}
                className="flex-1 w-full relative overflow-hidden bg-[#0D0B14] cursor-crosshair rounded-none border-none md:rounded-xl md:border md:border-white/5"
                style={{ 
                    backgroundImage: 'radial-gradient(circle, #333 1px, transparent 1px)',
                    backgroundSize: '20px 20px'
                }}
            >
                {/* ... (rest of the render is same) */}
                {/* Loading Overlay */}
                {isGenerating && (
                    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
                        <div className="relative">
                            <div className="h-24 w-24 rounded-full border-4 border-white/10 border-t-purple-500 animate-spin"></div>
                            <div className="absolute inset-0 flex items-center justify-center">
                                <Paintbrush className="text-purple-400 animate-pulse w-8 h-8" />
                            </div>
                        </div>
                        <p className="mt-8 text-white/80 font-medium animate-pulse text-lg">
                            {t.dreaming}
                        </p>
                        <p className="mt-2 font-mono text-purple-300 text-lg">{elapsedTime.toFixed(1)}s</p>
                    </div>
                )}

                {!image && (
                    <div  className="absolute z-40 inset-0 flex flex-col items-center justify-center p-6 md:p-12">
                        <div className="w-full max-w-lg space-y-4">
                            
                            {/* Provider selection dropdown removed */}

                            <label
                                className={`cursor-pointer group flex flex-col items-center justify-center w-full h-64 border-2 border-dashed rounded-xl transition-all duration-300 animate-in zoom-in-95 ${
                                    isDragOver 
                                    ? 'border-purple-500 bg-purple-500/10 scale-105' 
                                    : 'border-white/20 bg-white/[0.02] hover:bg-white/[0.05] hover:border-purple-500/50'
                                }`}
                                onDragOver={handleDragOver}
                                onDragLeave={handleDragLeave}
                                onDrop={handleDrop}
                            >
                                <input 
                                    ref={fileInputRef}
                                    type="file" 
                                    accept=".jpg,.jpeg,.png,.webp" 
                                    className="hidden" 
                                    onChange={handleImageUpload}
                                />
                                <div className="mb-6 p-5 rounded-full bg-white/5 group-hover:bg-purple-500/20 group-hover:scale-110 transition-all duration-300 shadow-lg">
                                    <Upload className={`w-10 h-10 transition-colors ${isDragOver ? 'text-purple-400' : 'text-white/40 group-hover:text-purple-400'}`} />
                                </div>
                                <p className="text-white/60 font-medium text-lg group-hover:text-white/90 transition-colors">{t.upload_image_cta}</p>
                                <div className="mt-2 flex items-center gap-2 text-white/30 text-sm font-mono">
                                    <span>JPG, PNG, WebP</span>
                                    <span className="w-1 h-1 rounded-full bg-white/20"></span>
                                </div>
                            </label>

                            <div className="flex gap-4">
                                <button
                                    onClick={() => setShowHistoryModal(true)}
                                    className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-white/10 hover:bg-white/15 text-white/80 hover:text-white border border-white/10 rounded-xl transition-all shadow-lg active:scale-95"
                                >
                                    <History className="w-4 h-4" />
                                    <span className="font-medium text-sm">{t.select_from_history}</span>
                                </button>
                                {isStorageEnabled && (
                                    <button
                                        onClick={() => setShowGalleryModal(true)}
                                        className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-white/10 hover:bg-white/15 text-white/80 hover:text-white border border-white/10 rounded-xl transition-all shadow-lg active:scale-95"
                                    >
                                        <Cloud className="w-4 h-4" />
                                        <span className="font-medium text-sm">{t.select_from_gallery}</span>
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Rest of the component logic remains unchanged */}
                <div 
                    className={`absolute inset-0 origin-top-left touch-none transition-opacity duration-300 ${image ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                    style={{
                        transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
                    }}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                    onTouchStart={handleTouchStart}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleMouseUp}
                    // onWheel logic removed from here, handled via ref
                >
                    {image && (
                        <img 
                            src={image.src} 
                            alt="Background Layer"
                            className="absolute top-0 left-0 pointer-events-none select-none shadow-2xl"
                            style={{ width: image.width, height: image.height, maxWidth: 'none' }}
                            draggable={false}
                        />
                    )}
                    <canvas 
                        ref={canvasRef}
                        className={`relative z-10 ${activeTool === 'move' ? 'cursor-grab active:cursor-grabbing' : (activeTool === 'select' ? 'cursor-default' : 'cursor-crosshair')}`}
                    />
                </div>
                
                {generatedResult && image && (
                    <div className="absolute inset-0 z-50 bg-[#0D0B14] animate-in fade-in duration-300">
                        <div className="relative w-full h-full overflow-hidden">
                             <ImageComparison 
                                beforeImage={image.src} 
                                afterImage={generatedResult} 
                                alt="Comparison" 
                                labelBefore={t.compare_original} 
                                labelAfter={t.compare_edited}
                             />
                             
                             <div className="absolute bottom-6 inset-x-0 flex justify-center pointer-events-none z-40">
                                <div className="pointer-events-auto max-w-[90%] overflow-x-auto scrollbar-hide rounded-2xl bg-black/60 backdrop-blur-md border border-white/10 shadow-2xl animate-in slide-in-from-bottom-4 duration-300">
                                    <div className="flex items-center gap-1 p-1.5 min-w-max">
                                        
                                        {/* Re-edit */}
                                        <Tooltip content={t.re_edit}>
                                            <button
                                                onClick={() => setGeneratedResult(null)}
                                                className="flex items-center justify-center w-10 h-10 rounded-xl text-white/70 hover:text-purple-400 hover:bg-white/10 transition-all"
                                            >
                                                <RotateCcw className="w-5 h-5" />
                                            </button>
                                        </Tooltip>

                                        <div className="w-px h-5 bg-white/10 mx-1"></div>

                                        {/* Upload Button */}
                                        {isStorageEnabled && provider !== 'modelscope' && (
                                            <>
                                                <Tooltip content={isUploading ? t.uploading : t.upload}>
                                                    <button
                                                        onClick={onCloudUpload}
                                                        disabled={isUploading}
                                                        className={`flex items-center justify-center w-10 h-10 rounded-xl transition-all ${isUploading ? 'text-green-400 bg-green-500/10 cursor-not-allowed' : 'text-white/70 hover:text-green-400 hover:bg-white/10'}`}
                                                    >
                                                        {isUploading ? (
                                                            <Loader2 className="w-5 h-5 animate-spin" />
                                                        ) : (
                                                            <CloudUpload className="w-5 h-5" />
                                                        )}
                                                    </button>
                                                </Tooltip>
                                                <div className="w-px h-5 bg-white/10 mx-1"></div>
                                            </>
                                        )}

                                        {/* Download */}
                                        <Tooltip content={t.menu_download}>
                                            <button
                                                onClick={() => handleDownloadResult(generatedResult)}
                                                disabled={isDownloading}
                                                className={`flex items-center justify-center w-10 h-10 rounded-xl transition-all ${isDownloading ? 'text-blue-400 bg-blue-500/10 cursor-not-allowed' : 'text-white/70 hover:text-blue-400 hover:bg-white/10'}`}
                                            >
                                                {isDownloading ? (
                                                    <Loader2 className="w-5 h-5 animate-spin" />
                                                ) : (
                                                    <Download className="w-5 h-5" />
                                                )}
                                            </button>
                                        </Tooltip>

                                        <div className="w-px h-5 bg-white/10 mx-1"></div>

                                        {/* Exit */}
                                        <Tooltip content={t.menu_exit}>
                                            <button
                                                onClick={() => setShowExitDialog(true)}
                                                className="flex items-center justify-center w-10 h-10 rounded-xl text-white/70 hover:text-red-400 hover:bg-red-500/10 transition-all"
                                            >
                                                <LogOut className="w-5 h-5" />
                                            </button>
                                        </Tooltip>
                                    </div>
                                </div>
                             </div>
                        </div>
                    </div>
                )}

                {contextMenu && (
                    <>
                        <div className="fixed inset-0 z-40" onClick={() => setContextMenu(null)} />
                        <div 
                            className="fixed z-50 min-w-[160px] bg-black/60 backdrop-blur-xl border border-white/20 rounded-xl shadow-2xl p-1 animate-in fade-in zoom-in-95 duration-150"
                            style={{ left: contextMenu.x, top: contextMenu.y }}
                        >
                            <button 
                                onClick={() => { setContextMenu(null); fileInputRef.current?.click(); }}
                                className="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium text-white hover:bg-white/10 rounded-lg transition-colors text-left group"
                            >
                                <ImageIcon className="w-4 h-4 text-purple-400 group-hover:scale-110 transition-transform" />
                                {t.menu_replace}
                            </button>
                            <button 
                                onClick={handleCenterView}
                                className="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium text-white hover:bg-white/10 rounded-lg transition-colors text-left group"
                            >
                                <AlignCenter className="w-4 h-4 text-blue-400 group-hover:scale-110 transition-transform" />
                                {t.menu_center}
                            </button>
                            <button 
                                onClick={handleDownloadExport}
                                className="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium text-white hover:bg-white/10 rounded-lg transition-colors text-left group"
                            >
                                <Download className="w-4 h-4 text-green-400 group-hover:scale-110 transition-transform" />
                                {t.menu_download}
                            </button>
                            <div className="h-px bg-white/10 my-1 mx-1" />
                            <button 
                                onClick={() => { setContextMenu(null); setShowExitDialog(true); }}
                                className="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium text-red-400 hover:bg-red-500/10 rounded-lg transition-colors text-left group"
                            >
                                <LogOut className="w-4 h-4 text-red-400 group-hover:scale-110 transition-transform" />
                                {t.menu_exit}
                            </button>
                        </div>
                    </>
                )}

                {image && (
                    <div className="absolute bottom-6 left-6 hidden md:flex items-center gap-1 bg-black/60 backdrop-blur-md border border-white/10 rounded-full text-white/70 shadow-lg z-20">
                        <Tooltip content={t.sc_zoom_out}>
                            <button 
                                onClick={zoomOut}
                                className="p-2 hover:bg-white/10 hover:text-white transition-colors rounded-s-full"
                            >
                                <Minus className="w-4 h-4" />
                            </button>
                        </Tooltip>
                        
                        <Tooltip content={t.sc_reset_view}>
                            <button 
                                onClick={zoomReset}
                                className="p-2 text-xs font-mono min-w-[3rem] text-center outline-none select-none hover:bg-white/10 hover:text-white transition-colors"
                            >
                                {Math.round(scale * 100)}%
                            </button>
                        </Tooltip>

                        <Tooltip content={t.sc_zoom_in}>
                            <button 
                                onClick={zoomIn}
                                className="p-2 hover:bg-white/10 hover:text-white transition-colors rounded-e-full"
                            >
                                <Plus className="w-4 h-4" />
                            </button>
                        </Tooltip>
                    </div>
                )}

                <div className="absolute bottom-6 right-6 hidden md:block z-20">
                    <Tooltip content={t.shortcuts_title} position="left">
                        <button 
                            onClick={() => setShowShortcuts(true)}
                            className="p-2 bg-black/60 backdrop-blur-md border border-white/10 rounded-full text-white/50 hover:text-white hover:bg-white/10 transition-colors shadow-lg"
                        >
                            <Keyboard className="w-5 h-5" />
                        </button>
                    </Tooltip>
                </div>

                <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-0.5 p-1.5 bg-black/60 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl z-30 max-w-[95vw]">
                    <Tooltip content={activeTool === 'move' ? t.tool_select : t.tool_move} position="bottom">
                        <button
                            onClick={() => setActiveTool(activeTool === 'move' ? 'select' : 'move')}
                            className={`p-2 rounded-xl transition-all ${
                                activeTool === 'move' 
                                ? 'bg-purple-600 text-white shadow-lg' 
                                : 'text-white/60 hover:text-white hover:bg-white/10'
                            }`}
                        >
                            <Hand className="w-5 h-5" />
                        </button>
                    </Tooltip>

                    <div className="w-px h-5 bg-white/10 mx-1" />

                    {drawingTools.map((tool) => {
                        const Icon = tool.icon;
                        return (
                            <Tooltip key={tool.id} content={tool.label} position="bottom">
                                <button
                                    onClick={() => setActiveTool(tool.id as ToolType)}
                                    className={`p-2 rounded-xl transition-all ${
                                        activeTool === tool.id 
                                        ? 'bg-purple-600 text-white shadow-lg' 
                                        : 'text-white/60 hover:text-white hover:bg-white/10'
                                    }`}
                                >
                                    <Icon className="w-5 h-5" />
                                </button>
                            </Tooltip>
                        );
                    })}
                    
                    <div className="w-px h-5 bg-white/10 mx-1" />
                    
                    <Tooltip content={t.tool_undo} position="bottom">
                        <button 
                            onClick={handleUndo} 
                            disabled={historyIndex <= 0}
                            className="p-2 text-white/60 hover:text-white hover:bg-white/10 rounded-xl disabled:opacity-30 disabled:cursor-not-allowed group"
                        >
                            <Undo2 className="w-5 h-5" />
                        </button>
                    </Tooltip>

                    <Tooltip content={t.tool_color} position="bottom">
                        <label className="cursor-pointer block relative">
                            <input 
                                id="editor-color-picker"
                                type="color" 
                                value={systemColor} 
                                onChange={(e) => setSystemColor(e.target.value)}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            />
                            <div className="p-2 hover:bg-white/10 rounded-xl transition-colors">
                                <div 
                                    className="w-5 h-5 rounded-full border-2 border-white/20 shadow-sm" 
                                    style={{ backgroundColor: systemColor }}
                                ></div>
                            </div>
                        </label>
                    </Tooltip>

                    <div className="w-px h-5 bg-white/10 mx-1" />
                    
                    <Tooltip content={t.tool_exit} position="bottom">
                         <button 
                            onClick={() => setShowExitDialog(true)}
                            className="p-2 text-white/40 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all"
                        >
                            <LogOut className="w-5 h-5" />
                        </button>
                    </Tooltip>
                </div>

                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-full max-w-2xl px-4 z-30 select-none">
                    <div className="relative flex items-center h-14 pl-2 pr-1.5 bg-black/60 backdrop-blur-xl border border-white/10 rounded-full shadow-2xl shadow-black/40 ring-1 ring-white/5">
                        
                        <div className="flex items-center mr-2">
                             {attachedImages.map((img, idx) => (
                                <Tooltip key={idx} content={t.ref_image_n.replace('{n}', (idx + 1).toString())}>
                                    <div 
                                        className={`relative w-8 h-8 rounded-full overflow-hidden border border-purple-500/50 group flex-shrink-0 bg-[#0D0B14] ${idx > 0 ? '-ml-3' : ''}`} 
                                        style={{ zIndex: 10 + idx }}
                                    >
                                        <div className="w-full h-full relative">
                                            <img src={img} alt={`Ref ${idx}`} className="w-full h-full object-cover" />
                                            <button 
                                                onClick={() => removeAttachedImage(idx)}
                                                className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                            >
                                                <X className="w-3 h-3 text-white" />
                                            </button>
                                        </div>
                                    </div>
                                </Tooltip>
                             ))}
                             
                             {attachedImages.length < 3 && (
                                <div className={`relative flex-shrink-0 ${attachedImages.length > 0 ? 'ml-2' : ''}`} style={{ zIndex: 20 }}>
                                    <input 
                                        type="file" 
                                        id="cmd-image-upload" 
                                        accept=".jpg,.jpeg,.png,.webp" 
                                        className="hidden" 
                                        onChange={handleRefImageSelect}
                                    />
                                    <Tooltip content={t.upload_ref_image}>
                                        <label 
                                            htmlFor="cmd-image-upload"
                                            className="flex items-center justify-center w-8 h-8 rounded-full cursor-pointer transition-all hover:bg-white/10 text-white/50 border border-white/5 hover:border-white/20 hover:text-white"
                                        >
                                            <ImagePlus className="w-4 h-4" />
                                        </label>
                                    </Tooltip>
                                </div>
                             )}
                        </div>

                        <Tooltip content={t.optimize}>
                            <button 
                                onClick={handleOptimize}
                                disabled={isOptimizing || !command.trim()}
                                className="flex items-center justify-center w-8 h-full text-purple-500/80 hover:text-purple-400 disabled:opacity-50 disabled:cursor-not-allowed mr-1 active:scale-90 transition-transform"
                            >
                                {isOptimizing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                            </button>
                        </Tooltip>

                        <input
                            type="text"
                            value={command}
                            onChange={(e) => setCommand(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleGenerate();
                                }
                            }}
                            placeholder={t.editor_placeholder}
                            disabled={isGenerating}
                            className="flex-1 bg-transparent border-0 text-white placeholder:text-white/30 focus:ring-0 h-full text-sm font-medium px-0 min-w-0 disabled:opacity-50"
                        />

                        <button 
                            onClick={handleGenerate}
                            disabled={!image || !command.trim()}
                            className={`
                                flex items-center justify-center gap-1.5 transition-all duration-500 ease-in-out
                                font-bold shadow-lg active:scale-95 ml-2
                                disabled:grayscale disabled:opacity-50
                                ${isGenerating 
                                    ? 'w-11 h-11 rounded-full p-0 flex-shrink-0 bg-white/60 hover:bg-white/80 text-white shadow-white/20 cursor-pointer' 
                                    : 'px-4 py-2 rounded-full flex-shrink-0 generate-button-gradient text-white shadow-purple-900/20'
                                }
                            `}
                        >
                            {isGenerating ? (
                                <div className="relative">
                                    <LoaderCircle className="w-8 h-8 animate-spin" />
                                    <Square className="absolute top-1/2 left-1/2 -mt-1.5 -ml-1.5 w-3 h-3 fill-current" />
                                </div>
                            ) : (
                                <>
                                    <span className="whitespace-nowrap text-sm">{t.editor_generate}</span>
                                    <ArrowRight className="w-4 h-4" />
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>

            {showExitDialog && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-[#1A1625] border border-white/10 rounded-2xl p-6 max-w-sm w-full shadow-2xl animate-in zoom-in-95 duration-200">
                        <h3 className="text-lg font-bold text-white mb-2">{t.exit_dialog_title}</h3>
                        <p className="text-white/60 text-sm mb-6">{t.exit_dialog_desc}</p>
                        <div className="flex justify-end gap-3">
                            <button 
                                onClick={() => setShowExitDialog(false)}
                                className="px-4 py-2 rounded-lg text-white/60 hover:text-white hover:bg-white/5 transition-colors text-sm font-medium"
                            >
                                {t.cancel}
                            </button>
                            <button 
                                onClick={handleExit}
                                className="px-4 py-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 transition-colors text-sm font-medium"
                            >
                                {t.confirm}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* History Modal */}
            {showHistoryModal && (
                <div 
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
                    onClick={() => setShowHistoryModal(false)}
                >
                    <div 
                        className="bg-[#1A1625] border border-white/10 rounded-2xl p-0 max-w-3xl w-[90vw] h-[80vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between p-5 border-b border-white/10 bg-white/5">
                            <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                <History className="w-5 h-5 text-purple-400" />
                                {t.history_modal_title}
                            </h3>
                            <button onClick={() => setShowHistoryModal(false)} className="text-white/40 hover:text-white transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto p-5 custom-scrollbar bg-[#0D0B14]">
                            {history.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-full text-white/30 space-y-4">
                                    <Sparkles className="w-12 h-12 opacity-50" />
                                    <p>{t.no_history_images}</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                                    {history.map((img) => (
                                        <button
                                            key={img.id}
                                            onClick={() => handleHistorySelect(img)}
                                            className="group relative aspect-square rounded-xl overflow-hidden border border-white/10 hover:border-purple-500 transition-all hover:ring-4 hover:ring-purple-500/20 focus:outline-none"
                                        >
                                            <img 
                                                src={img.url} 
                                                alt={img.prompt} 
                                                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                                                loading="lazy"
                                            />
                                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-3">
                                                <p className="text-xs text-white/90 line-clamp-2 text-left">{img.prompt}</p>
                                                <div className="flex items-center gap-2 mt-1 text-[10px] text-white/50">
                                                    <Clock className="w-3 h-3" />
                                                    <span>{new Date(img.timestamp).toLocaleDateString()}</span>
                                                </div>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Gallery Modal */}
            {showGalleryModal && (
                <div 
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
                    onClick={() => setShowGalleryModal(false)}
                >
                    <div 
                        className="bg-[#1A1625] border border-white/10 rounded-2xl p-0 max-w-3xl w-[90vw] h-[80vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between p-5 border-b border-white/10 bg-white/5">
                            <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                <Cloud className="w-5 h-5 text-purple-400" />
                                {t.gallery_modal_title}
                            </h3>
                            <button onClick={() => setShowGalleryModal(false)} className="text-white/40 hover:text-white transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto p-5 custom-scrollbar bg-[#0D0B14]">
                            {galleryLoading ? (
                                <div className="flex flex-col items-center justify-center h-full text-white/30 space-y-4">
                                    <Loader2 className="w-10 h-10 animate-spin" />
                                </div>
                            ) : galleryFiles.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-full text-white/30 space-y-4">
                                    <CloudUpload className="w-12 h-12 opacity-50" />
                                    <p>{t.no_gallery_images}</p>
                                </div>
                            ) : (
                                <>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                                        {visibleGalleryFiles.map((file) => {
                                             const displayUrl = (getStorageTypeForGallery === 'webdav' && galleryLocalUrls[file.key]) 
                                                ? galleryLocalUrls[file.key] 
                                                : (getStorageTypeForGallery !== 'webdav' ? file.url : '');

                                            return (
                                                <button
                                                    key={file.key}
                                                    onClick={() => handleGallerySelect(file)}
                                                    className="group relative aspect-square rounded-xl overflow-hidden border border-white/10 hover:border-purple-500 transition-all hover:ring-4 hover:ring-purple-500/20 focus:outline-none bg-white/5"
                                                >
                                                    {displayUrl ? (
                                                        <img 
                                                            src={displayUrl} 
                                                            alt={file.key} 
                                                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                                                            loading="lazy"
                                                        />
                                                    ) : (
                                                        <div className="flex items-center justify-center w-full h-full">
                                                            <Loader2 className="w-6 h-6 text-white/20 animate-spin" />
                                                        </div>
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>
                                    {galleryLimit < galleryFiles.length && (
                                        <div className="mt-6 flex justify-center">
                                            <button
                                                onClick={() => setGalleryLimit(prev => prev + 20)}
                                                className="px-4 py-2 bg-white/10 hover:bg-white/15 text-white/80 rounded-lg text-sm font-medium transition-colors"
                                            >
                                                {t.load_more}
                                            </button>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {showShortcuts && (
                <div 
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
                    onClick={() => setShowShortcuts(false)}
                >
                    <div 
                        className="bg-[#1A1625] border border-white/10 rounded-2xl p-4 max-w-xl w-full shadow-2xl animate-in zoom-in-95 duration-200"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between mb-6 border-b border-white/10 pb-4">
                            <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                <Keyboard className="w-5 h-5 text-purple-400" />
                                {t.shortcuts_title}
                            </h3>
                            <button onClick={() => setShowShortcuts(false)} className="text-white/40 hover:text-white transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-x-8 gap-y-3">
                            {shortcutsList.map((item, idx) => (
                                <div key={idx} className="flex items-center justify-between text-sm group">
                                    <span className="text-white/60 group-hover:text-white/80 transition-colors">{item.label}</span>
                                    <div className="flex items-center gap-2">
                                        {item.combos.map((combo, comboIdx) => (
                                            <React.Fragment key={comboIdx}>
                                                {comboIdx > 0 && <span className="text-white/30 text-xs">{t.or_conjunction}</span>}
                                                <div className="flex gap-1">
                                                    {combo.map((key, kIdx) => (
                                                        <span key={kIdx} className="px-1.5 py-0.5 rounded bg-white/10 border border-white/10 font-mono text-xs text-white/80 min-w-[20px] text-center">
                                                            {key}
                                                        </span>
                                                    ))}
                                                </div>
                                            </React.Fragment>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
