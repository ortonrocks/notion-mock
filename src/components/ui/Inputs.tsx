"use client";

import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from "react";

/**
 * Thin wrappers that end the copy-pasting of the same long className into
 * every form control. No behaviour, no state — just the house style.
 */

const FIELD =
  "w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-accent/60";

export function TextInput({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input type="text" className={`${FIELD} ${className}`} {...props} />;
}

export function NumberInput({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  // `inputMode` keeps a phone keyboard numeric; `step="any"` stops the browser
  // rejecting decimals in a `number` input with an integer step.
  return <input type="number" step="any" inputMode="decimal" className={`${FIELD} ${className}`} {...props} />;
}

export function Select({
  className = "",
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  return (
    <select className={`${FIELD} ${className}`} {...props}>
      {children}
    </select>
  );
}

export function Checkbox({ label, ...props }: InputHTMLAttributes<HTMLInputElement> & { label?: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-muted">
      <input type="checkbox" className="size-4 accent-[var(--accent)]" {...props} />
      {label}
    </label>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs text-ink-faint">{label}</span>
      <div className="mt-1">{children}</div>
      {hint && <span className="mt-1 block text-xs text-ink-faint">{hint}</span>}
    </label>
  );
}

/** The primary / secondary pair used in every dialog footer. */
export function Button({
  variant = "secondary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" }) {
  const styles = {
    primary: "bg-accent text-white font-medium hover:brightness-110 disabled:opacity-40",
    danger: "bg-red-600 text-white font-medium hover:brightness-110 disabled:opacity-40",
    secondary: "text-ink-muted hover-surface hover:text-ink disabled:opacity-50",
  }[variant];
  return <button className={`rounded-lg px-3 py-1.5 text-sm transition ${styles} ${className}`} {...props} />;
}
