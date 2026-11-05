import "./style.css";
import Phaser from "phaser";
import { PicnicScene, type ViewModel } from "./scene";
import { drawCharacter, foodFor, CLIPS, type Food } from "./art";
import {
  batting,
  defending,
  createGame,
  prep,
  input,
  tick,
  begin,
  hit,
} from "../shared/engine";
import { CFG, PITCHES } from "../shared/config";
import type {
  GameState,
  Input,
  ServerMessage,
  PitchKind,
  Clip,
} from "../shared/types";
import { decode } from "../shared/wire";
const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (ch) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        ch
      ]!,
  );
let ws: WebSocket | null = null,
  seq = 0,
  room = "",
  token = "",
  offset = 0,
  rtt = 0,
  lastSnapshot = 0,
  prev: GameState | null = null,
  latest: GameState | null = null,
  practice = false,
  lesson = 0,
  lessonDone = false,
  botAt = 0,
  serverClock = 0,
  disconnected = false,
  retryTimer: ReturnType<typeof setTimeout> | null = null,
  soundOn = false,
  audio: AudioContext | null = null;
let uiKey = "",
  boardKey = "",
  noticeAt = 0,
  seenEvent = -1,
  selectedAt = 0,
  retryCount = 0,
  connectionStarted = 0;
const vm: ViewModel = {
  state: null,
  player: 0,
  online: false,
  aim: { x: 0, y: 0 },
  selected: null,
  pitchKind: "fastball",
  send,
  select: (id) => {
    vm.selected = id;
    uiKey = "";
    selectedAt = performance.now();
  },
  holding: false,
  gallery: false,
  sound: (kind) => {
    if (!soundOn) return;
    audio ??= new AudioContext();
    const a = audio,
      o = a.createOscillator(),
      g = a.createGain();
    o.type = "triangle";
    o.frequency.setValueAtTime(
      kind === "hit" ? 460 : kind === "out" ? 180 : 280,
      a.currentTime,
    );
    o.frequency.exponentialRampToValueAtTime(
      kind === "out" ? 90 : 110,
      a.currentTime + 0.16,
    );
    g.gain.setValueAtTime(0.045, a.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + 0.18);
    o.connect(g);
    g.connect(a.destination);
    o.start();
    o.stop(a.currentTime + 0.2);
  },
};
const scene = new PicnicScene(vm);
const game = new Phaser.Game({
  type: Phaser.CANVAS,
  parent: "game",
  width: innerWidth,
  height: innerHeight,
  transparent: true,
  scene,
  scale: { mode: Phaser.Scale.RESIZE },
  render: { antialias: true, roundPixels: false },
  audio: { noAudio: true },
});
const endpoint = $<HTMLInputElement>("endpoint"),
  url = new URL(location.href);
endpoint.value =
  url.searchParams.get("server") ||
  ((location.hostname === "localhost" || location.hostname === "127.0.0.1") &&
  location.port === "5173"
    ? `ws://${location.hostname}:8787`
    : `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}`);
