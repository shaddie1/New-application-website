'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { forwardRef, useRef } from 'react';
import { cn } from '../../lib/cn';
import { Button } from './button';

// A dialog for forms, in the confirm dialog's style. Radix supplies the focus
// trap, Escape and the labelling. Below 768px it fills the screen; the body
// scrolls and the footer stays in view:
//
//   <Dialog open={open} onOpenChange={setOpen}>
//     <DialogContent>
//       <form className="contents" onSubmit={save}>
//         <DialogHeader>
//           <DialogTitle>Edit stakes</DialogTitle>
//           <DialogDescription>Stakes must add up to 100%.</DialogDescription>
//         </DialogHeader>
//         <DialogBody>…fields…</DialogBody>
//         <DialogFooter>
//           <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
//           <Button type="submit">Save</Button>
//         </DialogFooter>
//       </form>
//     </DialogContent>
//   </Dialog>
//
// A form that wraps the three parts needs `className="contents"` so they stay
// direct parts of the dialog's column. Without a DialogDescription, pass
// `aria-describedby={undefined}` to DialogContent.
//
// Focus: a dialog opens with focus in its first field, or on its title when
// it has no field, and never on the close button. When it closes, focus goes
// back to the control that opened it; these dialogs are opened by state, so
// there is no Radix trigger to do that. Passing `onOpenAutoFocus` or
// `onCloseAutoFocus` and calling `preventDefault()` replaces either half.

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

const FIELDS = 'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled])';

/**
 * The control that opened a dialog, given what had focus as it opened. An
 * item of a menu is gone by the time the dialog closes, so for one of those
 * it is the button that opened the menu, which the menu names as its label.
 */
function openerOf(focused: Element | null): HTMLElement | null {
  if (!(focused instanceof HTMLElement) || focused === document.body) return null;
  const menu = focused.closest('[role="menu"]');
  const menuButton = menu?.getAttribute('aria-labelledby');
  return menuButton ? document.getElementById(menuButton) : focused;
}

export const DialogContent = forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, onOpenAutoFocus, onCloseAutoFocus, ...props }, ref) => {
  const opener = useRef<HTMLElement | null>(null);

  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-charcoal/40 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 print:hidden" />
      <DialogPrimitive.Content
        ref={ref}
        onOpenAutoFocus={(event) => {
          // Focus has not moved yet: it is still on whatever opened the dialog.
          opener.current = openerOf(document.activeElement);
          onOpenAutoFocus?.(event);
          if (event.defaultPrevented) return;
          const dialog = event.currentTarget as HTMLElement;
          const target = dialog.querySelector<HTMLElement>(FIELDS) ?? dialog.querySelector<HTMLElement>('[data-dialog-title]');
          if (!target) return;
          event.preventDefault();
          target.focus();
        }}
        onCloseAutoFocus={(event) => {
          onCloseAutoFocus?.(event);
          if (event.defaultPrevented) return;
          const target = opener.current;
          opener.current = null;
          // An opener that has left the page, or been disabled, cannot take focus back.
          if (!target || !target.isConnected || target.matches(':disabled')) return;
          event.preventDefault();
          target.focus();
        }}
        // Centred from 768px with auto margins, not a transform, so the zoom
        // animation has the transform to itself.
        className={cn(
          'fixed inset-0 z-50 flex flex-col bg-white data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 md:m-auto md:h-fit md:max-h-[calc(100dvh-4rem)] md:w-[calc(100%-2rem)] md:max-w-lg md:rounded-2xl md:border md:border-line md:shadow-xl print:hidden',
          className,
        )}
        {...props}
      />
    </DialogPrimitive.Portal>
  );
});
DialogContent.displayName = 'DialogContent';

/** The title and description, with the close button beside them. */
export function DialogHeader({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('flex items-start justify-between gap-4 border-b border-line px-6 py-4', className)} {...props}>
      <div className="min-w-0">{children}</div>
      {/* A circle at every width: it keeps its size when the title beside it is long. */}
      <DialogPrimitive.Close asChild>
        <Button variant="ghost" size="icon" aria-label="Close" className="shrink-0 rounded-full">
          <X />
        </Button>
      </DialogPrimitive.Close>
    </div>
  );
}

export const DialogTitle = forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  // Focusable by script only, for a dialog with no field to start in.
  <DialogPrimitive.Title
    ref={ref}
    tabIndex={-1}
    data-dialog-title=""
    className={cn('font-serif text-2xl text-charcoal outline-none', className)}
    {...props}
  />
));
DialogTitle.displayName = 'DialogTitle';

export const DialogDescription = forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn('mt-2 text-sm leading-relaxed text-charcoal-muted', className)}
    {...props}
  />
));
DialogDescription.displayName = 'DialogDescription';

/** The scrolling part between the header and the footer. */
export function DialogBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('min-h-0 flex-1 overflow-y-auto px-6 py-5', className)} {...props} />;
}

/** The actions, kept in view below the scrolling body. */
export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex flex-col-reverse gap-2 border-t border-line px-6 py-4 sm:flex-row sm:justify-end', className)}
      {...props}
    />
  );
}
