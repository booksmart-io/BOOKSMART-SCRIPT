import { Fragment, type ReactNode } from "react";

function inlineFormatting(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((part, index) =>
    part.startsWith("**") && part.endsWith("**")
      ? <strong key={index} className="font-semibold text-foreground">{part.slice(2, -2)}</strong>
      : <Fragment key={index}>{part}</Fragment>,
  );
}

export function FormattedAiMessage({ content }: { content: string }) {
  return <div className="space-y-1.5 [overflow-wrap:anywhere]">
    {content.split(/\r?\n/).map((rawLine, index) => {
      const line = rawLine.trim();
      if (!line) return <div key={index} className="h-1" aria-hidden="true" />;
      const heading = line.match(/^#{1,3}\s+(.+)$/);
      if (heading) return <p key={index} className="font-semibold">{inlineFormatting(heading[1])}</p>;
      const bullet = line.match(/^[-*]\s+(.+)$/);
      if (bullet) return <div key={index} className="flex gap-2"><span className="shrink-0 text-primary">•</span><p>{inlineFormatting(bullet[1])}</p></div>;
      const numbered = line.match(/^(\d+)[.)]\s+(.+)$/);
      if (numbered) return <div key={index} className="flex gap-2"><span className="shrink-0 font-medium text-primary">{numbered[1]}.</span><p>{inlineFormatting(numbered[2])}</p></div>;
      return <p key={index}>{inlineFormatting(line)}</p>;
    })}
  </div>;
}
