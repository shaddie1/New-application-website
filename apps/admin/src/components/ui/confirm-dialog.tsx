'use client';

import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { Button } from './button';

export type ConfirmOptions = {
  title: string;
  description?: React.ReactNode;
  /** The confirm button's label; say what happens, e.g. "Delete". */
  confirmLabel?: string;
  cancelLabel?: string;
  /** Deletions and removals get a red confirm button. */
  destructive?: boolean;
};

type Confirm = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<Confirm | null>(null);

/**
 * The admin's replacement for `window.confirm`: a branded dialog that traps
 * focus, closes on Escape and returns the answer as a promise:
 *
 *   const confirm = useConfirm();
 *   if (!(await confirm({ title: 'Delete "Spring promo"?', destructive: true }))) return;
 */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  // Kept after closing so the text stays put while the dialog fades out.
  const [options, setOptions] = useState<ConfirmOptions>({ title: '' });
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const settle = useCallback((ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setOpen(false);
  }, []);

  const confirm = useCallback<Confirm>((next) => {
    // A new question answers any one still open with "no".
    resolver.current?.(false);
    setOptions(next);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AlertDialog.Root open={open} onOpenChange={(next) => !next && settle(false)}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 z-50 bg-charcoal/40 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 print:hidden" />
          <AlertDialog.Content
            // Radix wants a description or an explicit "none" for screen readers.
            {...(options.description ? {} : { 'aria-describedby': undefined })}
            className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-line bg-white p-6 shadow-xl data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 print:hidden"
          >
            <AlertDialog.Title className="font-serif text-2xl text-charcoal">{options.title}</AlertDialog.Title>
            {options.description && (
              <AlertDialog.Description className="mt-2 text-sm leading-relaxed text-charcoal-muted">
                {options.description}
              </AlertDialog.Description>
            )}
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <AlertDialog.Cancel asChild>
                <Button variant="outline">{options.cancelLabel ?? 'Cancel'}</Button>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <Button variant={options.destructive ? 'danger' : 'primary'} onClick={() => settle(true)}>
                  {options.confirmLabel ?? 'Confirm'}
                </Button>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): Confirm {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error('useConfirm needs a ConfirmProvider above it (the root layout has one).');
  return confirm;
}
