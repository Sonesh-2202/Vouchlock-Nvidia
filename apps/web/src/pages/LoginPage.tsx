/**
 * Login / Register page — The Delivery Ledger design.
 * Asymmetric 7/12 & 5/12 split layout with live Truthful Delivery Report excerpt.
 * Zero gradients, zero emojis, zero Lucide icons.
 */

import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth-context.js';
import { useTheme } from '../theme-context.js';
import { IconSun, IconMoon } from '../components/icons.js';

export function LoginPage() {
  const { login, register, resetPassword, loading, error, clearError } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [mode, setMode] = useState<'login' | 'register' | 'reset'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [resetSuccessMessage, setResetSuccessMessage] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    setResetSuccessMessage(null);

    if (mode === 'reset') {
      if (password.length < 8) {
        setLocalError('Password must be at least 8 characters long');
        return;
      }
      if (password !== confirmPassword) {
        setLocalError('Passwords do not match');
        return;
      }
      try {
        await resetPassword(email, password, confirmPassword);
        setResetSuccessMessage('Password reset successfully! Logging you in…');
      } catch {
        // Error surfaced through context
      }
      return;
    }

    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        await register(email, password, displayName);
      }
    } catch {
      // Error is surfaced through context
    }
  };

  const toggleMode = () => {
    clearError();
    setLocalError(null);
    setResetSuccessMessage(null);
    setMode((m) => (m === 'login' ? 'register' : 'login'));
  };

  const switchToReset = () => {
    clearError();
    setLocalError(null);
    setResetSuccessMessage(null);
    setPassword('');
    setConfirmPassword('');
    setMode('reset');
  };

  const switchToLogin = () => {
    clearError();
    setLocalError(null);
    setResetSuccessMessage(null);
    setPassword('');
    setConfirmPassword('');
    setMode('login');
  };

  return (
    <div className="min-h-screen overflow-x-hidden overflow-y-auto flex flex-col bg-[var(--bg-app)] text-[var(--text-primary)]">
      {/* Top micro-bar with theme toggle and brand mark */}
      <header
        style={{
          borderBottom: '1px solid var(--border-subtle)',
          padding: 'var(--space-3) var(--space-6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--bg-sidebar)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <span
            style={{
              width: 10,
              height: 10,
              background: 'var(--proof)',
              display: 'inline-block',
              borderRadius: 'var(--radius-sm)',
            }}
          />
          <span
            className="serif-display"
            style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600, letterSpacing: '-0.01em' }}
          >
            Vouchlock
          </span>
          <span
            className="badge badge-neutral"
            style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em' }}
          >
            Delivery Suite
          </span>
        </div>

        <button
          type="button"
          onClick={toggleTheme}
          className="btn btn-secondary btn-sm"
          aria-label={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
          style={{ padding: '4px 8px', fontSize: 'var(--font-size-xs)' }}
        >
          {theme === 'light' ? <IconMoon size={14} /> : <IconSun size={14} />}
          <span>{theme === 'light' ? 'Dark' : 'Light'}</span>
        </button>
      </header>

      {/* Main asymmetric 7/12 & 5/12 split */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-12 min-h-0">
        {/* Real-data onboarding panel: no fabricated projects or delivery claims */}
        <section
          className="desktop-only lg:col-span-7 login-hero-pane"
          style={{
            borderRight: '1px solid var(--border-subtle)',
            padding: 'clamp(var(--space-6), 5vw, var(--space-16))',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            background: 'var(--bg-app)',
          }}
        >
          <div>
            <span className="font-mono" style={{ fontSize: '11px', color: 'var(--proof)' }}>
              YOUR WORKSPACE STARTS EMPTY
            </span>
            <h1
              className="serif-display"
              style={{ fontSize: 'clamp(2.5rem, 5vw, 4.5rem)', margin: 'var(--space-4) 0' }}
            >
              Bring your brief. Build a plan you can prove.
            </h1>
            <p style={{ maxWidth: '54ch', color: 'var(--ink-muted)', lineHeight: 1.65 }}>
              Create your own workspace and projects. Your account begins with no sample projects or
              pre-filled delivery records.
            </p>
            <ol
              style={{
                marginTop: 'var(--space-8)',
                paddingLeft: '1.25rem',
                lineHeight: 2.1,
                color: 'var(--text-primary)',
              }}
            >
              <li>Create an account and personal workspace.</li>
              <li>Enter your project brief and delivery goals.</li>
              <li>Add tasks, requirements, evidence, and reviewers.</li>
              <li>Optionally connect your Nebius Token Factory API key in Settings.</li>
            </ol>
          </div>
          <p
            style={{
              borderTop: '1px solid var(--rule)',
              paddingTop: 'var(--space-4)',
              color: 'var(--ink-muted)',
              fontSize: 'var(--font-size-xs)',
            }}
          >
            AI requests run only when you ask. Generated plans remain proposals for your review.
          </p>
        </section>
        {/* Right Column (5/12 on desktop, full width on mobile): Authentic Clean Authentication Form */}
        <section
          className="col-span-12 lg:col-span-5 login-form-pane"
          style={{
            padding: 'clamp(var(--space-6), 4vw, var(--space-12))',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            background: 'var(--bg-surface)',
          }}
        >
          <div style={{ maxWidth: '380px', width: '100%', margin: '0 auto' }}>
            <div style={{ marginBottom: 'var(--space-6)' }}>
              <span
                className="font-mono"
                style={{
                  fontSize: '11px',
                  color: 'var(--proof)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                }}
              >
                {mode === 'reset' ? 'ACCOUNT RECOVERY' : 'SESSION ACCESS'}
              </span>
              <h2
                className="serif-display"
                style={{
                  fontSize: 'var(--font-size-2xl)',
                  color: 'var(--ink)',
                  marginTop: 'var(--space-1)',
                  marginBottom: 'var(--space-1)',
                }}
              >
                {mode === 'login'
                  ? 'Sign in to workspace'
                  : mode === 'register'
                    ? 'Create workspace account'
                    : 'Reset your password'}
              </h2>
              <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--ink-muted)' }}>
                {mode === 'login'
                  ? 'Enter credentials to access delivery registers.'
                  : mode === 'register'
                    ? 'Establish a new verified engineer or auditor identity.'
                    : 'Enter your account email and choose a new password (min. 8 characters).'}
              </p>
            </div>

            {resetSuccessMessage && (
              <div
                style={{
                  marginBottom: 'var(--space-4)',
                  borderLeft: '3px solid var(--verified)',
                  background: 'rgba(16, 185, 129, 0.1)',
                  padding: 'var(--space-3) var(--space-4)',
                  color: 'var(--verified)',
                  fontSize: 'var(--font-size-sm)',
                  borderRadius: 'var(--radius-sm)',
                }}
              >
                ✓ {resetSuccessMessage}
              </div>
            )}

            {(error || localError) && (
              <div
                className="error-banner"
                style={{
                  marginBottom: 'var(--space-4)',
                  borderLeft: '3px solid var(--blocked)',
                  background: 'var(--blocked-subtle)',
                  padding: 'var(--space-3) var(--space-4)',
                  color: 'var(--blocked)',
                  fontSize: 'var(--font-size-sm)',
                  borderRadius: 'var(--radius-sm)',
                }}
                role="alert"
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '8px',
                  }}
                >
                  <span>{localError || error}</span>
                  {mode === 'login' && (
                    <button
                      type="button"
                      onClick={switchToReset}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--proof)',
                        fontWeight: 600,
                        fontSize: '12px',
                        cursor: 'pointer',
                        padding: 0,
                        textDecoration: 'underline',
                      }}
                    >
                      Forgot password? Reset it here →
                    </button>
                  )}
                </div>
              </div>
            )}

            <form
              onSubmit={handleSubmit}
              style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}
            >
              {mode === 'register' && (
                <div>
                  <label
                    htmlFor="displayName"
                    className="input-label"
                    style={{ display: 'block', marginBottom: 'var(--space-1)', fontSize: '13px' }}
                  >
                    Display Name
                  </label>
                  <input
                    id="displayName"
                    type="text"
                    className="input-field"
                    placeholder="Eleni Vance"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    required
                    autoComplete="name"
                    maxLength={100}
                    style={{ width: '100%' }}
                  />
                </div>
              )}

              <div>
                <label
                  htmlFor="email"
                  className="input-label"
                  style={{ display: 'block', marginBottom: 'var(--space-1)', fontSize: '13px' }}
                >
                  Work Email
                </label>
                <input
                  id="email"
                  type="email"
                  className="input-field"
                  placeholder="engineer@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  style={{ width: '100%' }}
                />
              </div>

              <div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 'var(--space-1)',
                  }}
                >
                  <label htmlFor="password" className="input-label" style={{ fontSize: '13px' }}>
                    {mode === 'reset' ? 'New Password' : 'Password'}
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {mode === 'login' && (
                      <button
                        type="button"
                        onClick={switchToReset}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--ink-muted)',
                          fontSize: '11px',
                          cursor: 'pointer',
                          padding: 0,
                          textDecoration: 'underline',
                        }}
                      >
                        Forgot password?
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--ink-muted)',
                        fontSize: '11px',
                        cursor: 'pointer',
                        padding: 0,
                      }}
                    >
                      {showPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </div>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  className="input-field"
                  placeholder="Min 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  minLength={8}
                  style={{ width: '100%' }}
                />
              </div>

              {mode === 'reset' && (
                <div>
                  <label
                    htmlFor="confirmPassword"
                    className="input-label"
                    style={{ display: 'block', marginBottom: 'var(--space-1)', fontSize: '13px' }}
                  >
                    Confirm New Password
                  </label>
                  <input
                    id="confirmPassword"
                    type={showPassword ? 'text' : 'password'}
                    className="input-field"
                    placeholder="Re-enter new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={8}
                    autoComplete="new-password"
                    style={{ width: '100%' }}
                  />
                </div>
              )}

              <button
                type="submit"
                className="btn btn-primary"
                disabled={loading}
                style={{ width: '100%', justifyContent: 'center', padding: '10px' }}
              >
                {loading
                  ? mode === 'reset'
                    ? 'Resetting Password…'
                    : 'Authenticating…'
                  : mode === 'login'
                    ? 'Sign In'
                    : mode === 'register'
                      ? 'Create Account'
                      : 'Reset Password & Sign In'}
              </button>
            </form>

            <div
              style={{
                textAlign: 'center',
                marginTop: 'var(--space-4)',
                fontSize: 'var(--font-size-sm)',
                color: 'var(--ink-muted)',
              }}
            >
              {mode === 'reset' ? (
                <button
                  type="button"
                  onClick={switchToLogin}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--proof)',
                    cursor: 'pointer',
                    fontWeight: 500,
                    padding: 0,
                    textDecoration: 'underline',
                  }}
                >
                  ← Back to sign in
                </button>
              ) : (
                <div>
                  {mode === 'login' ? 'Need an account? ' : 'Already registered? '}
                  <button
                    type="button"
                    onClick={toggleMode}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--proof)',
                      cursor: 'pointer',
                      fontWeight: 500,
                      padding: 0,
                      textDecoration: 'underline',
                    }}
                  >
                    {mode === 'login' ? 'Register here' : 'Sign in'}
                  </button>
                </div>
              )}
            </div>

            {/* Legal Links Footer */}
            <div
              style={{
                marginTop: 'var(--space-8)',
                paddingTop: 'var(--space-4)',
                borderTop: '1px solid var(--rule)',
                fontSize: '11px',
                color: 'var(--ink-muted)',
                display: 'flex',
                justifyContent: 'center',
                gap: 'var(--space-4)',
              }}
            >
              <Link to="/terms" style={{ color: 'var(--ink-muted)', textDecoration: 'none' }}>
                Terms of Service
              </Link>
              <span>·</span>
              <Link to="/privacy" style={{ color: 'var(--ink-muted)', textDecoration: 'none' }}>
                Privacy Policy
              </Link>
            </div>
          </div>
        </section>
      </main>

      <style>{`
        @media (max-width: 900px) {
          main {
            display: flex !important;
            flex-direction: column !important;
          }
          .login-hero-pane {
            border-right: none !important;
            border-bottom: 1px solid var(--rule) !important;
            padding: var(--space-6) !important;
          }
          .login-form-pane {
            padding: var(--space-6) !important;
          }
        }
      `}</style>
    </div>
  );
}
