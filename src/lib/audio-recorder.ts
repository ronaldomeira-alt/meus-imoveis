export interface RecordingResult {
  blob: Blob;
  mimeType: string;
  spokenText: string;
}

export class AudioRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private stream: MediaStream | null = null;
  private selectedMimeType: string = '';

  /**
   * Identifica o MIME type de áudio ideal para o navegador atual.
   * Chrome/Android/Desktop: prioriza webm (opus).
   * Safari/iOS/macOS: prioriza mp4 (aac) ou omite options.
   */
  private getBestMimeType(): string {
    if (typeof MediaRecorder === 'undefined') return '';

    const candidates = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4;codecs=mp4a.40.2',
      'audio/mp4',
      'audio/aac',
      'audio/ogg;codecs=opus',
      'audio/ogg',
    ];

    for (const type of candidates) {
      try {
        if (MediaRecorder.isTypeSupported(type)) {
          return type;
        }
      } catch {
        // Ignora navegadores com implementação parcial de isTypeSupported
      }
    }

    return '';
  }

  async start(): Promise<void> {
    this.audioChunks = [];

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Seu navegador não suporta captura de áudio.');
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch (err: any) {
      this.stopTracks();
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        throw new Error('Não foi possível acessar o microfone. Verifique as permissões do navegador.');
      }
      if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        throw new Error('Nenhum microfone foi encontrado no seu dispositivo.');
      }
      if (err.name === 'NotReadableError') {
        throw new Error('O microfone já está em uso por outro aplicativo.');
      }
      if (err.name === 'SecurityError') {
        throw new Error('Acesso ao microfone requer uma conexão segura (HTTPS).');
      }
      throw new Error(`Erro ao acessar microfone: ${err.message || 'Falha desconhecida'}`);
    }

    // Inicialização segura do MediaRecorder
    this.selectedMimeType = this.getBestMimeType();

    try {
      if (this.selectedMimeType) {
        this.mediaRecorder = new MediaRecorder(this.stream, {
          mimeType: this.selectedMimeType,
        });
      } else {
        // Fallback nativo (Safari iOS geralmente prefere instanciar sem options)
        this.mediaRecorder = new MediaRecorder(this.stream);
      }
    } catch {
      // Se falhar com options específicas no Safari, tenta sem options
      try {
        this.mediaRecorder = new MediaRecorder(this.stream);
      } catch (fallbackErr: any) {
        this.stopTracks();
        throw new Error(`MediaRecorder não suportado: ${fallbackErr.message}`);
      }
    }

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        this.audioChunks.push(event.data);
      }
    };

    // Coleta chunks a cada 100ms
    this.mediaRecorder.start(100);


  }

  async stop(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) {
        this.stopTracks();
        return reject(new Error('Gravador não inicializado'));
      }


      this.mediaRecorder.onstop = () => {
        const mime = this.mediaRecorder?.mimeType || this.selectedMimeType || 'audio/webm';
        const audioBlob = new Blob(this.audioChunks, { type: mime });

        // Libera microfone
        this.stopTracks();

        if (audioBlob.size === 0) {
          return reject(new Error('Gravação muito curta ou vazia. Tente falar novamente.'));
        }

        resolve(audioBlob);
      };

      try {
        if (this.mediaRecorder.state !== 'inactive') {
          this.mediaRecorder.stop();
        }
      } catch (err) {
        this.stopTracks();
        reject(err);
      }
    });
  }

  cancel(): void {

    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try {
        this.mediaRecorder.stop();
      } catch {}
    }

    this.stopTracks();
    this.audioChunks = [];
  }

  private stopTracks(): void {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {}
      });
      this.stream = null;
    }
  }
}
