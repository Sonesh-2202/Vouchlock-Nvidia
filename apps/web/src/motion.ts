/**
 * ProjectPilot Motion System — GSAP + Lenis smooth scrolling & choreography.
 * Adheres to 60fps performance budgets, unified ticker, and prefers-reduced-motion.
 */

import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Flip } from 'gsap/Flip';
import Lenis from 'lenis';
export { useGSAP } from '@gsap/react';

// Register core plugins
gsap.registerPlugin(ScrollTrigger, Flip);

// ── Motion Tokens ──
export const MOTION = {
  duration: {
    instant: 0.09,
    fast: 0.15,
    base: 0.22,
    slow: 0.32,
    hero: 0.75,
    stamp: 0.32,
  },
  ease: {
    out: 'power2.out',
    outQuart: 'power4.out',
    inOut: 'power2.inOut',
    springStamp: 'back.out(1.8)',
    springCard: 'back.out(1.4)',
  },
  stagger: {
    tight: 0.03,
    base: 0.05,
    relaxed: 0.08,
  },
} as const;

// ── Reduced Motion Detection ──
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// ── Session Entrance Flag ──
// Data screens animate once per session; repeat navigation is instant
export function shouldAnimateEntrance(key: string): boolean {
  if (prefersReducedMotion()) return false;
  try {
    const fullKey = `pp_motion_${key}`;
    if (sessionStorage.getItem(fullKey)) return false;
    sessionStorage.setItem(fullKey, '1');
    return true;
  } catch {
    return true;
  }
}

// ── Lenis Smooth Scrolling Engine ──
let lenisInstance: Lenis | null = null;

export function initSmoothScroll(): Lenis | null {
  if (typeof window === 'undefined') return null;
  if (prefersReducedMotion()) return null;
  if (lenisInstance) return lenisInstance;

  lenisInstance = new Lenis({
    lerp: 0.1,
    duration: 1.1,
    smoothWheel: true,
    syncTouch: false, // native touch handling on mobile
  });

  // Connect Lenis to GSAP's single animation clock
  lenisInstance.on('scroll', ScrollTrigger.update);

  gsap.ticker.add((time) => {
    lenisInstance?.raf(time * 1000);
  });
  gsap.ticker.lagSmoothing(0);

  return lenisInstance;
}

export function getLenis(): Lenis | null {
  return lenisInstance;
}

/**
 * Freeze document scroll when modal, drawer, or command palette opens.
 */
export function pauseSmoothScroll() {
  lenisInstance?.stop();
}

/**
 * Resume document scroll on modal/drawer close.
 */
export function resumeSmoothScroll() {
  lenisInstance?.start();
}

/**
 * Destroy Lenis instance completely to restore 100% native uninhibited browser scrolling.
 */
export function destroySmoothScroll() {
  if (lenisInstance) {
    lenisInstance.destroy();
    lenisInstance = null;
  }
}

/**
 * Scroll smoothly to element or top.
 */
export function scrollToPosition(target: number | string | HTMLElement, immediate = false) {
  if (lenisInstance && !prefersReducedMotion()) {
    lenisInstance.scrollTo(target, { immediate, duration: immediate ? 0 : 0.8 });
  } else if (typeof window !== 'undefined') {
    if (typeof target === 'number') {
      window.scrollTo({ top: target, behavior: immediate ? 'instant' : 'smooth' });
    } else if (typeof target === 'string') {
      const el = document.querySelector(target);
      el?.scrollIntoView({ behavior: immediate ? 'instant' : 'smooth' });
    } else if (target instanceof HTMLElement) {
      target.scrollIntoView({ behavior: immediate ? 'instant' : 'smooth' });
    }
  }
}

/**
 * View Transitions helper with fallback for browsers without document.startViewTransition.
 */
export function withViewTransition(callback: () => void | Promise<void>) {
  const docWithTransition = document as Document & {
    startViewTransition?: (cb: () => void | Promise<void>) => unknown;
  };
  if (docWithTransition.startViewTransition) {
    docWithTransition.startViewTransition(callback);
  } else {
    callback();
  }
}

// ── Signature Animation 1: Verification Stamp ──
export function animateVerificationStamp(
  stampEl: HTMLElement | null,
  ringEl?: HTMLElement | null,
  onComplete?: () => void,
) {
  if (!stampEl) return;
  if (prefersReducedMotion()) {
    gsap.set(stampEl, { opacity: 1, scale: 1, rotation: -2 });
    onComplete?.();
    return;
  }

  const tl = gsap.timeline({ onComplete });
  tl.fromTo(
    stampEl,
    { scale: 1.28, opacity: 0, rotation: 5 },
    {
      scale: 1,
      opacity: 1,
      rotation: -2,
      duration: MOTION.duration.stamp,
      ease: MOTION.ease.springStamp,
    },
  );

  if (ringEl) {
    tl.fromTo(
      ringEl,
      { scale: 0.9, opacity: 0.8 },
      { scale: 1.5, opacity: 0, duration: 0.45, ease: 'power2.out' },
      '-=0.2',
    );
  }
}

// ── Signature Animation 2: Number Counting ──
export function animateNumberCount(
  element: HTMLElement | null,
  targetValue: number,
  options?: { duration?: number; prefix?: string; suffix?: string },
) {
  if (!element) return;
  const prefix = options?.prefix ?? '';
  const suffix = options?.suffix ?? '';
  const duration = options?.duration ?? 0.85;

  if (prefersReducedMotion()) {
    element.textContent = `${prefix}${targetValue}${suffix}`;
    return;
  }

  const obj = { val: 0 };
  gsap.to(obj, {
    val: targetValue,
    duration,
    ease: 'power2.out',
    onUpdate: () => {
      element.textContent = `${prefix}${Math.round(obj.val)}${suffix}`;
    },
  });
}

// ── Signature Animation 3: Traceability Chain Draw ──
export function animateTraceabilityChain(
  svgPath: SVGPathElement | null,
  nodes: (HTMLElement | null)[],
) {
  if (prefersReducedMotion()) {
    if (svgPath) {
      svgPath.style.strokeDashoffset = '0';
    }
    nodes.forEach((n) => {
      if (n) {
        gsap.set(n, { opacity: 1, y: 0 });
      }
    });
    return;
  }

  const tl = gsap.timeline();
  if (svgPath) {
    const length = svgPath.getTotalLength ? svgPath.getTotalLength() : 200;
    svgPath.style.strokeDasharray = `${length}`;
    svgPath.style.strokeDashoffset = `${length}`;
    tl.to(svgPath, {
      strokeDashoffset: 0,
      duration: 0.4,
      ease: 'power2.out',
    });
  }

  const validNodes = nodes.filter(Boolean) as HTMLElement[];
  if (validNodes.length > 0) {
    tl.fromTo(
      validNodes,
      { opacity: 0, y: 6 },
      {
        opacity: 1,
        y: 0,
        duration: 0.2,
        stagger: MOTION.stagger.base,
        ease: 'power2.out',
      },
      '-=0.2',
    );
  }
}

export { gsap, ScrollTrigger, Flip };
