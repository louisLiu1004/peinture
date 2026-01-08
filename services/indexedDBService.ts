import { GeneratedImage } from '../types';

const DB_NAME = 'peinture_db';
const DB_VERSION = 1;
const IMAGES_STORE = 'images';

interface StoredImage {
    id: string;
    blob: Blob;
    videoBlob?: Blob;
    metadata: Omit<GeneratedImage, 'url' | 'videoUrl'> & {
        originalUrl?: string;
        originalVideoUrl?: string;
    };
}

let dbInstance: IDBDatabase | null = null;

// Initialize IndexedDB
export const initDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
        if (dbInstance) {
            resolve(dbInstance);
            return;
        }

        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => {
            console.error('Failed to open IndexedDB:', request.error);
            reject(request.error);
        };

        request.onsuccess = () => {
            dbInstance = request.result;
            resolve(dbInstance);
        };

        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;
            
            // Create images store with index on timestamp
            if (!db.objectStoreNames.contains(IMAGES_STORE)) {
                const store = db.createObjectStore(IMAGES_STORE, { keyPath: 'id' });
                store.createIndex('timestamp', 'metadata.timestamp', { unique: false });
            }
        };
    });
};

// Convert URL to Blob
const urlToBlob = async (url: string): Promise<Blob | null> => {
    try {
        // Skip if it's already a blob URL or data URL that we can't fetch reliably
        if (url.startsWith('blob:')) {
            // Blob URLs from current session may still be valid
            const response = await fetch(url);
            return await response.blob();
        }
        
        if (url.startsWith('data:')) {
            // Convert base64 to blob
            const response = await fetch(url);
            return await response.blob();
        }

        // For external URLs, try to fetch
        const response = await fetch(url);
        if (!response.ok) return null;
        return await response.blob();
    } catch (e) {
        console.warn('Failed to convert URL to Blob:', url, e);
        return null;
    }
};

// Save image to IndexedDB
export const saveImageToDB = async (image: GeneratedImage): Promise<void> => {
    const db = await initDB();
    
    // Convert image URL to blob
    let imageBlob: Blob | null = null;
    let videoBlob: Blob | null = null;

    imageBlob = await urlToBlob(image.url);
    
    if (image.videoUrl) {
        videoBlob = await urlToBlob(image.videoUrl);
    }

    // If we couldn't get the blob, we still save metadata with original URL
    const storedImage: StoredImage = {
        id: image.id,
        blob: imageBlob || new Blob(),
        videoBlob: videoBlob || undefined,
        metadata: {
            ...image,
            originalUrl: imageBlob ? undefined : image.url,
            originalVideoUrl: videoBlob ? undefined : image.videoUrl,
        }
    };

    // Remove url and videoUrl from metadata as they'll be recreated from blobs
    delete (storedImage.metadata as any).url;
    delete (storedImage.metadata as any).videoUrl;

    return new Promise((resolve, reject) => {
        const transaction = db.transaction([IMAGES_STORE], 'readwrite');
        const store = transaction.objectStore(IMAGES_STORE);
        const request = store.put(storedImage);

        request.onerror = () => {
            console.error('Failed to save image:', request.error);
            reject(request.error);
        };
        
        request.onsuccess = () => resolve();
    });
};

// Get all images from IndexedDB
export const getAllImagesFromDB = async (): Promise<GeneratedImage[]> => {
    const db = await initDB();
    
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([IMAGES_STORE], 'readonly');
        const store = transaction.objectStore(IMAGES_STORE);
        const index = store.index('timestamp');
        const request = index.openCursor(null, 'prev'); // Sort by timestamp descending

        const images: GeneratedImage[] = [];
        const now = Date.now();
        const oneDayInMs = 24 * 60 * 60 * 1000;
        const expiredIds: string[] = [];

        request.onerror = () => {
            console.error('Failed to get images:', request.error);
            reject(request.error);
        };

        request.onsuccess = (event) => {
            const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
            
            if (cursor) {
                const stored = cursor.value as StoredImage;
                
                // Check expiration
                if ((now - stored.metadata.timestamp) >= oneDayInMs) {
                    expiredIds.push(stored.id);
                } else {
                    // Recreate URL from blob
                    let url = stored.metadata.originalUrl || '';
                    let videoUrl = stored.metadata.originalVideoUrl;

                    if (stored.blob && stored.blob.size > 0) {
                        url = URL.createObjectURL(stored.blob);
                    }

                    if (stored.videoBlob && stored.videoBlob.size > 0) {
                        videoUrl = URL.createObjectURL(stored.videoBlob);
                    }

                    const image: GeneratedImage = {
                        ...stored.metadata,
                        url,
                        videoUrl,
                    } as GeneratedImage;

                    images.push(image);
                }
                
                cursor.continue();
            } else {
                // Done iterating, clean up expired images
                if (expiredIds.length > 0) {
                    deleteMultipleImagesFromDB(expiredIds).catch(console.error);
                }
                resolve(images);
            }
        };
    });
};

