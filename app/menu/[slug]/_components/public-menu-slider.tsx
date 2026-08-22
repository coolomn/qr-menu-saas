"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  SLIDER_AUTOPLAY_MS,
  SLIDER_FADE_MS,
  getMountedSlideIndexes,
  getPendingSlidePreloadIndex,
  getPreloadSlideIndex,
  pruneMountedSlideIndexes,
  resolveActiveAfterSlideError,
  resolveAutoplaySlideIndex,
  shouldAutoplayPublicSlider,
  shouldRenderPublicSlider,
} from "@/lib/public-menu/slider-loading";

type PublicMenuSliderProps = {
  images: string[];
  enabled: boolean;
  sliderSectionClass: string;
  sliderInnerClass: string;
  sliderFrameClass: string;
};

export function PublicMenuSlider({
  images,
  enabled,
  sliderSectionClass,
  sliderInnerClass,
  sliderFrameClass,
}: PublicMenuSliderProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [loadedIndexes, setLoadedIndexes] = useState<Set<number>>(() => new Set());
  const [failedIndexes, setFailedIndexes] = useState<Set<number>>(() => new Set());
  const [mountedIndexes, setMountedIndexes] = useState<number[]>(() => (images.length > 0 ? [0] : []));
  const inFlightRef = useRef<Set<number>>(new Set());
  const stateRef = useRef({ activeIndex, loadedIndexes, failedIndexes, length: images.length });

  stateRef.current = { activeIndex, loadedIndexes, failedIndexes, length: images.length };

  const markLoaded = useCallback((index: number) => {
    inFlightRef.current.delete(index);
    setLoadedIndexes((prev) => {
      if (prev.has(index)) return prev;
      const next = new Set(prev);
      next.add(index);
      return next;
    });
    setMountedIndexes((prev) => (prev.includes(index) ? prev : [...prev, index].sort((a, b) => a - b)));
  }, []);

  const markFailed = useCallback(
    (index: number) => {
      inFlightRef.current.delete(index);
      setFailedIndexes((prev) => {
        if (prev.has(index)) return prev;
        const nextFailed = new Set(prev);
        nextFailed.add(index);
        const { activeIndex: currentActive, loadedIndexes: loaded, length } = stateRef.current;
        if (index === currentActive) {
          const fallback = resolveActiveAfterSlideError(index, length, loaded, nextFailed);
          if (fallback != null && fallback !== currentActive) {
            queueMicrotask(() => setActiveIndex(fallback));
          }
        }
        return nextFailed;
      });
    },
    []
  );

  const startPreload = useCallback(
    (index: number, url: string) => {
      if (inFlightRef.current.has(index)) return;
      inFlightRef.current.add(index);
      const img = new Image();
      img.onload = () => markLoaded(index);
      img.onerror = () => markFailed(index);
      img.src = url;
    },
    [markFailed, markLoaded]
  );

  useEffect(() => {
    inFlightRef.current = new Set();
    setActiveIndex(0);
    setLoadedIndexes(new Set());
    setFailedIndexes(new Set());
    setMountedIndexes(images.length > 0 ? [0] : []);
  }, [images]);

  useEffect(() => {
    if (!shouldRenderPublicSlider(images)) return;

    const preloadIndex = getPendingSlidePreloadIndex(
      images.length,
      activeIndex,
      loadedIndexes,
      failedIndexes,
      inFlightRef.current
    );

    if (preloadIndex != null) {
      startPreload(preloadIndex, images[preloadIndex]!);
    }
  }, [images, activeIndex, loadedIndexes, failedIndexes, startPreload]);

  useEffect(() => {
    if (images.length <= 1) return;
    const timer = window.setTimeout(() => {
      setMountedIndexes((prev) =>
        pruneMountedSlideIndexes(activeIndex, images.length, loadedIndexes, failedIndexes, prev)
      );
    }, SLIDER_FADE_MS);
    return () => window.clearTimeout(timer);
  }, [activeIndex, images.length, loadedIndexes, failedIndexes]);

  useEffect(() => {
    if (!enabled || !shouldAutoplayPublicSlider(images)) return;
    const timer = window.setInterval(() => {
      const { activeIndex: current, loadedIndexes: loaded, failedIndexes: failed, length } =
        stateRef.current;
      const target = resolveAutoplaySlideIndex(current, length, loaded, failed);
      if (target !== current) setActiveIndex(target);
    }, SLIDER_AUTOPLAY_MS);
    return () => window.clearInterval(timer);
  }, [enabled, images]);

  if (!shouldRenderPublicSlider(images)) return null;

  const visibleIndexes = getMountedSlideIndexes(
    activeIndex,
    images.length,
    loadedIndexes,
    failedIndexes
  );
  const renderIndexes = visibleIndexes.length > 0 ? visibleIndexes : mountedIndexes;

  return (
    <div className={sliderSectionClass}>
      <div className={sliderInnerClass}>
        <div className={sliderFrameClass}>
          {renderIndexes.map((idx) => {
            const url = images[idx];
            if (!url) return null;
            const isActive = activeIndex === idx;
            const isPreloadOnly =
              !isActive && idx === getPreloadSlideIndex(activeIndex, images.length, failedIndexes);
            return (
              <div
                key={url}
                className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${
                  isActive ? "opacity-100 z-10" : "opacity-0 z-0"
                }`}
                aria-hidden={!isActive}
              >
                <img
                  src={url}
                  alt={`Menü Görseli ${idx + 1}`}
                  className={`w-full h-full object-cover transition-transform duration-[4000ms] ease-out ${
                    isActive ? "scale-110" : "scale-100"
                  }`}
                  loading={isActive ? "eager" : isPreloadOnly ? "eager" : "lazy"}
                  decoding="async"
                  onLoad={() => markLoaded(idx)}
                  onError={() => markFailed(idx)}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
