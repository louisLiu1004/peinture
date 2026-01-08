
import React, { useRef, useState, useEffect, useMemo } from 'react';
import { GeneratedImage } from '../types';
import { ChevronLeft, ChevronRight, Film, Loader2, Layers } from 'lucide-react';

interface HistoryGalleryProps {
  images: GeneratedImage[];
  onSelect: (image: GeneratedImage) => void;
  selectedId?: string;
}

interface GroupedImage {
  type: 'single' | 'group';
  image: GeneratedImage;
  groupImages?: GeneratedImage[];
  groupId?: string;
}

export const HistoryGallery: React.FC<HistoryGalleryProps> = ({ images, onSelect, selectedId }) => {
  // State to track expanded groups
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);

  // Group images by groupId
  const groupedImages = useMemo((): GroupedImage[] => {
    const result: GroupedImage[] = [];
    const processedGroupIds = new Set<string>();

    for (const img of images) {
      if (img.groupId) {
        // Skip if already processed this group
        if (processedGroupIds.has(img.groupId)) continue;
        processedGroupIds.add(img.groupId);

        // Find all images in this group
        const groupImages = images.filter(i => i.groupId === img.groupId);
        
        if (groupImages.length > 1) {
          // Sort by groupIndex
          groupImages.sort((a, b) => (a.groupIndex || 0) - (b.groupIndex || 0));
          result.push({
            type: 'group',
            image: groupImages[0], // First image as thumbnail
            groupImages,
            groupId: img.groupId
          });
        } else {
          // Single image with groupId (batch of 1)
          result.push({
            type: 'single',
            image: img
          });
        }
      } else {
        // Single image without group
        result.push({
          type: 'single',
          image: img
        });
      }
    }

    return result;
  }, [images]);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = () => {
    if (scrollContainerRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollContainerRef.current;
      // Use a small tolerance (10px) for left as requested
      setCanScrollLeft(scrollLeft > 10);
      // Use 20px tolerance for right as requested
      setCanScrollRight(Math.ceil(scrollLeft + clientWidth) < scrollWidth - 20);
    }
  };

  useEffect(() => {
    // Force reset scroll to start (0) whenever images change.
    const timer = setTimeout(() => {
        if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollLeft = 0;
            checkScroll();
        }
    }, 0);
    
    window.addEventListener('resize', checkScroll);
    return () => {
        window.removeEventListener('resize', checkScroll);
        clearTimeout(timer);
    };
  }, [images]);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollContainerRef.current) {
      const scrollAmount = 300;
      const newScrollLeft = direction === 'left' 
        ? scrollContainerRef.current.scrollLeft - scrollAmount 
        : scrollContainerRef.current.scrollLeft + scrollAmount;
      
      scrollContainerRef.current.scrollTo({
        left: newScrollLeft,
        behavior: 'smooth',
      });
    }
  };

  // Handle group click - toggle expand or select
  const handleGroupClick = (groupedImg: GroupedImage) => {
    if (groupedImg.type === 'group' && groupedImg.groupId) {
      if (expandedGroupId === groupedImg.groupId) {
        // Already expanded, collapse
        setExpandedGroupId(null);
      } else {
        // Expand this group
        setExpandedGroupId(groupedImg.groupId);
      }
    } else {
      onSelect(groupedImg.image);
    }
  };

  // Render single image thumbnail
  const renderImageThumbnail = (img: GeneratedImage, isInGroup = false) => {
    const isSelected = selectedId === img.id;
    
    return (
      <div
        key={img.id}
        onClick={() => onSelect(img)}
        className={`
          relative group/item flex-shrink-0 ${isInGroup ? 'h-20 w-20' : 'h-24 w-24'} rounded-lg overflow-hidden cursor-pointer transition-all snap-start select-none
          ${isSelected ? 'ring-2 ring-purple-400 ring-offset-2 ring-offset-[#0D0B14]' : 'ring-2 ring-transparent hover:ring-white/50'}
        `}
      >
        <img
          src={img.url}
          alt={img.prompt}
          className={`h-full w-full object-cover transform group-hover/item:scale-110 transition-transform duration-500 ${img.isBlurred ? 'blur-sm' : ''}`}
          loading="lazy"
          onContextMenu={(e) => e.preventDefault()}
        />
        
        {/* Live Video Indicator */}
        {img.videoUrl && (
          <div className="absolute top-1 right-1 bg-black/60 rounded-full p-1 border border-white/20">
            <Film className="w-3 h-3 text-white" />
          </div>
        )}
        
        {/* Generating Loading Indicator */}
        {img.videoStatus === 'generating' && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <Loader2 className="w-6 h-6 text-white/80 animate-spin" />
          </div>
        )}

        {/* Group Index Badge for items in expanded group */}
        {isInGroup && img.groupIndex !== undefined && (
          <div className="absolute bottom-1 left-1 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded">
            {img.groupIndex + 1}
          </div>
        )}
      </div>
    );
  };

  if (images.length === 0) return null;

  return (
    <div className="relative mt-4 w-full">
      <div className="flex items-center gap-2">
        <button
          onClick={() => scroll('left')}
          disabled={!canScrollLeft}
          className="flex-shrink-0 flex items-center justify-center size-10 rounded-full bg-white/10 hover:bg-white/20 text-white/60 hover:text-white transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
          aria-label="Scroll left"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>

        <div className="flex-1 w-full overflow-hidden relative">
          <div 
            ref={scrollContainerRef}
            onScroll={checkScroll}
            className="flex items-center gap-3 p-3 overflow-x-auto scrollbar-hide snap-x"
          >
            {groupedImages.map((groupedImg, idx) => {
              if (groupedImg.type === 'single') {
                return renderImageThumbnail(groupedImg.image);
              }

              // Render group
              const isExpanded = expandedGroupId === groupedImg.groupId;
              const isAnySelected = groupedImg.groupImages?.some(img => img.id === selectedId);

              return (
                <div key={groupedImg.groupId || idx} className="flex-shrink-0 snap-start">
                  {isExpanded ? (
                    // Expanded group view
                    <div className="flex items-center gap-2 bg-white/5 rounded-xl p-2 border border-white/10">
                      {/* Collapse button */}
                      <button
                        onClick={() => setExpandedGroupId(null)}
                        className="flex-shrink-0 flex items-center justify-center h-20 w-8 rounded-lg bg-white/10 hover:bg-white/20 text-white/60 hover:text-white transition-colors"
                        title="Collapse"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      
                      {/* Group images */}
                      {groupedImg.groupImages?.map(img => renderImageThumbnail(img, true))}
                    </div>
                  ) : (
                    // Collapsed group thumbnail (stack effect)
                    <div
                      onClick={() => handleGroupClick(groupedImg)}
                      className={`
                        relative h-24 w-24 cursor-pointer transition-all select-none
                        ${isAnySelected ? 'ring-2 ring-purple-400 ring-offset-2 ring-offset-[#0D0B14]' : 'ring-2 ring-transparent hover:ring-white/50'}
                      `}
                    >
                      {/* Stacked background cards */}
                      <div className="absolute top-1 left-1 h-22 w-22 bg-white/10 rounded-lg transform rotate-3" />
                      <div className="absolute top-0.5 left-0.5 h-23 w-23 bg-white/20 rounded-lg transform rotate-1" />
                      
                      {/* Main thumbnail */}
                      <div className="relative h-24 w-24 rounded-lg overflow-hidden">
                        <img
                          src={groupedImg.image.url}
                          alt={groupedImg.image.prompt}
                          className={`h-full w-full object-cover ${groupedImg.image.isBlurred ? 'blur-sm' : ''}`}
                          loading="lazy"
                          onContextMenu={(e) => e.preventDefault()}
                        />
                        
                        {/* Group badge */}
                        <div className="absolute top-1 right-1 bg-purple-500/90 rounded-full px-1.5 py-0.5 border border-white/20 flex items-center gap-1">
                          <Layers className="w-3 h-3 text-white" />
                          <span className="text-[10px] text-white font-medium">{groupedImg.groupImages?.length}</span>
                        </div>
                        
                        {/* Live Video Indicator */}
                        {groupedImg.image.videoUrl && (
                          <div className="absolute top-1 left-1 bg-black/60 rounded-full p-1 border border-white/20">
                            <Film className="w-3 h-3 text-white" />
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <button
          onClick={() => scroll('right')}
          disabled={!canScrollRight}
          className="flex-shrink-0 flex items-center justify-center size-10 rounded-full bg-white/10 hover:bg-white/20 text-white/60 hover:text-white transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
          aria-label="Scroll right"
        >
          <ChevronRight className="w-6 h-6" />
        </button>
      </div>
    </div>
  );
};