// Delete image from IndexedDB
export const deleteImageFromDB = async (id: string): Promise<void> => {
    const db = await initDB();
    
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([IMAGES_STORE], 'readwrite');
        const store = transaction.objectStore(IMAGES_STORE);
        const request = store.delete(id);

        request.onerror = () => {
            console.error('Failed to delete image:', request.error);
            reject(request.error);
        };
        
        request.onsuccess = () => resolve();
    });
};

// Delete multiple images
export const deleteMultipleImagesFromDB = async (ids: string[]): Promise<void> => {
    const db = await initDB();
    
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([IMAGES_STORE], 'readwrite');
        const store = transaction.objectStore(IMAGES_STORE);
        
        let completed = 0;
        let hasError = false;

        ids.forEach(id => {
            const request = store.delete(id);
            request.onerror = () => {
                if (!hasError) {
                    hasError = true;
                    reject(request.error);
                }
            };
            request.onsuccess = () => {
                completed++;
                if (completed === ids.length && !hasError) {
                    resolve();
                }
            };
        });

        if (ids.length === 0) resolve();
    });
};

// Update image in IndexedDB
export const updateImageInDB = async (id: string, updates: Partial<GeneratedImage>): Promise<void> => {
    const db = await initDB();
    
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([IMAGES_STORE], 'readwrite');
        const store = transaction.objectStore(IMAGES_STORE);
        const getRequest = store.get(id);

        getRequest.onerror = () => {
            reject(getRequest.error);
        };

        getRequest.onsuccess = async () => {
            const stored = getRequest.result as StoredImage | undefined;
            if (!stored) {
                reject(new Error('Image not found'));
                return;
            }

            // Handle URL updates (convert to blob if needed)
            let newBlob = stored.blob;
            let newVideoBlob = stored.videoBlob;

            if (updates.url && updates.url !== stored.metadata.originalUrl) {
                const blob = await urlToBlob(updates.url);
                if (blob) {
                    newBlob = blob;
                    stored.metadata.originalUrl = undefined;
                } else {
                    stored.metadata.originalUrl = updates.url;
                }
            }

            if (updates.videoUrl && updates.videoUrl !== stored.metadata.originalVideoUrl) {
                const blob = await urlToBlob(updates.videoUrl);
                if (blob) {
                    newVideoBlob = blob;
                    stored.metadata.originalVideoUrl = undefined;
                } else {
                    stored.metadata.originalVideoUrl = updates.videoUrl;
                }
            }

            // Merge updates into metadata
            const updatedMetadata = { ...stored.metadata, ...updates };
            delete (updatedMetadata as any).url;
            delete (updatedMetadata as any).videoUrl;

            const updatedStore: StoredImage = {
                id,
                blob: newBlob,
                videoBlob: newVideoBlob,
                metadata: updatedMetadata,
            };

            const putRequest = store.put(updatedStore);
            putRequest.onerror = () => reject(putRequest.error);
            putRequest.onsuccess = () => resolve();
        };
    });
};

// Migrate data from localStorage to IndexedDB
export const migrateFromLocalStorage = async (): Promise<void> => {
    const LEGACY_KEY = 'ai_image_gen_history';
    
    try {
        const saved = localStorage.getItem(LEGACY_KEY);
        if (!saved) return;

        const legacyImages: GeneratedImage[] = JSON.parse(saved);
        if (!Array.isArray(legacyImages) || legacyImages.length === 0) return;

        console.log(`Migrating ${legacyImages.length} images from localStorage to IndexedDB...`);

        // Save each image to IndexedDB
        for (const image of legacyImages) {
            try {
                await saveImageToDB(image);
            } catch (e) {
                console.warn('Failed to migrate image:', image.id, e);
            }
        }

        // Clear legacy storage after successful migration
        localStorage.removeItem(LEGACY_KEY);
        console.log('Migration complete!');
    } catch (e) {
        console.error('Migration failed:', e);
    }
};

// Clear all images from IndexedDB
export const clearAllImagesFromDB = async (): Promise<void> => {
    const db = await initDB();
    
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([IMAGES_STORE], 'readwrite');
        const store = transaction.objectStore(IMAGES_STORE);
        const request = store.clear();

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
    });
};

// Check if IndexedDB is available
export const isIndexedDBAvailable = (): boolean => {
    try {
        return typeof indexedDB !== 'undefined';
    } catch (e) {
        return false;
    }
};
