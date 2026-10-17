import { useId, useRef, useState, type KeyboardEvent } from "react";
import { useAddressSuggestions } from "@/hooks/use-address-suggestions";
import { MAX_QUERY_LENGTH, MIN_QUERY_LENGTH, normalizeQuery, type AddressSuggestion } from "@/lib/address-search";
import { useI18n } from "@/i18n/i18n";
import { Spinner } from "@/components/ui/loading";

export interface SelectedAddress {
  id: string;
  label: string;
}

interface AddressSearchBoxProps {
  onSelect: (address: SelectedAddress) => void;
  autoFocus?: boolean;
}

/**
 * Address autocomplete (ARIA 1.2 combobox with a listbox popup).
 *
 * Only a complete house number can be chosen as the answer. A street-level
 * suggestion fills the field and keeps the list open, because looking up "a
 * street" would resolve nothing useful and spend a register lookup.
 */
export function AddressSearchBox({ onSelect, autoFocus = false }: AddressSearchBoxProps) {
  const { t } = useI18n();
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const hintId = useId();
  const { suggestions, isLoading, isError, isStale } = useAddressSuggestions(text);

  const typedEnough = normalizeQuery(text).length >= MIN_QUERY_LENGTH;
  const showList = open && typedEnough && suggestions.length > 0;
  const optionId = (index: number) => `${listId}-option-${index}`;

  function choose(suggestion: AddressSuggestion) {
    if (suggestion.kind === "address" && suggestion.id) {
      setText(suggestion.label);
      setOpen(false);
      setActive(-1);
      onSelect({ id: suggestion.id, label: suggestion.label });
      return;
    }
    setText(`${suggestion.label} `);
    setActive(-1);
    setOpen(true);
    inputRef.current?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (suggestions.length === 0) return;
      event.preventDefault();
      setOpen(true);
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((current) => (current + step + suggestions.length) % suggestions.length);
    } else if (event.key === "Enter") {
      const suggestion = showList ? suggestions[active] : undefined;
      if (suggestion) {
        event.preventDefault();
        choose(suggestion);
      }
    } else if (event.key === "Escape" && showList) {
      event.preventDefault();
      setOpen(false);
      setActive(-1);
    }
  }

  const busy = isLoading || isStale;
  const status = !typedEnough
    ? ""
    : isError
      ? t("address.search.error")
      : busy
        ? t("address.search.loading")
        : suggestions.length === 0
          ? t("address.search.noResults")
          : t("address.search.count", { count: suggestions.length });

  return (
    <div className="relative">
      <label htmlFor={`${listId}-input`} className="mb-2 block text-sm font-medium text-ink">
        {t("address.search.label")}
      </label>
      <div className="relative">
        <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-soft" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="10.5" cy="10.5" r="6.5" />
          <path d="m16 16 5 5" />
        </svg>
        <input
          ref={inputRef}
          id={`${listId}-input`}
          type="text"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-describedby={hintId}
          aria-activedescendant={showList && active >= 0 ? optionId(active) : undefined}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          autoFocus={autoFocus}
          maxLength={MAX_QUERY_LENGTH}
          value={text}
          placeholder={t("address.search.placeholder")}
          onChange={(event) => {
            setText(event.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            setOpen(false);
            setActive(-1);
          }}
          onKeyDown={onKeyDown}
          className="h-14 w-full rounded-2xl border border-border bg-surface py-2 pl-12 pr-12 text-base text-ink placeholder:text-ink-faint focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand-soft"
        />
        {busy && typedEnough && <span className="absolute right-4 top-1/2 -translate-y-1/2"><Spinner /></span>}
      </div>
      <p id={hintId} className="mt-2 text-xs text-ink-soft">{t("address.search.hint")}</p>
      <p role="status" aria-live="polite" className="sr-only">{status}</p>
      {typedEnough && isError && <p role="alert" className="mt-2 text-sm text-danger">{t("address.search.error")}</p>}
      {typedEnough && !busy && !isError && suggestions.length === 0 && <p className="mt-2 text-sm text-ink-soft">{t("address.search.noResults")}</p>}

      <ul
        id={listId}
        role="listbox"
        aria-label={t("address.search.label")}
        hidden={!showList}
        className="absolute inset-x-0 top-full z-20 mt-1 max-h-80 overflow-y-auto rounded-2xl border border-border bg-surface py-1 shadow-lift"
      >
        {showList && suggestions.map((suggestion, index) => (
          <li
            key={`${suggestion.kind}-${suggestion.id ?? suggestion.label}`}
            id={optionId(index)}
            role="option"
            aria-selected={index === active}
            // mousedown, not click: the input's blur would otherwise close the list before a click lands.
            onMouseDown={(event) => {
              event.preventDefault();
              choose(suggestion);
            }}
            onMouseMove={() => setActive(index)}
            className={`flex min-h-11 cursor-pointer items-center justify-between gap-3 px-4 py-2 text-sm text-ink ${index === active ? "bg-surface-alt" : ""}`}
          >
            <span className="min-w-0 break-words">{suggestion.label}</span>
            {suggestion.kind === "refine" && <span className="shrink-0 text-xs text-ink-soft">{t("address.search.keepTyping")}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
