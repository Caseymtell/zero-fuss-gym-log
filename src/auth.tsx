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
 * Magic-link sign-in screen. Email goes in, magic link goes out, user clicks
 * it on this device and the session updates automatically via onAuthStateChange.
 */
export function LoginScreen() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);

  async function sendMagicLink(event: FormEvent) {
    event.preventDefault();
    setStatus("sending");
    setError(null);
    const redirectTo = window.location.origin + window.location.pathname;
    const { error: sendError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: redirectTo },
    });
    if (sendError) {
      setStatus("error");
      setError(sendError.message);
      return;
    }
    setStatus("sent");
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
          <p className="eyebrow">Welcome</p>
          <h1>Zero Fuss Gym Log</h1>
          <p className="hero-sub">
            Sign in with your email — we'll send you a one-tap magic link.
          </p>
        </header>

        {status === "sent" ? (
          <div className="glass empty-card">
            <h3>Check your inbox</h3>
            <p>
              We just sent a magic link to <strong>{email}</strong>. Open it on
              this device to sign in. You'll stay signed in from now on.
            </p>
            <button
              className="btn full"
              style={{ marginTop: 14 }}
              onClick={() => {
                setStatus("idle");
                setEmail("");
              }}
            >
              Use a different email
            </button>
          </div>
        ) : (
          <form onSubmit={sendMagicLink}>
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
              disabled={status === "sending" || !email.trim()}
            >
              {status === "sending" ? "Sending…" : "Send magic link"}
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
        )}
      </main>
    </div>
  );
}
