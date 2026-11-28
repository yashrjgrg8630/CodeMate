import { useEffect, useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Check, Eye, EyeOff, KeyRound, Mail } from "lucide-react";
import { CodeMateMark } from "@/components/brand/CodeMateLogo";
import {
  getCurrentUser,
  getGoogleOAuthStatus,
  getGoogleOAuthUrl,
  login,
  signup,
  type CurrentUser,
} from "@/services/authService";

type AuthMode = "login" | "signup";

interface AuthPageProps {
  mode?: AuthMode;
  redirectTo?: string;
  oauthError?: string;
  sessionInvalid?: boolean;
  sessionExpired?: boolean;
  connectionError?: string;
  onRetryConnection?: () => void;
  onAuthenticated?: () => void;
}

function safeReturnTo(value: string | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return "/dashboard";
  }
  if (value.startsWith("/login") || value.startsWith("/signup")) return "/dashboard";
  return value;
}

export function AuthPage({
  mode = "login",
  redirectTo,
  oauthError,
  sessionInvalid = false,
  sessionExpired = false,
  connectionError,
  onRetryConnection,
  onAuthenticated,
}: AuthPageProps) {
  const isSignup = mode === "signup";
  const returnTo = safeReturnTo(redirectTo);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [nameTouched, setNameTouched] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [googleMessage, setGoogleMessage] = useState("");
  const [startingGoogle, setStartingGoogle] = useState(false);
  const queryClient = useQueryClient();
  const googleStatusQuery = useQuery({
    queryKey: ["auth", "google-status"],
    queryFn: getGoogleOAuthStatus,
    staleTime: 60_000,
    retry: false,
  });
  const existingUserQuery = useQuery({
    queryKey: ["auth", "me"],
    queryFn: getCurrentUser,
    enabled: !onAuthenticated,
    staleTime: 0,
    refetchOnMount: "always",
    retry: false,
  });

  useEffect(() => {
    if (existingUserQuery.data) window.location.assign(returnTo);
  }, [existingUserQuery.data, returnTo]);

  const authMutation = useMutation({
    mutationFn: () =>
      isSignup
        ? signup({ name: name.trim(), email: email.trim(), password })
        : login({ email: email.trim(), password }),
    onSuccess: (user: CurrentUser) => {
      queryClient.setQueryData(["auth", "me"], user);
      void queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
      if (onAuthenticated) {
        onAuthenticated();
      } else {
        window.location.assign(returnTo);
      }
    },
  });

  const passwordBytes = new TextEncoder().encode(password).length;
  const passwordValid = password.length >= 8 && passwordBytes <= 72;
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const showEmailError = (submitted || emailTouched) && !emailValid;
  const showNameError = isSignup && (submitted || nameTouched) && !name.trim();
  const showPasswordError =
    (submitted || passwordTouched) && (!password || (isSignup && !passwordValid));
  const googleEnabled = googleStatusQuery.data?.enabled === true;
  const googleChecking = googleStatusQuery.isPending;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
    authMutation.reset();
    if (!event.currentTarget.reportValidity()) return;
    if (isSignup && !name.trim()) return;
    if (isSignup && !passwordValid) return;
    authMutation.mutate();
  }

  async function startGoogle() {
    if (googleStatusQuery.isError) {
      const result = await googleStatusQuery.refetch();
      if (result.isError) {
        setStartingGoogle(false);
        setGoogleMessage("Could not verify Google sign-in availability. Please try again.");
        return;
      }
      if (result.data?.enabled !== true) {
        setStartingGoogle(false);
        setGoogleMessage(
          "Google sign-in is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in the backend environment.",
        );
        return;
      }
      setStartingGoogle(true);
      window.location.assign(getGoogleOAuthUrl(returnTo));
      return;
    }
    if (googleChecking) return;
    if (!googleEnabled) {
      setStartingGoogle(false);
      setGoogleMessage(
        "Google sign-in is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in the backend environment.",
      );
      return;
    }
    setGoogleMessage("");
    setStartingGoogle(true);
    window.location.assign(getGoogleOAuthUrl(returnTo));
  }

  if (!onAuthenticated && existingUserQuery.isPending) {
    return (
      <main className="auth-page grid min-h-screen place-items-center px-5">
        <p className="auth-loading" role="status">
          Checking your CodeMate session…
        </p>
      </main>
    );
  }

  return (
    <main className="auth-page min-h-screen">
      <div className="auth-page__depth" aria-hidden="true" />
      <header className="auth-header">
        <Link to="/" className="auth-brand" aria-label="CodeMate home">
          <CodeMateMark size={34} tone="dark" />
          <span className="auth-brand__name">
            CodeMate<span> AI</span>
          </span>
        </Link>
        <Link to="/" className="auth-home-link">
          Back to CodeMate <ArrowRight size={14} />
        </Link>
      </header>

      <section className="auth-layout" aria-labelledby="auth-title">
        <div className="auth-story">
          <p className="auth-eyebrow">
            <span className="auth-eyebrow__rule" />A workspace for better reasoning
          </p>
          <h1 className="auth-story__title">
            Make the
            <br />
            <span>hard parts</span>
            <br />
            feel clearer.
          </h1>
          <p className="auth-story__copy">
            From the first read of a problem to the way you explain a solution, keep your
            engineering practice connected.
          </p>

          <div className="auth-process" aria-label="CodeMate workflow">
            <div className="auth-process__step">
              <span className="auth-process__number">01</span>
              <span>Understand</span>
              <span className="auth-process__detail">analyze patterns</span>
            </div>
            <div className="auth-process__step">
              <span className="auth-process__number">02</span>
              <span>Improve</span>
              <span className="auth-process__detail">refine solutions</span>
            </div>
            <div className="auth-process__step">
              <span className="auth-process__number">03</span>
              <span>Explain</span>
              <span className="auth-process__detail">practice interviews</span>
            </div>
          </div>

          <p className="auth-story__signature">
            <span>CODEMATE / 01</span>
            Clarity is part of the solution.
          </p>
        </div>

        <div className="auth-form-column">
          <div className="auth-form-heading">
            <p className="auth-form-heading__eyebrow">
              {isSignup ? "YOUR NEXT STEP STARTS HERE" : "WELCOME BACK"}
            </p>
            <h2 id="auth-title">{isSignup ? "Create your account" : "Sign in to CodeMate"}</h2>
            <p>
              {isSignup
                ? "Save your progress and keep your work in one place."
                : "Pick up where your thinking left off."}
            </p>
          </div>

          <div className="auth-form-panel">
            {connectionError ? (
              <div className="auth-message auth-message--error" role="alert">
                <p>{connectionError}</p>
                {onRetryConnection ? (
                  <button type="button" className="auth-inline-action" onClick={onRetryConnection}>
                    Retry connection
                  </button>
                ) : null}
              </div>
            ) : null}

            {sessionExpired ? (
              <div className="auth-message auth-message--notice" role="status">
                Your session expired. Sign in again to continue.
              </div>
            ) : null}

            {oauthError === "oauth" ? (
              <div className="auth-message auth-message--notice" role="status">
                Google sign-in was cancelled or could not be completed. You can try again or use
                your email.
              </div>
            ) : null}

            {sessionInvalid && !sessionExpired && !connectionError ? (
              <p className="auth-session-note">
                {isSignup
                  ? "Create an account to continue to your workspace."
                  : "Sign in to continue to your workspace."}
              </p>
            ) : null}

            <form className="auth-form" onSubmit={submit}>
              {isSignup ? (
                <div className="auth-field">
                  <label htmlFor="auth-name">Name</label>
                  <div className="auth-input-wrap">
                    <input
                      id="auth-name"
                      type="text"
                      autoComplete="name"
                      placeholder="Your name"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      onBlur={() => setNameTouched(true)}
                      maxLength={80}
                      required
                      aria-invalid={showNameError}
                      aria-describedby={showNameError ? "auth-name-error" : undefined}
                    />
                  </div>
                  {showNameError ? (
                    <p className="auth-field-error" id="auth-name-error">
                      Enter your name to create an account.
                    </p>
                  ) : null}
                </div>
              ) : null}

              <div className="auth-field">
                <label htmlFor="auth-email">Email address</label>
                <div className="auth-input-wrap">
                  <Mail size={17} aria-hidden="true" />
                  <input
                    id="auth-email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    onBlur={() => setEmailTouched(true)}
                    maxLength={254}
                    required
                    aria-invalid={showEmailError}
                    aria-describedby={showEmailError ? "auth-email-error" : undefined}
                  />
                </div>
                {showEmailError ? (
                  <p className="auth-field-error" id="auth-email-error">
                    {email.trim() ? "Enter a valid email address." : "Enter your email address."}
                  </p>
                ) : null}
              </div>

              <div className="auth-field">
                <div className="auth-label-row">
                  <label htmlFor="auth-password">Password</label>
                  {isSignup ? (
                    <span
                      className={`auth-password-hint${password.length > 0 && !passwordValid ? " is-invalid" : ""}`}
                      aria-live="polite"
                    >
                      {password.length === 0
                        ? "At least 8 characters"
                        : passwordValid
                          ? "Password meets requirements"
                          : passwordBytes > 72
                            ? "Maximum 72 bytes"
                            : "At least 8 characters"}
                    </span>
                  ) : null}
                </div>
                <div className="auth-input-wrap">
                  <KeyRound size={17} aria-hidden="true" />
                  <input
                    id="auth-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete={isSignup ? "new-password" : "current-password"}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    onBlur={() => setPasswordTouched(true)}
                    maxLength={200}
                    required
                    minLength={isSignup ? 8 : undefined}
                    aria-invalid={showPasswordError}
                    aria-describedby={showPasswordError ? "auth-password-error" : undefined}
                  />
                  <button
                    className="auth-password-toggle"
                    type="button"
                    onClick={() => setShowPassword((visible) => !visible)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
                {showPasswordError ? (
                  <p className="auth-field-error" id="auth-password-error">
                    {!password
                      ? "Enter your password."
                      : isSignup
                        ? "Use at least 8 characters and no more than 72 UTF-8 bytes."
                        : "Enter your password."}
                  </p>
                ) : null}
              </div>

              {authMutation.isError ? (
                <div className="auth-message auth-message--error" role="alert">
                  {authMutation.error instanceof Error
                    ? authMutation.error.message
                    : "Authentication failed. Please try again."}
                </div>
              ) : null}

              <button type="submit" className="auth-submit" disabled={authMutation.isPending}>
                {authMutation.isPending
                  ? isSignup
                    ? "Creating account…"
                    : "Signing in…"
                  : isSignup
                    ? "Create account"
                    : "Sign in"}
                {!authMutation.isPending ? <ArrowRight size={16} /> : null}
              </button>
            </form>

            <div className="auth-divider">
              <span />
              <span>OR</span>
              <span />
            </div>

            <button
              type="button"
              className="auth-google"
              onClick={startGoogle}
              disabled={googleChecking || authMutation.isPending || startingGoogle}
              aria-describedby={
                googleEnabled || (!googleStatusQuery.isError && !googleMessage)
                  ? undefined
                  : "google-auth-note"
              }
            >
              <GoogleMark />
              {googleChecking
                ? "Checking Google sign-in…"
                : startingGoogle
                  ? "Connecting to Google…"
                  : "Continue with Google"}
            </button>

            {googleMessage ? (
              <p className="auth-provider-note" id="google-auth-note" role="alert">
                {googleMessage}
              </p>
            ) : googleStatusQuery.data?.enabled === false ? (
              <p className="auth-provider-note" id="google-auth-note">
                Google sign-in is not configured yet. Add the OAuth client ID and secret to the
                backend environment.
              </p>
            ) : googleStatusQuery.isError ? (
              <div className="auth-provider-note" id="google-auth-note">
                Could not verify Google sign-in availability.{" "}
                <button
                  type="button"
                  className="auth-inline-action"
                  onClick={() => void googleStatusQuery.refetch()}
                >
                  Try again
                </button>
              </div>
            ) : null}

            <p className="auth-switch">
              {isSignup ? "Already have an account?" : "New to CodeMate?"}{" "}
              <Link to={isSignup ? "/login" : "/signup"} search={{ redirect: returnTo }}>
                {isSignup ? "Sign in" : "Create an account"}
              </Link>
            </p>

            <div className="auth-security-note">
              <Check size={14} aria-hidden="true" />
              <span>Your account is secured by CodeMate’s backend session.</span>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function GoogleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 48 48" className="size-[18px]">
      <path
        fill="#4285F4"
        d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11a9.4 9.4 0 0 1-4.1 6.2v5.1h6.6c3.9-3.6 6.1-8.8 6.1-15Z"
      />
      <path
        fill="#34A853"
        d="M24 44c5.5 0 10.1-1.8 13.5-4.9l-6.6-5.1c-1.8 1.2-4 1.9-6.9 1.9-5.3 0-9.8-3.6-11.4-8.4H5.8v5.3A20 20 0 0 0 24 44Z"
      />
      <path fill="#FBBC05" d="M12.6 27.5a12 12 0 0 1 0-7v-5.3H5.8a20 20 0 0 0 0 17.6l6.8-5.3Z" />
      <path
        fill="#EA4335"
        d="M24 12.1c3 0 5.7 1 7.8 3.1l5.8-5.8C34.1 6.1 29.5 4 24 4A20 20 0 0 0 5.8 15.2l6.8 5.3c1.6-4.8 6.1-8.4 11.4-8.4Z"
      />
    </svg>
  );
}
