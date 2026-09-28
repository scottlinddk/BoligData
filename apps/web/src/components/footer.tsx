import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/i18n/i18n";
import { BrandMark } from "./brand-mark";

export function Footer() {
  const { user } = useAuth();
  const { language, t } = useI18n();
  const tx = (da: string, en: string) => language === "da" ? da : en;
  const linkClass = "w-fit text-[13px] leading-6 text-[var(--color-footer-muted)] transition-colors hover:text-[var(--color-footer-text)]";
  return <footer className="border-t border-[var(--color-footer-border)] bg-[var(--color-footer-bg)] text-[var(--color-footer-text)]">
    <div className="mx-auto grid max-w-[1680px] gap-10 px-5 pb-12 pt-14 sm:grid-cols-2 sm:px-8 lg:grid-cols-[1.5fr_1fr_1fr_1.5fr] lg:pt-20 xl:px-12">
      <div>
        <Link to="/" className="flex w-fit items-center gap-2.5 text-[22px] font-medium tracking-[-0.055em]"><BrandMark className="h-8 w-8" cutoutColor="var(--color-footer-bg)" />BoligData</Link>
        <p className="mt-5 max-w-60 text-[13px] leading-6 text-[var(--color-footer-muted)]">{tx("Et bedre grundlag for dit næste boligvalg.", "A clearer picture of your next home.")}</p>
      </div>
      <div><h2 className="mb-5 text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--color-footer-muted)]">{tx("Find din bolig", "Find your home")}</h2><div className="flex flex-col gap-2">
        <Link to="/" className={linkClass}>{tx("Boliger til salg", "Homes for sale")}</Link>
        <Link to="/research" className={linkClass}>{tx("Boligprojekt", "Buying project")}</Link>
        <Link to="/recommendations" className={linkClass}>{t("nav.recommendations")}</Link>
      </div></div>
      <div><h2 className="mb-5 text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--color-footer-muted)]">{tx("Din BoligData", "Your BoligData")}</h2><div className="flex flex-col gap-2">
        <Link to="/dashboard" className={linkClass}>{t("nav.dashboard")}</Link>
        <Link to="/account/profile" className={linkClass}>{t("nav.profile")}</Link>
        <Link to="/account/settings" className={linkClass}>{t("nav.settings")}</Link>
      </div></div>
      <div className="max-w-72"><h2 className="mb-5 text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--color-footer-muted)]">{tx("Klar til næste skridt?", "Ready for your next step?")}</h2>
        <Link to={user ? "/research" : "/auth/signup"} className="flex items-center justify-between gap-4 rounded-full bg-accent px-5 py-3 text-[13px] font-medium text-accent-text transition-colors hover:bg-accent-hover">{user ? tx("Åbn dit boligprojekt", "Open your buying project") : tx("Opret din konto", "Create your account")}<span aria-hidden="true">↗</span></Link>
        <Link to={user ? "/dashboard" : "/auth/signin"} className="mt-4 block text-center text-[13px] text-[var(--color-footer-muted)] underline decoration-[var(--color-footer-border)] underline-offset-4 transition-colors hover:text-[var(--color-footer-text)]">{user ? tx("Se dit overblik", "View your dashboard") : t("nav.signIn")}</Link>
      </div>
    </div>
    <div aria-hidden="true" className="mx-auto max-w-[1680px] overflow-hidden px-5 pb-7 pt-3 sm:px-8 xl:px-12"><p className="text-center text-[clamp(3.5rem,15vw,15rem)] font-medium uppercase leading-[0.95] tracking-[-0.075em]">BoligData<span className="text-accent">.</span></p></div>
    <div className="border-t border-[var(--color-footer-border)]"><div className="mx-auto flex max-w-[1680px] flex-wrap justify-between gap-3 px-5 py-5 text-[11px] text-[var(--color-footer-muted)] sm:px-8 xl:px-12"><span>© {new Date().getFullYear()} BoligData</span><span>{tx("Boligdata, overblik og forberedelse før fremvisning", "Property data, perspective and preparation before a viewing")}</span></div></div>
  </footer>;
}
