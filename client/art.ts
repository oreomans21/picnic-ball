import type { Clip } from "../shared/types";
export type Food = "hotdog" | "popcorn" | "watermelon" | "peanut";
export const CLIPS: Record<
  Clip,
  { duration: number; loop: boolean; events: Record<string, number> }
> = {
  idle: { duration: 2.8, loop: true, events: {} },
  ready: { duration: 1.8, loop: true, events: {} },
  pitch: { duration: 1.2, loop: false, events: { release: 0.72 } },
  swing: { duration: 0.66, loop: false, events: { contact: 0.18 } },
  run: { duration: 0.52, loop: true, events: { leftFoot: 0, rightFoot: 0.26 } },
  scoop: { duration: 0.8, loop: false, events: { secure: 0.42 } },
  catch: { duration: 0.72, loop: false, events: { catch: 0.2 } },
  throw: { duration: 0.8, loop: false, events: { release: 0.38 } },
  tag: { duration: 0.55, loop: false, events: { contact: 0.2 } },
  celebrate: { duration: 1.4, loop: true, events: {} },
  strikeout: { duration: 1.6, loop: false, events: {} },
};
type Pose = {
  tilt: number;
  bob: number;
  armL: number;
  armR: number;
  legL: number;
  legR: number;
  bend: number;
  face: number;
};
const rest: Pose = {
  tilt: 0,
  bob: 0,
  armL: 15,
  armR: -15,
  legL: 0,
  legR: 0,
  bend: 0,
  face: 0,
};
// Authored articulated pose keys: each key [normalized time, body rotation, height,
// left/right shoulder angles, left/right hip angles, crouch, expression].
const KEYS: Partial<Record<Clip, number[][]>> = {
  pitch: [
    [0, 0, 0, 20, -25, 0, 0, 0, 0],
    [0.2, -13, 2, -25, -150, 0, -65, 0, 1],
    [0.4, -23, 0, -55, -195, -10, -100, 2, 1],
    [0.6, 18, 1, 70, -75, -35, 40, 1, 1],
    [0.67, 29, -2, 105, 40, -35, 32, 3, 1],
    [0.84, 15, -1, 40, 95, -12, 15, 2, 0],
    [1, 0, 0, 15, -15, 0, 0, 0, 0],
  ],
  swing: [
    [0, -12, 0, -90, -95, 5, -12, 1, 1],
    [0.15, -20, 1, -115, -130, 12, -18, 2, 1],
    [0.28, 22, -1, 90, 105, -18, 20, 3, 1],
    [0.52, 34, 1, 135, 150, -10, 15, 1, 2],
    [0.8, 14, 0, 70, 85, -3, 6, 0, 2],
    [1, 0, 0, 15, -15, 0, 0, 0, 0],
  ],
  scoop: [
    [0, 0, 0, 15, -15, 0, 0, 0, 1],
    [0.25, 20, -9, 45, -30, -20, 22, 13, 1],
    [0.52, 28, -14, 80, 30, -30, 32, 18, 1],
    [0.72, 12, -5, 20, -40, -15, 18, 8, 2],
    [1, 0, 0, 15, -15, 0, 0, 0, 0],
  ],
  catch: [
    [0, -6, 0, -50, -70, 0, 0, 0, 1],
    [0.27, -8, 8, -155, -170, -10, 8, 0, 1],
    [0.45, 10, 0, -120, -80, 10, -10, 6, 2],
    [0.65, 12, -5, -50, -30, 5, -5, 8, 2],
    [1, 0, 0, 15, -15, 0, 0, 0, 0],
  ],
  throw: [
    [0, -8, 0, -30, -40, 0, -8, 2, 1],
    [0.25, -20, 2, -60, -160, 10, -30, 0, 1],
    [0.47, 20, -1, 60, -70, -30, 30, 2, 1],
    [0.64, 30, -4, 70, 90, -25, 25, 5, 2],
    [1, 0, 0, 15, -15, 0, 0, 0, 0],
  ],
  tag: [
    [0, 0, 0, 15, -15, 0, 0, 0, 1],
    [0.36, 27, -6, 100, 65, -25, 25, 8, 1],
    [0.6, 25, -5, 95, 50, -18, 18, 7, 2],
    [1, 0, 0, 15, -15, 0, 0, 0, 0],
  ],
  strikeout: [
    [0, 0, 0, -60, -70, 0, 0, 0, 0],
    [0.3, 12, -8, 18, -10, 5, -5, 8, 3],
    [0.7, -8, -5, 10, -5, -4, 5, 5, 3],
    [1, 0, 0, 15, -15, 0, 0, 0, 0],
  ],
};
export function pose(clip: Clip, time: number): Pose {
  const spec = CLIPS[clip],
    u = spec.loop
      ? (time % spec.duration) / spec.duration
      : Math.min(1, time / spec.duration),
    wave = Math.sin(u * Math.PI * 2);
  if (clip === "run")
    return {
      ...rest,
      tilt: 9,
      bob: -Math.abs(wave) * 4,
      armL: wave * 65,
      armR: -wave * 65,
      legL: -wave * 48,
      legR: wave * 48,
      bend: 5,
      face: 1,
    };
  if (clip === "idle" || clip === "ready")
    return {
      ...rest,
      bob: wave * 1.4,
      tilt: wave * 1.6,
      armL: clip === "ready" ? -75 : 15 + wave * 3,
      armR: clip === "ready" ? -95 : -15 - wave * 3,
      bend: clip === "ready" ? 2 : 0,
    };
  if (clip === "celebrate")
    return {
      ...rest,
      armL: -145 + wave * 16,
      armR: 145 - wave * 16,
      bob: Math.min(0, wave) * 10,
      legL: -12,
      legR: 12,
      face: 2,
    };
  const keys = KEYS[clip] || KEYS.pitch!;
  let n = 1;
  while (n < keys.length - 1 && keys[n][0] < u) n++;
  const a = keys[n - 1],
    b = keys[n],
    v = (u - a[0]) / (b[0] - a[0]);
  const vals = a.map((x, i) => x + (b[i] - x) * v);
  return {
    tilt: vals[1],
    bob: vals[2],
    armL: vals[3],
    armR: vals[4],
    legL: vals[5],
    legR: vals[6],
    bend: vals[7],
    face: Math.round(vals[8]),
  };
}
function path(
  c: CanvasRenderingContext2D,
  d: Path2D | string,
  fill: string,
  stroke = "#302d42",
  width = 3.4,
) {
  c.fillStyle = fill;
  if (
    width > 0 &&
    /^#[a-f0-9]{6}$/i.test(fill) &&
    !["#302d42", "#fff9ed"].includes(fill)
  ) {
    const n = parseInt(fill.slice(1), 16),
      rgb = [n >> 16, (n >> 8) & 255, n & 255];
    const gradient = c.createLinearGradient(-28, -108, 30, -18);
    gradient.addColorStop(
      0,
      `rgb(${rgb.map((n) => Math.min(255, Math.round(n * 0.88 + 31))).join(",")})`,
    );
    gradient.addColorStop(0.55, fill);
    gradient.addColorStop(
      1,
      `rgb(${rgb.map((n) => Math.round(n * 0.79)).join(",")})`,
    );
    c.fillStyle = gradient;
  }
  c.strokeStyle = stroke;
  c.lineWidth = width;
  const p = typeof d === "string" ? new Path2D(d) : d;
  c.fill(p);
  if (width) c.stroke(p);
}
function ellipse(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  fill: string,
  stroke = "#302d42",
  w = 2,
) {
  c.beginPath();
  c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  c.fillStyle = fill;
  c.fill();
  if (w) {
    c.strokeStyle = stroke;
    c.lineWidth = w;
    c.stroke();
  }
}
function line(
  c: CanvasRenderingContext2D,
  coords: number[],
  color = "#302d42",
  width = 3,
) {
  c.beginPath();
  c.moveTo(coords[0], coords[1]);
  for (let i = 2; i < coords.length; i += 2) c.lineTo(coords[i], coords[i + 1]);
  c.strokeStyle = color;
  c.lineWidth = width;
  c.stroke();
}
function limb(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  a: number,
  length: number,
  hand = false,
  equipment = false,
) {
  c.save();
  c.translate(x, y);
  c.rotate((a * Math.PI) / 180);
  c.beginPath();
  c.moveTo(0, 0);
  c.quadraticCurveTo(5, length * 0.5, 0, length);
  c.strokeStyle = "#302d42";
  c.lineWidth = 8;
  c.stroke();
  if (hand) {
    if (equipment) {
      path(
        c,
        "M-10 23Q-16 12-10 7L-6 12Q-5 1 0 4L3 12Q10 3 12 10L10 24Q0 32-10 23",
        "#bc7949",
      );
      line(c, [-5, 15, -2, 23, 5, 14], "#714731", 1.3);
    } else {
      path(
        c,
        "M-7 28Q-14 22-9 17L-5 19L-7 10Q-7 6-3 8L1 17L2 8Q5 4 7 9L8 18Q15 12 16 17L12 28Q2 35-7 28Z",
        "#fff9ed",
      );
      line(c, [-2, length - 2, 2, length + 1], "#bdad8e", 1);
    }
  } else {
    path(
      c,
      `M-4 ${length - 2} Q-7 ${length + 5} 3 ${length + 6} L14 ${length + 5} Q17 ${length} 6 ${length - 2}Z`,
      "#347cbb",
    );
    line(c, [3, length + 1, 8, length + 1], "#f8e8b8", 1.5);
  }
  c.restore();
}
export function drawCharacter(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  food: Food,
  clip: Clip,
  time: number,
  view: "front" | "rear" | "side" = "front",
  variation = 0,
  glove = false,
) {
  variation %= 9;
  const p = pose(clip, Math.max(0, time));
  c.save();
  c.translate(x, y);
  c.lineJoin = "round";
  c.lineCap = "round";
  ellipse(c, 0, 0, 23 * scale, 5 * scale, "#25433325", "", 0);
  c.scale(scale, scale);
  c.translate(0, p.bob - p.bend);
  c.rotate((p.tilt * Math.PI) / 180);
  limb(c, -12, -21, p.legL, 22 + p.bend);
  limb(c, 12, -21, p.legR, 22 + p.bend);
  limb(c, -24, -62, p.armL, 27, true, glove);
  c.save();
  if (view === "side") c.scale(0.94, 1);
  if (food === "hotdog") {
    path(
      c,
      "M-22-25Q-36-49-29-85Q-26-104-12-100Q-1-105 12-99Q30-101 32-81Q37-45 23-24Q4-17-22-25",
      "#ffd27c",
    );
    path(
      c,
      "M-16-29Q-24-55-19-88Q-17-103-4-102Q11-104 15-88Q22-55 15-30Q1-19-16-29",
      "#ed6944",
    );
    line(
      c,
      [-1, -93, 6, -85, -4, -76, 5, -66, -4, -57, 5, -47, -2, -36],
      "#f3cc57",
      4,
    );
    path(c, "M-27-79Q-32-49-21-31L-17-35Q-26-55-21-82", "#f9dfa0", "", 0);
  }
  if (food === "peanut") {
    path(
      c,
      "M-19-23Q-36-34-30-51Q-24-64-27-73Q-34-92-19-102Q-2-113 16-103Q32-95 25-77Q20-65 27-54Q40-35 21-23Q0-12-19-23",
      "#e4b263",
    );
    path(c, "M-18-96Q-25-87-19-73Q-14-62-21-48Q-27-32-13-27", "#ecca8c", "", 0);
    for (let row = 0; row < 6; row++) {
      const yy = -96 + row * 13;
      line(c, [-20, yy, 22, yy + 8], "#b88d54", 1.1);
      line(
        c,
        [-18 + (row % 2) * 6, yy, -10 + (row % 2) * 6, yy + 11],
        "#b88d54",
        1.1,
      );
      line(
        c,
        [3 + (row % 2) * 5, yy + 3, 12 + (row % 2) * 5, yy + 14],
        "#b88d54",
        1.1,
      );
    }
    line(c, [0, -101, -4, -84, 1, -67, -3, -51, 1, -25], "#a9804f", 1.5);
  }
  if (food === "popcorn") {
    path(c, "M-24-81L-18-25Q0-19 20-26L29-81Z", "#fff3ce");
    for (const xx of [-18, -2, 14])
      path(
        c,
        `M${xx}-80L${xx + 4}-25L${xx + 12}-25L${xx + 10}-80Z`,
        "#cf5c47",
        "",
        0,
      );
    path(
      c,
      "M-27-79Q-36-85-28-93Q-28-106-16-103Q-12-116-1-107Q9-119 17-105Q33-109 31-96Q43-86 29-79Z",
      "#fff3ce",
    );
    for (const [xx, yy] of [
      [-23, -92],
      [-11, -101],
      [2, -96],
      [15, -100],
      [26, -89],
    ]) {
      ellipse(c, xx, yy, 6, 5, "#fff8df", "#d9bb7e", 1);
      line(c, [xx - 2, yy + 2, xx + 2, yy - 1], "#e7cb8d", 1.7);
    }
    path(c, "M-17-78Q1-74 26-80L25-73Q0-69-17-73Z", "#f6dca3", "", 0);
  }
  if (food === "watermelon") {
    path(c, "M-36-90Q-12-112 17-103L40-31Q-2-9-37-39Z", "#39734d");
    path(c, "M-32-87Q-13-105 13-99L34-35Q-2-16-32-41Z", "#b5c96c", "", 0);
    path(c, "M-28-84Q-13-99 10-94L27-39Q-2-24-27-43Z", "#e97861", "", 0);
    for (const [xx, yy] of [
      [-15, -79],
      [1, -83],
      [12, -61],
      [-17, -52],
      [0, -42],
    ]) {
      c.save();
      c.translate(xx, yy);
      c.rotate(0.3);
      ellipse(c, 0, 0, 1.8, 3.8, "#46352e", "", 0);
      c.restore();
    }
  }
  // Accessory variations identify the nine lineup slots without changing anatomy.
  const cap =
    variation % 3 === 0
      ? "#2c6578"
      : variation % 3 === 1
        ? "#a94437"
        : "#d09a40";
  path(c, "M-20-97Q-17-113 0-111Q17-110 19-96Q4-100-20-97Z", cap);
  path(c, "M-4-98Q21-102 30-95Q19-91-4-94Z", cap);
  line(c, [-5, -106, -4, -101], "#ffffff60", 1.6);
  if (view !== "rear") {
    const offset = view === "side" ? 7 : 0;
    const blink = clip === "idle" && time % 2.8 > 2.6;
    c.save();
    c.translate(offset, 0);
    if (blink) {
      line(c, [-13, -70, -6, -70]);
      line(c, [6, -70, 13, -70]);
    } else {
      ellipse(c, -9, -69, 8, 10, "#fff9e9", "#302d42", 1);
      ellipse(c, 9, -69, 8, 10, "#fff9e9", "#302d42", 1);
      ellipse(c, -8, -68, 4.5, 6, "#302d42", "", 0);
      ellipse(c, 10, -68, 4.5, 6, "#302d42", "", 0);
      ellipse(c, -8, -71, 1.1, 1.7, "#fff7dc", "", 0);
      ellipse(c, 10, -71, 1.1, 1.7, "#fff7dc", "", 0);
    }
    if (p.face === 3) {
      c.beginPath();
      c.arc(0, -51, 7, Math.PI * 1.15, Math.PI * 1.85);
      c.strokeStyle = "#302d42";
      c.lineWidth = 2;
      c.stroke();
    } else if (p.face === 2) {
      path(c, "M-9-54Q0-49 10-55Q8-41 0-43Q-6-43-9-54", "#302d42", "", 0);
    } else {
      c.beginPath();
      c.moveTo(-6, -54);
      c.quadraticCurveTo(0, -48, 7, -54);
      c.lineWidth = 2.2;
      c.strokeStyle = "#302d42";
      c.stroke();
    }
    ellipse(c, -16, -58, 4, 2, "#c96c5555", "", 0);
    ellipse(c, 17, -58, 4, 2, "#c96c5555", "", 0);
    c.restore();
  } else {
    c.fillStyle = "#f6e1b3";
    c.font = "bold 19px Georgia";
    c.textAlign = "center";
    c.fillText(String(variation + 1), 0, -57);
  }
  c.restore();
  limb(c, 24, -62, p.armR, 27, true, false);
  if (clip === "swing" || clip === "ready") {
    c.save();
    const handAngle = (p.armR * Math.PI) / 180;
    c.translate(24 - Math.sin(handAngle) * 27, -62 + Math.cos(handAngle) * 27);
    c.rotate(
      ((clip === "ready" ? -30 : -35 + Math.min(1, time / 0.24) * 170) *
        Math.PI) /
        180,
    );
    path(c, "M-3 0L-5-38Q-9-70-3-78Q1-82 5-77L6-38L3 0Z", "#c89859");
    line(c, [-3, -2, 3, -2], "#41372b", 3);
    for (let j = 0; j < 4; j++)
      line(c, [-3, -6 - j * 4, 3, -7 - j * 4], "#675943", 1.5);
    c.restore();
  }
  c.restore();
}
export function foodFor(team: number, id: number): Food {
  return team === 1
    ? "peanut"
    : (["hotdog", "popcorn", "watermelon"] as Food[])[id % 3];
}
