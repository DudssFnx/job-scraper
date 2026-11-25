import type { ReactNode } from "react";

interface InsightsSectionProps {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** Cartão padrão das seções de /insights (mesmo visual dos cards do dashboard). */
export default function InsightsSection({ title, subtitle, icon, aside, children, className = "" }: InsightsSectionProps) {
  return (
    <section className={`rounded-2xl border border-gray-100 bg-white p-6 shadow-sm ${className}`}>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          {icon && <span className="mt-0.5 inline-flex rounded-lg bg-indigo-50 p-1.5 text-indigo-600">{icon}</span>}
          <div>
            <h2 className="text-base font-semibold text-gray-900">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-gray-500">{subtitle}</p>}
          </div>
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function EmptyState({ title, text }: { title: string; text?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-gray-200 px-6 py-8 text-center">
      <p className="text-sm font-semibold text-gray-900">{title}</p>
      {text && <p className="mt-1 text-xs text-gray-500">{text}</p>}
    </div>
  );
}
