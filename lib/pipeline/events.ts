import { Guide, Probe, Provider, Source } from "../schema";

export type ResolveResult =
  | { kind: "found"; provider: Provider; authorizeUrl?: string; candidateUrls: { url: string; why: string }[] }
  | { kind: "no_oauth"; providerName: string; reason: string }
  | { kind: "ambiguous"; options: string[]; question: string };

export type PipelineEvent =
  | { type: "stage"; name: string; status: "started" | "done" | "failed" | "skipped"; ms?: number; note?: string }
  | { type: "resolved"; result: ResolveResult }
  | { type: "source"; source: Source }
  | { type: "probe"; probe: Probe }
  | { type: "claims"; proposed: number; kept: number; dropped: number; stripped: number }
  | { type: "guide"; guide: Guide }
  | { type: "done"; slug: string; url: string | null; cached: boolean; runId: string }
  | { type: "error"; message: string; stage: string; partial: boolean }
  | { type: "log"; message: string };

export type Emit = (e: PipelineEvent) => void;
