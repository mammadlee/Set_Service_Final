import { ImageOff, LoaderCircle, RotateCcw, X, ZoomIn, ZoomOut } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface ImagePreviewModalProps {
  open: boolean;
  src?: string | null;
  alt: string;
  onClose: () => void;
}

export function ImagePreviewModal({ open, src, alt, onClose }: ImagePreviewModalProps) {
  const [zoom, setZoom] = useState(1);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>(src ? 'loading' : 'error');
  const closeButton = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    setZoom(1);
    setState(src ? 'loading' : 'error');
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current();
      if (event.key === '+' || event.key === '=') setZoom((value) => Math.min(3, value + 0.25));
      if (event.key === '-') setZoom((value) => Math.max(1, value - 0.25));
    };
    window.addEventListener('keydown', handleKeyDown);
    window.setTimeout(() => closeButton.current?.focus(), 0);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, src]);

  if (!open) return null;

  return (
    <div className="image-preview-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="image-preview-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`${alt} — tam ölçülü görünüş`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="image-preview-header">
          <strong>{alt}</strong>
          <button ref={closeButton} className="icon-btn" type="button" onClick={onClose} aria-label="Bağla">
            <X size={20} />
          </button>
        </header>
        <div className="image-preview-stage">
          {state === 'loading' ? <div className="image-preview-state"><LoaderCircle className="spinner-icon" size={30} />Şəkil yüklənir...</div> : null}
          {state === 'error' ? <div className="image-preview-state"><ImageOff size={32} />Şəkil mövcud deyil və ya yüklənə bilmədi.</div> : null}
          {src ? (
            <img
              className={state === 'ready' ? 'ready' : ''}
              src={src}
              alt={alt}
              style={{ transform: `scale(${zoom})` }}
              onLoad={() => setState('ready')}
              onError={() => setState('error')}
            />
          ) : null}
        </div>
        <footer className="image-preview-controls">
          <button className="btn secondary compact" type="button" disabled={state !== 'ready' || zoom <= 1} onClick={() => setZoom((value) => Math.max(1, value - 0.25))}>
            <ZoomOut size={17} /> Kiçilt
          </button>
          <span>{Math.round(zoom * 100)}%</span>
          <button className="btn secondary compact" type="button" disabled={state !== 'ready' || zoom >= 3} onClick={() => setZoom((value) => Math.min(3, value + 0.25))}>
            <ZoomIn size={17} /> Böyüt
          </button>
          <button className="btn ghost compact" type="button" disabled={state !== 'ready' || zoom === 1} onClick={() => setZoom(1)}>
            <RotateCcw size={16} /> Sıfırla
          </button>
        </footer>
      </section>
    </div>
  );
}
