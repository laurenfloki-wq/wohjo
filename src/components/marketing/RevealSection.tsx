// Section reveals — CSS-driven, IntersectionObserver-triggered
// (flostruction-v5.html:740-744 + .reveal rules at lines 101-105).
// Deliberately NOT GSAP (brief: keep the reveals vanilla).
'use client';

import { useEffect, useRef, type ElementType, type FC, type ReactNode } from 'react';

interface RevealSectionProps {
  className?: string;
  /** Wrapping element — defaults to div (problem band uses div, the
   *  closing section passes 'section'). */
  as?: ElementType;
  id?: string;
  children: ReactNode;
}

export const RevealSection: FC<RevealSectionProps> = ({ className, as, id, children }) => {
  const Tag: ElementType = as ?? 'div';
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!('IntersectionObserver' in window)) { el.classList.add('show'); return; }
    const io = new IntersectionObserver(
      (es) => es.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add('show'); io.unobserve(e.target); }
      }),
      { threshold: 0.18 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return <Tag className={className} id={id} ref={ref}>{children}</Tag>;
};
