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
        description: `Signed in as ${email ?? "your account"}. Judgewright works the same either way; the account is shared across Nor AI tools.`,
      };
    if (trigger === "export")
      return {
        title: "Report downloaded",
        description:
          "Optional: sign in with a free Nor AI account to use one login across Nor AI's tools. Nothing in Judgewright needs it.",
      };
    return {
      title: "Sign in to Nor AI",
      description:
        "Optional. Every analysis and export in Judgewright works without an account; signing in keeps one login across Nor AI's tools.",
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
      <DialogContent className="max-w-md shadow-pop border border-line bg-panel text-ink">
        <DialogHeader>
          <div
            className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-[3px] border border-line bg-sunk text-select-ink"
            aria-hidden="true"
          >
            <Lock className="h-5 w-5" />
          </div>
          <DialogTitle className="text-center text-lg font-bold text-ink">{copy.title}</DialogTitle>
          <DialogDescription className="mt-2 text-center text-sm leading-relaxed text-ink-3">
            {copy.description}
          </DialogDescription>
        </DialogHeader>

        {authError && (
          <div role="alert" className="mt-2 rounded-[3px] border border-miss/30 bg-miss/10 px-3 py-2 text-xs text-miss-ink">
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
              className="inline-flex h-10 items-center justify-center gap-2 rounded-[3px] border border-line bg-sunk text-sm font-medium text-ink transition-all duration-150 ease-out-expo hover:border-line-strong hover:bg-sunk hover:text-miss-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-select/70 disabled:cursor-not-allowed disabled:opacity-50"
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
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-[3px] border border-line bg-sunk text-sm font-medium text-ink transition-all duration-150 ease-out-expo hover:border-line-strong hover:bg-sunk focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-select/70 disabled:cursor-not-allowed disabled:opacity-50"
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
              <span className="w-full border-t border-line" />
              <span className="absolute bg-panel px-2.5 text-[11px] font-medium text-ink-3 uppercase tracking-wider">
                or with email
              </span>
            </div>

            {emailSent ? (
              <div className="flex flex-col gap-3 rounded-[3px] border border-select/30 bg-select/10 p-4 text-xs">
                <div className="text-center">
                  <p className="font-semibold text-select-ink">Check your inbox</p>
                  <p className="mt-1 text-ink-2">
                    We sent a sign-in link &amp; code to <strong className="text-ink">{emailInput}</strong>.
                  </p>
                  <p className="mt-1 text-[11px] text-ink-3">
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
                    className="h-10 flex-1 rounded-[3px] border border-line bg-sunk px-3 text-center font-mono text-sm tracking-widest text-ink placeholder:text-ink-3 focus:border-select focus:outline-none focus:ring-1 focus:ring-select"
                  />
                  <button
                    type="submit"
                    disabled={otpPending || !otpCode.trim()}
                    className="inline-flex h-10 items-center justify-center rounded-[3px] bg-select px-4 text-xs font-semibold text-white transition-colors hover:bg-select/90 dark:text-bezel disabled:cursor-not-allowed disabled:opacity-40"
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
                  className="mt-1 text-center text-[11px] text-ink-3 hover:text-ink underline"
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
                    className="h-10 flex-1 rounded-[3px] border border-line bg-sunk px-3 text-xs text-ink placeholder:text-ink-3 focus:border-select focus:outline-none focus:ring-1 focus:ring-select disabled:opacity-50"
                  />
                  <button
                    type="submit"
                    disabled={!isConfigured || emailPending || !emailInput}
                    className="inline-flex h-10 items-center justify-center rounded-[3px] bg-select px-4 text-xs font-semibold text-white transition-colors hover:bg-select/90 dark:text-bezel disabled:cursor-not-allowed disabled:opacity-40"
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
              <p className="mt-1 rounded-[3px] border border-caution/30 bg-caution/10 px-3 py-2 text-xs leading-relaxed text-caution-ink">
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
