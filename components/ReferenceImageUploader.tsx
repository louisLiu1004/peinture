
import React, { useRef } from 'react';
import { Plus, X, Pencil } from 'lucide-react';
import { Tooltip } from './Tooltip';

interface ReferenceImageUploaderProps {
    images: string[];  // base64 format images array
    setImages: (images: string[]) => void;
    onEditImage: (index: number) => void;  // Open edit modal
    t: any;  // Translation object
    maxImages?: number;  // Default 4
    disabled?: boolean;
}

export const ReferenceImageUploader: React.FC<ReferenceImageUploaderProps> = ({
    images,
    setImages,
    onEditImage,
    t,
    maxImages = 4,
    disabled = false
}) => {
    const fileInputRefs = useRef<(HTMLInputElement | null)[]>([]);

    const handleFileSelect = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Validate file type
        if (!file.type.startsWith('image/')) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const base64 = event.target?.result as string;
            const newImages = [...images];
            // If this slot has an image, replace it; otherwise add to the array
            if (index < images.length) {
                newImages[index] = base64;
            } else {
                newImages.push(base64);
            }
            setImages(newImages);
        };
        reader.readAsDataURL(file);

        // Reset input for re-upload
        e.target.value = '';
    };

    const handleRemove = (index: number) => {
        const newImages = images.filter((_, i) => i !== index);
        setImages(newImages);
    };

    const handleSlotClick = (index: number) => {
        if (disabled) return;
        if (index < images.length) {
            // Has image - do not trigger upload on slot click
            return;
        }
        // Empty slot - trigger upload
        fileInputRefs.current[index]?.click();
    };

    // Render slots: show images first, then empty slots up to maxImages
    const slots = [];
    for (let i = 0; i < maxImages; i++) {
        const hasImage = i < images.length;
        slots.push(
            <div
                key={i}
                className="relative aspect-square group"
            >
                {/* Hidden file input */}
                <input
                    ref={(el) => fileInputRefs.current[i] = el}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleFileSelect(i, e)}
                    disabled={disabled}
                />

                {hasImage ? (
                    // Image slot
                    <div className="relative w-full h-full rounded-lg overflow-hidden border border-white/10 bg-white/5">
                        <img
                            src={images[i]}
                            alt={`Reference ${i + 1}`}
                            className="w-full h-full object-cover"
                        />

                        {/* Hover overlay with actions */}
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                            {/* Edit button */}
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onEditImage(i);
                                }}
                                className="p-2 rounded-full bg-white/10 hover:bg-purple-500/50 text-white transition-all"
                                disabled={disabled}
                            >
                                <Pencil className="w-4 h-4" />
                            </button>

                            {/* Remove button */}
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleRemove(i);
                                }}
                                className="p-2 rounded-full bg-white/10 hover:bg-red-500/50 text-white transition-all"
                                disabled={disabled}
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                ) : (
                    // Empty slot
                    <button
                        onClick={() => handleSlotClick(i)}
                        disabled={disabled}
                        className="w-full h-full rounded-lg border-2 border-dashed border-white/20 hover:border-purple-500/50 bg-white/[0.02] hover:bg-white/[0.05] transition-all flex flex-col items-center justify-center gap-1 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Plus className="w-5 h-5 text-white/40" />
                        <span className="text-[10px] text-white/40">{t.upload_ref_image || 'Add'}</span>
                    </button>
                )}
            </div>
        );
    }

    return (
        <div className="w-full mb-4">
            <div className="flex items-center gap-2 mb-2">
                <label className="text-white/60 text-sm font-medium">
                    {t.ref_images || 'Reference Images'}
                </label>
                <span className="text-white/30 text-xs">
                    ({images.length}/{maxImages})
                </span>
            </div>
            <div className="grid grid-cols-4 gap-2">
                {slots}
            </div>
        </div>
    );
};