$<HTMLInputElement>("code").value = url.searchParams.get("room") || "";
if (url.searchParams.has("room")) $("join-row").hidden = false;
function send(i: Input) {
  if (vm.online) {
    if (ws?.readyState === WebSocket.OPEN)
      ws.send(JSON.stringify({ type: "input", seq: ++seq, input: i }));
  } else if (vm.state) {
    const ok = input(vm.state, vm.player, i);
    if (ok && i.type === "release" && lesson === 3) {
      lessonDone = true;
      renderTutorial();
    }
    if (ok && i.type === "throw" && lesson === 2) {
      lessonDone = true;
      renderTutorial();
    }
  }
}
function toast(message: string) {
  $("notice").textContent = message;
  $("notice").classList.add("visible");
  noticeAt = performance.now();
}
function error(message: string) {
  $("lobby-error").textContent = message;
  toast(message);
}
function leave() {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
  vm.online = false;
  ws?.close();
  ws = null;
  vm.state = null;
  latest = null;
  prev = null;
  room = "";
  token = "";
  sessionStorage.removeItem("picnic-session");
  practice = false;
  vm.selected = null;
  $("lobby").hidden = false;
  $("lobby-stamp").hidden = false;
  $("controls").hidden = true;
  $("scoreboard").hidden = true;
  $("tutorial").hidden = true;
  $("overlay").hidden = true;
  $("role-label").hidden = true;
  $("room-info").hidden = true;
  uiKey = "";
  $("connection").textContent = "The practice field is open";
  for (const id of ["practice", "name", "create", "join-toggle"])
    $(id).hidden = false;
}
function connect(join: boolean, reconnecting = false) {
  const address = endpoint.value.trim();
  try {
    const u = new URL(address);
    if (
      !["ws:", "wss:"].includes(u.protocol) ||
      (location.protocol === "https:" && u.protocol !== "wss:")
    )
      throw Error();
  } catch {
    error(
      location.protocol === "https:"
        ? "Enter a secure wss:// game server address under Multiplayer server."
        : "Enter a ws:// or wss:// game server address.",
    );
    $<HTMLDetailsElement>("server-settings").open = true;
    return;
  }
  practice = false;
  vm.online = true;
  disconnected = false;
  $("lobby-error").textContent = "";
  $("connection").textContent = reconnecting
    ? "Reconnecting…"
    : "Connecting to the ballpark…";
  const socket = new WebSocket(address);
  ws = socket;
  socket.onopen = () => {
    seq = 0;
    const code = $<HTMLInputElement>("code").value.trim().toUpperCase();
    socket.send(
      JSON.stringify(
        join
          ? {
              type: "join",
              name: $<HTMLInputElement>("name").value,
              code: reconnecting ? room : code,
              ...(reconnecting ? { token } : {}),
            }
          : { type: "create", name: $<HTMLInputElement>("name").value },
      ),
    );
  };
  socket.onmessage = (e) => {
    const m = decode(e.data);
    if (m.type === "welcome") {
      retryCount = 0;
      connectionStarted = 0;
      room = m.code;
      token = m.token;
      vm.player = m.player;
      latest = m.state;
      prev = m.state;
      vm.state = m.state;
      lastSnapshot = performance.now();
      sessionStorage.setItem(
        "picnic-session",
        JSON.stringify({ code: room, token, endpoint: address }),
      );
      uiKey = "";
      toast("Connected. Welcome to the ballpark!");
    } else if (m.type === "state") {
      prev = latest;
      latest = m.state;
      lastSnapshot = performance.now();
      serverClock = m.now;
      if (latest.phase === "live" && vm.state?.phase !== "live") {
        const r = latest.runners.find((r) => r.origin === 0 && !r.out);
        if (r) vm.selected = r.id;
      }
      vm.state = structuredClone(m.state);
    } else if (m.type === "pong") {
      rtt = Date.now() - m.sent;
      const measured = m.now - (m.sent + rtt / 2);
      offset = offset === 0 ? measured : offset * 0.7 + measured * 0.3;
      socket.send(JSON.stringify({ type: "clock", offset, rtt }));
    } else if (m.message.startsWith("MATCH_LOST:")) {
      const message = m.message.replace("MATCH_LOST: ", "");
      leave();
      error(message);
      $("overlay").hidden = false;
      $("overlay").innerHTML =
        `<div class="modal-paper"><span class="eyebrow">A FRESH START</span><h2>The picnic packed up.</h2><p>${escape(message)}</p><button id="lost-new" class="primary">Create a new game</button><button id="lost-back">Back to clubhouse</button></div>`;
      $("lost-new").onclick = () => {
        $("overlay").hidden = true;
        connect(false);
      };
      $("lost-back").onclick = () => {
        $("overlay").hidden = true;
      };
    } else {
      error(m.message);
      if (!token) {
        vm.online = false;
        socket.close();
      }
    }
  };
  socket.onerror = () => {};
  socket.onclose = () => {
    if (ws !== socket || !vm.online) return;
    disconnected = true;
    connectionStarted ||= Date.now();
    if (Date.now() - connectionStarted > 125000) {
      vm.online = false;
      error(
        "The server is still unavailable. Retry by creating or joining a room. Practice remains available.",
      );
      return;
    }
    retryCount++;
    const wait = Math.min(8000, 1500 * 1.6 ** Math.min(retryCount, 5));
    const message = token
      ? "Connection lost — reconnecting to your room…"
      : "Waking up the free ballpark. This can take about a minute. Retrying automatically…";
    $("connection").textContent = message;
    error(message);
    retryTimer = setTimeout(
      () => connect(token && room ? true : join, !!(token && room)),
      wait,
    );
  };
}
setInterval(() => {
  if (ws?.readyState === WebSocket.OPEN)
    ws.send(JSON.stringify({ type: "ping", sent: Date.now() }));
}, 1000);
$("create").onclick = () => connect(false);
$("join").onclick = () => connect(true);
$("join-toggle").onclick = () => {
  $("join-row").hidden = !$("join-row").hidden;
};
$("save-server").onclick = () => {
  localStorage.setItem("picnic-server", endpoint.value.trim());
  toast("Server address saved.");
};
function startPractice() {
  leave();
  practice = true;
  lesson = 0;
  lessonDone = false;
  vm.player = 0;
  vm.online = false;
  const s = createGame(["You · Picnic Club", "Practice · Peanuts"], 1);
  s.players.forEach((p) => {
    p.connected = true;
    p.ready = true;
  });
  begin(s);
  vm.state = s;
  botAt = 0;
  $("lobby").hidden = true;
  $("lobby-stamp").hidden = true;
  $("tutorial").hidden = false;
  uiKey = "";
  renderTutorial();
  $("connection").textContent =
    "Practice · local simulation · no connection needed";
}
const lessons = [
  {
    title: "Meet your sweet spot",
    text: "Move the red aiming ring toward the ball. Click once as it reaches the box. There’s just one swing — timing and aim do the work.",
    action: "Make contact to continue",
  },
  {
    title: "Your feet, your decision",
    text: "Your batter is selected. Click FIRST on the field or below to run. Runners stop at your destination. Stop pauses them; Return sends them back.",
    action: "Reach first base to continue",
  },
  {
    title: "Make the throw",
    text: "A ground ball is coming. Fielders chase and collect it for you. Once a fielder has the ball, click FIRST to try a force out.",
    action: "Throw to a base to continue",
  },
  {
    title: "Serve up a pitch",
    text: "Choose a pitch. Aim inside the box for a strike. Hold the mouse on the field, then release near the green mark. More meter means more speed — and more risk.",
    action: "Deliver a pitch to continue",
  },
  {
    title: "You’re ready for the picnic",
    text: "Three strikes: batter out. Four balls: first base. Three outs: switch sides. On a caught fly, return before advancing. After 8 idle seconds, you get a 5-second warning; runners left between bases are then out.",
    action: "Finish practice",
  },
];
function renderTutorial() {
  if (!practice) return;
  const l = lessons[lesson];
  $("tutorial").innerHTML =
    `<small>PRACTICE · ${lesson + 1} OF 5</small><h3>${l.title}</h3><p>${l.text}</p><button id="lesson-next" ${!lessonDone && lesson < 4 ? "disabled" : ""}>${lessonDone && lesson < 4 ? "Next lesson →" : l.action}</button><button id="practice-exit">Back to the clubhouse</button>`;
  $("lesson-next").onclick = nextLesson;
  $("practice-exit").onclick = leave;
}
function nextLesson() {
  if (lesson < 4 && !lessonDone) return;
  lesson++;
  lessonDone = false;
  const s = vm.state!;
  if (lesson === 1) {
    s.runners = [];
    hit(s, 0.25, 0.15, 3);
    vm.selected = s.runners[0].id;
  }
  if (lesson === 2) {
    s.half = 1;
    s.runners = [];
    s.balls = 0;
    s.strikes = 0;
    s.outs = 0;
    prep(s);
    s.phase = "live";
    s.ball = {
      ...s.ball,
      x: 2,
      y: 27,
      z: 0,
      vx: 2,
      vy: 4,
      vz: 0,
      holder: null,
      air: false,
      foul: false,
    };
    s.lastActivity = s.t;
    s.runners = [
      {
        id: 91,
        p: 0,
        origin: 0,
        target: 1,
        out: false,
        scored: false,
        retouch: false,
        lastBase: 0,
      },
    ];
  }
  if (lesson === 3) {
    s.half = 1;
    s.runners = [];
    s.outs = 0;
    prep(s);
  }
  if (lesson === 4) {
    lessonDone = true;
    localStorage.setItem("picnic-practised", "yes");
  }
  if (lesson >= 5) {
    leave();
    return;
  }
  uiKey = "";
  renderTutorial();
}
$("practice").onclick = startPractice;
$("practice-nav").onclick = startPractice;
$("help-nav").onclick = () => $<HTMLDialogElement>("help").showModal();
$("help")
  .querySelector(".close")!
  .addEventListener("click", () => $<HTMLDialogElement>("help").close());
