import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion, type Variants } from "motion/react";
import type { AskResponse } from "../types";

const API_URL = "http://localhost:8000/ask";

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

// The home page is cinematic because it has to persuade. This page is a working
// instrument, so its entrances are short and its background is static: nothing
// should still be moving by the time someone starts reading an answer.
const stack: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.09, delayChildren: 0.05 } },
};

const stackItem: Variants = {
  hidden: { opacity: 0, y: 14, filter: "blur(6px)" },
  visible: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.7, ease: EASE_OUT },
  },
};

// Diagonal hatching is how an airfield marks a surface you are not cleared to
// use. It does all the work of labelling the ungrounded half of this page, so
// the grounded half never has to shout.
const HATCH =
  "repeating-linear-gradient(135deg, var(--color-paper-700) 0, var(--color-paper-700) 1px, transparent 1px, transparent 8px)";

// The hash ticks under the home page's rules, turned vertical for the seam
// between the two panels: the two answers read as two cells of one instrument
// rather than two cards that happen to sit next to each other.
const CROSSHATCH = `${HATCH}, repeating-linear-gradient(45deg, var(--color-red-500) 0, var(--color-red-500) 1px, transparent 1px, transparent 9px)`;

const TICKS_V =
  "repeating-linear-gradient(to bottom, var(--color-ink-500) 0, var(--color-ink-500) 1px, transparent 1px, transparent 12px)";
const TICKS_H =
  "repeating-linear-gradient(to right, var(--color-ink-500) 0, var(--color-ink-500) 1px, transparent 1px, transparent 12px)";

// Real questions from the eval set, including one deliberately out of scope:
// the refusal is as much a proof as a citation is, so it gets a chip of its own.
const PROBES: { label: string; question: string; probe?: boolean }[] = [
  {
    label: "Congested-area minimum",
    question: "How high above the highest obstacle must I fly over a congested area?",
  },
  {
    label: "Alcohol wait time",
    question: "How long after drinking alcohol must a crewmember wait before flying?",
  },
  {
    label: "Helicopter minimum altitude",
    question: "Can a helicopter operate below the standard minimum safe altitude?",
  },
  {
    label: "Out of scope: Part 107 drones",
    question: "How do I register a drone under Part 107?",
    probe: true,
  },
];

// Three ways the request can fail before there is anything to compare, each
// worth telling apart: the page never reached the service, the service refused,
// or the service answered with something unreadable. All three used to land the
// viewer back on the empty state, which reads as "your question did nothing".
type FaultKind = "offline" | "status" | "malformed";

type Fault = { kind: FaultKind; detail: string };

const FAULTS: Record<FaultKind, { status: string; headline: string; body: string }> = {
  offline: {
    status: "link down",
    headline: "No answer arrived",
    body: "This page could not reach the backend, so neither model was asked anything.",
  },
  status: {
    status: "backend error",
    headline: "The request was refused",
    body: "The service answered with an error instead of a pair of answers. Nothing was retrieved and nothing was generated.",
  },
  malformed: {
    status: "unreadable response",
    headline: "The response could not be read",
    body: "The backend replied, but not with a result this page can parse, so there is nothing to put side by side.",
  },
};

// Indicative stages of the real pipeline, not measured telemetry: the checklist
// walks them on its own clock and then holds on the last one until the response
// actually lands. It exists because the grounded side has a process worth
// watching and the bare side does not — the wait is itself part of the contrast.
const STAGES = [
  { label: "Embedding the question", ms: 700 },
  { label: "Searching the Part 91 vector index", ms: 1500 },
  { label: "Ranking candidate sections", ms: 1100 },
  { label: "Drafting from retrieved text only", ms: 2600 },
  { label: "Formatting citations for display", ms: 0 },
];

type Parsed = { prefix: string; section: string; subsection: string; url: string | null };

// Citations arrive as "14 CFR § 91.119(b)". Split into prefix / section /
// subsection so the section number — the one checkable fact on this page — can
// be set at three times the size of the boilerplate around it, and resolve it
// to its page on eCFR so the number is not just quotable but clickable.
function parseCitation(raw: string): Parsed {
  const match = raw.match(/(\d+)\.(\d+[A-Za-z-]*)\s*((?:\([^)]*\))*)/);
  if (!match) return { prefix: "", section: raw.trim(), subsection: "", url: null };

  const [, part, rule, subsection] = match;
  const section = `${part}.${rule}`;
  const prefix = raw.slice(0, match.index).replace(/§\s*$/, "").trim() || "14 CFR";
  return {
    prefix,
    section,
    subsection,
    url: `https://www.ecfr.gov/current/title-14/section-${section}`,
  };
}

// The bare model is asked for citations too — it just has nothing behind them.
// Finding the regulation numbers it asserts in prose turns "no citations" from
// an absence into a specific, countable claim that nothing checked.
const ASSERTED = /(?:14\s*CFR\s*)?§+\s*\d{1,3}\.\d+(?:\([A-Za-z0-9]+\))*|\b\d{2,3}\.\d{1,3}(?:\([A-Za-z0-9]+\))*/g;

function splitAsserted(text: string): { text: string; asserted: boolean }[] {
  const parts: { text: string; asserted: boolean }[] = [];
  let cursor = 0;
  for (const match of text.matchAll(ASSERTED)) {
    const at = match.index ?? 0;
    if (at > cursor) parts.push({ text: text.slice(cursor, at), asserted: false });
    parts.push({ text: match[0], asserted: true });
    cursor = at + match[0].length;
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), asserted: false });
  return parts;
}

