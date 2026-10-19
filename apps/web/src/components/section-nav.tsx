import { useEffect, useState } from "react";

export interface SectionNavItem {
  id: string;
  label: string;
}

/** Sticky in-page navigation with a scroll-spy. Opens a collapsed `<details>` target before jumping to it. */
export function SectionNav({ items, label }: { items: SectionNavItem[]; label: string }) {
  const [active, setActive] = useState(items[0]?.id ?? "");
  const key = items.map(item => item.id).join("|");

  useEffect(() => {
    const targets = items.map(item => document.getElementById(item.id)).filter((element): element is HTMLElement => element !== null);
    if (targets.length === 0 || typeof IntersectionObserver === "undefined") return;
    const visible = new Set<string>();
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.isIntersecting) visible.add(entry.target.id); else visible.delete(entry.target.id);
      }
      // The first listed section on screen wins, so the highlight follows reading order.
      const current = items.find(item => visible.has(item.id));
      if (current) setActive(current.id);
    }, { rootMargin: "-96px 0px -55% 0px" });
    targets.forEach(target => observer.observe(target));
    return () => observer.disconnect();
    // `key` stands in for `items`, which is rebuilt every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  function jump(event: React.MouseEvent, id: string) {
    const target = document.getElementById(id);
    if (!target) return;
    event.preventDefault();
    if (target instanceof HTMLDetailsElement) target.open = true;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
    setActive(id);
  }

  return <nav aria-label={label} className="hidden lg:block">
    <ul className="grid gap-2.5 text-sm">
      {items.map(item => <li key={item.id}>
        <a href={`#${item.id}`} onClick={event => jump(event, item.id)} aria-current={active === item.id ? "true" : undefined}
          className={`flex items-center gap-2 transition-colors ${active === item.id ? "font-medium text-ink" : "text-ink-soft hover:text-ink"}`}>
          <span aria-hidden="true" className={`w-3 transition-opacity ${active === item.id ? "opacity-100" : "opacity-0"}`}>→</span>{item.label}
        </a>
      </li>)}
    </ul>
  </nav>;
}
