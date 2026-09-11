import { useEffect, useRef, useState } from 'react';

// Carrusel de fotos del lado público (galería del profesional y del salón). Es scroll nativo con
// scroll-snap: en el teléfono se pasa con el dedo, que es como la gente espera que funcione, y en
// el computador aparecen flechas. Sin librerías ni timers: nada se mueve solo, para que una foto
// no cambie justo cuando el cliente la está mirando.
export default function PhotoCarousel({ photos, alt = 'Foto', className = 'h-56', rounded = 'rounded-[20px]', frameClass = 'border border-[var(--t-border)]' }) {
  const trackRef = useRef(null);
  const [index, setIndex] = useState(0);
  const count = photos?.length || 0;

  // El índice se deduce de la posición del scroll, así que también se actualiza cuando el cliente
  // arrastra con el dedo y no solo cuando toca una flecha.
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    function onScroll() {
      const width = track.clientWidth || 1;
      setIndex(Math.round(track.scrollLeft / width));
    }
    track.addEventListener('scroll', onScroll, { passive: true });
    return () => track.removeEventListener('scroll', onScroll);
  }, [count]);

  if (!count) return null;

  function goTo(i) {
    const track = trackRef.current;
    if (!track) return;
    const next = Math.max(0, Math.min(count - 1, i));
    track.scrollTo({ left: next * track.clientWidth, behavior: 'smooth' });
  }

  return (
    <div className={'relative overflow-hidden ' + frameClass + ' ' + rounded}>
      <div
        ref={trackRef}
        className={'flex snap-x snap-mandatory overflow-x-auto ' + className}
        style={{ scrollbarWidth: 'none', overscrollBehaviorX: 'contain' }}
      >
        {photos.map((url, i) => (
          <img
            key={url}
            src={url}
            alt={`${alt} ${i + 1} de ${count}`}
            loading={i === 0 ? 'eager' : 'lazy'}
            className="h-full w-full flex-none snap-center object-cover"
          />
        ))}
      </div>

      {count > 1 && (
        <>
          <CarouselArrow side="left" disabled={index === 0} onClick={() => goTo(index - 1)} />
          <CarouselArrow side="right" disabled={index === count - 1} onClick={() => goTo(index + 1)} />
          <div className="absolute inset-x-0 bottom-2 flex justify-center gap-1.5">
            {photos.map((url, i) => (
              <button
                key={url}
                type="button"
                onClick={() => goTo(i)}
                aria-label={`Ver foto ${i + 1}`}
                aria-current={i === index}
                className={'h-1.5 rounded-full transition-all ' + (i === index ? 'w-4 bg-white' : 'w-1.5 bg-white/55')}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function CarouselArrow({ side, disabled, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={side === 'left' ? 'Foto anterior' : 'Foto siguiente'}
      className={
        'absolute top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-[15px] text-white disabled:opacity-0 ' +
        (side === 'left' ? 'left-2' : 'right-2')
      }
    >
      {side === 'left' ? '‹' : '›'}
    </button>
  );
}
