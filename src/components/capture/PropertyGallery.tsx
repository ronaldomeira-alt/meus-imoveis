import React, { useRef, useState } from 'react';
import { Camera, ImagePlus, Loader2, Star, Trash2, X } from 'lucide-react';
import type { ProcessedImage } from '../../lib/image-processor';

interface PropertyGalleryProps {
  images: ProcessedImage[];
  onFilesSelected: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveImage: (index: number) => void;
  onSetCover: (index: number) => void;
  onReorderImages?: (newImages: ProcessedImage[]) => void;
  isProcessing: boolean;
}

const VISIBLE_THUMBS = 6;

export const PropertyGallery: React.FC<PropertyGalleryProps> = ({
  images,
  onFilesSelected,
  onRemoveImage,
  onSetCover,
  onReorderImages,
  isProcessing,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showAll, setShowAll] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const handleDragStart = (e: React.DragEvent, index: number) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === targetIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    const reordered = [...images];
    const [moved] = reordered.splice(draggedIndex, 1);
    reordered.splice(targetIndex, 0, moved);

    // Regra estrita: índice 0 é sempre a mídia principal
    const normalized = reordered.map((img, i) => ({
      ...img,
      isCover: i === 0,
    }));

    if (onReorderImages) {
      onReorderImages(normalized);
    } else {
      onSetCover(targetIndex === 0 ? draggedIndex : 0);
    }

    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  // Fotos a exibir: se showAll, mostra todas; senão, limita
  const displayImages = showAll ? images : images.slice(0, VISIBLE_THUMBS);
  const overflowCount = images.length - displayImages.length;

  return (
    <div className="space-y-3">
      {/* Cabeçalho da galeria */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Camera className="w-3.5 h-3.5 text-accent" strokeWidth={2.2} />
          <h3 className="text-xs font-bold uppercase tracking-wider text-ink-primary">
            Fotos e vídeos
          </h3>
          {images.length > 0 && (
            <span className="text-[11px] text-ink-secondary tabular ml-1">
              · {images.length} {images.length === 1 ? 'mídia' : 'mídias'}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isProcessing}
            className="text-xs text-accent hover:text-accent-hover font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
          >
            {isProcessing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <ImagePlus className="w-3.5 h-3.5" />
            )}
            <span>{images.length === 0 ? 'Adicionar mídias' : 'Adicionar mais'}</span>
          </button>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,.heic,.heif"
        onChange={onFilesSelected}
        className="hidden"
      />

      {images.length === 0 ? (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isProcessing}
          className="w-full rounded-xl border border-dashed border-line-subtle hover:border-accent/40 bg-white/[0.01] hover:bg-white/[0.025] transition-all py-7 px-4 flex flex-col items-center justify-center gap-2 cursor-pointer group"
        >
          <div className="w-9 h-9 rounded-xl bg-white/[0.03] group-hover:bg-accent/10 border border-line-subtle group-hover:border-accent/30 flex items-center justify-center transition-colors">
            <ImagePlus className="w-4 h-4 text-ink-secondary group-hover:text-accent transition-colors" />
          </div>
          <div className="text-center">
            <p className="text-xs font-medium text-ink-primary">
              Clique para selecionar fotos e vídeos do imóvel
            </p>
            <p className="text-[11px] text-ink-secondary mt-0.5">
              A primeira foto será destacada automaticamente como foto principal
            </p>
          </div>
        </button>
      ) : (
        <div className="flex items-center gap-2.5 overflow-x-auto pb-1 no-scrollbar">
          {displayImages.map((img, idx) => {
            const isCover = idx === 0;
            const isDragged = draggedIndex === idx;
            const isOver = dragOverIndex === idx && draggedIndex !== idx;

            return (
              <div
                key={img.id || img.previewUrl || idx}
                draggable={!isProcessing}
                onDragStart={(e) => handleDragStart(e, idx)}
                onDragOver={(e) => handleDragOver(e, idx)}
                onDragEnd={handleDragEnd}
                onDrop={(e) => handleDrop(e, idx)}
                className={`relative flex-shrink-0 rounded-xl overflow-hidden cursor-grab active:cursor-grabbing transition-all duration-200 select-none group ${
                  isCover
                    ? 'w-[172px] h-[116px] sm:w-[196px] sm:h-[130px] border-2 border-accent/60 shadow-sm'
                    : 'w-[140px] h-[104px] sm:w-[154px] sm:h-[114px] border border-line-subtle bg-surface-1'
                } ${isOver ? 'ring-2 ring-accent scale-105 border-accent' : ''} ${
                  isDragged ? 'opacity-40 scale-95' : 'opacity-100'
                }`}
              >
                <img
                  src={img.previewUrl}
                  alt={isCover ? 'Foto principal' : `Foto ${idx + 1}`}
                  className="w-full h-full object-cover pointer-events-none"
                />

                {isCover ? (
                  <>
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20 pointer-events-none" />
                    <span className="absolute bottom-2 left-2 px-2 py-0.5 rounded-md bg-black/70 backdrop-blur-md text-[9.5px] font-bold text-accent border border-accent/30 flex items-center gap-1 pointer-events-none">
                      <Star className="w-2.5 h-2.5 fill-accent" />
                      Principal
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveImage(idx);
                      }}
                      title="Remover foto"
                      className="absolute top-1.5 right-1.5 p-1 rounded-lg bg-black/60 text-ink-secondary hover:text-status-danger opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </>
                ) : (
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        const reordered = [...images];
                        const [moved] = reordered.splice(idx, 1);
                        reordered.unshift(moved);
                        const normalized = reordered.map((m, i) => ({ ...m, isCover: i === 0 }));
                        if (onReorderImages) onReorderImages(normalized);
                        else onSetCover(idx);
                      }}
                      title="Tornar foto principal"
                      className="p-1.5 rounded-lg bg-white/20 hover:bg-accent text-white transition-colors cursor-pointer"
                    >
                      <Star className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveImage(idx);
                      }}
                      title="Remover"
                      className="p-1.5 rounded-lg bg-white/20 hover:bg-status-danger text-white transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          {overflowCount > 0 && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="flex-shrink-0 w-[110px] h-[104px] sm:w-[120px] sm:h-[114px] rounded-xl border border-line-subtle bg-white/[0.02] hover:bg-white/[0.05] flex flex-col items-center justify-center gap-1 text-ink-secondary hover:text-ink-primary transition-colors cursor-pointer"
            >
              <span className="text-sm font-bold text-ink-primary">+{overflowCount}</span>
              <span className="text-[10px]">Ver todas</span>
            </button>
          )}

          {/* Adicionar mais */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isProcessing}
            title="Adicionar mais mídias"
            className="flex-shrink-0 w-[80px] h-[104px] sm:w-[88px] sm:h-[114px] rounded-xl border border-dashed border-line-subtle hover:border-accent/40 bg-white/[0.01] hover:bg-accent/5 flex flex-col items-center justify-center gap-1 text-ink-secondary hover:text-accent transition-colors cursor-pointer disabled:opacity-50"
          >
            {isProcessing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <ImagePlus className="w-4 h-4" />
                <span className="text-[10px] font-medium">+ Mais</span>
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
};
