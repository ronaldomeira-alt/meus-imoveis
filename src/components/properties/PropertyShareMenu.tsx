import React, { useState } from 'react';
import { Share2 } from 'lucide-react';
import type { Property } from '../../types/property';
import { PropertyShareModal } from './PropertyShareModal';

interface PropertyShareMenuProps {
  property: Property;
  onUpdate?: (next: Property) => void;
}

export const PropertyShareMenu: React.FC<PropertyShareMenuProps> = ({ property }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        aria-label="Compartilhar imóvel"
        title="Compartilhar imóvel"
        onClick={(event) => {
          event.stopPropagation();
          setIsOpen(true);
        }}
        className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full border border-white/40 bg-black/60 text-white shadow-md transition-all hover:scale-105 hover:bg-accent hover:border-accent cursor-pointer active:scale-95"
      >
        <Share2 className="h-3.5 w-3.5" strokeWidth={2.2} />
      </button>

      <PropertyShareModal
        property={property}
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
      />
    </>
  );
};
