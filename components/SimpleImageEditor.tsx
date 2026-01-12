
import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
    Hand,
    Brush,
    Eraser,
    Square,
    Undo2,
    Redo2,
    X,
    Check,
    ZoomIn,
    ZoomOut,
    RotateCcw
} from 'lucide-react';
import { Tooltip } from './Tooltip';

interface SimpleImageEditorProps {
    image: string;  // base64 image to edit
    onSave: (editedImage: string) => void;  // Save callback with edited base64 image
    onClose: () => void;
    t: any;
}

type ToolType = 'move' | 'brush' | 'eraser' | 'rect';

export const SimpleImageEditor: React.FC<SimpleImageEditorProps> = ({
    image,
    onSave,
    onClose,
    t
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const snapshotRef = useRef<ImageData | null>(null);
    const lastTouchDistance = useRef<number | null>(null);

    // Image State
    const [imageElement, setImageElement] = useState<HTMLImageElement | null>(null);

    // History State
    const [historyStates, setHistoryStates] = useState<ImageData[]>([]);
    const [historyIndex, setHistoryIndex] = useState(-1);

    // Tool State
    const [activeTool, setActiveTool] = useState<ToolType>('brush');
    const [brushColor, setBrushColor] = useState('#60A5FA');

    // Transform State
    const [scale, setScale] = useState<number>(1);
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [isDrawing, setIsDrawing] = useState(false);
    const [lastPosition, setLastPosition] = useState({ x: 0, y: 0 });
    const [startPosition, setStartPosition] = useState({ x: 0, y: 0 });

    // Determine Platform for Shortcuts
    const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0;

    // Load image on mount
    useEffect(() => {
        const img = new Image();
        img.onload = () => {
            setImageElement(img);
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
                // Center and fit image
                const { width: contW, height: contH } = containerRef.current.getBoundingClientRect();
                const scaleH = (contH - 40) / img.height;  // Leave space for toolbar
                const scaleW = (contW - 40) / img.width;
                const newScale = Math.min(scaleH, scaleW, 1);
                setScale(newScale);
                setOffset({
                    x: (contW - img.width * newScale) / 2,
                    y: (contH - img.height * newScale) / 2
                });
            }
        };
        img.src = image;
    }, [image]);

    // History Management
    const saveToHistory = useCallback((ctx: CanvasRenderingContext2D, width: number, height: number) => {
        const imageData = ctx.getImageData(0, 0, width, height);
        const newHistory = historyStates.slice(0, historyIndex + 1);
        newHistory.push(imageData);
        if (newHistory.length > 20) {
            newHistory.shift();
        } else {
            setHistoryIndex(newHistory.length - 1);
        }
        setHistoryStates(newHistory);
    }, [historyStates, historyIndex]);

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

    // Zoom functions
    const zoomIn = useCallback(() => {
        setScale(prev => Math.min(prev * 1.1, 10));
    }, []);

    const zoomOut = useCallback(() => {
        setScale(prev => Math.max(prev * 0.9, 0.1));
    }, []);

    const zoomReset = useCallback(() => {
        if (imageElement && containerRef.current) {
            const { width: contW, height: contH } = containerRef.current.getBoundingClientRect();
            const scaleH = (contH - 40) / imageElement.height;
            const scaleW = (contW - 40) / imageElement.width;
            const newScale = Math.min(scaleH, scaleW, 1);
            setScale(newScale);
            setOffset({
                x: (contW - imageElement.width * newScale) / 2,
                y: (contH - imageElement.height * newScale) / 2
            });
        }
    }, [imageElement]);

    // Wheel zoom
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

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const isMod = isMac ? e.metaKey : e.altKey;
            const target = e.target as HTMLElement;
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

            if (e.key === 'Escape') {
                onClose();
                return;
            }

            if (isMod) {
                if (e.key === 'z' || e.key === 'Z') {
                    e.preventDefault();
                    if (e.shiftKey) handleRedo();
                    else handleUndo();
                }
            }

            switch (e.key.toLowerCase()) {
                case 'm':
                case '0':
                    e.preventDefault();
                    setActiveTool(prev => prev === 'move' ? 'brush' : 'move');
                    break;
                case 'd':
                case '1':
                    e.preventDefault();
                    setActiveTool('brush');
                    break;
                case 'r':
                case '2':
                    e.preventDefault();
                    setActiveTool('rect');
                    break;
                case 'e':
                case '3':
                    e.preventDefault();
                    setActiveTool('eraser');
                    break;
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isMac, handleUndo, handleRedo, onClose]);

    // Canvas drawing functions
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

    const getDynamicLineWidth = (baseSize: number) => baseSize / scale;

    const handleMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
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
                ctx.strokeStyle = brushColor;
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
                ctx.strokeStyle = brushColor;
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

    // Touch handlers for pinch zoom
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

    // Save handler
    const handleSave = () => {
        if (!imageElement || !canvasRef.current) return;

        // Create merged canvas
        const mergedCanvas = document.createElement('canvas');
        mergedCanvas.width = imageElement.naturalWidth;
        mergedCanvas.height = imageElement.naturalHeight;
        const ctx = mergedCanvas.getContext('2d');
        if (!ctx) return;

        // Draw original image
        ctx.drawImage(imageElement, 0, 0);
        // Draw canvas layer (drawings) on top
        ctx.drawImage(canvasRef.current, 0, 0);

        // Convert to base64
        const editedBase64 = mergedCanvas.toDataURL('image/png');
        onSave(editedBase64);
    };

    const tools = [
        { id: 'move', icon: Hand, label: t.tool_move || 'Move', shortcut: 'M' },
        { id: 'brush', icon: Brush, label: t.tool_brush || 'Brush', shortcut: '1' },
        { id: 'rect', icon: Square, label: t.tool_rect || 'Rectangle', shortcut: '2' },
        { id: 'eraser', icon: Eraser, label: t.tool_eraser || 'Eraser', shortcut: '3' },
    ];

    return (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-xl flex flex-col animate-in fade-in duration-200">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-[#0D0B14]">
                <h2 className="text-white font-medium text-lg">
                    {t.ref_image_editor_title || 'Edit Reference Image'}
                </h2>
                <div className="flex items-center gap-2">
                    <button
                        onClick={onClose}
                        className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-all"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>
            </div>

            {/* Main Editor Area */}
            <div
                ref={containerRef}
                className="flex-1 relative overflow-hidden bg-[#0D0B14]"
                style={{
                    backgroundImage: 'radial-gradient(circle, #333 1px, transparent 1px)',
                    backgroundSize: '20px 20px'
                }}
            >
                {/* Canvas Layer */}
                <div
                    className="absolute inset-0 origin-top-left touch-none"
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
                >
                    {imageElement && (
                        <img
                            src={imageElement.src}
                            alt="Background Layer"
                            className="absolute top-0 left-0 pointer-events-none select-none shadow-2xl"
                            style={{ width: imageElement.width, height: imageElement.height, maxWidth: 'none' }}
                            draggable={false}
                        />
                    )}
                    <canvas
                        ref={canvasRef}
                        className={`relative z-10 ${activeTool === 'move' ? 'cursor-grab active:cursor-grabbing' : 'cursor-crosshair'}`}
                    />
                </div>
            </div>

            {/* Bottom Toolbar */}
            <div className="flex items-center justify-between px-4 py-3 border-t border-white/10 bg-[#0D0B14]">
                {/* Left: Tools */}
                <div className="flex items-center gap-1 bg-white/5 rounded-xl p-1">
                    {tools.map((tool) => (
                        <Tooltip key={tool.id} content={`${tool.label} (${tool.shortcut})`}>
                            <button
                                onClick={() => setActiveTool(tool.id as ToolType)}
                                className={`p-2.5 rounded-lg transition-all ${activeTool === tool.id
                                        ? 'bg-purple-500/30 text-purple-300'
                                        : 'text-white/60 hover:text-white hover:bg-white/10'
                                    }`}
                            >
                                <tool.icon className="w-5 h-5" />
                            </button>
                        </Tooltip>
                    ))}

                    <div className="w-px h-6 bg-white/10 mx-1" />

                    {/* Color Picker */}
                    <Tooltip content={t.tool_color || 'Color'}>
                        <label className="relative p-2.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-all cursor-pointer">
                            <div
                                className="w-5 h-5 rounded-full border-2 border-white/40"
                                style={{ backgroundColor: brushColor }}
                            />
                            <input
                                type="color"
                                value={brushColor}
                                onChange={(e) => setBrushColor(e.target.value)}
                                className="absolute inset-0 opacity-0 cursor-pointer"
                            />
                        </label>
                    </Tooltip>
                </div>

                {/* Center: Zoom Controls */}
                <div className="flex items-center gap-1 bg-white/5 rounded-xl p-1">
                    <Tooltip content={t.zoom_out || 'Zoom Out'}>
                        <button onClick={zoomOut} className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-all">
                            <ZoomOut className="w-4 h-4" />
                        </button>
                    </Tooltip>
                    <span className="px-2 text-white/60 text-sm font-mono min-w-[50px] text-center">
                        {Math.round(scale * 100)}%
                    </span>
                    <Tooltip content={t.zoom_in || 'Zoom In'}>
                        <button onClick={zoomIn} className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-all">
                            <ZoomIn className="w-4 h-4" />
                        </button>
                    </Tooltip>
                    <Tooltip content={t.zoom_reset || 'Reset View'}>
                        <button onClick={zoomReset} className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-all">
                            <RotateCcw className="w-4 h-4" />
                        </button>
                    </Tooltip>
                </div>

                {/* Right: Undo/Redo + Save */}
                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 bg-white/5 rounded-xl p-1">
                        <Tooltip content={t.undo || 'Undo'}>
                            <button
                                onClick={handleUndo}
                                disabled={historyIndex <= 0}
                                className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                                <Undo2 className="w-4 h-4" />
                            </button>
                        </Tooltip>
                        <Tooltip content={t.redo || 'Redo'}>
                            <button
                                onClick={handleRedo}
                                disabled={historyIndex >= historyStates.length - 1}
                                className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                                <Redo2 className="w-4 h-4" />
                            </button>
                        </Tooltip>
                    </div>

                    <button
                        onClick={handleSave}
                        className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-medium transition-all"
                    >
                        <Check className="w-4 h-4" />
                        {t.save_and_close || 'Save'}
                    </button>
                </div>
            </div>
        </div>
    );
};
