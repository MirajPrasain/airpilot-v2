import { Link } from "react-router-dom";
import {
  motion,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
  type Variants,
} from "motion/react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import pilotBgVideo from "../assets/pilot_bg.mp4";
import darkPilotBgVideo from "../assets/dark_pilot_bg.mp4";

const STEPS = [
  {
    heading: "Real data",
    text: "Built on the real, complete text of 14 CFR Part 91 (General Operating and Flight Rules) — 261 regulation sections, pulled directly from the FAA's eCFR API.",
  },
  {
    heading: "Smart chunking",
    text: "Regulation text is chunked along its own legal structure and embedded into a MongoDB Atlas vector index for semantic search.",
  },
  {
    heading: "Side-by-side proof",
    text: "Every question is answered two ways side by side: a bare LLM with no grounding, and AirPilot's retrieval-grounded answer with real, verifiable citations.",
  },
  {
    heading: "Rigorous eval",
    text: "Validated against an 18-question hand-verified eval set covering numeric precision, nested regulation structure, cross-section reasoning, and out-of-scope rejection — scoring 17/18, with the one miss documented and understood.",
  },
];

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

// The hero is the first thing on screen, so it is deliberately unhurried: each
// line drifts up out of a blur, well spaced, rather than snapping into place.
const heroContainer: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.42, delayChildren: 0.25 } },
};

const heroItem: Variants = {
  hidden: { opacity: 0, y: 28, filter: "blur(10px)" },
  visible: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 1.5, ease: EASE_OUT },
  },
};

// The wordmark gets its own, longer reveal: it settles in from wide tracking so
// the name reads as assembling itself rather than just fading up. The end value
// matches `tracking-tight`, which motion overrides for the duration.
const heroTitle: Variants = {
  hidden: { opacity: 0, y: 28, filter: "blur(14px)", letterSpacing: "0.12em" },
  visible: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    letterSpacing: "-0.025em",
    transition: { duration: 2, ease: EASE_OUT },
  },
};

// Hero timing in seconds: the terminal frame starts arriving while the headline
// is still settling, then its screen lights up once the frame has landed.
const DEMO_WINDOW_DELAY = 0.6;
const DEMO_SCREEN_DELAY = DEMO_WINDOW_DELAY + 1;

// And only then does the demo start typing, so the first question lands in an
// already-settled terminal instead of racing its own entrance.
const DEMO_START_DELAY_MS = 2300;

const sectionReveal: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: EASE_OUT } },
};

type DemoPhase = "typing" | "reasoning" | "answering" | "hold";

type DemoReasoningStep = { call: string; args: string; result: string };

type DemoExample = {
  question: string;
  reasoning: DemoReasoningStep[];
  answer: string;
  citation: string;
};

// Two real Part 91 lookups, alternated each loop. The retrieval pipeline is
// rendered as a short trace of code so the demo shows the model's reasoning
// as concrete steps rather than a black box.
const DEMO_EXAMPLES: DemoExample[] = [
  {
    question: "Min altitude over a crowded stadium?",
    reasoning: [
      { call: "retrieve", args: '"min altitude, congested area"', result: "14 CFR Part 91" },
      { call: "rank", args: "chunks", result: "§91.119(b) · 0.94" },
      { call: "verify", args: "citation", result: "valid ✓" },
    ],
    answer: "1,000 ft above the highest obstacle within a 2,000 ft radius.",
    citation: "14 CFR § 91.119(b)",
  },
  {
    question: "Fuel reserve required for VFR day flight?",
    reasoning: [
      { call: "retrieve", args: '"VFR fuel reserve requirement"', result: "14 CFR Part 91" },
      { call: "rank", args: "chunks", result: "§91.151(a)(1) · 0.91" },
      { call: "verify", args: "citation", result: "valid ✓" },
    ],
    answer: "Enough to fly to the first point of intended landing, plus 30 minutes at normal cruising speed.",
    citation: "14 CFR § 91.151(a)(1)",
  },
];

