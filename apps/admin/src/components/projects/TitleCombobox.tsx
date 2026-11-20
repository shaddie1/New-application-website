'use client';

import { useId, useRef, useState } from 'react';
import { titleSuggestions, type TitleService } from '../../lib/projectTitle';

/**
 * The New project form's title box: type any title, or pick a service from the
 * list that opens under it. Picking fills the title with the service's name and
 * leaves the cursor at the end, so the site can be typed after it.
 */
export function TitleCombobox({
  value, services, onChange, onPick, className, placeholder,
}: {
  value: string;
  services: TitleService[];
  onChange: (title: string) => void;
  onPick: (service: TitleService) => void;
  className: string;
  placeholder?: string;
}) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const shown = titleSuggestions(services, value);
  const expanded = open && shown.length > 0;

  const pick = (service: TitleService) => {
    onPick(service);
    setOpen(false);
    setActive(-1);
    // The title changes on the next render; put the cursor after it then.
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!expanded) { setOpen(true); setActive(0); return; }
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((i) => (i + step + shown.length) % shown.length);
    } else if (e.key === 'Enter' && expanded && active >= 0 && shown[active]) {
      e.preventDefault(); // pick, rather than submit the form
      pick(shown[active]);
    } else if (e.key === 'Escape' && expanded) {
      e.preventDefault();
      setOpen(false);
    }
  };

  return (
    <div className="relative">
      <input
        ref={inputRef}
        required
        role="combobox"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={expanded && active >= 0 ? `${listId}-${active}` : undefined}
        autoComplete="off"
        className={`${className} pr-9`}
        value={value}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onBlur={() => { setOpen(false); setActive(-1); }}
        onKeyDown={onKeyDown}
        onChange={(e) => { onChange(e.target.value); setOpen(true); setActive(-1); }}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label="Show the list of services"
        className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-charcoal-muted"
        onMouseDown={(e) => {
          e.preventDefault(); // keep focus in the box
          inputRef.current?.focus();
          setOpen((v) => !v);
        }}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {expanded && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Services"
          className="absolute left-0 right-0 z-20 mt-1 max-h-64 overflow-y-auto rounded-lg border border-line bg-white py-1 text-sm shadow-lg"
        >
          {shown.map((s, i) => (
            <li
              key={s.code}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={`cursor-pointer px-3 py-2 ${i === active ? 'bg-mist' : 'hover:bg-mist'}`}
              onMouseDown={(e) => { e.preventDefault(); pick(s); }}
              onMouseEnter={() => setActive(i)}
            >
              {s.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
