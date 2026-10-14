"use client";

import { useEffect, useRef, useState } from "react";
import { useAuthDialog } from "@/features/auth/use-auth";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { Button, cx, inputCls } from "@/components/ui/primitives";

/** Supabase Auth error codes → Russian messages (raw messages are not shown). */
function authErrorText(code: string | undefined, fallback: string) {
  switch (code) {
    case "invalid_credentials":
      return "Неверная почта или пароль.";
    case "email_not_confirmed":
      return "Почта не подтверждена. Откройте письмо со ссылкой подтверждения.";
    case "user_already_exists":
    case "email_exists":
      return "Пользователь с такой почтой уже зарегистрирован. Войдите или восстановите пароль.";
    case "weak_password":
      return "Слишком простой пароль. Используйте не меньше 8 символов, буквы и цифры.";
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return "Слишком много попыток. Подождите немного и попробуйте снова.";
    case "signup_disabled":
      return "Регистрация сейчас отключена.";
    case "email_address_invalid":
      return "Некорректный адрес почты.";
    default:
      return fallback;
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Sign-in / sign-up dialog (email + password, Supabase Auth). */
export function AuthModal() {
  const open = useAuthDialog((s) => s.open);
  const show = useAuthDialog((s) => s.show);
  const close = useAuthDialog((s) => s.close);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const firstField = useRef<HTMLInputElement>(null);

  // Focus the first field, close on Escape, keep Tab inside the dialog, restore focus on close.
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    firstField.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key !== "Tab" || !dialog.current) return;
      const items = dialog.current.querySelectorAll<HTMLElement>("button, input, a[href]");
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, [open, close]);

  if (!open) return null;
  const register = open === "register";
  const supabase = getBrowserSupabase();

  const switchMode = (mode: "login" | "register") => {
    setError(null);
    setNotice(null);
    setPassword2("");
    show(mode);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (!supabase) return setError("Авторизация не настроена на сервере.");
    const mail = email.trim().toLowerCase();
    if (!EMAIL_RE.test(mail)) return setError("Введите корректный адрес почты.");
    if (password.length < 8) return setError("Пароль — не меньше 8 символов.");
    if (register && password !== password2) return setError("Пароли не совпадают.");
    setBusy(true);
    try {
      if (register) {
        const { data, error: err } = await supabase.auth.signUp({
          email: mail,
          password,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(window.location.pathname)}` },
        });
        if (err) return setError(authErrorText(err.code, "Не удалось зарегистрироваться. Попробуйте ещё раз."));
        // With email confirmation on, there is no session until the link is opened.
        if (!data.session) {
          setNotice(`Мы отправили письмо на ${mail}. Перейдите по ссылке в нём, чтобы подтвердить почту, затем войдите.`);
          setPassword("");
          setPassword2("");
          return;
        }
        close();
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({ email: mail, password });
        if (err) return setError(authErrorText(err.code, "Не удалось войти. Попробуйте ещё раз."));
        setPassword("");
        close();
      }
    } catch {
      setError("Сервис авторизации недоступен. Проверьте подключение и попробуйте снова.");
    } finally {
      setBusy(false);
    }
  };

  const resetPassword = async () => {
    setError(null);
    setNotice(null);
    const mail = email.trim().toLowerCase();
    if (!supabase) return;
    if (!EMAIL_RE.test(mail)) return setError("Введите почту, чтобы получить ссылку для сброса пароля.");
    setBusy(true);
    const { error: err } = await supabase.auth.resetPasswordForEmail(mail, { redirectTo: `${window.location.origin}/auth/callback?next=/builder` });
    setBusy(false);
    // Same message whether or not the address exists (no account enumeration).
    if (err && err.code?.startsWith("over_")) return setError(authErrorText(err.code, ""));
    setNotice("Если такая почта зарегистрирована, на неё придёт письмо со ссылкой для входа.");
  };

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/60 p-4 backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="auth-title" className="animate-in w-full max-w-sm rounded-[var(--radius-lg)] border border-line-strong bg-panel p-5 shadow-pop">
        <div className="flex items-start justify-between gap-3">
          <h2 id="auth-title" className="text-lg font-semibold">
            {register ? "Регистрация" : "Вход"}
          </h2>
          <button type="button" onClick={close} aria-label="Закрыть" className="grid size-8 place-items-center rounded-[var(--radius-sm)] text-fg-3 hover:bg-panel-2 hover:text-fg">
            ✕
          </button>
        </div>

        <div role="tablist" aria-label="Режим" className="mt-3 grid grid-cols-2 rounded-[var(--radius-md)] border border-line bg-panel-2 p-0.5 text-[13px]">
          {(["login", "register"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={open === m}
              onClick={() => switchMode(m)}
              className={cx("h-8 rounded-[calc(var(--radius-md)-3px)] font-medium transition-colors", open === m ? "bg-panel-3 text-fg" : "text-fg-3 hover:text-fg")}
            >
              {m === "login" ? "Вход" : "Регистрация"}
            </button>
          ))}
        </div>

        {!supabase ? (
          <p className="mt-4 text-[13px] text-warn">Авторизация не настроена: на сервере не заданы адрес проекта Supabase и публичный ключ.</p>
        ) : (
          <form onSubmit={submit} className="mt-4 space-y-3" noValidate>
            <label className="block space-y-1">
              <span className="text-[11.5px] font-medium text-fg-2">Почта</span>
              <input ref={firstField} type="email" autoComplete="email" required className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label className="block space-y-1">
              <span className="text-[11.5px] font-medium text-fg-2">Пароль</span>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete={register ? "new-password" : "current-password"}
                  required
                  minLength={8}
                  className={cx(inputCls, "pr-20")}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute top-1/2 right-2 -translate-y-1/2 text-[11px] text-fg-3 hover:text-fg" aria-pressed={showPassword}>
                  {showPassword ? "Скрыть" : "Показать"}
                </button>
              </div>
            </label>
            {register && (
              <label className="block space-y-1">
                <span className="text-[11.5px] font-medium text-fg-2">Повторите пароль</span>
                <input type={showPassword ? "text" : "password"} autoComplete="new-password" required className={inputCls} value={password2} onChange={(e) => setPassword2(e.target.value)} />
              </label>
            )}
            {register && <p className="text-[11px] text-fg-3">Не меньше 8 символов. После регистрации придёт письмо для подтверждения почты.</p>}

            {error && (
              <p role="alert" className="rounded-[var(--radius-sm)] border border-bad/40 bg-bad-soft px-2.5 py-2 text-[12px] text-bad">
                {error}
              </p>
            )}
            {notice && (
              <p role="status" className="rounded-[var(--radius-sm)] border border-ok/40 bg-ok-soft px-2.5 py-2 text-[12px] text-ok">
                {notice}
              </p>
            )}

            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Подождите…" : register ? "Зарегистрироваться" : "Войти"}
            </Button>
            {!register && (
              <button type="button" onClick={resetPassword} disabled={busy} className="w-full text-center text-[12px] text-violet hover:underline disabled:opacity-50">
                Забыли пароль?
              </button>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