$("replay-tutorial").onclick = () => {
  $<HTMLDialogElement>("help").close();
  startPractice();
};
$("sound").onclick = () => {
  soundOn = !soundOn;
  $("sound").textContent = `Sound ${soundOn ? "on" : "off"}`;
  $("sound").setAttribute("aria-pressed", String(soundOn));
  if (soundOn) vm.sound("hit");
};
function renderLobby(s: GameState) {
  $("lobby").hidden = false;
  $("lobby-stamp").hidden = true;
  for (const id of ["practice", "name", "create", "join-toggle", "join-row"])
    $(id).hidden = true;
  $("room-info").hidden = false;
  $("room-info").innerHTML =
    `<h2 style="font-family:Fraunces,Georgia;font-size:24px;margin:18px 0 8px">Your picnic is almost ready.</h2><p class="waiting-copy">Share this room code with your friend.</p><div class="room-code">${room}</div>${s.players.map((p, i) => `<div class="player-status"><b>${escape(p.name)}${i === vm.player ? " (you)" : ""}</b><span>${p.connected ? (p.ready ? "Ready" : "Connected") : "Waiting…"}</span></div>`).join("")}<div class="ready-row"><button id="ready" class="primary" ${s.readyFor[vm.player] ? "disabled" : ""}>${s.readyFor[vm.player] ? "You’re ready" : "Ready to play"}</button><button id="copy-link">Copy invite</button></div><button id="leave-room" style="margin-top:12px">Leave room</button>`;
  $("ready").onclick = () => send({ type: "ready" });
  $("copy-link").onclick = async () => {
    const u = new URL(location.href);
    u.searchParams.set("room", room);
    u.searchParams.set("server", endpoint.value.trim());
    try {
      await navigator.clipboard.writeText(u.href);
      toast("Invitation link copied.");
    } catch {
      toast(`Room ${room}. Share this code and the server address.`);
    }
  };
  $("leave-room").onclick = leave;
}
function updateUI() {
  const s = vm.state;
  if (!s) return;
  const bat = batting(s) === vm.player;
  const runners = s.runners.filter((r) => !r.out && !r.scored);
  if (
    s.phase === "live" &&
    bat &&
    (!vm.selected || !runners.some((r) => r.id === vm.selected))
  ) {
    vm.selected =
      runners.find((r) => r.origin === 0)?.id ?? runners[0]?.id ?? null;
  }
  const r = runners.find((r) => r.id === vm.selected);
  const key = [
    s.phase,
    s.event,
    s.home,
    s.half,
    s.inning,
    s.score.join(),
    s.balls,
    s.strikes,
    s.outs,
    s.readyFor.join(),
    s.players.map((p) => p.connected + " " + p.ready),
    runners.map((r) => `${r.id}:${r.target}:${r.retouch}:${Math.ceil(r.p)}`),
    vm.selected,
    s.ball.holder,
    s.ball.throwTo,
    vm.pitchKind,
    lesson,
    lessonDone,
  ].join("|");
  $("scoreboard").hidden = s.phase === "waiting";
  $("role-label").hidden = s.phase === "waiting";
  $("role-label").textContent =
    `${practice ? "PRACTICE · " : ""}${bat ? "YOU’RE BATTING" : "YOU’RE DEFENDING"}${room ? " · " + room : ""}`;
  const board = `<div class="scores"><div class="team ${batting(s) === 0 ? "bats" : ""}"><span>${escape(s.players[0].name)}</span><b>${s.score[0]}</b></div><div class="inning">${s.half === 0 ? "TOP" : "BOTTOM"}<strong>${s.inning}${s.inning === 1 ? "st" : s.inning === 2 ? "nd" : s.inning === 3 ? "rd" : "th"} inning</strong></div><div class="team ${batting(s) === 1 ? "bats" : ""}"><b>${s.score[1]}</b><span>${escape(s.players[1].name)}</span></div></div><div class="counts"><span>BALLS <strong>${s.balls}</strong> / 4</span><span>STRIKES <strong>${s.strikes}</strong> / 3</span><span>OUTS <strong>${s.outs}</strong> / 3</span><span>BASES <strong>${[1, 2, 3].map((b) => (runners.some((r) => Math.abs(r.p - b) < 0.02) ? b : "–")).join(" · ")}</strong></span></div>`;
  if (board !== boardKey) {
    $("scoreboard").innerHTML = board;
    boardKey = board;
  }
  if (s.event !== seenEvent) {
    seenEvent = s.event;
    toast(
      s.phase === "prepare" || s.phase === "flight"
        ? bat
          ? "Aim at the ball and click to swing."
          : "Aim inside the box. Hold, then release near the green."
        : s.phase === "live" && bat && s.message.startsWith("Ball secured")
          ? "Choose a runner, then click a base to run."
          : s.message,
    );
  }
  if (performance.now() - noticeAt > 6500)
    $("notice").classList.remove("visible");
  if (vm.online)
    $("connection").textContent = disconnected
      ? "Reconnecting…"
      : rtt > 150
        ? `Connection warning · ${Math.round(rtt)} ms RTT (supported: ≤150 ms)`
        : `Connected · ${Math.round(rtt)} ms · ${s.players.every((p) => p.connected) ? "Both players here" : "Waiting for your friend"}`;
  $("meter").hidden = !(
    vm.holding &&
    s.phase === "prepare" &&
    s.pitch?.holdAt !== null
  );
  if (!$("meter").hidden && s.pitch) {
    const u = ((s.t - s.pitch.holdAt!) % 1.5) / 1.5;
    ($("meter").querySelector("b") as HTMLElement).style.left = `${u * 100}%`;
  }
  if (s.phase === "prepare" && !bat) {
    const e = $("pitch-clock");
    if (e) e.textContent = `${Math.max(0, Math.ceil(s.until - s.t))}s to pitch`;
  }
  if (s.phase === "live" && s.t - s.lastActivity > 8)
    toast(
      `Keep the play moving! ${Math.max(0, Math.ceil(13 - (s.t - s.lastActivity)))} seconds before runners between bases are out.`,
    );
  if (key === uiKey) return;
  uiKey = key;
  if (s.phase === "waiting") {
    renderLobby(s);
    return;
  }
  $("lobby").hidden = true;
  $("lobby-stamp").hidden = true;
  $("controls").hidden = false;
  $("overlay").hidden = true;
  if (s.phase === "prepare") {
    $("controls").innerHTML = bat
      ? `<div class="control-heading">Your turn at the plate</div><p class="control-note">Aim at the ball and click once to swing. Wait for your opponent’s pitch.</p>`
      : `<div class="control-heading">Pick your pitch <span id="pitch-clock" class="count-clock">${Math.ceil(s.until - s.t)}s to pitch</span></div><div class="button-row">${Object.entries(
          PITCHES,
        )
          .map(
            ([kind, p]) =>
              `<button data-pitch="${kind}" class="${kind === vm.pitchKind ? "selected" : ""}" ${s.pitch ? "disabled" : ""}>${kind[0].toUpperCase() + kind.slice(1)}<small>${p.description}</small></button>`,
          )
          .join(
            "",
          )}</div><p class="control-note">Aim inside the box. Hold on the field, then release near the green mark.</p>`;
    document.querySelectorAll<HTMLElement>("[data-pitch]").forEach(
      (b) =>
        (b.onclick = () => {
          vm.pitchKind = b.dataset.pitch as PitchKind;
          uiKey = "";
        }),
    );
  } else if (s.phase === "flight")
    $("controls").innerHTML =
      `<div class="control-heading">${bat ? "Aim. Time it. Swing!" : "Watch the plate…"}</div><p class="control-note">${bat ? "Aim at the ball and click to swing. One click, one swing." : "Fielders will collect automatically. You decide where to throw."}</p>`;
  else if (s.phase === "live") {
    if (bat) {
      $("controls").innerHTML =
        `<div class="control-heading">${r?.retouch ? "Return to tag up before advancing" : r?.origin === 0 && r.p === 0 ? "Click first base to run!" : "Pick a runner, then a destination"}<small>Manual running</small></div><div class="runner-row">${runners.map((r, i) => `<button data-runner="${r.id}" class="${r.id === vm.selected ? "selected" : ""}">Runner ${i + 1}${r.origin === 0 ? " · batter" : ""}</button>`).join("")}</div><div class="button-row">${[1, 2, 3, 4].map((b) => `<button data-base="${b}" ${!r || r.retouch || b < Math.max(1, r.p) ? "disabled" : ""}>${["", "First", "Second", "Third", "Home"][b]}${r?.target === b ? " ←" : ""}</button>`).join("")}</div><div class="runner-row" style="margin:8px 0 0"><button id="stop-runner" ${!r ? "disabled" : ""}>Stop</button><button id="return-runner" ${!r ? "disabled" : ""}>Return</button><button id="all-advance">All advance one base</button></div>`;
      document
        .querySelectorAll<HTMLElement>("[data-runner]")
        .forEach(
          (b) => (b.onclick = () => vm.select(Number(b.dataset.runner))),
        );
      document
        .querySelectorAll<HTMLElement>("[data-base]")
        .forEach(
          (b) =>
            (b.onclick = () =>
              r &&
              send({ type: "run", id: r.id, base: Number(b.dataset.base) })),
        );
      $("stop-runner").onclick = () => r && send({ type: "stop", id: r.id });
      $("return-runner").onclick = () =>
        r && send({ type: "return", id: r.id });
      $("all-advance").onclick = () => send({ type: "advance" });
    } else {
      $("controls").innerHTML =
        `<div class="control-heading">${s.ball.holder !== null ? "Ball secured. Where’s the play?" : s.ball.throwTo !== null ? "Throw committed…" : "Your fielders are on it…"}</div><div class="button-row">${[1, 2, 3, 4].map((b) => `<button data-throw="${b}" ${s.ball.holder === null ? "disabled" : ""}>${["", "First", "Second", "Third", "Home"][b]}<small>${b === 1 ? "Get the batter out" : b === 4 ? "Protect a run" : "Stop an advancing runner"}</small></button>`).join("")}</div><p class="control-note">Click a highlighted base to throw. Force outs and tags happen automatically.</p>`;
      document
        .querySelectorAll<HTMLElement>("[data-throw]")
        .forEach(
          (b) =>
            (b.onclick = () =>
              send({ type: "throw", base: Number(b.dataset.throw) })),
        );
    }
  } else if (s.phase === "finished") {
    $("controls").hidden = true;
    $("overlay").hidden = false;
    $("overlay").innerHTML =
      `<div class="modal-paper"><span class="eyebrow">THAT’S A BALL GAME</span><h2>${s.winner === vm.player ? "Sweet victory!" : "Good game, snack."}</h2><p>${escape(s.message)}</p><h2>${s.score[0]} — ${s.score[1]}</h2><p>${escape(s.players[s.winner ?? 0].name)} wins.</p><button id="rematch" class="primary" ${s.readyFor[vm.player] ? "disabled" : ""}>${s.readyFor[vm.player] ? "Waiting for opponent…" : "Rematch · swap sides"}</button><button id="new-room">Back to clubhouse</button></div>`;
    $("rematch").onclick = () => send({ type: "rematch" });
    $("new-room").onclick = leave;
  } else if (s.phase === "paused") {
    $("controls").hidden = true;
    $("overlay").hidden = false;
    $("overlay").innerHTML =
      `<div class="modal-paper"><span class="eyebrow">HOLD THAT THOUGHT</span><h2>Picnic intermission.</h2><p>${escape(s.message)}</p><p>Your game stays frozen while your friend reconnects (up to 60 seconds). Both players get a 3-second countdown before resuming.</p></div>`;
  } else
    $("controls").innerHTML =
      `<div class="control-heading">${s.phase === "countdown" ? "Batter up!" : s.phase === "side" ? "Switching sides" : "A moment at the plate"}</div><p class="control-note">${escape(s.message)}</p>`;
}
let last = performance.now(),
  acc = 0;
