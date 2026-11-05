export type Phase =
  | "waiting"
  | "countdown"
  | "prepare"
  | "flight"
  | "live"
  | "dead"
  | "side"
  | "finished"
  | "paused";
export type Clip =
  | "idle"
  | "ready"
  | "pitch"
  | "swing"
  | "run"
  | "scoop"
  | "catch"
  | "throw"
  | "tag"
  | "celebrate"
  | "strikeout";
export type PitchKind = "fastball" | "curveball" | "changeup";
export interface Vec {
  x: number;
  y: number;
}
export interface Player {
  name: string;
  connected: boolean;
  ready: boolean;
}
export interface Runner {
  id: number;
  p: number;
  origin: number;
  target: number | null;
  out: boolean;
  scored: boolean;
  retouch: boolean;
  lastBase: number;
}
export interface Fielder extends Vec {
  id: number;
  clip: Clip;
  animAt: number;
}
export interface Ball extends Vec {
  z: number;
  vx: number;
  vy: number;
  vz: number;
  holder: number | null;
  air: boolean;
  foul: boolean;
  caught: boolean;
  throwTo: number | null;
  throwAt: number;
  throwEnd: number;
  from: Vec;
  collect?: {
    id: number;
    kind: "scoop" | "catch";
    at: number;
    from: Vec & { z: number };
  };
}
export interface Pitch {
  kind: PitchKind;
  target: Vec;
  start: number;
  release: number;
  arrival: number;
  swung: boolean;
  swingAt: number | null;
  swingAim: Vec;
  resolved: boolean;
  holdAt: number | null;
  locked: Vec;
  power: number;
}
export interface GameState {
  t: number;
  phase: Phase;
  until: number;
  inning: number;
  half: 0 | 1;
  home: number;
  score: [number, number];
  innings: number[][];
  balls: number;
  strikes: number;
  outs: number;
  batter: number;
  players: Player[];
  runners: Runner[];
  fielders: Fielder[];
  ball: Ball;
  pitch: Pitch | null;
  message: string;
  event: number;
  eventAt: number;
  winner: number | null;
  lastActivity: number;
  playRuns: number;
  thirdForce: boolean;
  pausedPhase: Phase | null;
  pauseRemaining: number;
  reconnectUntil: number;
  match: number;
  readyFor: [boolean, boolean];
}
export type Input =
  | { type: "ready" | "rematch" | "advance" }
  | { type: "hold"; kind: PitchKind; x: number; y: number }
  | { type: "release" }
  | { type: "swing"; x: number; y: number; at: number }
  | { type: "run"; id: number; base: number }
  | { type: "stop"; id: number }
  | { type: "return"; id: number }
  | { type: "throw"; base: number };
export type ClientMessage =
  | { type: "create"; name: string }
  | { type: "join"; name: string; code: string; token?: string }
  | { type: "ping"; sent: number }
  | { type: "clock"; offset: number; rtt: number }
  | { type: "input"; seq: number; input: Input };
export type ServerMessage =
  | {
      type: "welcome";
      code: string;
      token: string;
      player: number;
      state: GameState;
    }
  | { type: "state"; state: GameState; now: number; ack: number }
  | { type: "pong"; sent: number; now: number }
  | { type: "error"; message: string };
