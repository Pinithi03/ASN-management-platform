/**
 * LanguageSwitcher — globe button + menu in the sidebar footer.
 *
 * On select: switches the UI immediately, then saves the choice to the user's
 * account and refreshes the token so the new `locale` claim is in future tokens.
 */

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Globe } from "lucide-react";
import i18n, { LANGUAGE_NAMES, SUPPORTED_LANGUAGES, currentLanguage, type AppLanguage } from "@/i18n";
import { keycloak } from "@/lib/keycloak";
import { authService } from "@/services/auth";
import { cn } from "@/utils/cn";

interface LanguageSwitcherProps {
  /** Sidebar is collapsed: open the menu to the right instead of above. */
  collapsed?: boolean;
}

export default function LanguageSwitcher({ collapsed = false }: LanguageSwitcherProps) {
  const { t } = useTranslation("layout");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = currentLanguage();

  // Close the menu on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = async (lang: AppLanguage) => {
    setOpen(false);
    if (lang === active) return;

    await i18n.changeLanguage(lang);

    try {
      await authService.updatePreferences({ language: lang });
      await keycloak.updateToken(-1);
    } catch (err) {
      // The UI has already switched; saving to the account is best effort.
      console.warn("Could not save language preference:", err);
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 transition-colors cursor-pointer"
        title={t("language.change")}
        aria-label={t("language.change")}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Globe className="w-4 h-4" />
      </button>

      {open && (
        <div
          role="menu"
          className={cn(
            "absolute w-36 rounded-xl border border-slate-200 bg-white py-1 shadow-xl z-50",
            collapsed ? "left-full bottom-0 ml-2" : "right-0 bottom-full mb-2"
          )}
        >
          {SUPPORTED_LANGUAGES.map((lang) => (
            <button
              key={lang}
              type="button"
              role="menuitemradio"
              aria-checked={lang === active}
              lang={lang}
              onClick={() => handleSelect(lang)}
              className={cn(
                "w-full flex items-center justify-between px-3 py-1.5 text-xs transition-colors cursor-pointer",
                lang === active
                  ? "font-semibold text-slate-900 bg-slate-50"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              )}
            >
              <span>{LANGUAGE_NAMES[lang]}</span>
              {lang === active && <Check className="w-3.5 h-3.5 text-emerald-600" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