// Drives a looping mock Q&A exchange: type the question, reveal a retrieval
// reasoning trace, type the grounded answer, pop in its citation, hold, then
// move to the next example. Timers are tracked so the whole chain tears down
// cleanly on unmount.
function useDemoSequence() {
  const reduceMotion = useReducedMotion();
  const first = DEMO_EXAMPLES[0];
  const [example, setExample] = useState<DemoExample>(first);
  const [phase, setPhase] = useState<DemoPhase>(reduceMotion ? "hold" : "typing");
  const [questionChars, setQuestionChars] = useState(reduceMotion ? first.question.length : 0);
  const [reasoningLines, setReasoningLines] = useState(reduceMotion ? first.reasoning.length : 0);
  const [answerChars, setAnswerChars] = useState(reduceMotion ? first.answer.length : 0);
  const [showCitation, setShowCitation] = useState(reduceMotion);

  useEffect(() => {
    if (reduceMotion) return;

    let cancelled = false;
    let exampleIndex = 0;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const after = (fn: () => void, ms: number) => {
      if (cancelled) return;
      timers.push(setTimeout(fn, ms));
    };

    function run() {
      const current = DEMO_EXAMPLES[exampleIndex];
      setExample(current);
      setPhase("typing");
      setQuestionChars(0);
      setReasoningLines(0);
      setAnswerChars(0);
      setShowCitation(false);
      typeQuestion(current, 0);
    }

    function typeQuestion(current: DemoExample, i: number) {
      const next = i + 1;
      setQuestionChars(next);
      if (next < current.question.length) {
        after(() => typeQuestion(current, next), 18);
      } else {
        after(() => {
          setPhase("reasoning");
          revealReasoning(current, 0);
        }, 200);
      }
    }

    function revealReasoning(current: DemoExample, i: number) {
      const next = i + 1;
      setReasoningLines(next);
      if (next < current.reasoning.length) {
        after(() => revealReasoning(current, next), 220);
      } else {
        after(() => {
          setPhase("answering");
          typeAnswer(current, 0);
        }, 300);
      }
    }

    function typeAnswer(current: DemoExample, i: number) {
      const next = i + 1;
      setAnswerChars(next);
      if (next < current.answer.length) {
        after(() => typeAnswer(current, next), 8);
      } else {
        after(() => setShowCitation(true), 150);
        after(() => {
          setPhase("hold");
          after(() => {
            exampleIndex = (exampleIndex + 1) % DEMO_EXAMPLES.length;
            run();
          }, 1800);
        }, 550);
      }
    }

    after(run, DEMO_START_DELAY_MS);
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [reduceMotion]);

  return {
    phase,
    questionText: example.question.slice(0, questionChars),
    reasoning: example.reasoning,
    reasoningLines,
    answerText: example.answer.slice(0, answerChars),
    citation: example.citation,
    showCitation,
  };
}

// A mock "AirPilot" app window that loops through asking a question,
// revealing the retrieval reasoning as code, and getting a grounded, cited
// answer back — a concrete stand-in for a real product demo clip. The
// reasoning trace is kept deliberately small next to the answer, since the
// answer is the point and the trace is just supporting evidence.
function DemoWindow() {
  const reduceMotion = useReducedMotion();
  const { phase, questionText, reasoning, reasoningLines, answerText, citation, showCitation } = useDemoSequence();
  const showReasoning = phase === "reasoning" || phase === "answering" || phase === "hold";
  const showAnswer = phase === "answering" || phase === "hold";

  return (
    <div className="w-110 overflow-hidden rounded-2xl border border-ink-600 bg-ink-900/90 sm:w-130">
      <div className="flex items-center gap-2.5 border-b border-ink-700 bg-ink-850/80 px-5 py-3.5">
        {["bg-red-500/70", "bg-amber-500/70", "bg-green-500/70"].map((tone, i) => (
          <motion.span
            key={tone}
            initial={reduceMotion ? false : { opacity: 0, scale: 0.4 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{
              type: "spring",
              stiffness: 380,
              damping: 20,
              delay: DEMO_WINDOW_DELAY + 0.55 + i * 0.12,
            }}
            className={`h-3 w-3 rounded-full ${tone}`}
          />
        ))}
        <motion.span
          initial={reduceMotion ? false : { opacity: 0, x: -6 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7, ease: EASE_OUT, delay: DEMO_WINDOW_DELAY + 0.9 }}
          className="ml-2 text-sm font-medium tracking-wide text-paper-500"
        >
          AirPilot
        </motion.span>
      </div>
      {/* The screen comes up after the frame has landed, like a display
          switching on, before anything starts typing into it. */}
      <motion.div
        initial={reduceMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1, ease: EASE_OUT, delay: DEMO_SCREEN_DELAY }}
        className="flex min-h-60 flex-col gap-3 px-5 py-5 font-mono"
      >
        <p className="m-0 text-[15px] leading-relaxed text-paper-100">
          <span className="text-blue-400">❯ </span>
          {questionText}
          {phase === "typing" && <span className="animate-pulse text-blue-400">▍</span>}
        </p>

        {showReasoning && (
          <div className="flex flex-col gap-0.5 border-l-2 border-ink-700 pl-2.5">
            {reasoning.slice(0, reasoningLines).map((line) => (
              <motion.p
                key={line.call}
                initial={{ opacity: 0, y: 3 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.15 }}
                className="m-0 text-[10px] leading-snug text-paper-500/80"
              >
                <span className="text-blue-400/80">{line.call}</span>
                <span>(</span>
                <span className="text-amber-400/70">{line.args}</span>
                <span>) → </span>
                <span className="text-green-400/80">{line.result}</span>
              </motion.p>
            ))}
          </div>
        )}

        {showAnswer && (
          <div className="flex flex-col items-start gap-2.5">
            <p className="m-0 text-[17px] leading-relaxed font-medium text-paper-100">{answerText}</p>
            {showCitation && (
              <motion.span
                initial={{ opacity: 0, y: 4, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: "spring", stiffness: 400, damping: 22 }}
                className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-semibold text-amber-400"
              >
                {citation}
              </motion.span>
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
}

function TickRule() {
  return (
    <div aria-hidden className="relative mx-6">
      <div className="mx-auto h-px max-w-6xl bg-ink-600" />
      <div
        className="mx-auto -mt-[5px] h-[5px] max-w-6xl opacity-70"
        style={{
          backgroundImage:
            "repeating-linear-gradient(to right, var(--color-ink-500) 0, var(--color-ink-500) 1px, transparent 1px, transparent 12px)",
        }}
      />
    </div>
  );
}

type FlightNode = { x: number; y: number };
// `revealed` is a high-water mark so text never disappears out from under
// someone scrolling back to re-read; `current` tracks the plane in both
// directions, so exactly one step is ever lit.
type Legs = { revealed: number; current: number; landed: boolean; holding: boolean };

// Both measured as a fraction of the leg flying into a node. The text starts
// late in the approach so it is still settling as the plane reaches the dot,
// and the highlight lands essentially on it.
const REVEAL_LEAD = 0.18;
const ARRIVE_LEAD = 0.04;

// A card's words build in one by one over a much longer stretch of the approach
// than REVEAL_LEAD covers, so the copy visibly writes itself as the plane flies
// the leg instead of snapping in over a few scroll pixels. The last word lands
// on the same ARRIVE_LEAD point that lights the node.
const TEXT_LEAD = 0.95;

// Share of a card's own reveal window spent on the heading before body words
// start, and how far each word's fade stretches past an even slice of the rest
// — the overlap is what makes it a cascade rather than a strobe.
const HEADING_SHARE = 0.22;
const WORD_OVERLAP = 2.4;

type FlightGeometry = {
  width: number;
  height: number;
  d: string;
  nodes: FlightNode[];
  // Where the route runs straight up and down: the vertical both runways are
  // laid along.
  spine: number;
  runwayWidth: number;
};

const EMPTY_GEOMETRY: FlightGeometry = {
  width: 0,
  height: 0,
  d: "",
  nodes: [],
  spine: 0,
  runwayWidth: 0,
};

// The route overruns the card list at both ends. The top pad is deep enough to
// carry the departure runway up out of the section and into the foot of the
// hero, so the first screen shows the plane already sitting on the strip: one
// unbroken runway doing the scrolling hint, not a cue plus a second runway.
const ROUTE_PAD_TOP = 280;
const ROUTE_PAD_BOTTOM = 115;
// Both ends are cut to the same length, so departure and arrival read as the
// same piece of infrastructure.
const RUNWAY_LEN = 150;
// Where the plane sits before the first scroll: clear of the threshold bars.
const RUNWAY_HOLD = 28;

// A runway laid along the vertical run-in of the route: asphalt, threshold
// "piano keys" at the end the plane crosses, a dashed centreline the flight
// path paints over, and edge lights that come up amber once the leg is flown.
// `entry` is the end the plane meets first and `exit` the end it leaves from,
// so the same glyph serves as departure strip at the top of the route and
// landing strip at the bottom.
function Runway({
  x,
  entry,
  exit,
  width,
  lit,
  touchdown = false,
  cue = false,
}: {
  x: number;
  entry: number;
  exit: number;
  width: number;
  lit: boolean;
  touchdown?: boolean;
  // Marches the centreline and runs the edge lights entry-to-exit, turning a
  // static runway into a direction to travel in.
  cue?: boolean;
}) {
  const length = Math.abs(exit - entry);
  if (width <= 0 || length <= 0) return null;

  const half = width / 2;
  const dir = exit > entry ? 1 : -1;
  const keyLength = Math.min(15, length * 0.2);
  const keyPitch = width / 7;
  const mark = lit ? "var(--color-amber-400)" : "var(--color-ink-500)";

  return (
    <g>
      <rect
        x={x - half}
        y={Math.min(entry, exit)}
        width={width}
        height={length}
        rx={4}
        fill="var(--color-ink-900)"
        fillOpacity={0.7}
        stroke={lit ? "var(--color-amber-500)" : "var(--color-ink-600)"}
        strokeOpacity={lit ? 0.55 : 1}
        strokeWidth={1}
        className="transition-[stroke,stroke-opacity] duration-700"
      />

      {[-2.5, -1.5, -0.5, 0.5, 1.5, 2.5].map((offset) => (
        <rect
          key={offset}
          x={x + offset * keyPitch - keyPitch * 0.3}
          y={dir > 0 ? entry + 3.5 : entry - 3.5 - keyLength}
          width={keyPitch * 0.6}
          height={keyLength}
          rx={0.6}
          fill={mark}
          opacity={lit ? 0.9 : 0.5}
          className="transition-[fill,opacity] duration-700"
        />
      ))}

      <motion.line
        x1={x}
        y1={entry + dir * (keyLength + 10)}
        x2={x}
        y2={exit - dir * 5}
        stroke={mark}
        strokeOpacity={lit ? 0.7 : 0.5}
        strokeWidth={1.25}
        strokeDasharray="7 8"
        strokeLinecap="round"
        animate={cue ? { strokeDashoffset: [0, -15] } : { strokeDashoffset: 0 }}
        transition={cue ? { duration: 1.15, repeat: Infinity, ease: "linear" } : { duration: 0 }}
        className="transition-[stroke,stroke-opacity] duration-700"
      />

      {[0.2, 0.44, 0.68, 0.92].flatMap((along, row) =>
        [x - half, x + half].map((cx) => (
          <motion.circle
            key={`${along}-${cx}`}
            cx={cx}
            cy={entry + dir * length * along}
            r={lit ? 1.9 : 1.3}
            fill={lit ? "var(--color-amber-400)" : "var(--color-ink-500)"}
            animate={cue ? { opacity: [0.25, 1, 0.25] } : { opacity: 1 }}
            transition={
              cue
                ? { duration: 1.5, repeat: Infinity, delay: row * 0.17, ease: "easeInOut" }
                : { duration: 0.3 }
            }
            className={`transition-all duration-700 ${
              lit ? "drop-shadow-[0_0_5px_rgba(240,187,108,0.85)]" : ""
            }`}
          />
        )),
      )}

      {touchdown && (
        <motion.circle
          cx={x}
          cy={entry + dir * (keyLength + 10)}
          r={6}
          fill="none"
          stroke="var(--color-amber-400)"
          strokeWidth={1}
          initial={{ r: 6, opacity: 0.7 }}
          animate={{ r: [6, 26], opacity: [0.7, 0] }}
          transition={{ duration: 1.6, repeat: 2, ease: "easeOut" }}
        />
      )}
    </g>
  );
}

// Top-down airliner drawn nose-first along +x, so it can be rotated straight
// to the tangent of the route without any origin correction.
function PlaneGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-full w-full">
      <path d="M23 12c0 .58-.47 1.04-1.05 1.06l-6.4.35-4.3 6.82a.9.9 0 0 1-.77.43H9.1a.6.6 0 0 1-.58-.77l1.93-6.35-4.3.23-1.6 2.03a.6.6 0 0 1-.47.22H2.3a.5.5 0 0 1-.48-.64L2.93 12 1.82 8.62a.5.5 0 0 1 .48-.64h1.78c.18 0 .36.08.47.22l1.6 2.03 4.3.23L8.52 4.11a.6.6 0 0 1 .58-.78h1.38c.31 0 .6.17.77.44l4.3 6.82 6.4.35c.58.02 1.05.48 1.05 1.06Z" />
    </svg>
  );
}

// One word of a card's body copy, faded and lifted in across its own slice of
// the card's progress. It's its own component so each word gets a transform
// instance without calling a hook inside a loop.
function RevealWord({
  text,
  progress,
  start,
  end,
}: {
  text: string;
  progress: MotionValue<number>;
  start: number;
  end: number;
}) {
  const opacity = useTransform(progress, [start, end], [0, 1], { clamp: true });
  const y = useTransform(progress, [start, end], [8, 0], { clamp: true });
  return (
    <motion.span style={{ opacity, y }} className="inline-block">
      {text}
    </motion.span>
  );
}

function StepCard({
  step,
  index,
  side,
  current,
  flight,
  textStart,
  textEnd,
}: {
  step: (typeof STEPS)[number];
  index: number;
  side: "left" | "right";
  current: boolean;
  flight: MotionValue<number>;
  textStart: number;
  textEnd: number;
}) {
  // 0-1 across just this card's stretch of the route, so the copy is a pure
  // function of where the plane is rather than a fixed-duration animation that
  // can fire several cards at once when the scroll jumps.
  const progress = useTransform(flight, [textStart, textEnd], [0, 1], { clamp: true });
  const cardOpacity = useTransform(progress, [0, 0.08], [0, 1], { clamp: true });
  const cardY = useTransform(progress, [0, 0.5], [18, 0], { clamp: true });
  const headOpacity = useTransform(progress, [0, HEADING_SHARE], [0, 1], { clamp: true });
  const headY = useTransform(progress, [0, HEADING_SHARE], [10, 0], { clamp: true });

  const words = step.text.split(" ");
  const slice = (1 - HEADING_SHARE) / words.length;

  return (
    <motion.div
      style={{ opacity: cardOpacity, y: cardY }}
      className={`relative max-w-md rounded-2xl border p-6 backdrop-blur-[3px] transition-[border-color,background-color,box-shadow] duration-500 sm:p-7 ${
        current
          ? "border-amber-500/45 bg-ink-850/85 shadow-[0_30px_60px_-40px_rgba(224,162,60,0.6)]"
          : "border-ink-700 bg-ink-900/65"
      } ${side === "left" ? "lg:ml-auto lg:text-right" : ""}`}
    >
      <motion.div
        style={{ opacity: headOpacity, y: headY }}
        className={`flex items-baseline gap-3 ${side === "left" ? "lg:justify-end" : ""}`}
      >
        <span
          aria-hidden
          className={`font-mono text-sm tabular-nums transition-colors duration-500 ${
            current ? "text-amber-400" : "text-ink-400"
          }`}
        >
          {String(index + 1).padStart(2, "0")}
        </span>
        <h3 className="m-0 text-base font-semibold text-paper-100">{step.heading}</h3>
      </motion.div>
      <p
        className={`m-0 mt-2.5 flex flex-wrap gap-x-1.5 text-[15px] leading-relaxed text-paper-300 ${
          side === "left" ? "lg:justify-end" : ""
        }`}
      >
        {words.map((word, i) => {
          const start = HEADING_SHARE + i * slice;
          return (
            <RevealWord
              key={i}
              text={word}
              progress={progress}
              start={start}
              end={Math.min(1, start + slice * WORD_OVERLAP)}
            />
          );
        })}
      </p>
    </motion.div>
  );
}

// The four steps as legs of a single flight: cards alternate down the page and
// a dashed route threads between them, drawn in by scroll with a small plane
// riding the head of the line. Node positions are measured from the real card
// boxes rather than assumed, so the route stays glued to the layout at any
// width and after any text reflow.
function HowItWorks() {
  const reduceMotion = useReducedMotion();
  const listRef = useRef<HTMLOListElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const legEls = useRef<(HTMLLIElement | null)[]>([]);
  const nodeStops = useRef<number[]>([]);
  const revealStops = useRef<number[]>([]);
  const arriveStops = useRef<number[]>([]);
  const [geometry, setGeometry] = useState<FlightGeometry>(EMPTY_GEOMETRY);
  // Each card's [start, end] slice of the route, in state rather than a ref:
  // the cards interpolate against these, so they have to re-render once the
  // real measurements land.
  const [textWindows, setTextWindows] = useState<[number, number][]>([]);
  const [legs, setLegs] = useState<Legs>(
    reduceMotion
      ? { revealed: STEPS.length, current: STEPS.length - 1, landed: true, holding: false }
      : { revealed: 0, current: -1, landed: false, holding: true },
  );

  const { scrollYProgress } = useScroll({ target: listRef, offset: ["start end", "end 0.95"] });
  const flight = useSpring(scrollYProgress, { stiffness: 110, damping: 26, mass: 0.35 });
  // Under reduced motion the cards are already fully revealed, so their words
  // read off a value pinned at 1 instead of the live flight.
  const pinned = useMotionValue(1);
  const cardFlight = reduceMotion ? pinned : flight;

  const planeX = useMotionValue(0);
  const planeY = useMotionValue(0);
  const planeAngle = useMotionValue(90);
  const planeOpacity = useMotionValue(0);

  // Both the plane's position and its heading come from the path itself, so it
  // always sits on the curve and banks through each turn.
  const flyTo = useCallback(
    (progress: number) => {
      const path = pathRef.current;
      const total = path?.getTotalLength() ?? 0;
      if (!path || !total) return;
      const t = Math.min(Math.max(progress, 0), 1);
      const at = t * total;
      const point = path.getPointAtLength(at);
      const behind = path.getPointAtLength(Math.max(0, at - 2));
      const ahead = path.getPointAtLength(Math.min(total, at + 2));
      planeX.set(point.x);
      planeY.set(point.y);
      planeAngle.set((Math.atan2(ahead.y - behind.y, ahead.x - behind.x) * 180) / Math.PI);
      // Parked on the departure runway before the first scroll rather than
      // hidden: this plane is the scroll cue.
      planeOpacity.set(1);

      const arriving = revealStops.current.filter((stop) => t >= stop).length;
      let current = -1;
      for (let i = 0; i < arriveStops.current.length; i++) {
        if (t >= arriveStops.current[i]) current = i;
      }
      // The last stop is the arrival threshold, so "landed" is the roll-out
      // after it rather than the very last pixel of the route.
      const landed = t >= 0.985;
      const holding = t <= 0.004;
      setLegs((prev) => {
        const revealed = Math.max(prev.revealed, arriving);
        return prev.revealed === revealed &&
          prev.current === current &&
          prev.landed === landed &&
          prev.holding === holding
          ? prev
          : { revealed, current, landed, holding };
      });
    },
    [planeAngle, planeOpacity, planeX, planeY],
  );

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;

    const measure = () => {
      const rect = list.getBoundingClientRect();
      const { width } = rect;
      // The drawn box overhangs the list at both ends.
      const height = rect.height + ROUTE_PAD_TOP + ROUTE_PAD_BOTTOM;
      if (!width || !rect.height) return;

      // Matches the `lg:` two-column switch below: centred spine when the cards
      // straddle the middle, left-hand margin rail when they stack.
      const wide = window.matchMedia("(min-width: 1024px)").matches;
      const spine = wide ? width / 2 : 20;
      const sway = wide ? 38 : 10;

      const nodes = STEPS.map((_, i) => {
        const legRect = legEls.current[i]?.getBoundingClientRect();
        const y = legRect
          ? legRect.top - rect.top + legRect.height / 2 + ROUTE_PAD_TOP
          : (height * (i + 0.5)) / STEPS.length;
        return { x: spine + (i % 2 === 0 ? -sway : sway), y };
      });

      // Straight down the centreline for the length of each runway before the
      // route is allowed to bend, so the plane makes a real take-off roll and a
      // real roll-out instead of curving off the asphalt. It starts parked past
      // the threshold bars rather than on top of them.
      const points = [
        { x: spine, y: RUNWAY_HOLD },
        { x: spine, y: RUNWAY_LEN },
        ...nodes,
        { x: spine, y: height - RUNWAY_LEN },
        { x: spine, y: height },
      ];
      let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
      for (let i = 1; i < points.length; i++) {
        const from = points[i - 1];
        const to = points[i];
        const pull = (to.y - from.y) * 0.5;
        d +=
          ` C ${from.x.toFixed(1)} ${(from.y + pull).toFixed(1)},` +
          ` ${to.x.toFixed(1)} ${(to.y - pull).toFixed(1)},` +
          ` ${to.x.toFixed(1)} ${to.y.toFixed(1)}`;
      }

      const runwayWidth = wide ? 38 : 22;

      setGeometry((prev) =>
        prev.d === d && prev.width === width && prev.height === height
          ? prev
          : { width, height, d, nodes, spine, runwayWidth },
      );
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    legEls.current.forEach((leg) => leg && observer.observe(leg));
    return () => observer.disconnect();
  }, []);

  // Once the new `d` is on the element, walk it once to find how far along the
  // route each card sits — the plane lights a card up as it passes it.
  useEffect(() => {
    const path = pathRef.current;
    if (!path || !geometry.d) return;
    const total = path.getTotalLength();
    if (!total) return;

    const samples = 240;
    let cursor = 0;
    nodeStops.current = geometry.nodes.map((node) => {
      while (cursor < samples && path.getPointAtLength(((cursor + 1) / samples) * total).y < node.y) {
        cursor++;
      }
      return cursor / samples;
    });

    const windows: [number, number][] = nodeStops.current.map((stop, i) => {
      const leg = stop - (nodeStops.current[i - 1] ?? 0);
      revealStops.current[i] = stop - leg * REVEAL_LEAD;
      arriveStops.current[i] = stop - leg * ARRIVE_LEAD;
      return [stop - leg * TEXT_LEAD, arriveStops.current[i]];
    });
    setTextWindows((prev) =>
      prev.length === windows.length && prev.every((w, i) => w[0] === windows[i][0] && w[1] === windows[i][1])
        ? prev
        : windows,
    );

    flyTo(reduceMotion ? 1 : flight.get());
  }, [flight, flyTo, geometry, reduceMotion]);

  useMotionValueEvent(flight, "change", (value) => {
    if (!reduceMotion) flyTo(value);
  });

  return (
    <section className="mx-auto w-full max-w-6xl px-6 pt-24 pb-40">
      <h2 className="sr-only">How it works</h2>

      <ol ref={listRef} className="relative m-0 flex list-none flex-col gap-16 p-0 lg:gap-28">
        <svg
          aria-hidden
          className="pointer-events-none absolute inset-x-0 w-full"
          style={{ top: -ROUTE_PAD_TOP, height: geometry.height || undefined }}
          viewBox={`0 0 ${geometry.width || 1} ${geometry.height || 1}`}
        >
          <Runway
            x={geometry.spine}
            entry={0}
            exit={RUNWAY_LEN}
            width={geometry.runwayWidth}
            lit
            cue={legs.holding && !reduceMotion}
          />
          <Runway
            x={geometry.spine}
            entry={geometry.height - RUNWAY_LEN}
            exit={geometry.height}
            width={geometry.runwayWidth}
            lit={legs.landed}
            touchdown={legs.landed && !reduceMotion}
          />

          <path
            d={geometry.d}
            fill="none"
            stroke="var(--color-ink-600)"
            strokeWidth={1.5}
            strokeDasharray="5 8"
            strokeLinecap="round"
          />
          <motion.path
            ref={pathRef}
            d={geometry.d}
            fill="none"
            stroke="var(--color-amber-500)"
            strokeWidth={1.75}
            strokeLinecap="round"
            style={{ pathLength: reduceMotion ? 1 : flight }}
          />
          {geometry.nodes.map((node, i) => (
            <g key={STEPS[i].heading} className="transition-all duration-500">
              {i === legs.current && !reduceMotion && (
                <motion.circle
                  cx={node.x}
                  cy={node.y}
                  r={9}
                  fill="none"
                  stroke="var(--color-amber-400)"
                  strokeWidth={1}
                  initial={{ r: 9, opacity: 0.5 }}
                  animate={{ r: [9, 17], opacity: [0.5, 0] }}
                  transition={{ duration: 2.2, repeat: Infinity, ease: "easeOut" }}
                />
              )}
              <circle
                cx={node.x}
                cy={node.y}
                r={11}
                fill="var(--color-ink-950)"
                fillOpacity={0.92}
                stroke="var(--color-ink-600)"
                strokeWidth={1}
              />
              <circle
                cx={node.x}
                cy={node.y}
                r={i <= legs.current ? 9 : 0}
                fill="var(--color-amber-400)"
                opacity={0.2}
                className="transition-all duration-500"
              />
              <circle
                cx={node.x}
                cy={node.y}
                r={i <= legs.current ? 4.5 : 3}
                fill={i <= legs.current ? "var(--color-amber-400)" : "var(--color-ink-500)"}
                className={`transition-all duration-500 ${
                  i <= legs.current ? "drop-shadow-[0_0_6px_rgba(240,187,108,0.9)]" : ""
                }`}
              />
            </g>
          ))}
        </svg>

        {!reduceMotion && (
          <motion.div
            aria-hidden
            style={{
              x: planeX,
              y: planeY,
              rotate: planeAngle,
              opacity: planeOpacity,
              top: -ROUTE_PAD_TOP,
            }}
            className="pointer-events-none absolute left-0 -ml-[13px] -mt-[13px] h-[26px] w-[26px] text-amber-400 drop-shadow-[0_0_10px_rgba(224,162,60,0.7)]"
          >
            {/* Local +x is the nose, so holding short creeps it forward. */}
            <motion.div
              animate={legs.holding && !reduceMotion ? { x: [0, 5, 0] } : { x: 0 }}
              transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
              className="h-full w-full"
            >
              <PlaneGlyph />
            </motion.div>
          </motion.div>
        )}

        {STEPS.map((step, index) => {
          const side = index % 2 === 0 ? "left" : "right";
          return (
            <li
              key={step.heading}
              ref={(el) => {
                legEls.current[index] = el;
              }}
              className="relative grid grid-cols-1 pl-12 sm:pl-14 lg:grid-cols-2 lg:gap-x-28 lg:pl-0"
            >
              <div className={side === "left" ? "lg:col-start-1" : "lg:col-start-2"}>
                <StepCard
                  step={step}
                  index={index}
                  side={side}
                  current={index === legs.current}
                  flight={cardFlight}
                  textStart={textWindows[index]?.[0] ?? 1}
                  textEnd={textWindows[index]?.[1] ?? 1.0001}
                />
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

// How long before a clip's natural end to start blending into a second copy
// of itself, so the loop point is masked by a crossfade instead of a jump cut.
const LOOP_CROSSFADE_S = 0.8;

// Renders two stacked copies of the same clip and crossfades between them
// right at the loop boundary, so a background video can run indefinitely
// without ever showing its restart.
function SeamlessLoopVideo({ src, className }: { src: string; className?: string }) {
  const primaryRef = useRef<HTMLVideoElement>(null);
  const secondaryRef = useRef<HTMLVideoElement>(null);
  const primaryOpacity = useMotionValue(1);
  const secondaryOpacity = useMotionValue(0);
  const activeRef = useRef<"primary" | "secondary">("primary");

  useEffect(() => {
    let raf = 0;

    const tick = () => {
      const activeIsPrimary = activeRef.current === "primary";
      const active = activeIsPrimary ? primaryRef.current : secondaryRef.current;
      const idle = activeIsPrimary ? secondaryRef.current : primaryRef.current;
      const activeOpacity = activeIsPrimary ? primaryOpacity : secondaryOpacity;
      const idleOpacity = activeIsPrimary ? secondaryOpacity : primaryOpacity;

      if (active && idle && active.duration && !Number.isNaN(active.duration)) {
        const remaining = active.duration - active.currentTime;

        if (remaining <= LOOP_CROSSFADE_S) {
          if (idle.paused) {
            idle.currentTime = 0;
            idle.play().catch(() => {});
          }
          const t = Math.min(1, Math.max(0, 1 - remaining / LOOP_CROSSFADE_S));
          activeOpacity.set(1 - t);
          idleOpacity.set(t);

          if (remaining <= 0.05) {
            active.pause();
            activeOpacity.set(0);
            idleOpacity.set(1);
            activeRef.current = activeIsPrimary ? "secondary" : "primary";
          }
        }
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [primaryOpacity, secondaryOpacity]);

  return (
    <div className={className}>
      <motion.video
        ref={primaryRef}
        autoPlay
        muted
        playsInline
        preload="auto"
        style={{ opacity: primaryOpacity }}
        className="absolute inset-0 h-full w-full object-cover"
      >
        <source src={src} type="video/mp4" />
      </motion.video>
      <motion.video
        ref={secondaryRef}
        muted
        playsInline
        preload="auto"
        style={{ opacity: secondaryOpacity }}
        className="absolute inset-0 h-full w-full object-cover"
      >
        <source src={src} type="video/mp4" />
      </motion.video>
    </div>
  );
}

function Home() {
  const reduceMotion = useReducedMotion();
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const springX = useSpring(mouseX, { stiffness: 150, damping: 20, mass: 0.5 });
  const springY = useSpring(mouseY, { stiffness: 150, damping: 20, mass: 0.5 });

  const textX = useTransform(springX, (v) => v * 10);
  const textY = useTransform(springY, (v) => v * 6);

  // The dark cockpit clip crossfades in over the hero video as "How it works"
  // scrolls into view, so the background finishes its transition by the time
  // the section reaches the top of the screen.
  const howItWorksRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress: bgProgress } = useScroll({
    target: howItWorksRef,
    offset: ["start end", "start start"],
  });
  const darkBgOpacity = useSpring(bgProgress, { stiffness: 90, damping: 24, mass: 0.4 });

  function handlePointerMove(e: ReactPointerEvent<HTMLElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    mouseX.set((e.clientX - rect.left) / rect.width - 0.5);
    mouseY.set((e.clientY - rect.top) / rect.height - 0.5);
  }

  function handlePointerLeave() {
    mouseX.set(0);
    mouseY.set(0);
  }

  return (
    <div className="flex min-h-screen flex-col">
      <SeamlessLoopVideo src={pilotBgVideo} className="fixed inset-0 -z-20 h-full w-full" />
      <motion.div
        style={{ opacity: darkBgOpacity, filter: "brightness(0.45)" }}
        className="fixed inset-0 -z-20 h-full w-full"
      >
        <SeamlessLoopVideo src={darkPilotBgVideo} className="absolute inset-0 h-full w-full" />
      </motion.div>
      <div className="fixed inset-0 -z-10 bg-linear-to-b from-ink-950/50 via-ink-950/75 to-ink-950" />

      <header
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        className="relative z-10 mx-auto flex min-h-screen w-full max-w-6xl flex-col justify-center gap-14 px-6 pb-20 pt-28 lg:flex-row lg:items-center lg:gap-10 lg:pt-32"
      >
        <motion.div
          initial={reduceMotion ? false : "hidden"}
          animate="visible"
          variants={reduceMotion ? undefined : heroContainer}
          style={{ x: textX, y: textY }}
          className="flex flex-1 flex-col items-start gap-7 text-left"
        >
          <motion.h1
            variants={reduceMotion ? undefined : heroTitle}
            className="text-6xl font-semibold tracking-tight text-paper-100 sm:text-7xl lg:text-8xl"
          >
            AirPilot
          </motion.h1>
          <motion.p
            variants={reduceMotion ? undefined : heroItem}
            className="max-w-md text-lg leading-relaxed text-paper-300"
          >
            Bare LLMs will confidently hallucinate a regulation citation.
            AirPilot won't — because it only answers from real, retrievable
            FAA text.
          </motion.p>
          <motion.div variants={reduceMotion ? undefined : heroItem} className="mt-3 inline-flex">
            <Link to="/try" className="inline-flex">
              <motion.button
                whileHover={{ y: -2 }}
                whileTap={{ y: 0, scale: 0.97 }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
                className="group inline-flex items-center gap-2 rounded-[10px] bg-amber-500 px-8 py-4 text-sm font-semibold uppercase tracking-[0.08em] text-ink-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_10px_20px_-8px_rgba(0,0,0,0.5)] transition-shadow duration-200 hover:bg-amber-400 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_16px_28px_-10px_rgba(224,162,60,0.45),0_0_0_6px_rgba(224,162,60,0.15)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
              >
                Try it
                <span aria-hidden className="transition-transform duration-200 group-hover:translate-x-0.5">
                  →
                </span>
              </motion.button>
            </Link>
          </motion.div>
        </motion.div>

        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 36, scale: 0.93, filter: "blur(16px)" }}
          animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
          transition={{ duration: 1.7, ease: EASE_OUT, delay: DEMO_WINDOW_DELAY }}
          className="hidden flex-1 items-center justify-end lg:flex"
        >
          <div className="relative drop-shadow-[0_30px_50px_rgba(0,0,0,0.55)]">
            <DemoWindow />
          </div>
        </motion.div>
      </header>

      <div ref={howItWorksRef}>
        <HowItWorks />
      </div>

      <TickRule />

      <section className="mx-auto w-full max-w-6xl px-6 py-14">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.4 }}
          variants={sectionReveal}
          className="flex flex-col items-center gap-5 sm:flex-row sm:justify-between"
        >
          <h2 className="text-lg font-semibold text-paper-300">Learn more</h2>
          <ul className="m-0 flex list-none gap-4 p-0">
            <li>
              <motion.a
                href="https://github.com/YOUR_USERNAME/airpilot-v2"
                target="_blank"
                rel="noopener noreferrer"
                whileHover={{ y: -2 }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
                className="inline-flex items-center gap-2 rounded-[8px] border border-ink-600 px-5 py-2.5 text-sm font-medium text-paper-300 transition-[color,border-color,box-shadow] duration-200 hover:border-ink-500 hover:text-paper-100 hover:shadow-[0_10px_24px_-14px_rgba(0,0,0,0.6)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400"
              >
                View source on GitHub
              </motion.a>
            </li>
          </ul>
        </motion.div>
      </section>
    </div>
  );
}

export default Home;
