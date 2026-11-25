import Link from "next/link";
import type { PeriodKey } from "@/lib/insights/compute";

const LABELS: Record<PeriodKey, string> = { "7d": "7 dias", "30d": "30 dias", tudo: "Tudo" };

export default function PeriodTabs({ current }: { current: PeriodKey }) {
  return (
    <nav className="inline-flex rounded-xl bg-gray-100 p-1" aria-label="Período">
      {(Object.keys(LABELS) as PeriodKey[]).map((p) => (
        <Link
          key={p}
          href={`/insights?periodo=${p}`}
          scroll={false}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
            p === current ? "bg-white text-indigo-700 shadow-sm" : "text-gray-500 hover:text-gray-800"
          }`}
          aria-current={p === current ? "page" : undefined}
        >
          {LABELS[p]}
        </Link>
      ))}
    </nav>
  );
}
