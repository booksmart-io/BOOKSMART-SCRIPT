import type { ReactNode } from "react";
import { Bot, Check, ChevronLeft, Loader2, Sparkles, Star, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function QuestionnaireHeader({
  eyebrow = "BOOKSMART",
  title,
  description,
  steps,
  currentStep,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  steps: string[];
  currentStep: number;
}) {
  return (
    <header className="shrink-0 border-b border-[#243a55] bg-[#001426] px-4 py-3 sm:px-7 sm:py-5">
      <div className="mx-auto grid max-w-[1100px] gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(310px,0.85fr)]">
        <div className="min-w-0">
          <p className="text-[10px] font-black tracking-[0.18em] text-[#ffc72b]">{eyebrow}</p>
          <h2 className="mt-1 text-xl font-black tracking-tight text-white sm:text-[30px]">2. {title}</h2>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-[#d4deea] sm:text-sm">{description}</p>

          <div className="mt-4 overflow-x-auto pb-1">
            <div className="flex min-w-max items-start">
              {steps.map((step, index) => {
                const completed = index < currentStep;
                const active = index === currentStep;
                return (
                  <div key={step} className="flex items-start">
                    <div className="w-[92px] text-center">
                      <div className="mx-auto flex items-center justify-center">
                        <span className={cn(
                          "flex h-9 w-9 items-center justify-center rounded-full border text-xs font-black transition-colors",
                          completed && "border-[#78c94d] bg-[#113524] text-[#8cdc61]",
                          active && "border-[#ffc72b] bg-[#17283b] text-[#ffc72b] shadow-[0_0_16px_rgba(255,199,43,0.3)]",
                          !completed && !active && "border-[#58708d] bg-[#0b1d31] text-[#a8b9cd]",
                        )}>
                          {completed ? <Check className="h-4 w-4" /> : index + 1}
                        </span>
                      </div>
                      <p className={cn("mt-1.5 text-[9px] leading-tight", active ? "font-bold text-[#ffc72b]" : "text-[#b7c5d7]")}>{step}</p>
                    </div>
                    {index < steps.length - 1 && <div className={cn("mt-[17px] h-px w-5", index < currentStep ? "bg-[#78c94d]" : "bg-[#415873]")} />}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <aside className="hidden rounded-xl border border-[#2b4059] bg-[#00182d] p-4 lg:grid lg:grid-cols-2 lg:gap-4">
          <div>
            <h3 className="font-black text-[#ffc72b]">Objective</h3>
            <p className="mt-1 text-[11px] leading-relaxed text-[#d4deea]">Make it easy and enjoyable to provide the missing information needed to build an accurate Balance Sheet.</p>
            <div className="mt-3 space-y-1.5 text-[11px] text-[#e5edf6]">
              <p className="flex items-center gap-2"><Bot className="h-4 w-4 text-[#5d94ed]" /> Simple questions</p>
              <p className="flex items-center gap-2"><Star className="h-4 w-4 fill-[#ffc72b] text-[#ffc72b]" /> Gamified experience</p>
              <p className="flex items-center gap-2"><TrendingUp className="h-4 w-4 text-[#78c94d]" /> Progress tracking</p>
              <p className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-[#5d94ed]" /> AI guidance</p>
            </div>
          </div>
          <div className="border-l border-[#2b4059] pl-4">
            <h3 className="font-black text-[#ffc72b]">What You&apos;ll Provide</h3>
            <ul className="mt-2 space-y-1 text-[10px] text-[#e5edf6]">
              {["Business workspace info", "Vehicle usage", "Phone & internet usage", "Assets & equipment", "Business debts", "Owner contributions"].map((item) => (
                <li key={item} className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 rounded-full bg-[#78c94d] p-0.5 text-[#082013]" /> {item}</li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </header>
  );
}

export function QuestionProgress({
  current,
  total,
  percent,
}: {
  current: number;
  total: number;
  percent: number;
}) {
  return (
    <div className="mt-auto pt-5" aria-label={`Question ${current} of ${total}, ${percent}% complete`}>
      <div className="mb-2 flex items-center justify-between text-xs font-semibold">
        <span className="text-foreground">{current} of {total}</span>
        <span className="sr-only">{percent}% complete</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-gradient-to-r from-[#59a93d] to-[#8bd35a] transition-[width] duration-500 motion-reduce:transition-none"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

export function QuestionStage({
  number,
  title,
  description,
  image,
  icon,
  children,
}: {
  number: number;
  title: string;
  description?: string;
  image?: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="survey-question-surface question-enter relative mx-auto flex min-h-[min(540px,calc(100dvh-9rem))] w-full max-w-[460px] flex-col bg-card px-3 pb-3 pt-3 text-card-foreground sm:min-h-[min(570px,calc(100dvh-9rem))] sm:px-4">
      <span className="absolute left-3 top-3 flex h-9 w-9 items-center justify-center rounded-full border border-[#5794ef] bg-[#246acb] text-base font-black text-white shadow-[0_0_16px_rgba(56,130,246,0.28)]">{number}</span>
      <div className="mx-auto flex w-full flex-col items-center px-10 text-center sm:px-12">
        <h3 className="min-h-[56px] text-balance text-lg font-bold leading-snug text-card-foreground">{title}</h3>
        {image ? (
          <img src={image} alt="" aria-hidden="true" className="my-3 h-36 w-52 object-contain drop-shadow-[0_10px_16px_rgba(0,0,0,0.3)] sm:h-40 sm:w-56" />
        ) : (
          <div className="my-3 flex h-28 w-28 items-center justify-center text-[#7baaf2] sm:h-32 sm:w-32">{icon}</div>
        )}
        {description && <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>}
      </div>
      <div className="mx-auto mt-4 flex w-full max-w-[410px] min-w-0 flex-1 flex-col">{children}</div>
    </section>
  );
}

export function QuestionnaireNavigation({
  first,
  complete,
  saving,
  onBack,
  onSkip,
  onSave,
  onContinue,
}: {
  first: boolean;
  complete: boolean;
  saving: boolean;
  onBack: () => void;
  onSkip?: () => void;
  onSave?: () => void;
  onContinue: () => void;
}) {
  return (
    <footer className="survey-navigation shrink-0 border-t border-border bg-card/95 px-3 py-3 backdrop-blur sm:px-5 sm:py-4">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-2 sm:flex-nowrap">
        <Button variant="ghost" onClick={onBack} disabled={saving} className="min-h-11 flex-1 gap-1 text-muted-foreground hover:bg-muted hover:text-foreground sm:flex-none">
          {first ? "Cancel" : <><ChevronLeft className="h-4 w-4" /> Back</>}
        </Button>
        <div className="hidden flex-1 sm:block" />
        {onSkip && <Button variant="ghost" onClick={onSkip} disabled={saving} className="min-h-11 text-muted-foreground hover:bg-muted hover:text-foreground">Skip</Button>}
        {onSave && <Button variant="outline" onClick={onSave} disabled={saving} className="min-h-11 border-border bg-transparent text-foreground hover:bg-muted">Save for later</Button>}
        <Button onClick={onContinue} disabled={saving} className="min-h-11 flex-[2] gap-2 bg-primary font-black text-primary-foreground shadow-[0_8px_24px_rgba(255,199,43,0.2)] hover:bg-primary/90 sm:flex-none sm:px-7">
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {complete ? "Done" : "Continue"}
        </Button>
      </div>
    </footer>
  );
}

export function SelectionIndicator({ selected }: { selected: boolean }) {
  return (
    <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-md border", selected ? "border-[#8ade61] bg-[#65b943]" : "border-[#5b7697]")}>
      {selected && <Check className="h-3.5 w-3.5 text-white" aria-hidden="true" />}
    </span>
  );
}

export function CompletionCard({ image }: { image: string }) {
  return (
    <section className="question-enter mx-auto flex w-full max-w-3xl flex-col items-center rounded-[24px] border border-[#31557e] bg-[radial-gradient(circle_at_50%_15%,rgba(255,199,43,0.13),transparent_38%),#071a31] px-6 py-10 text-center shadow-2xl">
      <img src={image} alt="" aria-hidden="true" className="h-40 w-48 object-contain drop-shadow-[0_16px_24px_rgba(255,190,20,0.2)] sm:h-48 sm:w-56" />
      <p className="mt-2 flex items-center gap-2 text-3xl font-black text-[#ffc72b]">Great Job! <Sparkles className="h-6 w-6" /></p>
      <h3 className="mt-3 text-xl font-bold text-white">You&apos;ve completed the Business Survey.</h3>
      <p className="mt-2 max-w-xl text-sm leading-relaxed text-[#b7c9df]">BookSmart now has the information needed to build a more complete financial picture and tailor your tax strategy.</p>
    </section>
  );
}
