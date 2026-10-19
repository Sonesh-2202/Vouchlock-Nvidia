/**
 * Vouchlock Public Landing Page.
 * "Paper on the Desk" — Smooth-scrolling storytelling, GSAP animations,
 * interactive ledger excerpt with subtle pointer parallax, pinned sequence,
 * and authentic editorial typography.
 */

import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTheme } from '../theme-context.js';
import {
  gsap,
  ScrollTrigger,
  prefersReducedMotion,
  scrollToPosition,
  initSmoothScroll,
  destroySmoothScroll,
} from '../motion.js';
import { IconVerified, IconSun, IconMoon, IconMenu, IconClose } from '../components/icons.js';

export function LandingPage() {
  const { theme, toggleTheme } = useTheme();

  const heroRef = useRef<HTMLElement>(null);
  const excerptRef = useRef<HTMLDivElement>(null);
  const underlineRef = useRef<SVGPathElement>(null);
  const pinnedSectionRef = useRef<HTMLElement>(null);
  const pinnedTrackRef = useRef<HTMLDivElement>(null);
  const reportRef = useRef<HTMLDivElement>(null);

  const [activeStep, setActiveStep] = useState(0);
  const [navScrolled, setNavScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Initialize smooth scroll for marketing landing page; clean up on unmount
  useEffect(() => {
    initSmoothScroll();
    return () => {
      destroySmoothScroll();
    };
  }, []);

  // 1. Scroll listener for Nav hairline & shrink
  useEffect(() => {
    const onScroll = () => {
      setNavScrolled(window.scrollY > 40);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // 2. Parallax on live ledger excerpt (desktop only, non-reduced motion)
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const excerptEl = excerptRef.current;
    if (!excerptEl) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (window.innerWidth < 1024) return;
      const { innerWidth, innerHeight } = window;
      const xOffset = (e.clientX / innerWidth - 0.5) * 8;
      const yOffset = (e.clientY / innerHeight - 0.5) * 8;
      gsap.to(excerptEl, {
        x: xOffset,
        y: yOffset,
        duration: 0.8,
        ease: 'power2.out',
      });
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  // 3. Hero Choreography and Underline draw
  useEffect(() => {
    if (prefersReducedMotion()) return;

    const ctx = gsap.context(() => {
      // Underline stroke draw
      if (underlineRef.current) {
        const pathLen = underlineRef.current.getTotalLength
          ? underlineRef.current.getTotalLength()
          : 160;
        gsap.set(underlineRef.current, {
          strokeDasharray: pathLen,
          strokeDashoffset: pathLen,
        });
        gsap.to(underlineRef.current, {
          strokeDashoffset: 0,
          duration: 0.9,
          delay: 0.6,
          ease: 'power2.out',
        });
      }

      // Hero content entrance
      gsap.fromTo(
        '.hero-line',
        { y: 24, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.8,
          stagger: 0.1,
          ease: 'power2.out',
        },
      );

      // Excerpt assembly
      gsap.fromTo(
        '.excerpt-row',
        { opacity: 0, x: -12 },
        {
          opacity: 1,
          x: 0,
          duration: 0.5,
          stagger: 0.12,
          delay: 0.4,
          ease: 'power2.out',
        },
      );
    }, heroRef);

    return () => ctx.revert();
  }, []);

  // 4. Pinned Scroll Sequence: "How a claim becomes proof" (Desktop)
  useEffect(() => {
    if (prefersReducedMotion()) return;
    if (window.innerWidth < 1024) return;

    const sectionEl = pinnedSectionRef.current;
    const trackEl = pinnedTrackRef.current;
    if (!sectionEl || !trackEl) return;

    const ctx = gsap.context(() => {
      ScrollTrigger.create({
        trigger: sectionEl,
        start: 'top top',
        end: '+=200%',
        pin: true,
        scrub: 0.5,
        onUpdate: (self) => {
          const progress = self.progress;
          const stepIndex = Math.min(3, Math.floor(progress * 4));
          setActiveStep(stepIndex);
        },
      });
    }, sectionEl);

    return () => ctx.revert();
  }, []);

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: 'var(--desk)',
        color: 'var(--ink)',
        overflowX: 'hidden',
      }}
    >
      {/* ── Top Navigation Bar ── */}
      <nav
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 100,
          backgroundColor: navScrolled
            ? theme === 'dark'
              ? 'rgba(6, 9, 8, 0.94)'
              : 'rgba(248, 250, 249, 0.95)'
            : 'transparent',
          backdropFilter: navScrolled ? 'blur(12px)' : 'none',
          borderBottom: navScrolled ? '1px solid var(--border-subtle)' : '1px solid transparent',
          padding: navScrolled ? 'var(--space-3) var(--space-6)' : 'var(--space-5) var(--space-6)',
          transition:
            'padding var(--t-fast) var(--ease-out), background-color var(--t-fast) var(--ease-out), border-color var(--t-fast) var(--ease-out)',
        }}
      >
        <div
          className="container"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          {/* Brand Wordmark */}
          <Link
            to="/"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-3)',
              textDecoration: 'none',
              color: 'var(--ink)',
            }}
          >
            <span
              style={{
                width: 10,
                height: 10,
                backgroundColor: 'var(--proof)',
                borderRadius: 'var(--radius-sm)',
                display: 'inline-block',
              }}
            />
            <span
              className="serif-display"
              style={{
                fontSize: 'var(--font-size-lg)',
                fontWeight: 600,
                letterSpacing: '-0.02em',
              }}
            >
              Vouchlock
            </span>
            <span
              className="badge"
              style={{
                fontSize: '0.7rem',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: 'var(--ink-muted)',
              }}
            >
              Delivery Ledger
            </span>
          </Link>

          {/* Center Links */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-6)',
            }}
            className="no-mobile"
          >
            <button
              onClick={() => scrollToPosition('#product')}
              className="btn-ghost btn-sm"
              style={{ fontSize: 'var(--font-size-sm)', color: 'var(--ink-muted)' }}
            >
              Product
            </button>
            <button
              onClick={() => scrollToPosition('#how-it-works')}
              className="btn-ghost btn-sm"
              style={{ fontSize: 'var(--font-size-sm)', color: 'var(--ink-muted)' }}
            >
              How it works
            </button>
            <button
              onClick={() => scrollToPosition('#sample-report')}
              className="btn-ghost btn-sm"
              style={{ fontSize: 'var(--font-size-sm)', color: 'var(--ink-muted)' }}
            >
              Sample report
            </button>
          </div>

          {/* Right Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <button
              onClick={toggleTheme}
              className="btn btn-ghost btn-sm"
              title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
              aria-label="Toggle visual theme"
              style={{ padding: '0.4rem', border: '1px solid var(--border-subtle)' }}
            >
              {theme === 'dark' ? <IconSun size={15} /> : <IconMoon size={15} />}
            </button>

            <Link
              to="/login"
              className="btn btn-ghost btn-sm desktop-only"
              style={{ color: 'var(--text-primary)' }}
            >
              Sign in
            </Link>

            <Link
              to="/login"
              className="btn btn-primary btn-sm desktop-only"
              style={{
                fontWeight: 600,
                letterSpacing: '0.01em',
              }}
            >
              Create your workspace
            </Link>

            {/* Hamburger Menu Toggle on Mobile */}
            <button
              type="button"
              className="btn btn-ghost btn-sm mobile-only touch-target"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              aria-label="Toggle navigation menu"
              style={{ padding: '6px' }}
            >
              {mobileMenuOpen ? <IconClose size={20} /> : <IconMenu size={20} />}
            </button>
          </div>
        </div>

        {/* Sleek Mobile Slide-Down Navigation Drawer (< 768px) */}
        {mobileMenuOpen && (
          <div
            className="mobile-only"
            style={{
              marginTop: 'var(--space-3)',
              backgroundColor: 'var(--bg-surface)',
              borderTop: '1px solid var(--border-subtle)',
              borderBottom: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              padding: 'var(--space-4)',
              flexDirection: 'column',
              gap: 'var(--space-2)',
              boxShadow: 'var(--shadow-md)',
              animation: 'sheetSlideUp 200ms cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          >
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                scrollToPosition('#product');
              }}
              className="btn btn-ghost"
              style={{ justifyContent: 'flex-start', color: 'var(--text-primary)', width: '100%' }}
            >
              Product
            </button>
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                scrollToPosition('#how-it-works');
              }}
              className="btn btn-ghost"
              style={{ justifyContent: 'flex-start', color: 'var(--text-primary)', width: '100%' }}
            >
              How it works
            </button>
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                scrollToPosition('#sample-report');
              }}
              className="btn btn-ghost"
              style={{ justifyContent: 'flex-start', color: 'var(--text-primary)', width: '100%' }}
            >
              Sample report
            </button>
            <div
              style={{
                borderTop: '1px solid var(--border-subtle)',
                paddingTop: 'var(--space-3)',
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-2)',
              }}
            >
              <Link
                to="/login"
                onClick={() => setMobileMenuOpen(false)}
                className="btn btn-secondary"
                style={{ width: '100%', justifyContent: 'center' }}
              >
                Sign In
              </Link>
              <Link
                to="/login"
                onClick={() => setMobileMenuOpen(false)}
                className="btn btn-primary"
                style={{ width: '100%', justifyContent: 'center', fontWeight: 600 }}
              >
                Create your workspace →
              </Link>
            </div>
          </div>
        )}
      </nav>

      {/* ── Section 1: Hero with Mask Reveal & Live Ledger Excerpt ── */}
      <section
        ref={heroRef}
        id="product"
        style={{
          paddingTop: 'calc(var(--space-20) + 2rem)',
          paddingBottom: 'var(--space-20)',
          borderBottom: '1px solid var(--rule)',
          position: 'relative',
        }}
      >
        <div className="container">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
            {/* Left: Serif Headline & Editorial Subtext */}
            <div className="lg:col-span-7">
              <div
                className="hero-line"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 'var(--space-2)',
                  marginBottom: 'var(--space-4)',
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    backgroundColor: 'var(--proof)',
                    display: 'inline-block',
                  }}
                />
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 'var(--font-size-meta)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    color: 'var(--ink-muted)',
                  }}
                >
                  The Truthful Delivery Ledger
                </span>
              </div>

              <h1
                className="serif-display hero-line text-4xl sm:text-5xl lg:text-6xl"
                style={{
                  lineHeight: 1.08,
                  letterSpacing: '-0.035em',
                  marginBottom: 'var(--space-6)',
                  fontWeight: 600,
                }}
              >
                Know what you shipped, and{' '}
                <span className="editorial-underline-wrap">
                  <em style={{ fontStyle: 'italic', fontWeight: 500 }}>prove</em>
                  <svg
                    className="editorial-underline-svg"
                    viewBox="0 0 160 8"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      ref={underlineRef}
                      d="M2 5.5C40 2.5 110 2 158 5"
                      stroke="var(--proof)"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>{' '}
                it.
              </h1>

              <p
                className="hero-line"
                style={{
                  fontSize: 'var(--font-size-lead)',
                  lineHeight: 1.6,
                  color: 'var(--ink-muted)',
                  maxWidth: '52ch',
                  marginBottom: 'var(--space-8)',
                }}
              >
                Every software claim maps to verified tasks, empirical evidence, and named human
                sign-offs. When projects close, the delivery ledger is already complete.
              </p>

              <div
                className="hero-line"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-4)',
                  flexWrap: 'wrap',
                }}
              >
                <Link to="/login" className="btn btn-primary btn-lg" style={{ fontWeight: 600 }}>
                  Create your workspace →
                </Link>

                <button
                  onClick={() => scrollToPosition('#sample-report')}
                  className="btn btn-secondary btn-lg"
                  style={{ color: 'var(--ink)' }}
                >
                  Inspect sample report
                </button>
              </div>

              {/* Quiet note below hero CTA */}
              <div
                className="hero-line"
                style={{
                  marginTop: 'var(--space-6)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-3)',
                  fontSize: 'var(--font-size-meta)',
                  color: 'var(--ink-muted)',
                }}
              >
                <span className="mono-num">0% fluff</span>
                <span>•</span>
                <span>Self-hosted or local storage</span>
                <span>•</span>
                <span>Private workspaces backed by your account</span>
              </div>
            </div>

            {/* Right: Live Ledger Excerpt (Paper on the Desk with Glassmorphism) */}
            <div
              ref={excerptRef}
              className="w-full overflow-hidden lg:col-span-5"
              style={{
                position: 'relative',
              }}
            >
              <div
                className="glass-card"
                style={{
                  minHeight: 400,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  padding: 'var(--space-6)',
                  backgroundColor:
                    theme === 'dark' ? 'rgba(13, 20, 16, 0.88)' : 'rgba(255, 255, 255, 0.94)',
                  backdropFilter: 'blur(16px)',
                  color: 'var(--text-primary)',
                  border: '1px solid rgba(16, 185, 129, 0.25)',
                  borderRadius: 'var(--radius-lg)',
                  boxShadow:
                    '0 24px 60px -12px rgba(0, 0, 0, 0.3), 0 0 20px rgba(16, 185, 129, 0.1)',
                  transform: 'rotate(-0.4deg)',
                  transition: 'all 240ms cubic-bezier(0.16, 1, 0.3, 1)',
                }}
              >
                {/* Ledger Header */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    borderBottom: '1px solid var(--border-subtle)',
                    paddingBottom: 'var(--space-4)',
                    marginBottom: 'var(--space-4)',
                    flexShrink: 0,
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 'var(--font-size-meta)',
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                        color: 'var(--text-muted)',
                        marginBottom: 'var(--space-1)',
                      }}
                    >
                      Audit Slip #PP-8492
                    </div>
                    <div
                      style={{
                        fontFamily: 'var(--font-sans)',
                        fontWeight: 700,
                        letterSpacing: '-0.02em',
                        fontSize: 'var(--font-size-xl)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      Truthful Delivery Ledger
                    </div>
                  </div>

                  <div
                    className="stamp-seal"
                    style={{
                      borderRadius: '9999px',
                      boxShadow: '0 0 12px rgba(16, 185, 129, 0.25)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        backgroundColor: '#10B981',
                        display: 'inline-block',
                      }}
                    />
                    <IconVerified size={14} />
                    <span>Verified</span>
                  </div>
                </div>

                {/* Excerpt rows */}
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 'var(--space-3)',
                    flex: 1,
                    justifyContent: 'center',
                  }}
                >
                  {/* Row 1 */}
                  <div
                    className="excerpt-row"
                    style={{
                      border: '1px solid var(--border-subtle)',
                      padding: 'var(--space-3) var(--space-4)',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--bg-surface-elevated)',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: 'var(--space-1)',
                      }}
                    >
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: 'var(--font-size-meta)',
                          color: 'var(--text-muted)',
                        }}
                      >
                        REQ-001
                      </span>
                      <span className="badge badge-proof" style={{ fontSize: '0.7rem' }}>
                        Proven
                      </span>
                    </div>
                    <div
                      style={{
                        fontWeight: 600,
                        fontSize: 'var(--font-size-sm)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      Zero-Trust Token Revocation
                    </div>
                    <div
                      style={{
                        fontSize: 'var(--font-size-meta)',
                        color: 'var(--text-muted)',
                        marginTop: '0.2rem',
                      }}
                    >
                      Evidence: Redis rev-set hash & automated integration sweep pass
                    </div>
                  </div>

                  {/* Row 2 */}
                  <div
                    className="excerpt-row"
                    style={{
                      border: '1px solid var(--border-subtle)',
                      padding: 'var(--space-3) var(--space-4)',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--bg-surface-elevated)',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: 'var(--space-1)',
                      }}
                    >
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: 'var(--font-size-meta)',
                          color: 'var(--text-muted)',
                        }}
                      >
                        REQ-002
                      </span>
                      <span className="badge badge-proof" style={{ fontSize: '0.7rem' }}>
                        Proven
                      </span>
                    </div>
                    <div
                      style={{
                        fontWeight: 600,
                        fontSize: 'var(--font-size-sm)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      PostgreSQL WAL Audit Log Stream
                    </div>
                    <div
                      style={{
                        fontSize: 'var(--font-size-meta)',
                        color: 'var(--text-muted)',
                        marginTop: '0.2rem',
                      }}
                    >
                      Evidence: PG-Audit replication test log (42 tests verified)
                    </div>
                  </div>

                  {/* Row 3 - Gap row with dashed border */}
                  <div
                    className="excerpt-row"
                    style={{
                      border: '1px dashed var(--border-strong)',
                      padding: 'var(--space-3) var(--space-4)',
                      borderRadius: 'var(--radius-sm)',
                      background: 'transparent',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: 'var(--space-1)',
                      }}
                    >
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: 'var(--font-size-meta)',
                          color: 'var(--stamp)',
                        }}
                      >
                        REQ-003 • EVIDENCE GAP
                      </span>
                      <span className="badge badge-blocked" style={{ fontSize: '0.7rem' }}>
                        Unverified
                      </span>
                    </div>
                    <div
                      style={{
                        fontWeight: 600,
                        fontSize: 'var(--font-size-sm)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      Client Automated Data Export Zip
                    </div>
                    <div
                      style={{
                        fontSize: 'var(--font-size-meta)',
                        color: 'var(--stamp)',
                        marginTop: '0.2rem',
                      }}
                    >
                      Awaiting verification sign-off by Technical Director
                    </div>
                  </div>
                </div>

                {/* Excerpt Footer Sign-off (Rock-solid, never jumps or shifts) */}
                <div
                  style={{
                    marginTop: 'var(--space-5)',
                    paddingTop: 'var(--space-3)',
                    borderTop: '1px solid var(--border-subtle)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: 'var(--font-size-meta)',
                    flexShrink: 0,
                  }}
                >
                  <span style={{ color: 'var(--text-muted)' }}>
                    Ledger balance:{' '}
                    <strong style={{ color: 'var(--text-primary)' }}>2 of 3 proven</strong>
                  </span>
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--accent-primary)',
                      fontWeight: 600,
                    }}
                  >
                    66.7% Truthful Rate
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Section 2: "How a claim becomes proof" (Pinned sequence) ── */}
      <section
        ref={pinnedSectionRef}
        id="how-it-works"
        style={{
          padding: 'var(--space-20) 0',
          borderBottom: '1px solid var(--rule)',
          position: 'relative',
        }}
      >
        <div className="container">
          <div style={{ marginBottom: 'var(--space-10)' }}>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--font-size-meta)',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--ink-muted)',
              }}
            >
              The Traceability Chain
            </span>
            <h2
              className="serif-display"
              style={{
                fontSize: 'var(--font-size-3xl)',
                marginTop: 'var(--space-2)',
                letterSpacing: '-0.025em',
              }}
            >
              How a brief clause becomes irrevocable proof.
            </h2>
          </div>

          <div
            ref={pinnedTrackRef}
            className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center w-full"
          >
            {/* Left: Step Descriptions */}
            <div
              className="w-full"
              style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}
            >
              {[
                {
                  step: '01',
                  title: 'Requirement parsed from Source Brief',
                  desc: 'Brief clauses are distilled into scoped, atomic requirement items with measurable acceptance criteria.',
                },
                {
                  step: '02',
                  title: 'Tasks linked explicitly to requirement ID',
                  desc: 'Every PR, branch, and engineering commit maps back directly to a ledger line. Rogue tasks are flagged immediately.',
                },
                {
                  step: '03',
                  title: 'Evidence slips attached with verifiable artifacts',
                  desc: 'PR diffs, automated test run outputs, deployment hashes, and screen recordings are deposited as immutable evidence.',
                },
                {
                  step: '04',
                  title: 'Human verification seals the delivery ledger',
                  desc: 'A named human reviewer with explicit credentials places their sign-off stamp. Gaps cannot hide.',
                },
              ].map((item, index) => {
                const isSelected = activeStep === index;
                return (
                  <div
                    key={item.step}
                    onClick={() => setActiveStep(index)}
                    style={{
                      padding: 'var(--space-5)',
                      borderLeft: `2px solid ${isSelected ? 'var(--proof)' : 'var(--rule)'}`,
                      backgroundColor: isSelected ? 'var(--desk-raised)' : 'transparent',
                      borderRadius: '0 var(--radius-sm) var(--radius-sm) 0',
                      cursor: 'pointer',
                      transition: 'all var(--t-fast) var(--ease-out)',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--space-3)',
                        marginBottom: 'var(--space-2)',
                      }}
                    >
                      <span
                        className="mono-num"
                        style={{
                          fontSize: 'var(--font-size-sm)',
                          fontWeight: 600,
                          color: isSelected ? 'var(--proof)' : 'var(--ink-muted)',
                        }}
                      >
                        {item.step}
                      </span>
                      <h3
                        style={{
                          fontSize: 'var(--font-size-lg)',
                          fontWeight: 600,
                          color: isSelected ? 'var(--ink)' : 'var(--ink-muted)',
                        }}
                      >
                        {item.title}
                      </h3>
                    </div>
                    <p
                      style={{
                        fontSize: 'var(--font-size-sm)',
                        color: 'var(--ink-muted)',
                        lineHeight: 1.55,
                      }}
                    >
                      {item.desc}
                    </p>
                  </div>
                );
              })}
            </div>

            {/* Right: Dynamic Interactive Traceability Node Card */}
            <div className="w-full">
              <div
                className="min-h-[340px] transition-all duration-300"
                style={{
                  padding: 'var(--space-8)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-primary)',
                  boxShadow: 'var(--shadow-sm, 0 1px 3px rgba(0,0,0,0.05))',
                }}
              >
                <div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      borderBottom: '1px solid var(--rule)',
                      paddingBottom: 'var(--space-3)',
                      marginBottom: 'var(--space-5)',
                    }}
                  >
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 'var(--font-size-meta)',
                        color: 'var(--ink-muted)',
                        textTransform: 'uppercase',
                      }}
                    >
                      Stage Progress: Step {activeStep + 1} of 4
                    </span>
                    <span
                      className="mono-num"
                      style={{
                        fontSize: 'var(--font-size-meta)',
                        color: activeStep === 3 ? 'var(--proof)' : 'var(--ochre)',
                        fontWeight: 600,
                      }}
                    >
                      {activeStep === 3 ? '100% PROVEN' : `${(activeStep + 1) * 25}% ACCUMULATED`}
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--space-3)',
                        opacity: activeStep >= 0 ? 1 : 0.35,
                      }}
                    >
                      <div
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: '50%',
                          backgroundColor: activeStep >= 0 ? 'var(--proof)' : 'var(--rule)',
                          color: '#ffffff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '12px',
                          fontWeight: 700,
                        }}
                      >
                        ✓
                      </div>
                      <div>
                        <div
                          style={{
                            fontSize: 'var(--font-size-sm)',
                            fontWeight: 600,
                            color: 'var(--ink)',
                          }}
                        >
                          Requirement Defined
                        </div>
                        <div
                          style={{ fontSize: 'var(--font-size-meta)', color: 'var(--ink-muted)' }}
                        >
                          "All patient data encrypted at rest with AES-256-GCM"
                        </div>
                      </div>
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--space-3)',
                        opacity: activeStep >= 1 ? 1 : 0.35,
                      }}
                    >
                      <div
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: '50%',
                          backgroundColor: activeStep >= 1 ? 'var(--proof)' : 'var(--rule)',
                          color: '#ffffff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '12px',
                          fontWeight: 700,
                        }}
                      >
                        ✓
                      </div>
                      <div>
                        <div
                          style={{
                            fontSize: 'var(--font-size-sm)',
                            fontWeight: 600,
                            color: 'var(--ink)',
                          }}
                        >
                          Engineering Tasks Linked
                        </div>
                        <div
                          style={{ fontSize: 'var(--font-size-meta)', color: 'var(--ink-muted)' }}
                        >
                          Task #104: Apply KMS key envelope encryption pipeline
                        </div>
                      </div>
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--space-3)',
                        opacity: activeStep >= 2 ? 1 : 0.35,
                      }}
                    >
                      <div
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: '50%',
                          backgroundColor: activeStep >= 2 ? 'var(--proof)' : 'var(--rule)',
                          color: '#ffffff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '12px',
                          fontWeight: 700,
                        }}
                      >
                        ✓
                      </div>
                      <div>
                        <div
                          style={{
                            fontSize: 'var(--font-size-sm)',
                            fontWeight: 600,
                            color: 'var(--ink)',
                          }}
                        >
                          Verifiable Evidence Deposited
                        </div>
                        <div
                          style={{ fontSize: 'var(--font-size-meta)', color: 'var(--ink-muted)' }}
                        >
                          SHA-256: <code>e8b91a...40cf</code> • KMS key rotation validation log
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    paddingTop: 'var(--space-4)',
                    borderTop: '1px solid var(--rule)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div style={{ fontSize: 'var(--font-size-meta)', color: 'var(--ink-muted)' }}>
                    {activeStep === 3
                      ? 'Signed by the named project reviewer'
                      : 'Pending final human sign-off stamp...'}
                  </div>
                  {activeStep === 3 && (
                    <div className="stamp-seal" style={{ margin: 0 }}>
                      <IconVerified size={14} />
                      <span>LEGALLY VERIFIED</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Section 3: The Truthful Delivery Report on Paper ── */}
      <section
        id="sample-report"
        style={{
          padding: 'var(--space-20) 0',
          borderBottom: '1px solid var(--rule)',
          backgroundColor: 'var(--desk)',
        }}
      >
        <div className="container">
          <div style={{ textAlign: 'center', maxWidth: '640px', margin: '0 auto var(--space-12)' }}>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--font-size-meta)',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--ink-muted)',
              }}
            >
              Document of Record
            </span>
            <h2
              className="serif-display"
              style={{
                fontSize: 'var(--font-size-3xl)',
                letterSpacing: '-0.025em',
                marginTop: 'var(--space-2)',
                marginBottom: 'var(--space-3)',
              }}
            >
              The Truthful Delivery Report
            </h2>
            <p style={{ color: 'var(--ink-muted)', fontSize: 'var(--font-size-base)' }}>
              No vague summaries. When a sprint completes, Vouchlock generates an authoritative
              delivery ledger that stands in contract dispute.
            </p>
          </div>

          {/* Centered Paper Sheet Document */}
          <div
            ref={reportRef}
            className="paper-sheet"
            style={{
              maxWidth: '920px',
              margin: '0 auto',
              padding: 'var(--space-10) var(--space-12)',
            }}
          >
            {/* Top Sheet Header */}
            <div
              style={{
                borderBottom: '2px solid var(--ink)',
                paddingBottom: 'var(--space-6)',
                marginBottom: 'var(--space-8)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  marginBottom: 'var(--space-4)',
                }}
              >
                <div>
                  <div
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 'var(--font-size-meta)',
                      color: 'var(--ink-muted)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                    }}
                  >
                    OFFICIAL DELIVERY LEDGER • FORM DL-2026
                  </div>
                  <h3
                    className="serif-display"
                    style={{
                      fontSize: 'var(--font-size-2xl)',
                      marginTop: 'var(--space-1)',
                      color: 'var(--ink)',
                    }}
                  >
                    Healthcare Core API Migration v3.1
                  </h3>
                  <div
                    style={{
                      fontSize: 'var(--font-size-meta)',
                      color: 'var(--ink-muted)',
                      marginTop: '0.2rem',
                    }}
                  >
                    Client: Horizon Medical Systems • Prepared by: Redstone Engineering
                  </div>
                </div>

                <div className="stamp-seal" style={{ padding: '0.5rem 1rem' }}>
                  <IconVerified size={16} />
                  <span>AUTHENTIC RECORD</span>
                </div>
              </div>

              {/* Stat Numerals Strip */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: 'var(--space-4)',
                  paddingTop: 'var(--space-4)',
                  borderTop: '1px solid var(--rule)',
                }}
              >
                <div>
                  <div style={{ fontSize: 'var(--font-size-meta)', color: 'var(--ink-muted)' }}>
                    Requirements
                  </div>
                  <div
                    className="mono-num serif-display"
                    style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--ink)' }}
                  >
                    14
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 'var(--font-size-meta)', color: 'var(--proof)' }}>
                    Proven With Proof
                  </div>
                  <div
                    className="mono-num serif-display"
                    style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--proof)' }}
                  >
                    13
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 'var(--font-size-meta)', color: 'var(--stamp)' }}>
                    Recorded Gaps
                  </div>
                  <div
                    className="mono-num serif-display"
                    style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--stamp)' }}
                  >
                    1
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 'var(--font-size-meta)', color: 'var(--ink-muted)' }}>
                    Truthful Score
                  </div>
                  <div
                    className="mono-num serif-display"
                    style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--ink)' }}
                  >
                    92.8%
                  </div>
                </div>
              </div>
            </div>

            {/* Claims vs Evidence Table */}
            <div style={{ marginBottom: 'var(--space-8)' }}>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 'var(--font-size-meta)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: 'var(--ink-muted)',
                  marginBottom: 'var(--space-3)',
                }}
              >
                Claims & Empirical Evidence Summary
              </div>

              <table className="table-ledger" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ width: '15%' }}>Ref</th>
                    <th style={{ width: '45%' }}>Agreed Requirement Claim</th>
                    <th style={{ width: '25%' }}>Empirical Evidence</th>
                    <th style={{ width: '15%', textAlign: 'right' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="mono-num">SEC-01</td>
                    <td>HIPAA-compliant cryptographic audit trail on all query endpoints</td>
                    <td style={{ fontSize: 'var(--font-size-meta)' }}>
                      PR #482 • 120 tests passed
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <span className="badge badge-proof">Verified</span>
                    </td>
                  </tr>
                  <tr>
                    <td className="mono-num">PERF-04</td>
                    <td>P99 response latency under 120ms during 5,000 req/sec load</td>
                    <td style={{ fontSize: 'var(--font-size-meta)' }}>
                      K6 load run log (p99=84ms)
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <span className="badge badge-proof">Verified</span>
                    </td>
                  </tr>
                  <tr>
                    <td className="mono-num">DAT-09</td>
                    <td>Automated nightly cold-storage archive replication to S3 Glacier</td>
                    <td style={{ fontSize: 'var(--font-size-meta)', color: 'var(--stamp)' }}>
                      No backup manifest log
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <span className="badge badge-blocked">Gap Marked</span>
                    </td>
                  </tr>
                  <tr>
                    <td className="mono-num">REL-02</td>
                    <td>Zero-downtime Blue/Green rolling deployment rollback hook</td>
                    <td style={{ fontSize: 'var(--font-size-meta)' }}>
                      ArgoCD canary release hash
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <span className="badge badge-proof">Verified</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Hand-signed Verification Block */}
            <div
              style={{
                borderTop: '1px solid var(--rule)',
                paddingTop: 'var(--space-6)',
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
                gap: 'var(--space-8)',
                alignItems: 'flex-end',
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 'var(--font-size-meta)',
                    color: 'var(--ink-muted)',
                    marginBottom: 'var(--space-1)',
                  }}
                >
                  Verified Signatory Statement
                </div>
                <p
                  style={{ fontSize: 'var(--font-size-sm)', color: 'var(--ink)', lineHeight: 1.5 }}
                >
                  "I hereby attest that the thirteen proven claims listed above have been
                  empirically tested and inspected against real system logs. The one noted gap
                  remains unfulfilled and is formally recorded."
                </p>
              </div>

              <div
                style={{
                  border: '1px solid var(--rule)',
                  padding: 'var(--space-4)',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'rgba(255, 255, 255, 0.4)',
                }}
              >
                <div
                  style={{
                    fontSize: 'var(--font-size-meta)',
                    color: 'var(--ink-muted)',
                    marginBottom: 'var(--space-2)',
                  }}
                >
                  Digital Stamp & Signature
                </div>
                <div
                  className="serif-display"
                  style={{
                    fontSize: '1.25rem',
                    fontStyle: 'italic',
                    color: 'var(--ink)',
                    marginBottom: 'var(--space-2)',
                  }}
                >
                  Elena Rostova, Lead Architect
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.72rem',
                    color: 'var(--ink-muted)',
                  }}
                >
                  TIMESTAMP: 2026-10-11T14:22:08Z • KEY: ED25519-7F3A-981C
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Section 4: Editorial Principles (01, 02, 03) ── */}
      <section
        style={{
          padding: 'var(--space-20) 0',
          borderBottom: '1px solid var(--rule)',
        }}
      >
        <div className="container">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-16)' }}>
            {/* Principle 01 - Left heavy */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '120px minmax(0, 1fr)',
                gap: 'var(--space-8)',
                borderBottom: '1px solid var(--rule)',
                paddingBottom: 'var(--space-10)',
              }}
            >
              <div
                className="serif-display mono-num"
                style={{
                  fontSize: 'var(--font-size-display)',
                  color: 'var(--proof)',
                  lineHeight: 0.9,
                }}
              >
                01
              </div>
              <div style={{ maxWidth: '820px' }}>
                <h3
                  className="serif-display"
                  style={{
                    fontSize: 'var(--font-size-2xl)',
                    marginBottom: 'var(--space-3)',
                    letterSpacing: '-0.02em',
                  }}
                >
                  No unverified claims.
                </h3>
                <p
                  style={{
                    fontSize: 'var(--font-size-lead)',
                    color: 'var(--ink-muted)',
                    lineHeight: 1.6,
                  }}
                >
                  A closed Jira ticket is not proof. Real answers require raw test runs,
                  commit hashes, and human sign-off stamps. If evidence is absent, the ledger
                  marks an unambiguous gap.
                </p>
              </div>
            </div>

            {/* Principle 02 - Right heavy */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1fr) 120px',
                gap: 'var(--space-8)',
                borderBottom: '1px solid var(--rule)',
                paddingBottom: 'var(--space-10)',
              }}
            >
              <div style={{ maxWidth: '820px', justifySelf: 'end', textAlign: 'right' }}>
                <h3
                  className="serif-display"
                  style={{
                    fontSize: 'var(--font-size-2xl)',
                    marginBottom: 'var(--space-3)',
                    letterSpacing: '-0.02em',
                  }}
                >
                  Evidence is physically referenced, never assumed.
                </h3>
                <p
                  style={{
                    fontSize: 'var(--font-size-lead)',
                    color: 'var(--ink-muted)',
                    lineHeight: 1.6,
                  }}
                >
                  Evidence is an immutable artifact: terminal outputs, schema snapshots,
                  and verifiable screen traces. Cryptographic evidence cannot be bluff-claimed.
                </p>
              </div>
              <div
                className="serif-display mono-num"
                style={{
                  fontSize: 'var(--font-size-display)',
                  color: 'var(--ink-muted)',
                  lineHeight: 0.9,
                }}
              >
                02
              </div>
            </div>

            {/* Principle 03 - Full width */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '120px minmax(0, 1fr)',
                gap: 'var(--space-8)',
              }}
            >
              <div
                className="serif-display mono-num"
                style={{
                  fontSize: 'var(--font-size-display)',
                  color: 'var(--stamp)',
                  lineHeight: 0.9,
                }}
              >
                03
              </div>
              <div style={{ maxWidth: '820px' }}>
                <h3
                  className="serif-display"
                  style={{
                    fontSize: 'var(--font-size-2xl)',
                    marginBottom: 'var(--space-3)',
                    letterSpacing: '-0.02em',
                  }}
                >
                  Truth is cheaper than post-launch disputes.
                </h3>
                <p
                  style={{
                    fontSize: 'var(--font-size-lead)',
                    color: 'var(--ink-muted)',
                    lineHeight: 1.6,
                  }}
                >
                  When client and engineering teams inspect the exact same signed ledger, scope
                  creep evaporates. Completed work is certified, and invoices are approved without argument.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Section 5: Who it is for (Typographic Asymmetric Block) ── */}
      <section
        style={{
          padding: 'var(--space-20) 0',
          borderBottom: '1px solid var(--rule)',
          backgroundColor: 'var(--desk-raised)',
        }}
      >
        <div className="container">
          <div style={{ maxWidth: '720px', marginBottom: 'var(--space-10)' }}>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--font-size-meta)',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--ink-muted)',
              }}
            >
              Intended Operators
            </span>
            <h2
              className="serif-display"
              style={{
                fontSize: 'var(--font-size-3xl)',
                letterSpacing: '-0.025em',
                marginTop: 'var(--space-2)',
              }}
            >
              Built for teams whose reputation rests on proof.
            </h2>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 'var(--space-6)',
            }}
          >
            <div
              className="card"
              style={{
                background: 'var(--desk)',
                padding: 'var(--space-6)',
              }}
            >
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 'var(--font-size-meta)',
                  color: 'var(--proof)',
                  marginBottom: 'var(--space-2)',
                }}
              >
                ROLE: INDEPENDENT CONTRACTOR
              </div>
              <h4
                style={{
                  fontSize: 'var(--font-size-lg)',
                  fontWeight: 600,
                  marginBottom: 'var(--space-2)',
                }}
              >
                Freelance Technical Leads
              </h4>
              <p
                style={{
                  fontSize: 'var(--font-size-sm)',
                  color: 'var(--ink-muted)',
                  lineHeight: 1.55,
                }}
              >
                Hand over client software with a signed delivery ledger. Turns disputed final
                milestone payments into immediate wire transfers.
              </p>
            </div>

            <div
              className="card"
              style={{
                background: 'var(--desk)',
                padding: 'var(--space-6)',
              }}
            >
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 'var(--font-size-meta)',
                  color: 'var(--ochre)',
                  marginBottom: 'var(--space-2)',
                }}
              >
                ROLE: ACADEMIC & CAPSTONE
              </div>
              <h4
                style={{
                  fontSize: 'var(--font-size-lg)',
                  fontWeight: 600,
                  marginBottom: 'var(--space-2)',
                }}
              >
                Student Engineering Teams
              </h4>
              <p
                style={{
                  fontSize: 'var(--font-size-sm)',
                  color: 'var(--ink-muted)',
                  lineHeight: 1.55,
                }}
              >
                Present final capstones with verifiable code traces rather than slides.
                Reviewers inspect requirement lineage directly down to automated CI logs.
              </p>
            </div>

            <div
              className="card"
              style={{
                background: 'var(--desk)',
                padding: 'var(--space-6)',
              }}
            >
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 'var(--font-size-meta)',
                  color: 'var(--stamp)',
                  marginBottom: 'var(--space-2)',
                }}
              >
                ROLE: BOUTIQUE AGENCY
              </div>
              <h4
                style={{
                  fontSize: 'var(--font-size-lg)',
                  fontWeight: 600,
                  marginBottom: 'var(--space-2)',
                }}
              >
                Specialist Software Agencies
              </h4>
              <p
                style={{
                  fontSize: 'var(--font-size-sm)',
                  color: 'var(--ink-muted)',
                  lineHeight: 1.55,
                }}
              >
                Eliminate subjective acceptance debates. Deliver each milestone with an
                authoritative Truthful Delivery Report signed by named reviewers.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Section 6: Closing Heroic CTA ── */}
      <section
        style={{
          padding: 'var(--space-24) 0',
          textAlign: 'center',
          borderBottom: '1px solid var(--rule)',
          position: 'relative',
        }}
      >
        <div className="container" style={{ maxWidth: '820px' }}>
          <h2
            className="serif-display"
            style={{
              fontSize: 'var(--font-size-hero)',
              lineHeight: 1.05,
              letterSpacing: '-0.03em',
              marginBottom: 'var(--space-6)',
            }}
          >
            Start your delivery ledger now.
          </h2>
          <p
            style={{
              fontSize: 'var(--font-size-lead)',
              color: 'var(--ink-muted)',
              marginBottom: 'var(--space-8)',
              maxWidth: '56ch',
              margin: '0 auto var(--space-8)',
            }}
          >
            Create an account to enter your own project brief, build a plan, and track delivery in
            your workspace.
          </p>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 'var(--space-4)',
              flexWrap: 'wrap',
            }}
          >
            <Link to="/login" className="btn btn-primary btn-lg" style={{ fontWeight: 600 }}>
              Create your workspace →
            </Link>
            <Link to="/login" className="btn btn-secondary btn-lg" style={{ color: 'var(--ink)' }}>
              Sign into workspace
            </Link>
          </div>
        </div>
      </section>

      {/* ── Section 7: Authentic Quiet Footer ── */}
      <footer
        style={{
          padding: 'var(--space-10) 0',
          backgroundColor: 'var(--desk)',
          fontSize: 'var(--font-size-meta)',
          color: 'var(--ink-muted)',
        }}
      >
        <div
          className="container"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 'var(--space-4)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
            <span style={{ fontWeight: 600, color: 'var(--ink)' }}>Vouchlock</span>
            <span>•</span>
            <span>The Delivery Ledger Suite</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-6)' }}>
            <Link to="/terms" className="link-editorial" style={{ color: 'var(--ink-muted)' }}>
              Terms of Service
            </Link>
            <Link to="/privacy" className="link-editorial" style={{ color: 'var(--ink-muted)' }}>
              Privacy Policy
            </Link>
            <span>Data stored locally in session storage</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
