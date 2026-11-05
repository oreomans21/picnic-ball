import Phaser from "phaser";
import { Ballpark } from "./world";
import { BASES } from "../shared/config";
import { batting, defending, runnerPos } from "../shared/engine";
import type { GameState, Input, Vec } from "../shared/types";
export interface ViewModel {
  state: GameState | null;
  player: number;
  online: boolean;
  aim: Vec;
  selected: number | null;
  pitchKind: "fastball" | "curveball" | "changeup";
  send: (i: Input) => void;
  select: (id: number) => void;
  holding: boolean;
  gallery: boolean;
  sound: (kind: string) => void;
}
export class PicnicScene extends Phaser.Scene {
  vm: ViewModel;
  world!: Ballpark;
  graphics!: Phaser.GameObjects.Graphics;
  labels: Phaser.GameObjects.Text[] = [];
  possessionLabel!: Phaser.GameObjects.Text;
  lastEvent = -1;
  swingAt = -10;
  fps: number[] = [];
  constructor(vm: ViewModel) {
    super("picnic");
    this.vm = vm;
  }
  create() {
    this.world = new Ballpark(document.getElementById("game")!);
    this.graphics = this.add.graphics();
    this.possessionLabel = this.add
      .text(0, 0, "BALL", {
        fontFamily: "Nunito Sans, sans-serif",
        fontSize: "11px",
        fontStyle: "bold",
        color: "#123953",
        backgroundColor: "#ffe365",
        padding: { x: 7, y: 4 },
      })
      .setOrigin(0.5)
      .setVisible(false);
    for (let i = 1; i <= 4; i++)
      this.labels.push(
        this.add
          .text(0, 0, ["", "FIRST", "SECOND", "THIRD", "HOME"][i], {
            fontFamily: "Nunito, sans-serif",
            fontSize: "13px",
            fontStyle: "bold",
            color: "#ffffff",
            backgroundColor: "#153b5c",
            padding: { x: 10, y: 6 },
          })
          .setOrigin(0.5),
      );
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      if (this.vm.holding) return;
      const z = this.world.zone();
      this.vm.aim = {
        x: Math.max(-1.45, Math.min(1.45, (p.x - z.x) / z.rx)),
        y: Math.max(-1.35, Math.min(1.35, (p.y - z.y) / z.ry)),
      };
    });
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => this.down(p));
    const release = () => {
      if (this.vm.holding) {
        this.vm.holding = false;
        this.vm.send({ type: "release" });
      }
    };
    this.input.on("pointerup", release);
    window.addEventListener("pointerup", release);
  }
  down(p: Phaser.Input.Pointer) {
    const v = this.vm,
      s = v.state;
    if (!s || v.gallery) return;
    if (s.phase === "prepare" && defending(s) === v.player) {
      v.holding = true;
      v.send({ type: "hold", kind: v.pitchKind, ...v.aim });
      return;
    }
    if (s.phase === "flight" && batting(s) === v.player && !s.pitch?.swung) {
      this.swingAt = s.t;
      v.send({ type: "swing", ...v.aim, at: v.online ? Date.now() : s.t });
      v.sound("swing");
      return;
    }
    if (s.phase === "live") {
      for (let base = 1; base <= 4; base++) {
        const q = this.world.project(BASES[base]);
        if (Math.hypot(q.x - p.x, q.y - p.y) < 48) {
          if (batting(s) === v.player) {
            const r = s.runners.find(
              (r) => r.id === v.selected && !r.out && !r.scored,
            );
            if (r) v.send({ type: "run", id: r.id, base });
          } else v.send({ type: "throw", base });
          return;
        }
      }
      if (batting(s) === v.player) {
        const r = s.runners
          .filter((r) => !r.out && !r.scored)
          .map((r) => ({ r, q: this.world.project(runnerPos(r), 4) }))
          .filter(({ q }) => Math.hypot(q.x - p.x, q.y - p.y) < 52)[0];
        if (r) v.select(r.r.id);
      }
    }
  }
  update(_time: number, delta: number) {
    if (!this.world) return;
    this.world.resize(this.scale.width, this.scale.height);
    this.fps.push(1000 / delta);
    if (this.fps.length > 600) this.fps.shift();
    const v = this.vm,
      s = v.state;
    this.world.render(v, Math.min(0.1, delta / 1000), this.swingAt);
    const g = this.graphics;
    g.clear();
    this.labels.forEach((l) => l.setVisible(false));
    this.possessionLabel.setVisible(false);
    if (!s || v.gallery) return;
    if (s.event !== this.lastEvent) {
      this.lastEvent = s.event;
      if (s.message.includes("hit") || s.message.includes("Home run"))
        v.sound("hit");
      if (s.message.includes("out")) v.sound("out");
    }
    if (
      (s.phase === "prepare" && defending(s) === v.player) ||
      (s.phase === "flight" && batting(s) === v.player)
    ) {
      const z = this.world.zone();
      g.lineStyle(3, 0xffffff, 0.9);
      g.fillStyle(0x154d74, 0.13);
      g.fillRoundedRect(z.x - z.rx, z.y - z.ry, z.rx * 2, z.ry * 2, 8);
      g.strokeRoundedRect(z.x - z.rx, z.y - z.ry, z.rx * 2, z.ry * 2, 8);
      g.lineStyle(1, 0xffffff, 0.35);
      for (const f of [-1 / 3, 1 / 3]) {
        g.lineBetween(z.x + f * z.rx, z.y - z.ry, z.x + f * z.rx, z.y + z.ry);
        g.lineBetween(z.x - z.rx, z.y + f * z.ry, z.x + z.rx, z.y + f * z.ry);
      }
      const x = z.x + v.aim.x * z.rx,
        y = z.y + v.aim.y * z.ry;
      g.lineStyle(4, 0xffcf45);
      g.strokeCircle(x, y, 21);
      g.lineBetween(x - 30, y, x - 15, y);
      g.lineBetween(x + 15, y, x + 30, y);
      g.lineBetween(x, y - 30, x, y - 15);
      g.lineBetween(x, y + 15, x, y + 30);
    }
    if (s.phase === "live") {
      const flash = s.t - this.world.contactAt;
      if (flash < 0.2) {
        const p = this.world.project({ x: 0, y: 0 }, 4);
        g.lineStyle(4, 0xffef9b, 1 - flash / 0.2);
        for (let i = 0; i < 8; i++) {
          const a = (i * Math.PI) / 4,
            r = 22 + flash * 120;
          g.lineBetween(
            p.x + Math.cos(a) * r,
            p.y + Math.sin(a) * r,
            p.x + Math.cos(a) * (r + 10),
            p.y + Math.sin(a) * (r + 10),
          );
        }
      }
      const bat = batting(s) === v.player,
        r = s.runners.find((r) => r.id === v.selected && !r.out && !r.scored);
      if (s.ball.holder !== null) {
        const f = s.fielders[s.ball.holder],
          q = this.world.project(f),
          label = this.world.project(f, 10);
        g.lineStyle(4, 0x63e7d0);
        g.strokeEllipse(q.x, q.y, 64, 25);
        this.possessionLabel.setPosition(label.x, label.y).setVisible(true);
      }
      for (let n = 1; n <= 4; n++) {
        if (
          bat ? !r || r.retouch || n < Math.max(1, r.p) : s.ball.holder === null
        )
          continue;
        const p = this.world.project(BASES[n]);
        this.labels[n - 1].setPosition(p.x, p.y - 26).setVisible(true);
        g.lineStyle(3, 0xffdc55);
        g.strokeEllipse(p.x, p.y, 54, 26);
      }
      for (const runner of s.runners) {
        if (runner.out || runner.scored) continue;
        const q = this.world.project(runnerPos(runner));
        g.lineStyle(
          runner.id === v.selected ? 4 : 2,
          runner.retouch
            ? 0xff6b5c
            : runner.id === v.selected
              ? 0xffdc55
              : 0xffffff,
          0.9,
        );
        g.strokeEllipse(q.x, q.y, runner.id === v.selected ? 60 : 43, 22);
        if (runner.target !== null) {
          const to = this.world.project(BASES[runner.target]);
          g.lineStyle(2, 0xffdc55, 0.8);
          g.lineBetween(q.x, q.y, to.x, to.y);
        }
      }
    }
  }
}
