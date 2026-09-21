import React, { useEffect } from 'react';
import { X, Edit3 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Property } from '../../types/property';
import { ManualPropertyForm } from '../capture/ManualPropertyForm';

interface PropertyEditModalProps {
  isOpen: boolean;
  property: Property | null;
  onClose: () => void;
  onSaveProperty: (property: Property) => void;
}

export const PropertyEditModal: React.FC<PropertyEditModalProps> = ({
  isOpen,
  property,
  onClose,
  onSaveProperty,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !property) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 md:p-6 overflow-hidden">
        {/* Backdrop escuro com desfoque */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/80 backdrop-blur-2xl"
        />

        {/* Modal Janela Principal */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ type: 'spring', damping: 26, stiffness: 260 }}
          className="relative w-full max-w-5xl h-[750px] max-h-[92vh] glass-modal rounded-3xl overflow-hidden z-10 my-auto border border-white/15 flex flex-col shadow-2xl"
        >
          {/* Header do Modal */}
          <div className="h-[60px] px-6 border-b border-white/10 flex items-center justify-between bg-black/30 backdrop-blur-md flex-shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-cyan-500/15 text-cyan-400 flex items-center justify-center">
                <Edit3 className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-white">Editar Imóvel</h3>
                <p className="text-[11px] text-slate-400">
                  {property.neighborhood} · {property.type}
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              aria-label="Fechar"
              className="p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Conteúdo do Formulário Manual Preenchido */}
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
            <ManualPropertyForm
              initialProperty={property}
              submitButtonLabel="Salvar Alterações"
              onSaveProperty={(updatedProp) => {
                onSaveProperty(updatedProp);
                onClose();
              }}
              onCancel={onClose}
            />
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
