import {
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from "react";

/* ------------------------------------------------------------------
 * CONFIGURACIÓN GLOBAL — todo ajustable sin tocar lógica
 * ------------------------------------------------------------------ */
const CONFIG = {
  SALDO_INICIAL: 30000,
  APUESTA_MINIMA: 250,
  FICHAS: [250, 500, 1000, 5000],
  RECARGA: 10000,
  TIEMPO_APUESTAS: 15,
  TIEMPO_NO_VA_MAS: 2,
  TIEMPO_GIRO: 6,
  TIEMPO_PAGO: 4,
  USAR_CRYPTO: false,
  VOZ_ACTIVA: true,
  AUDIO_ACTIVO: true,
} as const;

/* ------------------------------------------------------------------
 * CONSTANTES Y TIPOS
 * ------------------------------------------------------------------ */
type Phase = "BETTING" | "NO_MORE_BETS" | "SPINNING" | "PAYOUT";

type Bet = {
  id: string;
  numbers: number[];
  payout: number;
  amount: number;
};

type State = {
  phase: Phase;
  saldo: number;
  bets: Bet[];
  totalBet: number;
  winner: number | null;
  timeLeft: number;
  lastWin: number;
  lastNet: number;
  history: number[];
  selectedChip: number;
  paused: boolean;
  message: string;
};

type Action =
  | { type: "PLACE_BET"; id: string; amount: number }
  | { type: "CLEAR_BETS" }
  | { type: "SELECT_CHIP"; chip: number }
  | { type: "RECHARGE"; amount: number }
  | { type: "TOGGLE_PAUSE" }
  | { type: "TICK" }
  | { type: "SET_PHASE"; phase: Phase; timeLeft?: number }
  | { type: "SET_WINNER"; winner: number }
  | { type: "RESOLVE_AND_PAY" }
  | { type: "NEW_ROUND" }
  | { type: "SPIN_NOW" };

const WHEEL = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24,
  16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
] as const;

const RED = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
]);

const colorOf = (n: number): "red" | "black" | "green" => {
  if (n === 0) return "green";
  return RED.has(n) ? "red" : "black";
};

/* ------------------------------------------------------------------
 * RNG
 * ------------------------------------------------------------------ */
function spinMath(): number {
  return Math.floor(Math.random() * 37);
}

function spinSecure(): number {
  const max = Math.floor(256 / 37) * 37;
  const buf = new Uint8Array(1);
  let v: number;
  do {
    window.crypto.getRandomValues(buf);
    v = buf[0];
  } while (v >= max);
  return v % 37;
}

const drawWinner = (): number =>
  CONFIG.USAR_CRYPTO ? spinSecure() : spinMath();

/* ------------------------------------------------------------------
 * DEFINICIONES DE APUESTAS
 * ------------------------------------------------------------------ */
function betDef(id: string): { numbers: number[]; payout: number } {
  if (id.startsWith("straight-")) {
    const n = parseInt(id.split("-")[1], 10);
    return { numbers: [n], payout: 35 };
  }

  if (id.startsWith("split-")) {
    const [, a, b] = id.split("-").map((x) => parseInt(x, 10));
    return { numbers: [a, b], payout: 17 };
  }

  if (id.startsWith("street-")) {
    const n = parseInt(id.split("-")[1], 10);
    return { numbers: [n, n + 1, n + 2], payout: 11 };
  }

  if (id.startsWith("corner-")) {
    const a = parseInt(id.split("-")[1], 10);
    // a = número de la esquina superior izquierda del cuadro de 4
    const nums = [a, a - 1, a + 2, a + 3];
    return { numbers: nums, payout: 8 };
  }

  if (id.startsWith("sixline-")) {
    const n = parseInt(id.split("-")[1], 10);
    return { numbers: [n, n + 1, n + 2, n + 3, n + 4, n + 5], payout: 5 };
  }

  if (id === "col-1") {
    return { numbers: Array.from({ length: 12 }, (_, i) => 1 + i * 3), payout: 2 };
  }
  if (id === "col-2") {
    return { numbers: Array.from({ length: 12 }, (_, i) => 2 + i * 3), payout: 2 };
  }
  if (id === "col-3") {
    return { numbers: Array.from({ length: 12 }, (_, i) => 3 + i * 3), payout: 2 };
  }

  if (id === "dozen-1") return { numbers: Array.from({ length: 12 }, (_, i) => i + 1), payout: 2 };
  if (id === "dozen-2") return { numbers: Array.from({ length: 12 }, (_, i) => i + 13), payout: 2 };
  if (id === "dozen-3") return { numbers: Array.from({ length: 12 }, (_, i) => i + 25), payout: 2 };

  if (id === "red") return { numbers: Array.from({ length: 36 }, (_, i) => i + 1).filter((n) => RED.has(n)), payout: 1 };
  if (id === "black") return { numbers: Array.from({ length: 36 }, (_, i) => i + 1).filter((n) => !RED.has(n)), payout: 1 };
  if (id === "even") return { numbers: Array.from({ length: 36 }, (_, i) => i + 1).filter((n) => n % 2 === 0), payout: 1 };
  if (id === "odd") return { numbers: Array.from({ length: 36 }, (_, i) => i + 1).filter((n) => n % 2 === 1), payout: 1 };
  if (id === "low") return { numbers: Array.from({ length: 18 }, (_, i) => i + 1), payout: 1 };
  if (id === "high") return { numbers: Array.from({ length: 18 }, (_, i) => i + 19), payout: 1 };

  throw new Error(`Apuesta desconocida: ${id}`);
}

