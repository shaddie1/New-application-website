'use client';

import { useEffect, useState, type ReactNode } from 'react';

import { cn } from '../../lib/cn';
import { ArrowRightIcon } from '../icons';
import { HERO_SLIDES, SITE_PHOTOS } from '../../content/site';

const INTERVAL_MS = 6000;

/**
 * Full-bleed hero backdrop, cross-fading between shots behind the headline.
 * Every slide is mounted and stacked, so the fade never waits on a network
 * request mid-transition. The headline itself comes in as `children`.
 */
export function HeroPhotos({ children }: { children: ReactNode }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const slides = HERO_SLIDES.filter((slide) => SITE_PHOTOS[slide.slot].src);

  useEffect(() => {
    if (paused || slides.length < 2) return;
    // Someone who has asked the OS for less motion gets the first shot, still.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const id = setInterval(() => setIndex((i) => (i + 1) % slides.length), INTERVAL_MS);
    return () => clearInterval(id);
  }, [paused, slides.length]);

  const step = (by: number) => setIndex((i) => (i + by + slides.length) % slides.length);

  return (
    <div
      className="relative isolate flex min-h-[560px] items-center overflow-hidden bg-cream sm:min-h-[620px] lg:min-h-[calc(100vh-4rem)]"
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      {slides.map((slide, i) => {
        const photo = SITE_PHOTOS[slide.slot];
        return (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={slide.slot}
            src={photo.src!}
            alt={i === index ? photo.alt : ''}
            aria-hidden={i !== index}
            loading={i === 0 ? 'eager' : 'lazy'}
            decoding="async"
            className={cn(
              'absolute inset-0 -z-20 h-full w-full object-cover object-[center_30%] transition-opacity duration-1000 ease-out',
              i === index ? 'opacity-100' : 'opacity-0',
            )}
          />
        );
      })}

      {/* A soft cream wash behind the headline only; the right half of the photo stays
          untouched. Phones have no free side, so the wash covers the frame lightly. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-cream/80 lg:bg-transparent lg:bg-gradient-to-r lg:from-cream lg:from-25% lg:via-cream/75 lg:via-45% lg:to-transparent lg:to-65%"
      />

      <div className="w-full">{children}</div>

      {slides.length > 1 && (
        <>
          <div className="absolute right-4 top-1/2 hidden -translate-y-1/2 flex-col gap-3 sm:flex lg:right-8">
            <button
              type="button"
              onClick={() => step(-1)}
              aria-label="Previous photo"
              className="grid h-11 w-11 place-items-center rounded-pill bg-white/90 text-charcoal shadow-md transition hover:bg-gold-bright hover:text-charcoal"
            >
              <ArrowRightIcon className="h-5 w-5 -rotate-90" />
            </button>
            <button
              type="button"
              onClick={() => step(1)}
              aria-label="Next photo"
              className="grid h-11 w-11 place-items-center rounded-pill bg-white/90 text-charcoal shadow-md transition hover:bg-gold-bright hover:text-charcoal"
            >
              <ArrowRightIcon className="h-5 w-5 rotate-90" />
            </button>
          </div>

          <p
            aria-live="polite"
            className="absolute bottom-5 right-4 max-w-[70%] rounded-pill bg-white/90 px-3.5 py-1.5 text-right text-xs font-medium text-charcoal shadow-sm lg:right-8"
          >
            {slides[index]?.caption}
          </p>
        </>
      )}
    </div>
  );
}
