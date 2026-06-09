import Link from 'next/link';
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'dark' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

function buttonClasses(variant: Variant, size: Size, extra?: string): string {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-pill font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
  const sizes: Record<Size, string> = {
    sm: 'px-4 py-2 text-sm',
    md: 'px-5 py-2.5 text-[15px]',
    lg: 'px-6 py-3 text-base',
  };
  const variants: Record<Variant, string> = {
    // Metallic gold gradient for a more premium feel.
    primary: 'bg-gradient-to-br from-gold to-gold-deep text-surface-dark shadow-sm hover:shadow-md hover:brightness-105',
    secondary: 'border border-gold/40 bg-surface text-text hover:border-gold hover:bg-gold-soft/20',
    dark: 'bg-surface-dark text-text-on-dark hover:opacity-90',
    ghost: 'text-gold-deep hover:bg-gold-soft/20',
  };
  return [base, sizes[size], variants[variant], extra].filter(Boolean).join(' ');
}

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return <button className={buttonClasses(variant, size, className)} {...props} />;
}

export function ButtonLink({
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; variant?: Variant; size?: Size }) {
  return <Link className={buttonClasses(variant, size, className)} {...props} href={props.href} />;
}

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={['rounded-xl border border-border bg-surface p-5', className].filter(Boolean).join(' ')}
      {...props}
    />
  );
}

export function Pill({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <span
      className={['inline-block rounded-pill px-3 py-1 text-xs font-medium', className].filter(Boolean).join(' ')}
    >
      {children}
    </span>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={['inline-block h-5 w-5 animate-spin rounded-pill border-2 border-current border-t-transparent', className]
        .filter(Boolean)
        .join(' ')}
      role="status"
      aria-label="Loading"
    />
  );
}

export function Banner({ tone = 'error', children }: { tone?: 'error' | 'success' | 'info'; children: ReactNode }) {
  const tones = {
    error: 'bg-danger/10 text-danger border-danger/30',
    success: 'bg-success/10 text-success border-success/30',
    info: 'bg-gold-soft/50 text-gold-deep border-gold/30',
  } as const;
  return <div className={`rounded-md border px-4 py-3 text-sm ${tones[tone]}`}>{children}</div>;
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-text">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-text-muted">{hint}</span> : null}
    </label>
  );
}

const inputClasses =
  'w-full rounded-md border border-border-strong bg-surface px-3.5 py-2.5 text-[15px] text-text outline-none placeholder:text-text-muted focus:border-gold';

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={[inputClasses, className].filter(Boolean).join(' ')} {...props} />;
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={[inputClasses, className].filter(Boolean).join(' ')} {...props} />;
}

export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={[inputClasses, className].filter(Boolean).join(' ')} {...props} />;
}
