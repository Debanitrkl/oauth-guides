import { NextRequest } from "next/server";
import { PipelineEvent } from "@/lib/pipeline/events";
import { runPipeline } from "@/lib/pipeline/run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const RATE: Map<string, number[]> = new Map();
let inflight = 0;
const MAX_INFLIGHT = 5;
const PER_HOUR = 10;

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const list = (RATE.get(ip) ?? []).filter((t) => now - t < 3_600_000);
  if (list.length >= PER_HOUR) {
    RATE.set(ip, list);
    return true;
  }
  list.push(now);
  RATE.set(ip, list);
  return false;
}

export async function POST(req: NextRequest) {
  let body: { query?: string; force?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Send JSON with a query field." }, { status: 400 });
  }
  const query = (body.query ?? "").trim();
  if (!query || query.length > 200) return Response.json({ error: "Query must be 1 to 200 characters." }, { status: 400 });
  // An optional per request key. Used for this run only, never logged or stored.
  const headerKey = (req.headers.get("x-anthropic-key") ?? "").trim();
  if (headerKey && !/^sk-ant-[A-Za-z0-9_-]{20,}$/.test(headerKey)) {
    return Response.json({ error: "That does not look like an Anthropic API key." }, { status: 400 });
  }
  const apiKey = headerKey || undefined;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (process.env.NODE_ENV === "production" && rateLimited(ip)) {
    return Response.json({ error: "Rate limit: 10 generations per hour per address." }, { status: 429 });
  }
  if (inflight >= MAX_INFLIGHT) return Response.json({ error: "Too many generations running. Try again in a minute." }, { status: 503 });

  const encoder = new TextEncoder();
  const abort = new AbortController();
  req.signal.addEventListener("abort", () => abort.abort(), { once: true });
  inflight++;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (e: PipelineEvent) => {
        try {
          controller.enqueue(encoder.encode(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`));
        } catch {
          // stream closed
        }
      };
      send({ type: "log", message: `Generating a guide for "${query}"` });
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          clearInterval(heartbeat);
        }
      }, 10_000);
      runPipeline({ query, force: !!body.force, signal: abort.signal, apiKey }, send)
        .catch((e) => send({ type: "error", message: e instanceof Error ? e.message : String(e), stage: "run", partial: false }))
        .finally(() => {
          clearInterval(heartbeat);
          inflight--;
          try {
            controller.close();
          } catch {
            // already closed
          }
        });
    },
    cancel() {
      abort.abort();
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
