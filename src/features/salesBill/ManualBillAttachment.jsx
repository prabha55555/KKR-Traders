import { Camera, Image as ImageIcon, Trash2, ZoomIn } from 'lucide-react';
import { useRef, useState } from 'react';
import { Button, Modal } from '@/ui';

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
                variant="outlineGold"
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
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-slate-50/80 px-3 py-2">
            <div className="flex min-w-0 items-center gap-2 text-xs font-semibold text-slate-700">
              <span className="flex size-2 shrink-0 rounded-full bg-emerald-500 ring-2 ring-emerald-200" />
              Manual Bill Slip Attached
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                variant="outlineInfo"
                icon={ZoomIn}
                title="Preview slip"
                onClick={() => setZoomOpen(true)}
              >
                Preview
              </Button>
              <Button
                size="sm"
                variant="outlineDanger"
                icon={Trash2}
                title="Remove attached photo"
                onClick={handleRemove}
              >
                Remove
              </Button>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setZoomOpen(true)}
            aria-label="View full image"
            className="group relative block w-full cursor-pointer bg-slate-900/5 p-2 text-center focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:outline-none focus-visible:ring-inset"
          >
            <img
              src={value}
              alt="Attached manual bill slip preview"
              className="mx-auto max-h-48 rounded-lg object-contain shadow-xs transition-transform duration-200 group-hover:scale-[1.01]"
            />
            <span className="absolute inset-0 flex items-center justify-center bg-brand-950/30 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
              <span className="flex items-center gap-1.5 rounded-lg bg-white/90 px-3 py-1.5 text-xs font-bold text-brand-900 shadow">
                <ZoomIn className="size-4" aria-hidden /> Click to view full image
              </span>
            </span>
          </button>

          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 bg-slate-50/50 px-3 py-1.5 text-[11px] text-slate-500">
            <span className="min-w-0">This slip will be merged into the PDF document</span>
            <Button
              size="sm"
              variant="ghost"
              icon={Camera}
              className="-mr-2"
              onClick={() => cameraInputRef.current?.click()}
            >
              Retake Photo
            </Button>
          </div>
        </div>
      )}

      {/* Full-size preview */}
      <Modal open={zoomOpen} onClose={() => setZoomOpen(false)} title="Manual Bill Slip Attachment" size="lg">
        <div className="-mx-4 -my-4 bg-slate-100 p-4 sm:-mx-6 sm:-my-5">
          <img
            src={value}
            alt="Full size manual bill slip"
            className="mx-auto max-h-[70dvh] rounded-lg object-contain shadow-md"
          />
        </div>
      </Modal>
    </div>
  );
}
