import { FormEvent, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";

/**
 * Tracks the current Supabase auth session. Returns null while we're still
 * loading the initial session from storage, then updates live as the user
 * signs in / out / their token refreshes.
 */
export function useSession(): { session: Session | null; loading: boolean } {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { session, loading };
}

/**
 * Two-step OTP sign-in: send a code to the email, then type it back in to verify.
 *
 * We deliberately avoid the "click the magic link in email" flow because on
 * iOS, the link opens in Safari while the home-screen-installed PWA runs in
 * a separate storage scope — so the session never reaches the PWA. Typing a
 * code keeps everything inside whichever browser context the user is in.
 */
export function LoginScreen() {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<"idle" | "working" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function sendCode(event: FormEvent) {
    event.preventDefault();
    setStatus("working");
    setError(null);
    const { error: sendError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        // Even though we tell the user to use the code, Supabase still puts
        // a magic link in the email by default. If they tap that, send them
        // back to this PWA URL so they end up in roughly the right place.
        emailRedirectTo: window.location.origin + window.location.pathname,
      },
    });
    if (sendError) {
      setStatus("error");
      setError(sendError.message);
      return;
    }
    setStatus("idle");
    setStep("code");
  }

  async function verifyCode(event: FormEvent) {
    event.preventDefault();
    setStatus("working");
    setError(null);
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: "email",
    });
    if (verifyError) {
      setStatus("error");
      setError(verifyError.message);
      return;
    }
    // Success — the onAuthStateChange listener will pick up the new session
    // and the App component will swap to the authenticated view automatically.
    setStatus("idle");
  }

  return (
    <div className="device-bg">
      <div className="wallpaper" aria-hidden="true">
        <div className="orb orb-a"></div>
        <div className="orb orb-b"></div>
        <div className="orb orb-c"></div>
        <div className="orb orb-d"></div>
        <div className="noise"></div>
      </div>

      <main className="app-scroll">
        <header className="hero">
          <p className="eyebrow">
            {step === "email" ? "Welcome" : "Check your email"}
          </p>
          <h1>Zero Fuss Gym Log</h1>
          <p className="hero-sub">
            {step === "email"
              ? "Sign in with your email — we'll send you a 6-digit code."
              : `We sent a 6-digit code to ${email}. Pop it in below.`}
          </p>
        </header>

        {step === "email" ? (
          <form onSubmit={sendCode}>
            <div className="field">
              <label>Email</label>
              <input
                className="input"
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                required
              />
            </div>
            <button
              className="btn primary full"
              type="submit"
              disabled={status === "working" || !email.trim()}
            >
              {status === "working" ? "Sending…" : "Send code"}
            </button>
            {error && (
              <div className="glass empty-card" style={{ marginTop: 12 }}>
                <p style={{ color: "var(--accent-coral)" }}>{error}</p>
              </div>
            )}
            <div className="glass info-card" style={{ marginTop: 16 }}>
              <strong>Private to you.</strong> Each email gets its own private
              log — your data, no one else's.
            </div>
          </form>
        ) : (
          <form onSubmit={verifyCode}>
            <div className="field">
              <label>6-digit code</label>
              <input
                className="input"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={6}
                value={code}
                onChange={(event) =>
                  setCode(event.target.value.replace(/\D/g, ""))
                }
                placeholder="123456"
                required
                autoFocus
              />
            </div>
            <button
              className="btn primary full"
              type="submit"
              disabled={status === "working" || code.trim().length < 6}
            >
              {status === "working" ? "Verifying…" : "Sign in"}
            </button>
            <button
              className="btn full"
              type="button"
              style={{ marginTop: 10 }}
              onClick={() => {
                setStep("email");
                setCode("");
                setError(null);
              }}
            >
              Use a different email
            </button>
            {error && (
              <div className="glass empty-card" style={{ marginTop: 12 }}>
                <p style={{ color: "var(--accent-coral)" }}>{error}</p>
              </div>
            )}
            <div className="glass info-card" style={{ marginTop: 16 }}>
              <strong>Don't tap the link in the email.</strong> Just copy the
              6-digit code from the message and paste it above. This keeps
              you signed in inside this app.
            </div>
          </form>
        )}
      </main>
    </div>
  );
}
