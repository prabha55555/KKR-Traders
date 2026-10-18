import { Camera, Image as ImageIcon, Trash2, ZoomIn, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { Button } from '@/ui';
import { cn } from '@/ui/cn';

/**
 * Resizes an image file to a balanced dimension (default 1024px) and compresses to JPEG data URL.
 * Keeps payload ultra-lightweight (~40-60KB) for Firestore storage, PDF embedding, and fast sharing without sacrificing legibility.
 */
export async function compressImageFile(file, maxDimension = 1024, quality = 0.65) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(e.target.result);
          return;
        }
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

export function ManualBillAttachment({ value, onChange }) {
  const cameraInputRef = useRef(null);
  const fileInputRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [zoomOpen, setZoomOpen] = useState(false);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setLoading(true);
      const compressed = await compressImageFile(file);
      onChange(compressed);
    } catch (err) {
      console.error('Failed to process image:', err);
    } finally {
      setLoading(false);
      e.target.value = '';
    }
  };

  const handleRemove = (e) => {
    e.stopPropagation();
    onChange(null);
  };

  return (
    <div className="space-y-3">
      {/* Hidden file inputs: one dedicated to mobile camera capture, one for file browsing */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFile}
      />
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />

      {!value ? (
        <div className="rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/50 p-4 transition-colors hover:border-brand-300">
          <div className="flex flex-col items-center justify-center text-center">
            <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-700 shadow-xs">
              <Camera className="h-5 w-5" />
            </div>
            <p className="text-sm font-semibold text-slate-800">Attach Manual Bill / Physical Slip</p>
            <p className="mt-0.5 max-w-xs text-xs text-slate-500">
              Take a photo or upload a copy of the manual bill. It will be attached directly into the
              generated invoice document.
            </p>

            <div className="mt-3.5 flex flex-wrap items-center justify-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="primary"
                icon={Camera}
                disabled={loading}
                onClick={() => cameraInputRef.current?.click()}
              >
                {loading ? 'Processing...' : 'Take Photo (Camera)'}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                icon={ImageIcon}
                disabled={loading}
                onClick={() => fileInputRef.current?.click()}
              >
                Upload Slip
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-white shadow-xs">
          <div className="flex items-center justify-between border-b border-line bg-slate-50/80 px-3 py-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
              <span className="flex h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-emerald-200" />
              Manual Bill Slip Attached
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setZoomOpen(true)}
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200/60"
                title="Preview slip"
              >
                <ZoomIn className="h-3.5 w-3.5 text-slate-500" />
                Preview
              </button>
              <button
                type="button"
                onClick={handleRemove}
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                title="Remove attached photo"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Remove
              </button>
            </div>
          </div>

          <div
            className="group relative cursor-pointer bg-slate-900/5 p-2 text-center"
            onClick={() => setZoomOpen(true)}
          >
            <img
              src={value}
              alt="Attached manual bill slip preview"
              className="mx-auto max-h-48 rounded-lg object-contain shadow-xs transition-transform duration-200 group-hover:scale-[1.01]"
            />
            <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity group-hover:opacity-100">
              <span className="flex items-center gap-1.5 rounded-lg bg-white/90 px-3 py-1.5 text-xs font-bold text-slate-900 shadow">
                <ZoomIn className="h-4 w-4" /> Click to view full image
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between bg-slate-50/50 px-3 py-2 text-[11px] text-slate-500">
            <span>This slip will be merged into the PDF document</span>
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              className="font-medium text-brand-700 hover:underline"
            >
              Retake Photo
            </button>
          </div>
        </div>
      )}

      {/* Modal Preview */}
      {zoomOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs"
          onClick={() => setZoomOpen(false)}
        >
          <div
            className="relative max-h-[90vh] max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h3 className="text-sm font-bold text-slate-900">Manual Bill Slip Attachment</h3>
              <button
                type="button"
                onClick={() => setZoomOpen(false)}
                className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="max-h-[75vh] overflow-auto bg-slate-100 p-4">
              <img
                src={value}
                alt="Full size manual bill slip"
                className="mx-auto max-h-full rounded-lg object-contain shadow-md"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
