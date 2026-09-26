import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/i18n/i18n";
import { BrandMark } from "./brand-mark";

export function Footer() {
  const { user } = useAuth();
  const { language, t } = useI18n();
  const tx = (da: string, en: string) => language === "da" ? da : en;
  const linkClass = "w-fit text-[13px] leading-6 text-[#b8bec8] transition-colors hover:text-white";
  return <footer className="border-t border-[#30363d] bg-[#1b1f24] text-white">
    <div className="mx-auto grid max-w-[1680px] gap-10 px-5 py-12 sm:grid-cols-2 sm:px-8 lg:grid-cols-[1.5fr_1fr_1fr_1.5fr] xl:px-12">
      <div>
        <Link to="/" className="flex w-fit items-center gap-2 text-[19px] font-semibold tracking-tight"><BrandMark className="h-7 w-7" />BoligData</Link>
        <p className="mt-4 max-w-60 text-[13px] leading-6 text-[#b8bec8]">{tx("Et bedre grundlag for dit næste boligvalg.", "A clearer picture of your next home.")}</p>
      </div>
      <div><h2 className="mb-4 text-sm font-medium">{tx("Find din bolig", "Find your home")}</h2><div className="flex flex-col gap-2">
        <Link to="/" className={linkClass}>{tx("Boliger til salg", "Homes for sale")}</Link>
        <Link to="/research" className={linkClass}>{tx("Boligprojekt", "Buying project")}</Link>
        <Link to="/recommendations" className={linkClass}>{t("nav.recommendations")}</Link>
      </div></div>
      <div><h2 className="mb-4 text-sm font-medium">{tx("Din BoligData", "Your BoligData")}</h2><div className="flex flex-col gap-2">
        <Link to="/dashboard" className={linkClass}>{t("nav.dashboard")}</Link>
        <Link to="/account/profile" className={linkClass}>{t("nav.profile")}</Link>
        <Link to="/account/settings" className={linkClass}>{t("nav.settings")}</Link>
      </div></div>
      <div className="max-w-72"><h2 className="mb-4 text-sm font-medium">{tx("Klar til næste skridt?", "Ready for your next step?")}</h2>
        <Link to={user ? "/research" : "/auth/signup"} className="block rounded-full bg-[#3473e6] px-5 py-2.5 text-center text-[13px] font-medium text-white transition-colors hover:bg-[#4382f5]">{user ? tx("Åbn dit boligprojekt", "Open your buying project") : tx("Opret din konto", "Create your account")}</Link>
        <Link to={user ? "/dashboard" : "/auth/signin"} className="mt-3 block rounded-full border border-[#a9b1be] px-5 py-2.5 text-center text-[13px] font-medium text-white transition-colors hover:bg-white/5">{user ? tx("Se dit overblik", "View your dashboard") : t("nav.signIn")}</Link>
      </div>
    </div>
    <div className="border-t border-[#30363d]"><div className="mx-auto flex max-w-[1680px] flex-wrap justify-between gap-3 px-5 py-5 text-[11px] text-[#a5aebb] sm:px-8 xl:px-12"><span>© {new Date().getFullYear()} BoligData</span><span>{tx("Boligdata, overblik og forberedelse før fremvisning", "Property data, perspective and preparation before a viewing")}</span></div></div>
  </footer>;
}
