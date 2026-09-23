import React, { useState, useRef } from 'react';
import { Mic, X, Check, Loader2 } from 'lucide-react';
import { AudioRecorder } from '../../lib/audio-recorder';
import { transcribeAudioMultiProvider } from '../../lib/ai-provider';

interface VoiceNotesInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  label?: string;
  groqApiKey?: string;
  geminiApiKey?: string;
  className?: string;
}

export const VoiceNotesInput: React.FC<VoiceNotesInputProps> = ({
  value,
  onChange,
  placeholder = 'Observações subjetivas, vizinhança, proximidade do mar, rotina local, comércio, sensação do imóvel...',
  rows = 3,
  label = 'Observações & Percepções do Imóvel',
  groqApiKey = (import.meta.env.VITE_GROQ_API_KEY as string) || localStorage.getItem('meus_imoveis_groq_key') || '',
  geminiApiKey = (import.meta.env.VITE_GEMINI_API_KEY as string) || localStorage.getItem('meus_imoveis_gemini_key') || '',
  className = '',
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const recorderRef = useRef<AudioRecorder | null>(null);

  const handleStartRecording = async () => {
    try {
      recorderRef.current = new AudioRecorder();
      await recorderRef.current.start();
      setIsRecording(true);
    } catch (err) {
      console.error('Erro ao acessar microfone:', err);
      alert('Não foi possível acessar o microfone. Verifique as permissões do navegador.');
    }
  };

  const handleStopAndTranscribe = async () => {
    if (!recorderRef.current) return;
    setIsRecording(false);
    setIsTranscribing(true);

    try {
      const audioBlob = await recorderRef.current.stop();
      const result = await transcribeAudioMultiProvider({
        audioBlob,
        groqApiKey,
        geminiApiKey,
      });

      if (result.text && result.text.trim()) {
        const transcribed = result.text.trim();
        // Preserva o conteúdo existente e concatena em nova linha
        const current = (value || '').trim();
        const updated = current ? `${current}\n${transcribed}` : transcribed;
        onChange(updated);
      }
    } catch (err) {
      console.error('Erro ao transcrever áudio:', err);
      alert('Falha na transcrição do áudio. Tente novamente ou digite o texto.');
    } finally {
      setIsTranscribing(false);
      recorderRef.current = null;
    }
  };

  const handleCancelRecording = () => {
    if (recorderRef.current) {
      recorderRef.current.stop().catch(() => {});
      recorderRef.current = null;
    }
    setIsRecording(false);
    setIsTranscribing(false);
  };

  return (
    <div className={`space-y-1.5 ${className}`}>
      <div className="flex items-center justify-between">
        <label className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-ink-secondary flex items-center gap-1.5">
          <span>{label}</span>
        </label>

        <div className="flex items-center gap-1.5">
          {isRecording ? (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-status-danger/10 border border-status-danger/30 text-status-danger text-xs animate-pulse">
              <span className="w-1.5 h-1.5 rounded-full bg-status-danger" />
              <span className="text-[11px] font-semibold">Gravando...</span>
              <button
                type="button"
                onClick={handleStopAndTranscribe}
                title="Concluir gravação"
                className="w-5 h-5 rounded bg-status-danger text-white flex items-center justify-center ml-1 hover:opacity-90 cursor-pointer"
              >
                <Check className="w-3 h-3 stroke-[2.5]" />
              </button>
              <button
                type="button"
                onClick={handleCancelRecording}
                title="Cancelar"
                className="w-5 h-5 rounded bg-white/10 text-ink-secondary hover:text-ink-primary flex items-center justify-center cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ) : isTranscribing ? (
            <div className="flex items-center gap-1.5 text-xs text-ink-secondary">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-accent" />
              <span className="text-[11px] italic">Transcrevendo áudio...</span>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleStartRecording}
              className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-line-subtle text-ink-secondary hover:text-ink-primary text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Gravar áudio narrando detalhes subjetivos, rotina ou vizinhança"
            >
              <Mic className="w-3 h-3 text-accent" />
              <span>Gravar voz</span>
            </button>
          )}
        </div>
      </div>

      <div className="p-3 rounded-xl border border-line-subtle/60 bg-white/[0.015] focus-within:border-accent transition-colors">
        <textarea
          rows={rows}
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-transparent text-xs sm:text-sm text-ink-primary placeholder-ink-secondary/50 focus:outline-none resize-none leading-relaxed"
        />
      </div>
    </div>
  );
};
