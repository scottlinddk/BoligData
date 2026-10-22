import { useEffect, useRef, useState } from "react";

/** Pixel width of an element, kept current as it resizes. Falls back to `initial` until measured. */
export function useElementWidth<T extends HTMLElement>(initial = 640) {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(initial);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => setWidth(Math.round(element.getBoundingClientRect().width) || initial);
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [initial]);
  return [ref, width] as const;
}
