"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useSavedBuilds } from "@/features/build-state/saved-builds";
import { useBuildStore } from "@/features/build-state/store";
import { CURRENCIES, RATES_AS_OF, RUB_PER_UNIT, useCurrencyStore } from "@/features/settings/currency";
import { useAuth, useAuthDialog } from "@/features/auth/use-auth";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { useMessages } from "@/lib/i18n";
import { IconArrowUp, IconBolt, IconCube, IconDatabase, IconGauge, IconMenu, IconUser } from "@/components/ui/icons";
import { cx } from "@/components/ui/primitives";
import { GlobalSearch } from "./GlobalSearch";

export function Logo() {
  return (
    <Link href="/builder" className="flex items-center gap-2.5 rounded-md pr-1" aria-label="NexRig — к сборке">
      <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden>
        <rect x="1" y="1" width="30" height="30" rx="8" fill="#141927" stroke="#313a51" />
        <path d="M10 22V10l12 12V10" fill="none" stroke="#8d7dff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="23.5" cy="9" r="1.8" fill="#4fd1e3" />
      </svg>
      <span className="text-[15px] font-bold tracking-tight">
        Nex<span className="text-violet">Rig</span>
      </span>
    </Link>
  );
}

export function TopNav() {
  const t = useMessages();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const links = [
    { href: "/builder", label: t.nav.builder, icon: IconCube },
    { href: "/database", label: t.nav.database, icon: IconDatabase },
    { href: "/games", label: t.nav.games, icon: IconGauge },
    { href: "/benchmark", label: t.nav.benchmark, icon: IconBolt },
    { href: "/community", label: t.nav.community, icon: IconUser },
    { href: "/upgrade", label: t.nav.upgrade, icon: IconArrowUp },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg-0/90 backdrop-blur-md">
      {/* Height excludes the 1px bottom border so header + workspace equal exactly 100dvh. */}
      <div className="flex h-[calc(var(--nav-h)-1px)] items-center gap-3 px-3 md:px-4">
        <Logo />
        <nav aria-label={t.nav.mainMenu} className="ml-3 hidden items-center gap-0.5 lg:flex">
          {links.map((l) => {
            const active = pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "relative flex h-8 items-center gap-2 rounded-[var(--radius-sm)] px-2 text-[13px] font-medium whitespace-nowrap transition-colors xl:px-2.5",
                  // Active: text + a violet underline flush with the header edge — clear, but quieter than a filled tab.
                  active ? "text-fg after:absolute after:inset-x-2 after:-bottom-[12px] after:h-0.5 after:rounded-full after:bg-violet" : "text-fg-3 hover:bg-[var(--hover-bg)] hover:text-fg",
                )}
              >
                <l.icon className={cx("hidden xl:block", active && "text-violet")} />
                {l.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <GlobalSearch />
          <CurrencySwitch />
          <ProfileMenu />
          <button
            type="button"
            className="inline-flex size-9 items-center justify-center rounded-[var(--radius-sm)] border border-line text-fg-2 lg:hidden"
            aria-label={t.nav.mainMenu}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <IconMenu />
          </button>
        </div>
      </div>
      {menuOpen && (
        <nav aria-label={t.nav.mainMenu} className="animate-in grid gap-1 border-t border-line p-2 lg:hidden">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setMenuOpen(false)}
              aria-current={pathname.startsWith(l.href) ? "page" : undefined}
              className={cx(
                "flex h-10 items-center gap-2.5 rounded-[var(--radius-sm)] px-3 text-sm",
                pathname.startsWith(l.href) ? "bg-[var(--selected-bg)] text-fg" : "text-fg-2 hover:bg-[var(--hover-bg)]",
              )}
            >
              <l.icon /> {l.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}

/** Display currency: RUB / USD / GEL at fixed reference rates. */
function CurrencySwitch() {
  const currency = useCurrencyStore((s) => s.currency);
  const setCurrency = useCurrencyStore((s) => s.setCurrency);
  const hint = `Цены ориентировочные. Пересчёт из рублей по фиксированному курсу на ${RATES_AS_OF}: 1 $ = ${RUB_PER_UNIT.USD} ₽, 1 ₾ = ${RUB_PER_UNIT.GEL} ₽.`;
  return (
    <div role="radiogroup" aria-label="Валюта цен" title={hint} className="flex h-9 items-center rounded-[var(--radius-md)] border border-line bg-panel p-0.5">
      {CURRENCIES.map((c) => (
        <button
          key={c.id}
          type="button"
          role="radio"
          aria-checked={currency === c.id}
          aria-label={c.label}
          onClick={() => setCurrency(c.id)}
          className={cx(
            "num h-7 min-w-7 rounded-[calc(var(--radius-md)-3px)] px-1.5 text-[13px] font-semibold transition-colors",
            currency === c.id ? "bg-panel-3 text-fg shadow-[0_0_0_1px_var(--line-strong)]" : "text-fg-3 hover:text-fg",
          )}
        >
          {c.symbol}
        </button>
      ))}
    </div>
  );
}

function ProfileMenu() {
  const t = useMessages();
  const [open, setOpen] = useState(false);
  const count = useSavedBuilds((s) => s.builds.length);
  const setInspector = useBuildStore((s) => s.setInspector);
  const auth = useAuth();
  const showAuth = useAuthDialog((s) => s.show);
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const signOut = async () => {
    setOpen(false);
    await getBrowserSupabase()?.auth.signOut();
    router.refresh();
  };

  // Signed out: a direct "Sign in" button opens the dialog.
  if (auth.status === "signed-out") {
    return (
      <button
        type="button"
        onClick={() => showAuth("login")}
        className="inline-flex h-9 items-center gap-2 rounded-[var(--radius-md)] border border-line bg-panel px-3 text-[13px] font-medium text-fg-2 hover:border-line-strong hover:text-fg"
      >
        <IconUser width={14} height={14} />
        <span className="hidden sm:inline">Войти</span>
      </button>
    );
  }

  const user = auth.user;
  const initial = user?.email?.[0]?.toUpperCase();
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={user ? `Профиль: ${user.email ?? ""}` : t.nav.profile}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-9 items-center gap-2 rounded-[var(--radius-md)] border border-line bg-panel px-2 text-fg-2 hover:text-fg"
      >
        <span className={cx("grid size-6 place-items-center rounded-full text-[11px] font-semibold", user ? "bg-violet-soft text-violet" : "bg-panel-3 text-fg-2")}>
          {initial ?? <IconUser width={14} height={14} />}
        </span>
        <span className="num hidden text-xs sm:inline">{count}</span>
      </button>
      {open && (
        <div role="menu" className="animate-in absolute right-0 z-50 mt-2 w-72 rounded-[var(--radius-lg)] border border-line-strong bg-panel p-3 shadow-pop">
          {user ? (
            <>
              <p className="truncate text-sm font-semibold" title={user.email ?? undefined}>
                {user.email}
              </p>
              <p className="mt-0.5 text-xs text-fg-3">{user.isAdmin ? "Администратор" : "Пользователь"}</p>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold">{t.nav.localProfile}</p>
              <p className="mt-1 text-xs leading-relaxed text-fg-3">{t.nav.localProfileHint}</p>
            </>
          )}
          <button
            role="menuitem"
            type="button"
            onClick={() => {
              setInspector("saved");
              setOpen(false);
              router.push("/builder");
            }}
            className="mt-3 flex w-full items-center justify-between rounded-[var(--radius-sm)] border border-line bg-panel-2 px-3 py-2 text-left text-sm hover:border-line-strong"
          >
            {t.nav.savedBuilds}
            <span className="num text-xs text-fg-3">{count}</span>
          </button>
          {user?.isAdmin && (
            <Link
              role="menuitem"
              href="/admin/benchmarks"
              onClick={() => setOpen(false)}
              className="mt-1.5 flex w-full items-center rounded-[var(--radius-sm)] border border-line bg-panel-2 px-3 py-2 text-sm hover:border-line-strong"
            >
              Администрирование бенчмарков
            </Link>
          )}
          {user && (
            <button role="menuitem" type="button" onClick={signOut} className="mt-1.5 w-full rounded-[var(--radius-sm)] px-3 py-2 text-left text-sm text-fg-2 hover:bg-panel-2 hover:text-fg">
              Выйти
            </button>
          )}
        </div>
      )}
    </div>
  );
}
