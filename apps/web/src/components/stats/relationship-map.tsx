import type { ReactNode } from "react";

export interface RelationshipNode {
  id: string;
  label: string;
}

export interface RelationshipEdge {
  from: string;
  to: string;
  /** Short text on the arrow, e.g. "r -0.56 at 4 months". */
  label: string;
}

interface RelationshipMapProps {
  chain: RelationshipNode[];
  chainEdges: RelationshipEdge[];
  side: { node: RelationshipNode; edge: RelationshipEdge }[];
  /** Sentence explaining how to read the arrows. */
  caption: ReactNode;
}

function Node({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-border-strong bg-surface px-3 py-2 text-center text-[13px] font-semibold text-ink shadow-card">{children}</div>;
}

function Arrow({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-0.5 px-1 py-1 text-ink-faint md:min-w-[8.5rem]" aria-hidden="false">
      <span className="rounded-full bg-surface-alt px-2.5 py-0.5 text-center text-[11px] font-medium text-ink-soft">{label}</span>
      <svg viewBox="0 0 40 12" className="hidden h-3 w-full max-w-[7rem] md:block" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M1 6h36M32 1.5 37.5 6 32 10.5" />
      </svg>
      <svg viewBox="0 0 12 20" className="h-5 md:hidden" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 1v16M1.5 12 6 17.5 10.5 12" />
      </svg>
    </div>
  );
}

/** Supply -> asking price -> sold price, with the weaker side effects of supply underneath. */
export function RelationshipMap({ chain, chainEdges, side, caption }: RelationshipMapProps) {
  return (
    <figure>
      <div className="flex flex-col items-stretch md:flex-row md:items-center md:justify-center">
        {chain.map((node, i) => (
          <div key={node.id} className="flex flex-col items-stretch md:flex-row md:items-center">
            <Node>{node.label}</Node>
            {i < chain.length - 1 && <Arrow label={chainEdges[i]?.label ?? ""} />}
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-col gap-2 border-t border-dashed border-border pt-3 md:flex-row md:justify-center md:gap-6">
        {side.map(({ node, edge }) => (
          <div key={node.id} className="flex flex-col items-center gap-1 md:flex-row md:gap-2">
            <span className="text-[12px] text-ink-faint">{chain[0]?.label}</span>
            <span className="rounded-full bg-surface-alt px-2.5 py-0.5 text-[11px] font-medium text-ink-soft">{edge.label}</span>
            <Node>{node.label}</Node>
          </div>
        ))}
      </div>
      <figcaption className="mt-3 text-center text-[12px] text-ink-faint">{caption}</figcaption>
    </figure>
  );
}