/* ------------------------------------------------------------------
 * VOZ
 * ------------------------------------------------------------------ */
function speak(text: string): void {
  if (!CONFIG.VOZ_ACTIVA || !("speechSynthesis" in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "es-ES";
  u.rate = 0.95;
  const voices = speechSynthesis.getVoices();
  const v = voices.find((x) => x.lang.startsWith("es"));
  if (v) u.voice = v;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}

function formatMoney(n: number): string {
  return n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
}

/* ------------------------------------------------------------------
 * AUDIO (Web Audio API)
 * ------------------------------------------------------------------ */
function useRouletteAudio() {
  const ctxRef = useRef<AudioContext | null>(null);
  const timers = useRef<number[]>([]);

  const ensure = (): AudioContext | null => {
    if (!CONFIG.AUDIO_ACTIVO) return null;
    const w = window as typeof window & { webkitAudioContext?: typeof AudioContext };
    const Ctx = w.AudioContext || w.webkitAudioContext;
    if (!ctxRef.current) {
      ctxRef.current = new Ctx();
    }
    if (ctxRef.current.state === "suspended") {
      void ctxRef.current.resume();
    }
    return ctxRef.current;
  };

  const beep = (freq: number, duration: number, type: OscillatorType, gain = 0.08) => {
    const ctx = ensure();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  };

  const playTick = (progress: number) => {
    const p = progress * progress;
    const freq = 900 - 650 * p;
    beep(freq, 0.04, "triangle", 0.07);
  };

  const playFall = () => {
    const ctx = ensure();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(420, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(90, ctx.currentTime + 0.18);
    g.gain.setValueAtTime(0.12, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.25);
  };

  const startSpinning = (durationMs: number) => {
    stopSpinning();
    const start = performance.now();
    const schedule = () => {
      const elapsed = performance.now() - start;
      if (elapsed >= durationMs) return;
      const p = elapsed / durationMs;
      playTick(p);
      const nextInterval = 70 + 270 * p * p;
      const id = window.setTimeout(schedule, nextInterval);
      timers.current.push(id);
    };
    schedule();
    const fallId = window.setTimeout(playFall, Math.max(durationMs - 180, 0));
    timers.current.push(fallId);
  };

  const stopSpinning = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  const playPrize = () => {
    [880, 1320, 1760].forEach((freq, i) => {
      const id = window.setTimeout(() => beep(freq, 0.2, "sine", 0.12), i * 120);
      timers.current.push(id);
    });
  };

  return { ensure, startSpinning, stopSpinning, playFall, playPrize };
}

/* ------------------------------------------------------------------
 * REDUCER
 * ------------------------------------------------------------------ */
const initialState: State = {
  phase: "BETTING",
  saldo: CONFIG.SALDO_INICIAL,
  bets: [],
  totalBet: 0,
  winner: null,
  timeLeft: CONFIG.TIEMPO_APUESTAS,
  lastWin: 0,
  lastNet: 0,
  history: [],
  selectedChip: CONFIG.FICHAS[0],
  paused: false,
  message: "Apuestas abiertas",
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "PLACE_BET": {
      if (state.phase !== "BETTING") return state;
      const amount = action.amount;
      if (amount < CONFIG.APUESTA_MINIMA) return state;
      if (state.saldo < amount) return state;
      const existing = state.bets.find((b) => b.id === action.id);
      let bets: Bet[];
      if (existing) {
        bets = state.bets.map((b) =>
          b.id === action.id ? { ...b, amount: b.amount + amount } : b
        );
      } else {
        const def = betDef(action.id);
        bets = [...state.bets, { id: action.id, ...def, amount }];
      }
      return {
        ...state,
        saldo: state.saldo - amount,
        bets,
        totalBet: state.totalBet + amount,
        message: `Apostaste ${formatMoney(amount)}`,
      };
    }

    case "CLEAR_BETS": {
      if (state.phase !== "BETTING" || state.totalBet === 0) return state;
      return {
        ...state,
        saldo: state.saldo + state.totalBet,
        bets: [],
        totalBet: 0,
        message: "Apuestas limpiadas",
      };
    }

    case "SELECT_CHIP":
      return { ...state, selectedChip: action.chip };

    case "RECHARGE":
      return { ...state, saldo: state.saldo + action.amount, message: `Recargaste ${formatMoney(action.amount)}` };

    case "TOGGLE_PAUSE":
      return { ...state, paused: !state.paused, message: !state.paused ? "Pausado" : state.message };

    case "TICK": {
      if (state.phase !== "BETTING") return state;
      return { ...state, timeLeft: Math.max(0, state.timeLeft - 1) };
    }

    case "SET_PHASE": {
      return {
        ...state,
        phase: action.phase,
        timeLeft:
          action.timeLeft ??
          (action.phase === "BETTING"
            ? CONFIG.TIEMPO_APUESTAS
            : action.phase === "NO_MORE_BETS"
            ? CONFIG.TIEMPO_NO_VA_MAS
            : action.phase === "PAYOUT"
            ? CONFIG.TIEMPO_PAGO
            : state.timeLeft),
        message:
          action.phase === "BETTING"
            ? "Apuestas abiertas"
            : action.phase === "NO_MORE_BETS"
            ? "No va más"
            : action.phase === "SPINNING"
            ? "Girando..."
            : state.winner !== null
            ? `Número ${state.winner}`
            : state.message,
      };
    }

    case "SET_WINNER":
      return { ...state, winner: action.winner };

    case "RESOLVE_AND_PAY": {
      if (state.winner === null) return state;
      let totalReturn = 0;
      for (const bet of state.bets) {
        if (bet.numbers.includes(state.winner)) {
          totalReturn += bet.amount * (bet.payout + 1);
        }
      }
      const net = totalReturn - state.totalBet;
      const newHistory = [state.winner, ...state.history].slice(0, 10);
      return {
        ...state,
        saldo: state.saldo + totalReturn,
        history: newHistory,
        lastWin: totalReturn,
        lastNet: net,
        message: net > 0 ? `¡Ganaste ${formatMoney(net)}!` : `Salió el ${state.winner}`,
      };
    }

    case "NEW_ROUND": {
      return {
        ...state,
        phase: "BETTING",
        bets: [],
        totalBet: 0,
        winner: null,
        timeLeft: CONFIG.TIEMPO_APUESTAS,
        lastWin: 0,
        lastNet: 0,
        message: "Apuestas abiertas",
      };
    }

    case "SPIN_NOW": {
      if (state.phase !== "BETTING" || state.totalBet === 0) return state;
      return { ...state, phase: "NO_MORE_BETS", timeLeft: CONFIG.TIEMPO_NO_VA_MAS, message: "No va más" };
    }

    default:
      return state;
  }
}

/* ------------------------------------------------------------------
 * LAYOUT DEL TABLERO (3 filas x 12 columnas)
 * ------------------------------------------------------------------ */
const TOP_ROW = Array.from({ length: 12 }, (_, j) => 3 + j * 3);
const MID_ROW = Array.from({ length: 12 }, (_, j) => 2 + j * 3);
const BOT_ROW = Array.from({ length: 12 }, (_, j) => 1 + j * 3);
const GRID = [TOP_ROW, MID_ROW, BOT_ROW];

/* ------------------------------------------------------------------
 * FICHAS VISUALES
 * ------------------------------------------------------------------ */
function chipClasses(value: number): string {
  switch (value) {
    case 250:
      return "bg-white";
    case 500:
      return "bg-[#c1121f]";
    case 1000:
      return "bg-blue-600";
    case 5000:
      return "bg-yellow-500";
    default:
      return "bg-gray-500";
  }
}

function chipLabel(value: number): string {
  return value >= 1000 ? `${value / 1000}k` : `${value}`;
}

function chipTextColor(value: number): string {
  return value === 250 || value === 5000 ? "text-black" : "text-white";
}

function Chip({ value, small }: { value: number; small?: boolean }) {
  const base = chipClasses(value);
  const textColor = chipTextColor(value);
  const borderColor = value === 250 ? "border-black/30" : "border-white/80";
  const size = small ? "w-5 h-5 text-[8px]" : "w-7 h-7 text-[10px]";
  const inner = small ? "inset-[2px]" : "inset-[3px]";
  return (
    <div className={`relative ${size} rounded-full shadow-lg pointer-events-none`}>
      {/* Aro exterior tipo ficha de casino */}
      <div className={`absolute inset-0 rounded-full ${base} border-2 border-dashed ${borderColor}`} />
      {/* Pastilla interior */}
      <div
        className={`absolute ${inner} rounded-full bg-white/20 border border-white/30 flex items-center justify-center font-black ${textColor}`}
      >
        {chipLabel(value)}
      </div>
    </div>
  );
}

function BetChip({ amount, small }: { amount: number; small?: boolean }) {
  const denom = useMemo(() => {
    for (let i = CONFIG.FICHAS.length - 1; i >= 0; i--) {
      if (amount >= CONFIG.FICHAS[i]) return CONFIG.FICHAS[i];
    }
    return CONFIG.FICHAS[0];
  }, [amount]);
  return <Chip value={denom} small={small} />;
}

/* ------------------------------------------------------------------
 * RUEDA SVG
 * ------------------------------------------------------------------ */
const CX = 300;
const CY = 300;
const WHEEL_R = 230;
const INNER_R = 150;
const BALL_OUTER = 260;
const BALL_INNER = 205;
const SLOT_ANGLE = 360 / WHEEL.length;

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function sectorPath(
  inner: number,
  outer: number,
  startDeg: number,
  endDeg: number
) {
  const p1 = polar(CX, CY, inner, startDeg);
  const p2 = polar(CX, CY, inner, endDeg);
  const p3 = polar(CX, CY, outer, endDeg);
  const p4 = polar(CX, CY, outer, startDeg);
  return `M ${p1.x} ${p1.y} A ${inner} ${inner} 0 0 1 ${p2.x} ${p2.y} L ${p3.x} ${p3.y} A ${outer} ${outer} 0 0 0 ${p4.x} ${p4.y} Z`;
}

function WheelContents({ winner, pulse }: { winner: number | null; pulse?: boolean }) {
  return (
    <>
      {/* Corona de números */}
      {WHEEL.map((n, i) => {
        const mid = -90 + i * SLOT_ANGLE;
        const start = mid - SLOT_ANGLE / 2;
        const end = mid + SLOT_ANGLE / 2;
        const col = colorOf(n);
        const fill = col === "red" ? "#c1121f" : col === "black" ? "#141414" : "#0a7d34";
        const tPos = polar(CX, CY, 190, mid);
        let rot = mid + 90;
        if (rot > 90 && rot < 270) rot += 180;
        const isWinner = winner === n;
        return (
          <g key={n}>
            <path d={sectorPath(INNER_R, WHEEL_R, start, end)} fill={fill} stroke="#caa84a" strokeWidth="2" />
            {isWinner && (
              <path
                d={sectorPath(INNER_R, WHEEL_R, start, end)}
                fill="#facc15"
                fillOpacity="0.55"
                stroke="white"
                strokeWidth="4"
                className={pulse ? "animate-pulse" : ""}
              />
            )}
            <text
              x={tPos.x}
              y={tPos.y}
              fill="white"
              fontSize="16"
              fontWeight="700"
              textAnchor="middle"
              dominantBaseline="middle"
              transform={`rotate(${rot} ${tPos.x} ${tPos.y})`}
            >
              {n}
            </text>
          </g>
        );
      })}

      {/* Anillos decorativos */}
      <circle cx={CX} cy={CY} r={WHEEL_R + 8} fill="none" stroke="#854d0e" strokeWidth="6" />
      <circle cx={CX} cy={CY} r={WHEEL_R - 6} fill="none" stroke="#caa84a" strokeWidth="2" />
      <circle cx={CX} cy={CY} r={INNER_R - 2} fill="none" stroke="#caa84a" strokeWidth="2" />

      {/* Cono central */}
      <circle cx={CX} cy={CY} r={INNER_R - 10} fill="url(#cone)" stroke="#94a3b8" strokeWidth="3" />
    </>
  );
}

/* ------------------------------------------------------------------
 * COMPONENTE PRINCIPAL
 * ------------------------------------------------------------------ */
export default function App() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const timersRef = useRef<number[]>([]);
  const audio = useRouletteAudio();

  const wheelGroupRef = useRef<SVGGElement>(null);
  const ballGroupRef = useRef<SVGGElement>(null);
  const ballRadiusRef = useRef<SVGGElement>(null);
  const wheelAngleRef = useRef(0);
  const ballAngleRef = useRef(0);

  const clearTimers = () => {
    timersRef.current.forEach((id) => clearTimeout(id));
    timersRef.current = [];
  };

  /* Máquina de estados controlada por fase */
  useEffect(() => {
    clearTimers();
    if (state.paused) return;

    if (state.phase === "NO_MORE_BETS") {
      speak("No va más");
      const id = window.setTimeout(() => {
        const w = drawWinner();
        dispatch({ type: "SET_WINNER", winner: w });
        dispatch({ type: "SET_PHASE", phase: "SPINNING" });
      }, CONFIG.TIEMPO_NO_VA_MAS * 1000);
      timersRef.current.push(id);
    }

    if (state.phase === "SPINNING" && state.winner !== null) {
      triggerSpinAnimation(state.winner);
      audio.startSpinning(CONFIG.TIEMPO_GIRO * 1000);
      const id = window.setTimeout(() => {
        dispatch({ type: "RESOLVE_AND_PAY" });
        dispatch({ type: "SET_PHASE", phase: "PAYOUT" });
      }, CONFIG.TIEMPO_GIRO * 1000);
      timersRef.current.push(id);
    }

    if (state.phase === "PAYOUT" && state.winner !== null) {
      if (state.lastNet > 0) audio.playPrize();
      const c = colorOf(state.winner);
      const texto = state.lastNet > 0
        ? `Número ${state.winner}, ${c === "red" ? "rojo" : c === "black" ? "negro" : "verde"}. Ganaste ${state.lastNet} pesos.`
        : `Número ${state.winner}, ${c === "red" ? "rojo" : c === "black" ? "negro" : "verde"}`;
      speak(texto);
      const id = window.setTimeout(() => {
        dispatch({ type: "NEW_ROUND" });
      }, CONFIG.TIEMPO_PAGO * 1000);
      timersRef.current.push(id);
    }

    return () => {
      clearTimers();
      audio.stopSpinning();
    };
  }, [state.phase, state.paused]);

  /* Countdown en BETTING */
  useEffect(() => {
    if (state.phase !== "BETTING" || state.paused) return;
    if (state.timeLeft <= 0) {
      dispatch({ type: "SET_PHASE", phase: "NO_MORE_BETS" });
      return;
    }
    const id = window.setTimeout(() => dispatch({ type: "TICK" }), 1000);
    timersRef.current.push(id);
    return () => clearTimers();
  }, [state.phase, state.timeLeft, state.paused]);

  /* Animación de la rueda y la bola */
  const triggerSpinAnimation = (winner: number) => {
    const wheelEl = wheelGroupRef.current;
    const ballEl = ballGroupRef.current;
    const ballInner = ballRadiusRef.current;
    if (!wheelEl || !ballEl || !ballInner) return;

    const idx = WHEEL.findIndex((n) => n === winner);
    // Ángulo absoluto final del grupo de la rueda para que WHEEL[idx] quede arriba.
    // WHEEL[i] se dibuja originalmente a i*SLOT_ANGLE horario desde el tope; tras rotar la
    // rueda A° horario, queda en i*SLOT_ANGLE + A. Para que valga 0: A = -i*SLOT_ANGLE (mod 360).
    const targetVisual = (-idx * SLOT_ANGLE + 360) % 360;

    // Ángulo visual actual de la rueda normalizado a [0, 360)
    const currentWheelVisual = ((wheelAngleRef.current % 360) + 360) % 360;
    const wheelDelta = (targetVisual - currentWheelVisual + 360) % 360;
    const wheelStart = wheelAngleRef.current;
    const wheelTarget = wheelStart + 6 * 360 + wheelDelta;

    // La bola siempre termina exactamente arriba (múltiplo de 360°).
    // ballTarget = ballStart - 11 vueltas - driftVisual garantiza rotación CCW
    // y vuelve a visual 0 sin acumular deriva.
    const currentBallVisual = ((ballAngleRef.current % 360) + 360) % 360;
    const ballStart = ballAngleRef.current;
    const ballTarget = ballStart - 11 * 360 - currentBallVisual;

    // Resetear transform con transición desactivada para forzar reflow
    wheelEl.style.transition = "none";
    ballEl.style.transition = "none";
    ballInner.style.transition = "none";
    wheelEl.style.transform = `rotate(${wheelStart}deg)`;
    ballEl.style.transform = `rotate(${ballStart}deg)`;
    ballInner.style.transform = `translateY(-${BALL_OUTER}px)`;

    void wheelEl.getBoundingClientRect();

    // Doble requestAnimationFrame para garantizar que el reset se aplique antes de la transición
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const ease = `transform ${CONFIG.TIEMPO_GIRO}s cubic-bezier(0.25, 0.1, 0.25, 1)`;
        wheelEl.style.transition = ease;
        ballEl.style.transition = ease;
        ballInner.style.transition = ease;
        wheelEl.style.transform = `rotate(${wheelTarget}deg)`;
        ballEl.style.transform = `rotate(${ballTarget}deg)`;
        ballInner.style.transform = `translateY(-${BALL_INNER}px)`;

        wheelAngleRef.current = wheelTarget;
        ballAngleRef.current = ballTarget;
      });
    });
  };

  const placeBet = (id: string) => {
    if (state.phase !== "BETTING") return;
    audio.ensure();
    dispatch({ type: "PLACE_BET", id, amount: state.selectedChip });
  };

  const betFor = (id: string) => state.bets.find((b) => b.id === id);

  /* ----------------------------------------------------------------
   * Render helpers de la mesa
   * ---------------------------------------------------------------- */
  const baseCell =
    "relative flex items-center justify-center font-bold text-white select-none border border-[#0a4a22] md:text-sm text-xs";

  const numberCellColor = (n: number) => {
    const c = colorOf(n);
    return c === "red" ? "bg-[#c1121f]" : c === "black" ? "bg-[#141414]" : "bg-[#0a7d34]";
  };

  const chipSpot = (id: string, small?: boolean) => {
    const b = betFor(id);
    if (!b) return null;
    return (
      <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
        <div className="drop-shadow-[0_2px_3px_rgba(0,0,0,0.6)]">
          <BetChip amount={b.amount} small={small} />
       </div>
     </div>
    );
  };

  // Ficha en esquina superior-derecha para no tapar el texto del botón
  const chipSpotCorner = (id: string) => {
    const b = betFor(id);
    if (!b) return null;
    return (
      <div className="absolute top-1 right-1 z-10 pointer-events-none">
        <div className="drop-shadow-[0_2px_3px_rgba(0,0,0,0.7)]">
          <BetChip amount={b.amount} small={true} />
       </div>
     </div>
    );
  };

  const renderNumberCell = (n: number, rowIndex: number, colIndex: number) => {
    const straightId = `straight-${n}`;
    const rightSplitId = `split-${Math.min(n, n + 3)}-${Math.max(n, n + 3)}`;
    const bottomSplitId =
      rowIndex < 2 ? `split-${Math.min(n, n - 1)}-${Math.max(n, n - 1)}` : null;
    const streetId = rowIndex === 2 ? `street-${n}` : null;
    const isLastCol = colIndex === 11;
    const cornerId =
      rowIndex < 2 && !isLastCol ? `corner-${n}` : null;
    const sixlineId =
      rowIndex === 2 && !isLastCol ? `sixline-${n}` : null;

    const isWinner = state.winner === n && state.phase === "PAYOUT";

    return (
      <div
        key={n}
        className={`${baseCell} ${numberCellColor(n)} cursor-pointer hover:brightness-110 active:scale-95 ${
          isWinner ? "ring-4 ring-[#facc15] z-40 scale-105 shadow-[0_0_20px_#facc15] animate-pulse" : ""
        }`}
        style={{ gridColumn: colIndex + 2, gridRow: rowIndex + 1 }}
        onClick={() => placeBet(straightId)}
      >
        {n}
        {chipSpot(straightId)}

        {/* Zona split horizontal derecho */}
        {!isLastCol && (
          <div
            className="absolute right-0 top-1/2 -translate-y-1/2 w-4 md:w-5 h-full -mr-2 z-20 rounded-full hover:bg-white/20 cursor-pointer"
            onClick={(e) => { e.stopPropagation(); placeBet(rightSplitId); }}
          >
            {chipSpot(rightSplitId, true)}
          </div>
        )}

        {/* Zona split vertical inferior o street */}
        {bottomSplitId && (
          <div
            className="absolute bottom-0 left-1/2 -translate-x-1/2 w-full h-3 md:h-4 -mb-2 z-20 rounded-full hover:bg-white/20 cursor-pointer"
            onClick={(e) => { e.stopPropagation(); placeBet(bottomSplitId); }}
          >
            {chipSpot(bottomSplitId, true)}
          </div>
        )}
        {streetId && (
          <div
            className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-full h-3 md:h-4 z-20 rounded-full hover:bg-white/20 cursor-pointer"
            onClick={(e) => { e.stopPropagation(); placeBet(streetId); }}
          >
            {chipSpot(streetId, true)}
          </div>
        )}

        {/* Esquina inferior derecha: corner o sixline */}
        {!isLastCol && (
          <div
            className="absolute -right-2 -bottom-2 w-5 h-5 md:w-6 md:h-6 z-30 rounded-full hover:bg-white/30 cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              if (cornerId) placeBet(cornerId);
              else if (sixlineId) placeBet(sixlineId);
            }}
          >
            {cornerId ? chipSpot(cornerId, true) : null}
            {sixlineId ? chipSpot(sixlineId, true) : null}
          </div>
        )}
      </div>
    );
  };

  const renderZeroSplits = () => {
    // Splits del 0 con 3, 2 y 1
    return [3, 2, 1].map((n, i) => {
      const id = `split-0-${n}`;
      return (
        <div
          key={id}
          className="absolute right-0 w-4 md:w-5 h-8 md:h-10 z-20 -mr-2 rounded-full hover:bg-white/20 cursor-pointer"
          style={{ top: `${(i * 100) / 3 + 100 / 6}%`, transform: "translateY(-50%)" }}
          onClick={(e) => { e.stopPropagation(); placeBet(id); }}
        >
          {chipSpot(id, true)}
        </div>
      );
    });
  };

  const outsideBtn = (id: string, label: React.ReactNode, flex = "flex-1") => (
    <button
      disabled={state.phase !== "BETTING"}
      onClick={() => placeBet(id)}
      className={`${flex} relative md:h-12 h-10 flex items-center justify-center font-bold text-white text-xs md:text-sm border border-[#0a4a22] bg-[#14552d] hover:bg-[#1a6b39] disabled:opacity-80 disabled:cursor-not-allowed px-2`}
    >
      <span className="text-center leading-tight">{label}</span>
      {chipSpotCorner(id)}
   </button>
  );

  const progressPct = (state.timeLeft / CONFIG.TIEMPO_APUESTAS) * 100;

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white p-3 lg:p-5">
      {/* Header */}
      <header className="flex flex-col md:flex-row items-center justify-between gap-3 mb-4 border-b border-[#caa84a] pb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[#c1121f] flex items-center justify-center text-white font-black border-2 border-[#caa84a]">
            R
          </div>
          <h1 className="text-2xl font-black tracking-wider text-[#caa84a] uppercase">Ruleta Live</h1>
        </div>
        <div className="flex items-center gap-3 text-sm md:text-base">
          <div className="bg-[#141414] border border-[#caa84a] px-4 py-2 rounded">
            <span className="text-gray-400">Saldo</span>{" "}
            <span className="font-mono font-bold text-[#caa84a]">{formatMoney(state.saldo)}</span>
          </div>
          <div className="bg-[#141414] border border-[#caa84a] px-4 py-2 rounded">
            <span className="text-gray-400">Apostado</span>{" "}
            <span className="font-mono font-bold text-white">{formatMoney(state.totalBet)}</span>
          </div>
          <button
            onClick={() => dispatch({ type: "RECHARGE", amount: CONFIG.RECARGA })}
            className="bg-[#16a34a] hover:bg-[#15803d] text-white font-bold px-3 py-2 rounded border border-green-400"
            title={`Recargar ${formatMoney(CONFIG.RECARGA)}`}
          >
            + Recargar
          </button>
        </div>
      </header>

      <main className="flex flex-col xl:flex-row gap-5">
        {/* Panel izquierdo: rueda, fase, historial */}
        <section className="flex-1 min-w-0 flex flex-col items-center gap-4">
          {/* Rueda */}
          <div className="relative w-full max-w-[460px] aspect-square">
            <svg viewBox="0 0 600 600" className="w-full h-full">
              <defs>
                <radialGradient id="cone" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#e2e8f0" />
                  <stop offset="40%" stopColor="#94a3b8" />
                  <stop offset="80%" stopColor="#475569" />
                  <stop offset="100%" stopColor="#1e293b" />
                </radialGradient>
                <filter id="shadow-ball" x="-50%" y="-50%" width="200%" height="200%">
                  <feDropShadow dx="0" dy="0" stdDeviation="2" floodColor="#000" floodOpacity="0.6" />
                </filter>
              </defs>

              {/* Rueda giratoria */}
              <g
                ref={wheelGroupRef}
                style={{ transformOrigin: "300px 300px" }}
              >
                <WheelContents winner={state.winner} pulse={state.phase === "PAYOUT"} />
              </g>

              {/* Bola giratoria */}
              <g
                ref={ballGroupRef}
                style={{ transformOrigin: "300px 300px" }}
              >
                <g
                  ref={ballRadiusRef}
                  style={{ transformOrigin: "300px 300px" }}
                >
                  <circle
                    cx={CX}
                    cy={CY}
                    r={8}
                    fill="#f8fafc"
                    stroke="#94a3b8"
                    strokeWidth={2}
                    filter="url(#shadow-ball)"
                  />
                </g>
              </g>
            </svg>
            {/* Indicador superior */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 -mt-2 w-0 h-0 border-l-8 border-r-8 border-t-12 border-l-transparent border-r-transparent border-t-[#caa84a] drop-shadow-lg" />
          </div>

          {/* Mensaje de fase */}
          <div className="text-center">
            <div
              className={`text-2xl font-black uppercase tracking-widest ${
                state.phase === "NO_MORE_BETS" ? "animate-pulse text-[#c1121f]" : "text-[#caa84a]"
              }`}
            >
              {state.message}
            </div>
            {state.phase === "BETTING" && (
              <div className="mt-2 w-64 h-3 bg-[#141414] rounded overflow-hidden border border-[#caa84a]">
                <div
                  className="h-full bg-[#caa84a] transition-all duration-1000 ease-linear"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            )}
            {state.phase === "BETTING" && (
              <div className="mt-1 font-mono text-xl">{state.timeLeft}s</div>
            )}
            {state.phase === "PAYOUT" && state.lastNet > 0 && (
              <div className="mt-2 text-3xl font-black text-green-400 animate-bounce">
                +{formatMoney(state.lastNet)}
              </div>
            )}
          </div>

          {/* Historial */}
          <div className="w-full max-w-md">
            <h3 className="text-sm text-gray-300 mb-2 font-bold">ÚLTIMOS NÚMEROS</h3>
            <div className="flex gap-2 flex-wrap">
              {state.history.map((n, idx) => {
                const c = colorOf(n);
                const bg = c === "red" ? "bg-[#c1121f]" : c === "black" ? "bg-[#141414]" : "bg-[#0a7d34]";
                const ring = idx === 0 ? "ring-2 ring-[#caa84a]" : "";
                return (
                  <div
                    key={`${n}-${idx}`}
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white ${bg} ${ring} border border-white/20`}
                  >
                    {n}
                  </div>
                );
              })}
              {state.history.length === 0 && (
                <span className="text-gray-500 text-sm">Sin giros aún</span>
              )}
            </div>
          </div>
        </section>

        {/* Panel derecho: mesa, fichas, controles */}
        <section className="flex-[1.6] min-w-0">
          <div className="bg-[#0a6b2e] border-4 border-[#caa84a] rounded-lg p-2 md:p-4 shadow-2xl overflow-x-auto">
            {/* Área de números con 0 y columnas laterales */}
            <div
              className="grid gap-0.5 min-w-[340px]"
              style={{
                gridTemplateColumns: "2.25rem repeat(12, minmax(0, 1fr)) 2rem",
                gridTemplateRows: "repeat(3, 2.75rem)",
              }}
            >
              {/* Cero */}
              <div
                className="relative col-start-1 col-end-2 row-start-1 row-end-4 bg-[#0a7d34] flex items-center justify-center font-bold text-white border border-[#0a4a22] hover:brightness-110 cursor-pointer"
                onClick={() => placeBet("straight-0")}
              >
                0
                {chipSpot("straight-0")}
                {renderZeroSplits()}
              </div>

              {/* Grilla de números */}
              {GRID.map((row, ri) =>
                row.map((n, ci) => renderNumberCell(n, ri, ci))
              )}

              {/* Columnas 2:1 */}
              {[
                { id: "col-3", label: "2:1" },
                { id: "col-2", label: "2:1" },
                { id: "col-1", label: "2:1" },
              ].map((col, i) => (
                <button
                  key={col.id}
                  disabled={state.phase !== "BETTING"}
                  onClick={() => placeBet(col.id)}
                  className="relative col-start-14 col-end-15 flex items-center justify-center text-[10px] font-bold bg-[#14552d] text-white border border-[#0a4a22] hover:bg-[#1a6b39] disabled:opacity-80"
                  style={{ gridRow: i + 1 }}
                >
                  {col.label}
                  {chipSpot(col.id)}
                </button>
              ))}
            </div>

            {/* Docenas */}
            <div className="grid grid-cols-3 gap-0.5 min-w-[340px] mt-1">
              {outsideBtn("dozen-1", "1ª Docena (1‑12)")}
              {outsideBtn("dozen-2", "2ª Docena (13‑24)")}
              {outsideBtn("dozen-3", "3ª Docena (25‑36)")}
            </div>

            {/* Apuestas externas */}
            <div className="grid grid-cols-6 gap-0.5 min-w-[340px] mt-1">
              {outsideBtn("low", "1‑18")}
              {outsideBtn("even", "PAR")}
              {outsideBtn(
                "red",
                <div className="w-5 h-5 rotate-45 bg-[#c1121f] border border-white" />,
                "flex-1"
              )}
              {outsideBtn(
                "black",
                <div className="w-5 h-5 rotate-45 bg-[#141414] border border-white" />,
                "flex-1"
              )}
              {outsideBtn("odd", "IMPAR")}
              {outsideBtn("high", "19‑36")}
            </div>
          </div>

          {/* Selector de fichas */}
          <div className="flex items-center justify-center gap-3 mt-4">
            {CONFIG.FICHAS.map((chip) => {
              const active = state.selectedChip === chip;
              return (
                <button
                  key={chip}
                  onClick={() => dispatch({ type: "SELECT_CHIP", chip })}
                  disabled={state.phase !== "BETTING" || state.saldo < chip}
                  className={`relative w-12 h-12 md:w-14 md:h-14 rounded-full border-2 border-white/80 font-black text-sm md:text-base shadow-lg transition-transform ${chipClasses(
                    chip
                  )} ${chipTextColor(chip)} ${active ? "scale-110 ring-2 ring-[#caa84a]" : "hover:scale-105"} ${
                    state.saldo < chip ? "opacity-40 cursor-not-allowed" : ""
                  }`}
                >
                  {chipLabel(chip)}
                </button>
              );
            })}
          </div>

          {/* Controles */}
          <div className="flex flex-wrap items-center justify-center gap-3 mt-4">
            <button
              onClick={() => dispatch({ type: "CLEAR_BETS" })}
              disabled={state.phase !== "BETTING" || state.totalBet === 0}
              className="px-5 py-2.5 rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-50 font-bold border border-gray-500"
            >
              ✕ Limpiar
            </button>
            <button
              onClick={() => dispatch({ type: "SPIN_NOW" })}
              disabled={state.phase !== "BETTING" || state.totalBet === 0}
              className="px-6 py-2.5 rounded bg-[#c1121f] hover:bg-[#9a0e19] disabled:opacity-50 disabled:cursor-not-allowed font-black tracking-wide uppercase shadow-lg"
            >
              ▶ Girar ya
            </button>
            {state.phase !== "SPINNING" && (
              <button
                onClick={() => dispatch({ type: "TOGGLE_PAUSE" })}
                className={`px-5 py-2.5 rounded font-bold border ${
                  state.paused
                    ? "bg-yellow-600 hover:bg-yellow-500 border-yellow-400"
                    : "bg-gray-700 hover:bg-gray-600 border-gray-500"
                }`}
              >
                {state.paused ? "▶ Reanudar" : "⏸ Pausar"}
              </button>
            )}
          </div>

          {/* Tabla de pagos */}
          <div className="mt-5 bg-[#141414] border border-[#2e303a] rounded p-3 min-w-[340px]">
            <h3 className="text-[#caa84a] font-bold mb-1 text-sm">Tabla de pagos</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 text-xs text-gray-300">
              <span>Pleno (1) 35:1</span>
              <span>Caballo (2) 17:1</span>
              <span>Transversal (3) 11:1</span>
              <span>Cuadro (4) 8:1</span>
              <span>Seisena (6) 5:1</span>
              <span>Columna (12) 2:1</span>
              <span>Docena (12) 2:1</span>
            <span>Exterior (18) 1:1</span>
          </div>
        </div>
      </section>
      </main>

      {/* Modal de resultado: aparece durante PAYOUT, gana o pierda */}
      {state.phase === "PAYOUT" && state.winner !== null && state.totalBet > 0 && (() => {
        const winningBets = state.bets.filter((b) => b.numbers.includes(state.winner!));
        const won = state.lastNet > 0;
        const breakEven = state.lastNet === 0;
        return (
          <div
            className={`fixed inset-0 z-50 flex items-center justify-center pointer-events-none win-modal ${won ? "win-modal-win" : breakEven ? "win-modal-even" : "win-modal-lose"}`}
          >
            <div
              className={`bg-black/85 backdrop-blur-sm rounded-2xl px-8 py-6 md:px-12 md:py-8 border-4 text-center max-w-md mx-4 shadow-2xl ${
                won
                  ? "border-[#facc15] shadow-[0_0_60px_#facc15]"
                  : breakEven
                  ? "border-gray-400"
                  : "border-[#c1121f]"
              }`}
            >
              <div
                className={`text-xl md:text-2xl font-black uppercase tracking-widest mb-3 drop-shadow-lg ${
                  won ? "text-[#facc15]" : breakEven ? "text-gray-200" : "text-[#c1121f]"
                }`}
              >
                {won ? "¡Ganaste!" : breakEven ? "Recuperaste" : "Salió el"}
             </div>
              <div
                className={`mx-auto w-20 h-20 md:w-24 md:h-24 rounded-full flex items-center justify-center text-3xl md:text-4xl font-black text-white border-4 border-white shadow-2xl ${
                  colorOf(state.winner) === "red"
                    ? "bg-[#c1121f]"
                    : colorOf(state.winner) === "black"
                    ? "bg-[#141414]"
                    : "bg-[#0a7d34]"
                }`}
              >
                {state.winner}
             </div>
              <div
                className={`mt-4 text-3xl md:text-5xl font-black drop-shadow-lg ${
                  state.lastWin > 0 ? "text-green-400" : "text-gray-300"
                }`}
              >
                {formatMoney(state.lastWin)}
             </div>
              <div
                className={`mt-1 text-sm md:text-base font-bold drop-shadow ${
                  state.lastNet >= 0 ? "text-green-300" : "text-red-400"
                }`}
              >
                {state.lastNet >= 0 ? "+" : ""}
                {formatMoney(state.lastNet)}
             </div>
              <div className="mt-2 text-xs text-gray-300 uppercase tracking-wider">
                Apostado: {formatMoney(state.totalBet)}
             </div>
              {winningBets.length > 0 && (
                <div className="mt-3 text-xs text-[#caa84a] font-bold">
                  {winningBets.length === 1
                    ? `Apuesta ganadora`
                    : `${winningBets.length} apuestas ganadoras`}
               </div>
              )}
           </div>
         </div>
        );
      })()}
   </div>
  );
}
