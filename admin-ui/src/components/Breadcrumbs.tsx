import { ChevronRight, Home } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useUiLocale } from "../contexts/LocaleContext";
import { useTenant } from "../contexts/TenantContext";
import { pathSegmentLabel } from "../lib/breadcrumbs";

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

export function Breadcrumbs() {
  const location = useLocation();
  const { tenant } = useTenant();
  const { t, locale } = useUiLocale();
  const segments = location.pathname.replace(/^\//, "").split("/").filter(Boolean);

  if (segments.length === 0) return null;

  const labelFor = (segment: string) => pathSegmentLabel(segment, locale);

  const crumbs: Array<{ label: string; to: string }> = [{ label: t("nav.dashboard"), to: "/" }];
  let path = "";
  for (const seg of segments) {
    path += `/${seg}`;
    const decoded = decodeSegment(seg);
    crumbs.push({ label: labelFor(decoded) || labelFor(seg), to: path });
  }

  return (
    <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-xs text-slate-500">
      <Link to="/" className="flex items-center gap-1 transition hover:text-cyan-300">
        <Home className="h-3 w-3" />
      </Link>
      {tenant && (
        <>
          <ChevronRight className="h-3 w-3 shrink-0" />
          <span className="truncate text-slate-400">{tenant.name}</span>
        </>
      )}
      {crumbs.slice(1).map((crumb, i) => (
        <span key={crumb.to} className="flex items-center gap-1">
          <ChevronRight className="h-3 w-3 shrink-0" />
          {i === crumbs.length - 2 ? (
            <span className="font-medium text-slate-300">{crumb.label}</span>
          ) : (
            <Link to={crumb.to} className="transition hover:text-cyan-300">
              {crumb.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}