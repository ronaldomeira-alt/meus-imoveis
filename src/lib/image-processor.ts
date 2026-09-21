import heic2any from 'heic2any';

export interface ProcessedImage {
  id?: string;
  file?: File;
  previewUrl: string;
  isCover: boolean;
  storagePath?: string;
}

export const processImageFile = async (file: File): Promise<ProcessedImage> => {
  let finalFile = file;

  // Conversão de fotos HEIC do iPhone
  const isHeic = file.type === 'image/heic' || 
                 file.type === 'image/heif' || 
                 file.name.toLowerCase().endsWith('.heic') || 
                 file.name.toLowerCase().endsWith('.heif');

  if (isHeic) {
    try {
      const convertedBlob = await heic2any({
        blob: file,
        toType: 'image/jpeg',
        quality: 0.85,
      });

      const blob = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob;
      finalFile = new File([blob], file.name.replace(/\.(heic|heif)$/i, '.jpg'), {
        type: 'image/jpeg',
      });
    } catch (err) {
      console.warn('Falha na conversão do HEIC, tentando usar o arquivo original:', err);
    }
  }

  const previewUrl = URL.createObjectURL(finalFile);

  return {
    file: finalFile,
    previewUrl,
    isCover: false,
  };
};
