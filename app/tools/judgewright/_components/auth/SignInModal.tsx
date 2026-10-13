"use client";

import { useMemo, useState } from "react";
import { Loader2, Lock } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuthPromptStore } from "../../_store/useAuthPromptStore";
import { useAuth, userEmail, type OAuthProvider } from "../../_hooks/useAuth";
import { GitHubMark, GoogleMark } from "./SignInButton";

const PROVIDERS: { id: OAuthProvider; label: string }[] = [
  { id: "google", label: "Continue with Google" },
  { id: "github", label: "Continue with GitHub" },
];

export function SignInModal() {
  const { isOpen, trigger, close } = useAuthPromptStore();
  const { isConfigured, isAuthenticated, session, signInWith, signInWithEmail, verifyEmailOtp, signOut } =
    useAuth();
  const [pending, setPending] = useState<OAuthProvider | null>(null);
  const [emailInput, setEmailInput] = useState("");
  const [emailPending, setEmailPending] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [otpPending, setOtpPending] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const email = userEmail(session);

  const copy = useMemo(() => {
    if (isAuthenticated)
      return {
        title: "You're signed in",
        description: `Signed in as ${email ?? "your account"}. Exports and saved presets are unlocked.`,
      };
    if (trigger === "export")
      return {
        title: "Sign in to export the full bundle",
        description:
          "Exporting every language at once uses a free Nor AI account. Core regex work stays free forever.",
      };
    if (trigger === "return-visit")
      return {
        title: "Welcome back to Judgewright",
        description:
          "Sign in to sync saved presets and history across your devices.",
      };
    return {
      title: "Sign in to Judgewright",
      description:
        "Connect with Google, GitHub, or your email to unlock bundle export and cross-device preset sync.",
    };
  }, [isAuthenticated, email, trigger]);

  const handleProvider = async (provider: OAuthProvider) => {
    setAuthError(null);
    setPending(provider);
    try {
      const ok = await signInWith(provider);
      if (!ok) {
        setAuthError(`Sign-in with ${provider} could not be initiated.`);
      }
    } catch {
      setAuthError(`Sign-in with ${provider} failed.`);
    } finally {
      setPending(null);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput || !emailInput.includes("@")) {
      setAuthError("Please enter a valid email address.");
      return;
    }
    setAuthError(null);
    setEmailPending(true);
    try {
      const res = await signInWithEmail(emailInput.trim());
      if (res.success) {
        setEmailSent(true);
      } else {
        setAuthError(res.error ?? "Failed to send magic link.");
      }
    } catch {
      setAuthError("Failed to send magic link. Please try again.");
    } finally {
      setEmailPending(false);
    }
  };

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpCode.trim()) return;
    setAuthError(null);
    setOtpPending(true);
    try {
      const res = await verifyEmailOtp(emailInput.trim(), otpCode.trim());
      if (res.success) {
        close();
      } else {
        setAuthError(res.error ?? "Invalid code. Please try again.");
      }
    } catch {
      setAuthError("Verification failed. Please try again.");
    } finally {
      setOtpPending(false);
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(next) => {
        if (!next) {
          setAuthError(null);
          setEmailSent(false);
          close();
        }
      }}
    >
      <DialogContent className="max-w-md shadow-elevated border border-surface-border bg-surface-base text-zinc-100">
        <DialogHeader>
          <div
            className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl border border-surface-border bg-surface-elevated text-brand-lime"
            aria-hidden="true"
          >
            <Lock className="h-5 w-5" />
          </div>
          <DialogTitle className="text-center text-lg font-bold text-zinc-100">{copy.title}</DialogTitle>
          <DialogDescription className="mt-2 text-center text-sm leading-relaxed text-zinc-400">
            {copy.description}
          </DialogDescription>
        </DialogHeader>

        {authError && (
          <div role="alert" className="mt-2 rounded-lg border border-brand-rose/30 bg-brand-rose/10 px-3 py-2 text-xs text-brand-rose">
            {authError}
          </div>
        )}

        {isAuthenticated ? (
          <div className="mt-4 flex flex-col gap-3">
            <button
              type="button"
              onClick={async () => {
                await signOut();
                close();
              }}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-surface-border bg-surface-subtle text-sm font-medium text-zinc-200 transition-all duration-150 ease-out-expo hover:border-surface-borderHover hover:bg-surface-elevated hover:text-brand-rose active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-lime/70 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Sign out
            </button>
          </div>
        ) : (
          <div className="mt-3 flex flex-col gap-3">
            <div className="flex flex-col gap-2.5">
              {PROVIDERS.map((provider) => (
                <button
                  key={provider.id}
                  type="button"
                  disabled={!isConfigured || pending !== null}
                  onClick={() => handleProvider(provider.id)}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-surface-border bg-surface-subtle text-sm font-medium text-zinc-200 transition-all duration-150 ease-out-expo hover:border-surface-borderHover hover:bg-surface-elevated active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-lime/70 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {pending === provider.id ? (
                    <Loader2
                      className="h-4 w-4 animate-spin motion-reduce:animate-none"
                      aria-hidden="true"
                    />
                  ) : provider.id === "github" ? (
                    <GitHubMark />
                  ) : (
                    <GoogleMark />
                  )}
                  {provider.label}
                </button>
              ))}
            </div>

            <div className="relative my-1 flex items-center justify-center">
              <span className="w-full border-t border-surface-border" />
              <span className="absolute bg-surface-base px-2.5 text-[11px] font-medium text-zinc-500 uppercase tracking-wider">
                or with email
              </span>
            </div>

            {emailSent ? (
              <div className="flex flex-col gap-3 rounded-xl border border-brand-lime/30 bg-brand-lime/10 p-4 text-xs">
                <div className="text-center">
                  <p className="font-semibold text-brand-lime">Check your inbox</p>
                  <p className="mt-1 text-zinc-300">
                    We sent a sign-in link &amp; code to <strong className="text-zinc-100">{emailInput}</strong>.
                  </p>
                  <p className="mt-1 text-[11px] text-zinc-400">
                    Click the link in your email, or enter the 6-digit code:
                  </p>
                </div>

                <form onSubmit={handleOtpSubmit} className="flex gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={10}
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value)}
                    placeholder="123456"
                    disabled={otpPending}
                    className="h-10 flex-1 rounded-lg border border-surface-border bg-surface-subtle px-3 text-center font-mono text-sm tracking-widest text-zinc-100 placeholder:text-zinc-500 focus:border-brand-lime focus:outline-none focus:ring-1 focus:ring-brand-lime"
                  />
                  <button
                    type="submit"
                    disabled={otpPending || !otpCode.trim()}
                    className="inline-flex h-10 items-center justify-center rounded-lg bg-brand-lime px-4 text-xs font-semibold text-black transition-transform hover:opacity-95 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {otpPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      "Verify"
                    )}
                  </button>
                </form>

                <button
                  type="button"
                  onClick={() => {
                    setEmailSent(false);
                    setOtpCode("");
                    setAuthError(null);
                  }}
                  className="mt-1 text-center text-[11px] text-zinc-400 hover:text-zinc-200 underline"
                >
                  Use a different email
                </button>
              </div>
            ) : (
              <form onSubmit={handleEmailSubmit} className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    placeholder="name@example.com"
                    disabled={!isConfigured || emailPending}
                    className="h-10 flex-1 rounded-lg border border-surface-border bg-surface-subtle px-3 text-xs text-zinc-100 placeholder:text-zinc-500 focus:border-brand-lime focus:outline-none focus:ring-1 focus:ring-brand-lime disabled:opacity-50"
                  />
                  <button
                    type="submit"
                    disabled={!isConfigured || emailPending || !emailInput}
                    className="inline-flex h-10 items-center justify-center rounded-lg bg-brand-lime px-4 text-xs font-semibold text-black transition-transform hover:opacity-95 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {emailPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      "Send Link"
                    )}
                  </button>
                </div>
              </form>
            )}

            {!isConfigured && (
              <p className="mt-1 rounded-lg border border-brand-amber/30 bg-brand-amber/10 px-3 py-2 text-xs leading-relaxed text-brand-amber">
                Everything in Judgewright works without an account — sign-in only
                powers cross-device sync.
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
