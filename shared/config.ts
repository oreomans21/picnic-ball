export const CFG = {
  tick: 60,
  snapshots: 20,
  innings: 3,
  pitchClock: 12,
  countdown: 3,
  rewind: 0.1,
  contactWindow: 0.145,
  reach: 0.68,
  runnerSpeed: 10.5,
  fielderSpeed: 14,
  throwSpeed: 64,
  stallWarning: 8,
  stallEnd: 13,
  reconnect: 60,
  waitingExpiry: 900,
  finishedExpiry: 300,
};
export const BASES = [
  { x: 0, y: 0 },
  { x: 28, y: 28 },
  { x: 0, y: 56 },
  { x: -28, y: 28 },
  { x: 0, y: 0 },
];
export const FIELDERS = [
  { x: 0, y: 21 },
  { x: 27, y: 30 },
  { x: 14, y: 51 },
  { x: -27, y: 30 },
  { x: -13, y: 51 },
  { x: -48, y: 70 },
  { x: 0, y: 88 },
  { x: 48, y: 70 },
  { x: 0, y: -7 },
];
export const PITCHES = {
  fastball: { duration: 0.88, description: "Quick & mostly straight" },
  curveball: { duration: 1.3, description: "Slower, with a big bend" },
  changeup: { duration: 1.15, description: "Looks quick. Arrives late." },
};
