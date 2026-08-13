export function Sparkline({ values, color = "#22c55e" }: { values: number[]; color?: string }) {
  const safe = values.length > 1 ? values : [0, 0];
  const min = Math.min(...safe); const max = Math.max(...safe); const range = max - min || 1;
  const points = safe.map((value, index) => `${(index / (safe.length - 1)) * 100},${38 - ((value - min) / range) * 34}`).join(" ");
  return <svg viewBox="0 0 100 42" className="h-12 w-24 shrink-0 sm:h-14 sm:w-32" aria-hidden="true"><polyline points={points} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />{safe.map((value, index) => <circle key={index} cx={(index / (safe.length - 1)) * 100} cy={38 - ((value - min) / range) * 34} r="1.5" fill={color} />)}</svg>;
}

export function HealthGauge({ score }: { score: number }) {
  const bounded = Math.max(0, Math.min(100, score));
  const label = bounded >= 80 ? "Strong" : bounded >= 60 ? "Good" : bounded >= 40 ? "Needs Attention" : "At Risk";
  return <div className="flex flex-col items-center"><div className="relative h-36 w-52 overflow-hidden"><div className="absolute left-3 top-5 h-44 w-44 rounded-full" style={{ background: "conic-gradient(from 225deg,#ef4444 0deg,#f97316 55deg,#facc15 115deg,#84cc16 175deg,#22c55e 240deg,transparent 241deg)" }} /><div className="absolute left-[34px] top-[50px] h-[132px] w-[132px] rounded-full bg-card" /><div className="absolute inset-x-0 top-[74px] text-center"><span className="text-4xl font-bold">{bounded}</span><span className="text-sm text-muted-foreground">/100</span></div></div><p className={bounded >= 60 ? "font-semibold text-emerald-400" : "font-semibold text-rose-400"}>{label}</p></div>;
}

export function SpendingDonut({ segments }: { segments: Array<{ value: number; color: string }> }) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0) || 1;
  let offset = 0;
  const gradient = segments.map(segment => { const start = offset; offset += segment.value / total * 100; return `${segment.color} ${start}% ${offset}%`; }).join(",");
  return <div className="relative h-36 w-36 shrink-0 rounded-full" style={{ background: `conic-gradient(${gradient || "#1e3a5f 0 100%"})` }}><div className="absolute inset-7 rounded-full bg-card" /></div>;
}