function loop(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (practice && vm.state) {
    const s = vm.state;
    acc += dt;
    while (acc >= 1 / 60) {
      tick(s);
      acc -= 1 / 60;
    }
    if (lesson === 0 && s.phase === "live" && !lessonDone) {
      lessonDone = true;
      renderTutorial();
    }
    if (
      lesson === 1 &&
      s.runners.some((r) => r.origin === 0 && r.p >= 1) &&
      !lessonDone
    ) {
      lessonDone = true;
      renderTutorial();
    }
    if (s.phase === "prepare" && batting(s) === 0 && lesson < 2) {
      if (!s.pitch) {
        input(s, 1, { type: "hold", kind: "fastball", x: 0, y: 0 });
        botAt = s.t + 1.02;
      } else if (s.t >= botAt) input(s, 1, { type: "release" });
    }
    if (
      s.phase === "live" &&
      defending(s) === 1 &&
      s.ball.holder !== null &&
      s.t - s.lastActivity > 1.35 &&
      lesson !== 1
    )
      input(s, 1, { type: "throw", base: 1 });
    if (lesson === 1 && lessonDone && s.phase === "live") s.lastActivity = s.t; // allow reading the completed tutorial step
  } else if (vm.online && latest && vm.state) {
    const s = structuredClone(latest);
    if (!["paused", "waiting", "finished"].includes(s.phase))
      s.t += Math.min(0.1, (now - lastSnapshot) / 1000);
    if (prev && s.phase === "live" && prev.phase === "live") {
      const a = Math.min(1, (now - lastSnapshot) / 50);
      s.fielders.forEach((f, i) => {
        const p = prev!.fielders[i];
        f.x = p.x + (f.x - p.x) * a;
        f.y = p.y + (f.y - p.y) * a;
      });
      s.runners.forEach((r) => {
        const p = prev!.runners.find((x) => x.id === r.id);
        if (p) r.p = p.p + (r.p - p.p) * a;
      });
      if (
        s.ball.throwTo === prev.ball.throwTo &&
        s.ball.holder === prev.ball.holder
      ) {
        s.ball.x = prev.ball.x + (s.ball.x - prev.ball.x) * a;
        s.ball.y = prev.ball.y + (s.ball.y - prev.ball.y) * a;
        s.ball.z = prev.ball.z + (s.ball.z - prev.ball.z) * a;
      }
    }
    vm.state = s;
  }
  updateUI();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
let galleryFrame = 0;
function openGallery() {
  vm.gallery = true;
  const div = document.createElement("section");
  div.id = "gallery";
  div.innerHTML = `<button id="close-gallery" class="close" aria-label="Close animation studio">×</button><span class="eyebrow">THE ART DEPARTMENT</span><h2>Meet the starting lineup.</h2><p>Articulated vector clips · event markers share the server timeline · four foods, three views, nine identifying caps.</p><div class="gallery-toolbar"><label>Character <select id="gallery-food"><option>hotdog</option><option>popcorn</option><option>watermelon</option><option>peanut</option></select></label><label>View <select id="gallery-view"><option>front</option><option>rear</option><option>side</option></select></label><label>Speed <select id="gallery-speed"><option value="1">1×</option><option value="0.25">¼× slow motion</option><option value="0">Pause</option></select></label></div><div class="gallery-grid">${Object.entries(
    CLIPS,
  )
    .map(
      ([name, spec]) =>
        `<article class="clip-card"><canvas width="240" height="200" data-clip="${name}"></canvas><strong>${name}</strong><small>${spec.duration}s · ${spec.loop ? "loops" : "one shot"} · ${Object.keys(spec.events).join(", ") || "no event"}</small><button data-replay="${name}">Replay clip</button></article>`,
    )
    .join("")}</div>`;
  $("game-shell").append(div);
  let t = 0,
    then = performance.now();
  const starts: Record<string, number> = {};
  div.querySelectorAll<HTMLElement>("[data-replay]").forEach(
    (b) =>
      (b.onclick = () => {
        starts[b.dataset.replay!] = t;
      }),
  );
  function frame(now: number) {
    t +=
      ((now - then) / 1000) *
      Number($<HTMLSelectElement>("gallery-speed").value);
    then = now;
    div.querySelectorAll<HTMLCanvasElement>("canvas").forEach((canvas) => {
      const c = canvas.getContext("2d")!;
      c.clearRect(0, 0, 240, 200);
      const clip = canvas.dataset.clip as Clip;
      const spec = CLIPS[clip];
      drawCharacter(
        c,
        120,
        175,
        1.2,
        $<HTMLSelectElement>("gallery-food").value as Food,
        clip,
        Math.max(
          0,
          (t - (starts[clip] || 0)) % (spec.duration + (!spec.loop ? 0.4 : 0)),
        ),
        $<HTMLSelectElement>("gallery-view").value as "front",
        0,
        true,
      );
    });
    galleryFrame = requestAnimationFrame(frame);
  }
  galleryFrame = requestAnimationFrame(frame);
  $("close-gallery").onclick = () => {
    cancelAnimationFrame(galleryFrame);
    div.remove();
    vm.gallery = false;
  };
}
$("gallery-nav").onclick = () => {
  if (!vm.gallery) openGallery();
};
const menuButton = document.createElement("button");
menuButton.id = "menu-toggle";
menuButton.textContent = "Menu";
menuButton.setAttribute("aria-expanded", "false");
document.querySelector("header")!.prepend(menuButton);
menuButton.onclick = () => {
  const open = document.querySelector("header")!.classList.toggle("menu-open");
  menuButton.setAttribute("aria-expanded", String(open));
};
document.querySelectorAll("nav button").forEach((b) =>
  b.addEventListener("click", () => {
    document.querySelector("header")!.classList.remove("menu-open");
    menuButton.setAttribute("aria-expanded", "false");
  }),
);
// Explicit QA bridge: read-only game data and artwork rendering, no outcome mutation online.
(window as any).__picnic = {
  get state() {
    return structuredClone(vm.state);
  },
  get fps() {
    const f = scene.fps;
    return { mean: f.reduce((a, b) => a + b, 0) / f.length, samples: f.length };
  },
  get player() {
    return vm.player;
  },
  get aim() {
    return vm.aim;
  },
  get zone() {
    return scene.world?.zone();
  },
  project: (p: { x: number; y: number }) => scene.world.project(p),
  renderArt: drawCharacter,
  clips: CLIPS,
};
const prior = sessionStorage.getItem("picnic-session");
if (prior) {
  try {
    const saved = JSON.parse(prior);
    if (
      url.searchParams.get("room") === saved.code ||
      !url.searchParams.has("room")
    ) {
      room = saved.code;
      token = saved.token;
      endpoint.value = saved.endpoint;
      connect(true, true);
    }
  } catch {
    /* invalid saved state is ignored */
  }
}
