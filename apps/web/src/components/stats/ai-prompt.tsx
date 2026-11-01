import { useMemo, useRef, useState } from "react";
import { useI18n } from "@/i18n/i18n";
import { BENCHMARK_ZIP, buildBuyerPrompt, EXAMPLE_INPUT, zipOf, type BuyerPromptInput } from "@/lib/buyer-prompt";

const fieldClass =
  "mt-1 block w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30";

function toNumber(value: string): number | null {
  if (value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

type CopyState = "idle" | "copied" | "failed";

/** A form that builds a ready-to-paste prompt for an AI assistant, using the stats on this page. */
export function AiPrompt() {
  const { language } = useI18n();
  const tx = (da: string, en: string) => (language === "da" ? da : en);
  const [input, setInput] = useState<BuyerPromptInput>(EXAMPLE_INPUT);
  const [copy, setCopy] = useState<CopyState>("idle");
  const textRef = useRef<HTMLTextAreaElement>(null);

  const prompt = useMemo(() => buildBuyerPrompt(input, language), [input, language]);
  const zip = zipOf(input.location);
  const outsideBenchmark = zip !== BENCHMARK_ZIP;

  const set = <K extends keyof BuyerPromptInput>(key: K, value: BuyerPromptInput[K]) => {
    setInput((current) => ({ ...current, [key]: value }));
    setCopy("idle");
  };

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopy("copied");
    } catch {
      // Clipboard access can be blocked; select the text so the user can copy it by hand.
      textRef.current?.select();
      setCopy("failed");
    }
  };

  return (
    <section aria-labelledby="ai-prompt-heading" className="mb-12">
      <p className="text-[12px] font-semibold uppercase tracking-wide text-brand-text">{tx("For købere", "For buyers")}</p>
      <h2 id="ai-prompt-heading" className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">
        {tx("Lad en AI finde den bedste bolig", "Let an AI find the best home")}
      </h2>
      <p className="mt-1 max-w-3xl text-sm text-ink-soft">
        {tx(
          "Udfyld dine ønsker, kopiér teksten og indsæt den i en AI-assistent med adgang til nettet. Prompten indeholder markedstallene og sæsonmønstret fra denne side, så AI'en kan finde boliger med mest forhandlingsrum.",
          "Fill in what you want, copy the text and paste it into an AI assistant with web access. The prompt includes the market figures and the seasonal pattern from this page, so the AI can look for homes with the most room to negotiate.",
        )}
      </p>

      <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        <form className="space-y-3 rounded-2xl border border-border bg-surface p-4 shadow-card" onSubmit={(e) => e.preventDefault()}>
          <label className="block text-[13px] font-semibold">
            {tx("Kilde", "Source")}
            <input className={fieldClass} value={input.source} onChange={(e) => set("source", e.target.value)} placeholder="boligsiden.dk" autoComplete="off" />
          </label>
          <label className="block text-[13px] font-semibold">
            {tx("Postnummer og by", "Postcode and city")}
            <input className={fieldClass} value={input.location} onChange={(e) => set("location", e.target.value)} placeholder="9000 Aalborg" inputMode="text" autoComplete="off" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-[13px] font-semibold">
              {tx("Værelser, fra", "Rooms, from")}
              <input className={fieldClass} type="number" min={0} inputMode="numeric" value={input.roomsMin ?? ""} onChange={(e) => set("roomsMin", toNumber(e.target.value))} />
            </label>
            <label className="block text-[13px] font-semibold">
              {tx("Værelser, til", "Rooms, to")}
              <input className={fieldClass} type="number" min={0} inputMode="numeric" value={input.roomsMax ?? ""} onChange={(e) => set("roomsMax", toNumber(e.target.value))} />
            </label>
          </div>
          <label className="block text-[13px] font-semibold">
            {tx("Badeværelser/toiletter, mindst", "Bathrooms/toilets, at least")}
            <input className={fieldClass} type="number" min={0} inputMode="numeric" value={input.bathroomsMin ?? ""} onChange={(e) => set("bathroomsMin", toNumber(e.target.value))} />
          </label>
          <label className="block text-[13px] font-semibold">
            {tx("Boligareal, mindst (m²)", "Living area, at least (m²)")}
            <input className={fieldClass} type="number" min={0} inputMode="numeric" value={input.minAreaM2 ?? ""} onChange={(e) => set("minAreaM2", toNumber(e.target.value))} />
          </label>
          <button type="button" className="text-sm underline underline-offset-2" onClick={() => { setInput(EXAMPLE_INPUT); setCopy("idle"); }}>
            {tx("Nulstil til eksemplet (boligsiden.dk, 9000 Aalborg, 4-5 værelser, 2 badeværelser, 130 m²)", "Reset to the example (boligsiden.dk, 9000 Aalborg, 4-5 rooms, 2 bathrooms, 130 m²)")}
          </button>
          {outsideBenchmark && (
            <p role="status" className="rounded-xl bg-warning-soft p-3 text-[12.5px] text-warning-text">
              {tx(
                `Tallene på denne side gælder kun postnummer ${BENCHMARK_ZIP}. For andre postnumre beder prompten AI'en finde områdets egne tal.`,
                `The figures on this page only cover postcode ${BENCHMARK_ZIP}. For other postcodes the prompt asks the AI to find the area's own figures.`,
              )}
            </p>
          )}
        </form>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label htmlFor="ai-prompt-text" className="text-[13px] font-semibold">{tx("Din prompt", "Your prompt")}</label>
            <div className="flex items-center gap-3">
              <span role="status" className="text-[12.5px] text-ink-soft">
                {copy === "copied" ? tx("Kopieret", "Copied") : copy === "failed" ? tx("Kunne ikke kopiere. Teksten er markeret, tryk Ctrl+C.", "Could not copy. The text is selected, press Ctrl+C.") : ""}
              </span>
              <button type="button" onClick={copyPrompt} className="rounded-full bg-cta px-4 py-1.5 text-sm font-semibold text-cta-text hover:bg-cta-hover">
                {tx("Kopiér prompt", "Copy prompt")}
              </button>
            </div>
          </div>
          <textarea
            id="ai-prompt-text"
            ref={textRef}
            readOnly
            value={prompt}
            rows={22}
            className="mt-2 block w-full rounded-2xl border border-border bg-surface-alt p-4 font-mono text-[12.5px] leading-relaxed text-ink"
            onFocus={(e) => e.currentTarget.select()}
          />
          <p className="mt-2 text-[12px] text-ink-soft">
            {tx(
              "AI-svar kan være forkerte eller forældede. Tjek annoncen, tilstandsrapporten og tallene selv, før du byder. Teksten sendes ikke nogen steder fra denne side.",
              "AI answers can be wrong or out of date. Check the listing, the condition report and the figures yourself before bidding. This page does not send the text anywhere.",
            )}
          </p>
        </div>
      </div>
    </section>
  );
}