function CheckGlyph({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden className={className}>
      <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.1" strokeOpacity="0.5" />
      <path d="M4.8 8.3l2.1 2.1 4.3-4.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// The X painted across a closed runway: the surface is there, you may not use it.
function ClosedGlyph({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden className={className}>
      <rect x="1.5" y="1.5" width="17" height="17" rx="2" stroke="currentColor" strokeWidth="1" strokeOpacity="0.45" strokeDasharray="3 3" />
      <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

// Held short rather than cleared: the shape for an answer AirPilot declined to
// give, which is a different kind of emptiness from having nothing to give.
function HeldGlyph({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden className={className}>
      <circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M6.5 10h7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden className={`animate-spin ${className}`}>
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.25" />
      <path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function Micro({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`font-mono text-[10px] uppercase tracking-[0.2em] ${className}`}>{children}</span>
  );
}

// Runway edge lights, flattened into a bar along the head of each panel. Lit and
// travelling on the grounded side, dark and static on the ungrounded one: the
// same vocabulary the flight route used for a leg flown versus a leg not yet.
function LightBar({
  lit,
  sweep,
  tone = "amber",
  count = 22,
}: {
  lit: boolean;
  sweep?: boolean;
  tone?: "amber" | "red";
  count?: number;
}) {
  const reduceMotion = useReducedMotion();
  const on =
    tone === "red"
      ? "bg-red-400 drop-shadow-[0_0_6px_rgba(226,141,118,0.85)]"
      : "bg-amber-400 drop-shadow-[0_0_5px_rgba(240,187,108,0.85)]";
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 flex h-3 items-center justify-between px-5">
      {Array.from({ length: count }, (_, i) => (
        <motion.span
          key={i}
          className={`h-[3px] w-[3px] rounded-full ${lit ? on : "bg-ink-500"}`}
          animate={sweep && !reduceMotion ? { opacity: [0.2, 1, 0.2] } : { opacity: lit ? 0.9 : 0.55 }}
          transition={
            sweep && !reduceMotion
              ? { duration: 1.8, repeat: Infinity, ease: "easeInOut", delay: (i / count) * 1.4 }
              : { duration: 0.4 }
          }
        />
      ))}
    </div>
  );
}

type PanelTone = "grounded" | "held" | "bare" | "standby";

// One cell of the comparator. Every treatment difference between the two answers
// is forked here, in one place, on one value — surface height, border, glow,
// hatching, type weight — so the contrast is a property of the panel rather than
// something each piece of content has to remember to apply. Colour is reserved
// for the verified side: the ungrounded panel gets no hue at all.
function Panel({
  tone,
  title,
  meta,
  status,
  count,
  flash,
  sweep,
  delay,
  body,
  record,
}: {
  tone: PanelTone;
  title: string;
  meta: string;
  status: string;
  count: number | null;
  flash?: boolean;
  sweep?: boolean;
  delay?: number;
  body: React.ReactNode;
  record: React.ReactNode;
}) {
  const reduceMotion = useReducedMotion();
  const keyed = tone === "grounded" || tone === "held";

  const surface =
    tone === "grounded"
      ? "bg-ink-850/80 shadow-[inset_0_1px_0_rgba(240,187,108,0.12),0_30px_60px_-45px_rgba(224,162,60,0.5)]"
      : tone === "held"
        ? "bg-ink-850/70 shadow-[inset_0_1px_0_rgba(240,187,108,0.07)]"
        : tone === "bare"
          ? "bg-ink-950/70 shadow-[inset_0_2px_14px_rgba(0,0,0,0.6)]"
          : "bg-ink-900/45";

  return (
    // Three rows — heading, source record, answer — laid on a subgrid of the
    // comparator, so the two records start on the same line regardless of tone,
    // and sit directly under the heading rather than after however long either
    // answer runs. The citations are the proof on this page, so they can never
    // be something a long bare-LLM ramble pushes below the fold.
    <motion.div
      initial={reduceMotion || delay === undefined ? false : { opacity: 0, y: 16, filter: "blur(8px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.75, ease: EASE_OUT, delay: delay ?? 0 }}
      className={`relative flex min-h-[26rem] flex-col overflow-hidden px-6 pb-6 pt-9 sm:px-7 lg:row-span-3 lg:grid lg:grid-rows-subgrid ${surface}`}
    >
      {/* The ungrounded panel carries the hatching across its whole surface, at
          the threshold of visible — felt before it is noticed. */}
      {tone === "bare" && (
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.055]" style={{ backgroundImage: HATCH }} />
      )}

      <LightBar lit={keyed} sweep={sweep} />

      {/* A single wash of light across the head of the grounded panel as its
          answer arrives: the display coming up, not a decoration that loops. */}
      {flash && !reduceMotion && (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-[radial-gradient(ellipse_60%_100%_at_50%_0%,rgba(240,187,108,0.22),transparent_70%)]"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 0.22] }}
          transition={{ duration: 1.4, ease: EASE_OUT, times: [0, 0.35, 1] }}
        />
      )}

      <div className="relative">
        <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h3 className={`m-0 text-base font-semibold tracking-tight ${keyed ? "text-paper-100" : "text-paper-300"}`}>
            {title}
          </h3>
          <Micro className={keyed ? "text-paper-500" : "text-paper-700"}>{meta}</Micro>
        </div>

        {/* The glance-level readout: two numerals in the same place, at the same
            size, one lit and one not. Comparable before a word is read. */}
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span
            className={`font-mono text-[2.6rem] leading-none font-semibold tabular-nums tracking-tight ${
              count === null
                ? "text-ink-600"
                : count > 0
                  ? "text-amber-400 drop-shadow-[0_0_16px_rgba(240,187,108,0.5)]"
                  : tone === "held"
                    ? "text-amber-500/45"
                    : "text-paper-700"
            }`}
          >
            {count === null ? "\u2013\u2013" : String(count).padStart(2, "0")}
          </span>
          <Micro className={count || tone === "held" ? "text-amber-500/80" : "text-paper-500"}>
            {count === 1 ? "citation" : "citations"}
          </Micro>
        </div>
      </div>

        <div className="mt-4 mb-5 flex items-center gap-2.5">
        <span
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${
            tone === "grounded"
              ? "bg-amber-400 shadow-[0_0_8px_rgba(240,187,108,0.9)]"
              : tone === "held"
                ? "bg-amber-500/50"
                : "bg-ink-500"
          }`}
        />
        <Micro className={keyed ? "text-amber-400/90" : "text-paper-500"}>{status}</Micro>
        <span aria-hidden className="h-px flex-1 bg-ink-700" />
        </div>
      </div>

      {/* The record sits directly under the heading, on its own auto-sized
          row, so it lands in the same place on both panels no matter how
          long either answer turns out to be. */}
      <div className="relative">{record}</div>
      <div className="relative pt-6">{body}</div>
    </motion.div>
  );
}

// A citation, given the weight of the thing it actually is: the one fact on this
// page a reader can leave and verify. Boilerplate goes small and quiet above,
// the section number goes large and lit, and the whole placard is the link to
// the FAA's own text of it.
function Placard({ raw, index, delay }: { raw: string; index: number; delay: number }) {
  const reduceMotion = useReducedMotion();
  const { prefix, section, subsection, url } = parseCitation(raw);

  const body = (
    <>
      <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-amber-400 shadow-[0_0_14px_2px_rgba(240,187,108,0.6)]" />
      <span aria-hidden className="pointer-events-none absolute inset-0 bg-[linear-gradient(100deg,rgba(240,187,108,0.10),transparent_45%)]" />
      <Micro className="relative shrink-0 tabular-nums text-amber-500/60">{String(index + 1).padStart(2, "0")}</Micro>
      <span className="relative flex min-w-0 flex-col">
        <Micro className="text-paper-500">{prefix}</Micro>
        <span className="mt-0.5 truncate font-mono text-[1.35rem] leading-tight font-semibold tracking-tight text-amber-400">
          § {section}
          {subsection && <span className="text-paper-300">{subsection}</span>}
        </span>
      </span>
      <span className="relative ml-auto flex shrink-0 items-center gap-2 text-amber-400/70">
        <Micro className="hidden text-paper-500 transition-colors duration-200 group-hover:text-amber-400/80 sm:inline">
          {url ? "verify on eCFR ↗" : "in corpus"}
        </Micro>
        <CheckGlyph className="h-4 w-4" />
      </span>
    </>
  );

  const shell =
    "group relative flex items-center gap-4 overflow-hidden rounded-xl border border-amber-500/30 bg-ink-900/70 py-3.5 pr-4 pl-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-[border-color,background-color,box-shadow] duration-200 hover:border-amber-500/60 hover:bg-ink-850 hover:shadow-[0_14px_30px_-20px_rgba(224,162,60,0.7)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400";

  return (
    <motion.li
      // Citations do not fade in; they land. Spring plus a touch of scale reads
      // as each number being stamped onto the record in turn.
      initial={reduceMotion ? false : { opacity: 0, y: 10, scale: 0.97, filter: "blur(5px)" }}
      animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
      transition={{ type: "spring", stiffness: 320, damping: 24, delay }}
    >
      {url ? (
        <motion.a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          whileHover={reduceMotion ? undefined : { y: -1 }}
          transition={{ type: "spring", stiffness: 400, damping: 25 }}
          className={shell}
        >
          {body}
        </motion.a>
      ) : (
        <div className={shell}>{body}</div>
      )}
    </motion.li>
  );
}

function RecordHeader({ children, lit }: { children: React.ReactNode; lit: boolean }) {
  return (
    <div className="mb-3 flex items-center gap-3">
      <Micro className={lit ? "text-amber-400/90" : "text-paper-500"}>{children}</Micro>
      <span aria-hidden className="h-px flex-1 bg-ink-700" />
      <span aria-hidden className="h-[5px] w-16 opacity-60" style={{ backgroundImage: TICKS_H }} />
    </div>
  );
}

function SourceRecord({ citations }: { citations: string[] }) {
  return (
    <div>
      <RecordHeader lit>
        source record · {citations.length} {citations.length === 1 ? "entry" : "entries"}
      </RecordHeader>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {citations.map((raw, i) => (
          <Placard key={`${raw}-${i}`} raw={raw} index={i} delay={0.28 + i * 0.09} />
        ))}
      </ul>
      <p className="m-0 mt-3 text-[13px] leading-relaxed text-paper-500">
        Every number above was pulled from retrieved Part 91 text, not written by the model. Open one to read
        the FAA's own wording.
      </p>
    </div>
  );
}

// AirPilot answering "not in the corpus" is a success, so it cannot be dressed
// in the same grey as the bare model's missing sources. Held short: outlined in
// amber, no hatching, an explicit reason.
function HeldRecord() {
  return (
    <div>
      <RecordHeader lit>source record · held</RecordHeader>
      <div className="flex items-start gap-3.5 rounded-xl border border-amber-500/25 bg-ink-900/60 p-4">
        <HeldGlyph className="mt-0.5 h-5 w-5 shrink-0 text-amber-400/80" />
        <div className="flex flex-col gap-1">
          <span className="text-[13px] font-semibold text-paper-100">No citation issued, by design</span>
          <span className="text-[13px] leading-relaxed text-paper-500">
            Nothing in the indexed Part 91 corpus covers this, so the grounded pipeline declined instead of
            reaching for something plausible.
          </span>
        </div>
      </div>
    </div>
  );
}

// The absence, made as concrete as the presence opposite it. Same footprint, same
// position, hatched over and struck through — and where the prose asserted a
// regulation number anyway, that assertion is counted against zero verified.
function NoSourceRecord({ asserted }: { asserted: number }) {
  return (
    <div>
      <RecordHeader lit={false}>source record · empty</RecordHeader>
      <div className="relative overflow-hidden rounded-xl border border-dashed border-ink-600 p-4">
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.09]" style={{ backgroundImage: HATCH }} />
        <div className="relative flex items-start gap-3.5">
          <ClosedGlyph className="mt-0.5 h-5 w-5 shrink-0 text-paper-700" />
          <div className="flex flex-col gap-1.5">
            <Micro className="text-paper-500">no source on record</Micro>
            <span className="text-[13px] leading-relaxed text-paper-500">
              {asserted > 0 ? (
                <>
                  This answer states{" "}
                  <span className="font-medium text-paper-300">
                    {asserted} regulation {asserted === 1 ? "number" : "numbers"}
                  </span>{" "}
                  in its prose and backs {asserted === 1 ? "it" : "them"} with nothing — underlined
                  above, unchecked.
                </>
              ) : (
                <>Nothing was retrieved and nothing is cited. There is no way to check this answer.</>
              )}
            </span>
          </div>
        </div>
      </div>
      <p className="m-0 mt-3 flex items-baseline gap-2 text-[13px] text-paper-500">
        <span className="font-mono tabular-nums text-paper-300">{String(asserted).padStart(2, "0")}</span>
        asserted
        <span aria-hidden className="text-ink-500">/</span>
        <span className="font-mono tabular-nums text-paper-300">00</span>
        verified
      </p>
    </div>
  );
}

function SkeletonLines({ tint }: { tint: "amber" | "grey" }) {
  const widths = ["92%", "100%", "84%", "62%"];
  return (
    <div aria-hidden className="flex flex-col gap-2.5">
      {widths.map((w, i) => (
        <div
          key={w}
          className={`h-3 animate-pulse rounded-full ${tint === "amber" ? "bg-amber-500/12" : "bg-ink-700/55"}`}
          style={{ width: w, animationDelay: `${i * 160}ms` }}
        />
      ))}
    </div>
  );
}

// Dead time is still time someone is looking at the page, so the wait says
// something: the grounded side has stages worth watching, and watching them is
// the argument. The last stage holds until the response lands, because this
// checklist knows the shape of the work, not its progress.
function Pipeline() {
  const reduceMotion = useReducedMotion();
  const [stage, setStage] = useState(reduceMotion ? STAGES.length - 1 : 0);

  useEffect(() => {
    if (reduceMotion) return;
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    let elapsed = 0;
    STAGES.forEach((_, i) => {
      if (i === 0) return;
      elapsed += STAGES[i - 1].ms;
      timers.push(setTimeout(() => !cancelled && setStage(i), elapsed));
    });
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [reduceMotion]);

  return (
    <ol className="m-0 flex list-none flex-col gap-2.5 p-0">
      {STAGES.map((s, i) => {
        const done = i < stage;
        const active = i === stage;
        return (
          <motion.li
            key={s.label}
            initial={reduceMotion ? false : { opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, ease: EASE_OUT, delay: i * 0.06 }}
            className="flex items-center gap-3"
          >
            <span className="flex h-4 w-4 shrink-0 items-center justify-center">
              {done ? (
                <CheckGlyph className="h-4 w-4 text-amber-400" />
              ) : active ? (
                <Spinner className="h-4 w-4 text-amber-400" />
              ) : (
                <span className="h-1.5 w-1.5 rounded-full bg-ink-500" />
              )}
            </span>
            <span
              className={`font-mono text-xs tracking-wide transition-colors duration-500 ${
                done ? "text-paper-300" : active ? "text-paper-100" : "text-paper-700"
              }`}
            >
              {s.label}
            </span>
            {active && !reduceMotion && (
              <motion.span
                aria-hidden
                className="h-px flex-1 bg-linear-to-r from-amber-500/50 to-transparent"
                initial={{ scaleX: 0, originX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 1.2, ease: EASE_OUT }}
              />
            )}
          </motion.li>
        );
      })}
    </ol>
  );
}

// The other side of the same wait: one call, nothing to inspect. A sweep with
// no stages under it is the honest picture of a black box.
function BlackBox() {
  const reduceMotion = useReducedMotion();
  return (
    <div className="relative overflow-hidden rounded-xl border border-ink-700 p-5">
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.07]" style={{ backgroundImage: HATCH }} />
      {!reduceMotion && (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 w-1/3 bg-[linear-gradient(90deg,transparent,rgba(131,142,157,0.10),transparent)]"
          animate={{ x: ["-120%", "340%"] }}
          transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
        />
      )}
      <div className="relative flex items-center gap-3">
        <Spinner className="h-4 w-4 text-paper-500" />
        <Micro className="text-paper-500">no intermediate steps</Micro>
      </div>
      <p className="relative m-0 mt-2 text-[13px] leading-relaxed text-paper-500">
        One call, no retrieval, nothing to show while it runs. Whatever comes back arrives with no record of
        where it came from.
      </p>
    </div>
  );
}

function Elapsed() {
  const [ms, setMs] = useState(0);
  useEffect(() => {
    const start = performance.now();
    const id = setInterval(() => setMs(performance.now() - start), 100);
    return () => clearInterval(id);
  }, []);
  return (
    <Micro className="tabular-nums text-amber-400/80">
      t+{(ms / 1000).toFixed(1)}s
    </Micro>
  );
}

function GhostLines({ rows = 4 }: { rows?: number }) {
  const widths = ["94%", "100%", "80%", "58%", "70%"];
  return (
    <div aria-hidden className="flex flex-col gap-2.5 opacity-60">
      {widths.slice(0, rows).map((w) => (
        <div key={w} className="h-3 rounded-full border border-dashed border-ink-600" style={{ width: w }} />
      ))}
    </div>
  );
}

function Seam() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-y-0 left-1/2 hidden w-px bg-ink-700 lg:block">
      <div className="absolute inset-y-0 left-0 w-[5px] opacity-60" style={{ backgroundImage: TICKS_V }} />
    </div>
  );
}

function Bezel({
  status,
  note,
  seam = true,
  children,
}: {
  status: React.ReactNode;
  note: React.ReactNode;
  seam?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-ink-700 bg-ink-950/50 shadow-[0_50px_90px_-60px_rgba(0,0,0,0.95),inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-[6px]">
      <div className="flex flex-col gap-2 border-b border-ink-700 bg-ink-850/60 px-6 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <div className="flex min-w-0 items-center gap-3">{status}</div>
        <div className="flex min-w-0 items-center gap-3">{note}</div>
      </div>
      <div className="relative grid grid-cols-1 lg:grid-cols-2 lg:grid-rows-[auto_auto_1fr]">
        {seam && <Seam />}
        {children}
      </div>
    </div>
  );
}

// Before a question is asked, the comparator is already drawn — unpowered, both
// readouts blank, both source records outlined. The empty state's job is to make
// the promise the result then keeps: the reader learns where to look, and that
// one of those two records is going to stay empty.
function EmptyPanels() {
  const reduceMotion = useReducedMotion();
  return (
    <Bezel
      status={
        <>
          <motion.span
            aria-hidden
            className="h-1.5 w-1.5 rounded-full bg-amber-500/70"
            animate={reduceMotion ? undefined : { opacity: [0.25, 1, 0.25] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
          />
          <Micro className="text-paper-500">awaiting query</Micro>
        </>
      }
      note={<Micro className="text-paper-500">both models answer the same question, at the same time</Micro>}
    >
      <Panel
        tone="standby"
        title="AirPilot"
        meta="grounded · retrieval over Part 91"
        status="standby"
        count={null}
        body={<GhostLines />}
        record={
          <div>
            <RecordHeader lit={false}>source record</RecordHeader>
            <div className="flex items-center gap-4 rounded-xl border border-dashed border-amber-500/25 px-5 py-4">
              <Micro className="text-amber-500/40">01</Micro>
              <div className="flex flex-col gap-1.5">
                <div className="h-2 w-14 rounded-full bg-amber-500/15" />
                <div className="h-3.5 w-32 rounded-full bg-amber-500/20" />
              </div>
            </div>
            <p className="m-0 mt-3 text-[13px] leading-relaxed text-paper-500">
              Real section numbers land here — one per retrieved source, each linking to the FAA's text.
            </p>
          </div>
        }
      />

      <Panel
        tone="bare"
        title="Bare LLM"
        meta="ungrounded · no retrieval"
        status="standby"
        count={null}
        body={<GhostLines />}
        record={
          <div>
            <RecordHeader lit={false}>source record</RecordHeader>
            <div className="relative overflow-hidden rounded-xl border border-dashed border-ink-600 px-5 py-4">
              <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.09]" style={{ backgroundImage: HATCH }} />
              <div className="relative flex items-center gap-3.5">
                <ClosedGlyph className="h-5 w-5 shrink-0 text-paper-700" />
                <Micro className="text-paper-500">will stay empty</Micro>
              </div>
            </div>
            <p className="m-0 mt-3 text-[13px] leading-relaxed text-paper-500">
              Nothing lands here, whatever the question. The model has no sources to give.
            </p>
          </div>
        }
      />
    </Bezel>
  );
}

function LoadingPanels() {
  return (
    <Bezel
      status={
        <>
          <span aria-hidden className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-amber-400 shadow-[0_0_8px_rgba(240,187,108,0.9)]" />
          <Micro className="text-paper-300">running both models</Micro>
        </>
      }
      note={<Elapsed />}
    >
      <Panel
        tone="grounded"
        title="AirPilot"
        meta="grounded · retrieval over Part 91"
        status="retrieving"
        count={null}
        sweep
        body={
          <>
            <Pipeline />
            <div className="mt-6">
              <SkeletonLines tint="amber" />
            </div>
          </>
        }
        record={
          <div>
            <RecordHeader lit>source record · pending</RecordHeader>
            <div className="flex flex-col gap-2">
              {[0, 1].map((i) => (
                <div
                  key={i}
                  className="flex items-center gap-4 rounded-xl border border-amber-500/20 bg-ink-900/40 py-3.5 pr-4 pl-5"
                >
                  <Micro className="tabular-nums text-amber-500/40">{String(i + 1).padStart(2, "0")}</Micro>
                  <div className="flex flex-col gap-1.5">
                    <div className="h-2 w-12 animate-pulse rounded-full bg-amber-500/12" style={{ animationDelay: `${i * 220}ms` }} />
                    <div className="h-4 w-28 animate-pulse rounded-full bg-amber-500/20" style={{ animationDelay: `${i * 220}ms` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        }
      />

      <Panel
        tone="bare"
        title="Bare LLM"
        meta="ungrounded · no retrieval"
        status="generating"
        count={null}
        body={
          <>
            <BlackBox />
            <div className="mt-6">
              <SkeletonLines tint="grey" />
            </div>
          </>
        }
        // The bare model's record is final before its answer even exists:
        // nothing is on the way.
        record={<NoSourceRecord asserted={0} />}
      />
    </Bezel>
  );
}

// A failed instrument, not an error card. Glass panels flag invalid data by
// crossing the whole display out rather than writing a message in the corner,
// and that convention happens to say the one thing a viewer needs here: both
// halves are dark for the same reason, so neither answer is a verdict on
// anything. It fills the comparator rather than sitting inside one half of it —
// with nothing to compare, the seam would be claiming a contrast that isn't
// there — which is why it is built out of the same parts as Panel instead of
// being another of its tones.
function FaultPanels({ fault, onRetry }: { fault: Fault; onRetry: () => void }) {
  const reduceMotion = useReducedMotion();
  const copy = FAULTS[fault.kind];
  const endpoint = API_URL.replace(/^https?:\/\//, "");

  return (
    <Bezel
      seam={false}
      status={
        <>
          {/* Annunciators flash until they are acknowledged. */}
          <motion.span
            aria-hidden
            className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-400 shadow-[0_0_9px_rgba(226,141,118,0.9)]"
            animate={reduceMotion ? undefined : { opacity: [1, 0.2, 1] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
          />
          <Micro className="text-red-400">{copy.status}</Micro>
        </>
      }
      note={<Micro className="truncate text-paper-500">no answers received</Micro>}
    >
      <div
        role="alert"
        className="relative flex min-h-[26rem] flex-col justify-center overflow-hidden px-6 py-10 sm:px-7 lg:col-span-2 lg:row-span-3"
      >
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.06]" style={{ backgroundImage: CROSSHATCH }} />
        {/* Corner to corner across the whole face: the display is X'd out. */}
        <svg
          aria-hidden
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-0 h-full w-full"
        >
          <line x1="0" y1="0" x2="100" y2="100" stroke="var(--color-red-500)" strokeWidth="0.3" strokeOpacity="0.42" />
          <line x1="100" y1="0" x2="0" y2="100" stroke="var(--color-red-500)" strokeWidth="0.3" strokeOpacity="0.42" />
        </svg>

        <LightBar lit tone="red" sweep={!reduceMotion} />

        <div className="relative mx-auto flex max-w-xl flex-col items-center gap-5 text-center">
          {/* Avionics flag a dead reading with boxed text, not a sentence. */}
          <span className="inline-flex items-center gap-2 rounded-[6px] border border-red-500/40 bg-red-500/10 px-3 py-1.5">
            <ClosedGlyph className="h-4 w-4 text-red-400" />
            <Micro className="text-red-400">no data</Micro>
          </span>

          <div className="flex flex-col gap-2">
            <h3 className="m-0 text-xl font-semibold tracking-tight text-paper-100">{copy.headline}</h3>
            <p className="m-0 text-[15px] leading-relaxed text-paper-300">{copy.body}</p>
          </div>

          {/* What actually failed, in the same mono readout the pipeline used. */}
          <div className="flex w-full flex-col gap-2 rounded-xl border border-ink-700 bg-ink-950/60 px-4 py-3 text-left">
            <div className="flex items-baseline gap-2">
              <Micro className="shrink-0 text-paper-500">post</Micro>
              <span className="truncate font-mono text-xs text-paper-300">{endpoint}</span>
            </div>
            <div className="flex items-baseline gap-2">
              <Micro className="shrink-0 text-red-400/80">failed</Micro>
              <span className="font-mono text-xs break-words text-paper-500">{fault.detail}</span>
            </div>
          </div>

          <motion.button
            type="button"
            onClick={onRetry}
            whileHover={reduceMotion ? undefined : { y: -2 }}
            whileTap={{ y: 0, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            className="group inline-flex items-center gap-2 rounded-[10px] border border-ink-600 px-6 py-3 text-sm font-medium text-paper-300 transition-[color,border-color,box-shadow] duration-200 hover:border-amber-500/45 hover:text-paper-100 hover:shadow-[0_12px_26px_-16px_rgba(224,162,60,0.5)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
          >
            Ask again
            <span aria-hidden className="transition-transform duration-300 group-hover:rotate-180">
              ↻
            </span>
          </motion.button>

          <div className="flex w-full items-center gap-3">
            <span aria-hidden className="h-px flex-1 bg-ink-700" />
            <span aria-hidden className="h-[5px] w-16 opacity-60" style={{ backgroundImage: TICKS_H }} />
            <span aria-hidden className="h-px flex-1 bg-ink-700" />
          </div>

          <p className="m-0 text-[13px] leading-relaxed text-paper-500">
            Both sides are empty for the same reason. Nothing here is a judgement on either model — the
            comparison simply never ran.
          </p>
        </div>
      </div>
    </Bezel>
  );
}

// Answer length is itself part of the contrast — a bare model rambling is as
// telling as it going silent — but letting either prose block set the panel's
// height would push the source record for a short answer down to match a
// long one, and defeat the whole point of putting the record above the fold.
// Capped at a fixed height with its own toggle, each panel's footprint stays
// predictable regardless of which side is expanded.
const ANSWER_COLLAPSED_PX = 176;

function AnswerBody({ amber, children }: { amber: boolean; children: React.ReactNode }) {
  const reduceMotion = useReducedMotion();
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setOverflowing(el.scrollHeight > ANSWER_COLLAPSED_PX + 1);
  }, [children]);

  return (
    <div>
      <div
        ref={ref}
        style={{ maxHeight: expanded ? 4000 : ANSWER_COLLAPSED_PX }}
        className={`relative overflow-hidden ${reduceMotion ? "" : "transition-[max-height] duration-500 ease-out"}`}
      >
        {children}
        {!expanded && overflowing && (
          <div
            aria-hidden
            className={`pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-linear-to-t ${
              amber ? "from-ink-850 to-transparent" : "from-ink-950 to-transparent"
            }`}
          />
        )}
      </div>
      {overflowing && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className={`mt-3 inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.2em] transition-colors duration-200 ${
            amber ? "text-amber-400/80 hover:text-amber-400" : "text-paper-500 hover:text-paper-300"
          }`}
        >
          {expanded ? "Show less" : "Read full answer"}
          <span aria-hidden className={`inline-block transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}>
            ↓
          </span>
        </button>
      )}
    </div>
  );
}

function ResultPanels({ result }: { result: AskResponse }) {
  const citations = result.airpilot.citations;
  const cited = result.airpilot.is_answerable && citations.length > 0;
  const bareParts = splitAsserted(result.bare_llm.answer);
  const asserted = bareParts.filter((p) => p.asserted).length;

  const verdict = cited
    ? `Grounded in ${citations.length} Part 91 ${citations.length === 1 ? "section" : "sections"} · bare model cited none`
    : "AirPilot declined for lack of a source · the bare model answered anyway";

  return (
    <Bezel
      status={
        <>
          <Micro className="shrink-0 text-paper-500">query</Micro>
          <span className="truncate text-[13px] text-paper-300">{result.question}</span>
        </>
      }
      note={
        <>
          {cited ? (
            <CheckGlyph className="h-3.5 w-3.5 shrink-0 text-amber-400" />
          ) : (
            <HeldGlyph className="h-3.5 w-3.5 shrink-0 text-amber-400/80" />
          )}
          <span className="text-[13px] text-paper-300">{verdict}</span>
        </>
      }
    >
      {/* The grounded panel arrives first and the bare one follows a beat later:
          the eye is sent to the verified answer before it is shown the other one. */}
      <Panel
        tone={cited ? "grounded" : "held"}
        title="AirPilot"
        meta="grounded · retrieval over Part 91"
        status={cited ? "verified against source text" : "declined · outside the corpus"}
        count={citations.length}
        flash={cited}
        delay={0}
        body={
          <AnswerBody amber>
            <p className="m-0 text-[17px] leading-relaxed font-medium text-paper-100">{result.airpilot.answer}</p>
          </AnswerBody>
        }
        record={cited ? <SourceRecord citations={citations} /> : <HeldRecord />}
      />

      <Panel
        tone="bare"
        title="Bare LLM"
        meta="ungrounded · no retrieval"
        status="unverified"
        count={0}
        delay={0.14}
        body={
          <AnswerBody amber={false}>
            <p className="m-0 text-[15px] leading-relaxed text-paper-300">
              {bareParts.map((part, i) =>
                part.asserted ? (
                  <span
                    key={i}
                    title="Asserted by the model. Not checked against any source."
                    className="border-b border-dashed border-paper-500 pb-px font-medium text-paper-100"
                  >
                    {part.text}
                  </span>
                ) : (
                  <span key={i}>{part.text}</span>
                ),
              )}
            </p>
          </AnswerBody>
        }
        record={<NoSourceRecord asserted={asserted} />}
      />
    </Bezel>
  );
}

function Tool() {
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<AskResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [fault, setFault] = useState<Fault | null>(null);

  const reduceMotion = useReducedMotion();
  const formRef = useRef<HTMLFormElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim()) return;

    setLoading(true);
    setResult(null);
    setFault(null);

    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      // A non-200 used to fall through to json(), which then threw something
      // about syntax rather than reporting the status the service actually sent.
      if (!response.ok) {
        setFault({
          kind: "status",
          detail: `HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}`,
        });
        return;
      }
      const data: AskResponse = await response.json();
      setResult(data);
    } catch (err) {
      console.error("Request failed:", err);
      // A body that isn't JSON throws SyntaxError; anything else at this point
      // means the request never completed.
      setFault({
        kind: err instanceof SyntaxError ? "malformed" : "offline",
        detail: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setLoading(false);
    }
  }

  // Chips fill the field and then fire the form's own submit, so there is only
  // ever one path to the request. The value is committed by the time the next
  // frame dispatches the event.
  function askProbe(probe: string) {
    setQuestion(probe);
    requestAnimationFrame(() => formRef.current?.requestSubmit());
  }

  const state = loading ? "loading" : fault ? "fault" : result ? "result" : "empty";

  return (
    <div className="flex min-h-screen flex-col">
      {/* Home's cockpit footage would fight a page of regulation prose, so the
          background here is the instrument panel it sat on: a faint grid, an
          amber wash at the top, and nothing that moves. */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(var(--color-ink-800) 1px, transparent 1px), linear-gradient(90deg, var(--color-ink-800) 1px, transparent 1px)",
            backgroundSize: "64px 64px",
            maskImage: "radial-gradient(ellipse 85% 55% at 50% 0%, black, transparent)",
            WebkitMaskImage: "radial-gradient(ellipse 85% 55% at 50% 0%, black, transparent)",
            opacity: 0.7,
          }}
        />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_900px_460px_at_50%_-12%,rgba(224,162,60,0.07),transparent_65%)]" />
      </div>

      <div className="sticky top-0 z-20 border-b border-ink-700/70 bg-ink-950/75 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-6 py-3.5">
          <Link
            to="/"
            className="group inline-flex items-center gap-2.5 text-paper-300 transition-colors duration-200 hover:text-paper-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-400"
          >
            <span aria-hidden className="inline-block transition-transform duration-200 group-hover:-translate-x-0.5">
              ←
            </span>
            <span className="text-[15px] font-semibold tracking-tight">AirPilot</span>
          </Link>
          <Micro className="hidden text-paper-500 sm:block">14 CFR part 91 · 261 sections indexed</Micro>
        </div>
      </div>

      <main className="mx-auto w-full max-w-6xl px-6 pt-14 pb-24">
        <motion.div
          initial={reduceMotion ? false : "hidden"}
          animate="visible"
          variants={reduceMotion ? undefined : stack}
          className="mx-auto flex max-w-3xl flex-col items-center gap-5 text-center"
        >
          <motion.h1
            variants={reduceMotion ? undefined : stackItem}
            className="m-0 text-3xl leading-tight font-semibold tracking-tight text-paper-100 sm:text-4xl"
          >
            Ask a real flight question — or steal one below.
            <br className="hidden sm:block" />{" "}
            <span className="text-amber-400">One answer comes with a source. One doesn't.</span>
          </motion.h1>

          <motion.form
            ref={formRef}
            onSubmit={handleSubmit}
            variants={reduceMotion ? undefined : stackItem}
            className="mt-3 w-full"
          >
            <label htmlFor="question" className="sr-only">
              Ask a Part 91 question
            </label>
            {/* An instrument well rather than a text box: the field is sunk into
                the panel, lit amber at the edge when it has focus, and keeps the
                home page's blue ❯ prompt so the two pages share a caret. */}
            <div className="flex flex-col gap-2 rounded-2xl border border-ink-600 bg-ink-900/80 p-2.5 shadow-[inset_0_2px_14px_rgba(0,0,0,0.55)] backdrop-blur-sm transition-[border-color,box-shadow] duration-200 focus-within:border-amber-500/50 focus-within:shadow-[inset_0_2px_14px_rgba(0,0,0,0.55),0_0_0_5px_rgba(224,162,60,0.12)] sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-2.5 pl-3">
                <span aria-hidden className="font-mono text-blue-400">
                  ❯
                </span>
                <input
                  id="question"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="Ask a Part 91 question..."
                  autoComplete="off"
                  className="min-w-0 flex-1 border-0 bg-transparent py-2.5 text-[15px] text-paper-100 outline-none placeholder:text-paper-500"
                />
              </div>
              <motion.button
                type="submit"
                disabled={loading}
                whileHover={reduceMotion || loading ? undefined : { y: -2 }}
                whileTap={loading ? undefined : { y: 0, scale: 0.97 }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-[10px] bg-amber-500 px-7 py-3 text-sm font-semibold tracking-[0.08em] uppercase text-ink-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_10px_20px_-8px_rgba(0,0,0,0.5)] transition-[background-color,box-shadow,opacity] duration-200 hover:bg-amber-400 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_16px_28px_-10px_rgba(224,162,60,0.45),0_0_0_6px_rgba(224,162,60,0.15)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 disabled:cursor-progress disabled:bg-amber-600 disabled:opacity-80"
              >
                {loading ? (
                  <>
                    <Spinner className="h-4 w-4" />
                    Working
                  </>
                ) : (
                  <>
                    Ask
                    <span aria-hidden>→</span>
                  </>
                )}
              </motion.button>
            </div>
          </motion.form>

          <motion.div
            variants={reduceMotion ? undefined : stackItem}
            className={`flex flex-wrap items-center justify-center gap-2 transition-opacity duration-300 ${
              loading ? "pointer-events-none opacity-40" : "opacity-100"
            }`}
          >
            <Micro className="mr-1 text-paper-500">try</Micro>
            {PROBES.map((probe) => (
              <motion.button
                key={probe.label}
                type="button"
                onClick={() => askProbe(probe.question)}
                disabled={loading}
                whileHover={reduceMotion || loading ? undefined : { y: -1 }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
                title={probe.question}
                className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs transition-[color,border-color,background-color] duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400 ${
                  probe.probe
                    ? "border-dashed border-ink-600 text-paper-500 hover:border-ink-500 hover:text-paper-300"
                    : "border-ink-600 text-paper-300 hover:border-amber-500/40 hover:text-paper-100"
                }`}
              >
                {probe.label}
              </motion.button>
            ))}
          </motion.div>
        </motion.div>

        <div className="mt-14" aria-live="polite" aria-busy={loading}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={state}
              initial={reduceMotion ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -8, transition: { duration: 0.18 } }}
              transition={{ duration: 0.55, ease: EASE_OUT }}
            >
              {state === "loading" ? (
                <LoadingPanels />
              ) : state === "fault" && fault ? (
                <FaultPanels fault={fault} onRetry={() => formRef.current?.requestSubmit()} />
              ) : state === "result" && result ? (
                <ResultPanels result={result} />
              ) : (
                <EmptyPanels />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}

export default Tool;
