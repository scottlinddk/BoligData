import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { AddressSearchBox } from "@/components/address-search-box";
import { Footer } from "@/components/footer";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useI18n } from "@/i18n/i18n";

/** Entry point of the address lookup: pick an address, land on its report. */
export function AddressLookupPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  // Focusing on touch devices would raise the keyboard before the person has read anything.
  const hasFinePointer = useMediaQuery("(pointer: fine)");

  useEffect(() => {
    const appName = t("app.name");
    document.title = `${t("address.title")} | ${appName}`;
    return () => { document.title = appName; };
  }, [t]);

  return <>
    <section className="ui-enter mx-auto max-w-2xl px-4 pb-24 pt-10 sm:px-8 sm:pt-16">
      <h1 className="ds-display text-3xl leading-tight text-ink sm:text-[40px]">{t("address.title")}</h1>
      <p className="mb-8 mt-3 text-base leading-7 text-ink-soft">{t("address.subtitle")}</p>
      <AddressSearchBox autoFocus={hasFinePointer} onSelect={address => navigate(`/address/${address.id}`)} />
    </section>
    <Footer />
  </>;
}
