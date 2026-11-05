import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { drawCharacter, foodFor, CLIPS, type Food } from "./art";
import { BASES, FIELDERS } from "../shared/config";
import { ballAt, batting, defending, runnerPos } from "../shared/engine";
import type { Clip, GameState, Vec } from "../shared/types";
import type { ViewModel } from "./scene";
type Actor = {
  mesh: THREE.Mesh;
  shadow: THREE.Mesh;
  canvas: HTMLCanvasElement;
  texture: THREE.CanvasTexture;
  last: number;
};
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
export class Ballpark {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(47, 1, 0.2, 700);
  renderer: THREE.WebGLRenderer;
  actors = new Map<string, Actor>();
  ball: THREE.Mesh;
  ballShadow: THREE.Mesh;
  markers: THREE.Mesh[] = [];
  time = 0;
  wide = 0;
  lastLive = false;
  contactAt = -10;
  dust: THREE.Mesh[] = [];
  width = 0;
  height = 0;
  private grass = new THREE.MeshToonMaterial({ color: "#70b83d" });
  private dirt = new THREE.MeshToonMaterial({ color: "#df9452" });
  private white = new THREE.MeshToonMaterial({ color: "#fff9ee" });
  private shadowTexture: THREE.CanvasTexture;
  constructor(parent: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.needsUpdate = true;
    this.renderer.domElement.id = "world-3d";
    parent.prepend(this.renderer.domElement);
    this.scene.background = new THREE.Color("#79cafa");
    this.scene.fog = new THREE.Fog("#a9def0", 155, 350);
    this.scene.add(new THREE.HemisphereLight("#e3f5ff", "#7b9847", 2.1));
    const sun = new THREE.DirectionalLight("#fff1cf", 2.8);
    sun.position.set(-45, 85, -32);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, {
      left: -100,
      right: 100,
      top: 120,
      bottom: -60,
      near: 1,
      far: 260,
    });
    sun.shadow.bias = -0.001;
    this.scene.add(sun);
    this.scene.add(sun.target);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 64;
    const c = canvas.getContext("2d")!,
      g = c.createRadialGradient(32, 32, 3, 32, 32, 31);
    g.addColorStop(0, "rgba(35,48,44,.38)");
    g.addColorStop(0.55, "rgba(35,48,44,.2)");
    g.addColorStop(1, "rgba(35,48,44,0)");
    c.fillStyle = g;
    c.fillRect(0, 0, 64, 64);
    this.shadowTexture = new THREE.CanvasTexture(canvas);
    this.environment();
    this.mergeScenery();
    this.ball = new THREE.Mesh(
      new THREE.SphereGeometry(0.65, 16, 12),
      this.white,
    );
    this.ball.castShadow = false;
    this.scene.add(this.ball);
    this.ballShadow = this.shadow(2.8);
    for (let i = 0; i < 4; i++) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(2.8, 3.15, 40),
        new THREE.MeshBasicMaterial({
          color: "#ffe451",
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.85,
        }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(-BASES[i + 1].x, 0.19, BASES[i + 1].y);
      ring.visible = false;
      this.scene.add(ring);
      this.markers.push(ring);
    }
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.4, 0),
        new THREE.MeshBasicMaterial({
          color: "#f5c48a",
          transparent: true,
          opacity: 0,
        }),
      );
      this.scene.add(m);
      this.dust.push(m);
    }
    this.resize(parent.clientWidth, parent.clientHeight);
  }
  mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    this.scene.add(m);
    return m;
  }
  box(
    w: number,
    h: number,
    d: number,
    color: string,
    x: number,
    y: number,
    z: number,
  ) {
    return this.mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshToonMaterial({ color }),
      x,
      y,
      z,
    );
  }
  groundShape(points: number[][], material: THREE.Material, height: number) {
    const shape = new THREE.Shape();
    points.forEach(([x, z], i) =>
      i ? shape.lineTo(x, -z) : shape.moveTo(x, -z),
    );
    shape.closePath();
    const geo = new THREE.ShapeGeometry(shape);
    geo.rotateX(-Math.PI / 2);
    const m = this.mesh(geo, material, 0, height, 0);
    m.castShadow = false;
    return m;
  }
  beam(a: THREE.Vector3, b: THREE.Vector3, r: number, color: string) {
    const delta = b.clone().sub(a),
      m = this.mesh(
        new THREE.CylinderGeometry(r, r, delta.length(), 8),
        new THREE.MeshToonMaterial({ color }),
      );
    m.position.copy(a.clone().add(b).multiplyScalar(0.5));
    m.quaternion.setFromUnitVectors(V(0, 1, 0), delta.normalize());
    return m;
  }
  environment() {
    const ground = this.mesh(
      new THREE.PlaneGeometry(520, 500),
      this.grass,
      0,
      -0.08,
      90,
    );
    ground.rotation.x = -Math.PI / 2;
    ground.castShadow = false;
    // Wide smooth areas, real elevation, beveled bases and a modeled raised mound.
    const outfield: number[][] = [[0, 0]];
    for (let i = 0; i <= 64; i++) {
      const a = -Math.PI / 4 + ((i / 64) * Math.PI) / 2;
      outfield.push([Math.sin(a) * 110, Math.cos(a) * 110]);
    }
    this.groundShape(
      outfield,
      new THREE.MeshToonMaterial({ color: "#7fc343" }),
      0.015,
    );
    this.groundShape(
      [
        [0, -8],
        [12, 4],
        [36, 28],
        [28, 49],
        [0, 64],
        [-28, 49],
        [-36, 28],
        [-12, 4],
      ],
      this.dirt,
      0.045,
    );
    this.groundShape(
      [
        [0, 8],
        [20, 28],
        [0, 48],
        [-20, 28],
      ],
      new THREE.MeshToonMaterial({ color: "#65ac3c" }),
      0.065,
    );
    this.mesh(new THREE.CylinderGeometry(5, 6, 0.7, 40), this.dirt, 0, 0.4, 21);
    this.box(3, 0.2, 0.8, "#fff8e9", 0, 0.85, 21);
    BASES.slice(1).forEach((p, i) => {
      const m = this.box(2.5, 0.35, 2.5, "#fff9e9", -p.x, 0.3, p.y);
      m.rotation.y = Math.PI / 4;
    });
    this.groundShape(
      [
        [-1.5, -1],
        [1.5, -1],
        [1.5, 1],
        [0, 2],
        [-1.5, 1],
      ],
      this.white,
      0.26,
    );
    for (const sign of [-1, 1]) {
      this.beam(V(0, 0.12, 0), V(sign * 79, 0.12, 79), 0.16, "#fff6e3");
      this.beam(V(sign * 4, 0.12, -3), V(sign * 4, 0.12, 4), 0.13, "#fff6e3");
      this.beam(V(sign * 8, 0.12, -3), V(sign * 8, 0.12, 4), 0.13, "#fff6e3");
      this.beam(V(sign * 4, 0.12, 4), V(sign * 8, 0.12, 4), 0.13, "#fff6e3");
    }
    for (let i = 0; i < 40; i++) {
      const a = -1.12 + (i / 40) * 2.24,
        b = -1.12 + ((i + 1) / 40) * 2.24,
        p = V(Math.sin(a) * 112, 4, Math.cos(a) * 112),
        q = V(Math.sin(b) * 112, 4, Math.cos(b) * 112);
      const center = p.clone().add(q).multiplyScalar(0.5);
      const panel = this.box(
        p.distanceTo(q) + 0.1,
        8,
        0.7,
        i % 2 ? "#2478a3" : "#2d86aa",
        center.x,
        4,
        center.z,
      );
      panel.rotation.y = -Math.atan2(q.z - p.z, q.x - p.x);
      this.beam(p.clone().setY(8.1), q.clone().setY(8.1), 0.32, "#ffcd52");
      if (i % 4 === 0) this.box(0.6, 9, 1, "#1c5979", p.x, 4, p.z);
    }
    for (const side of [-1, 1]) {
      this.beam(V(side * 79, 0, 79), V(side * 79, 29, 79), 0.36, "#ffd64c");
      for (let y = 10; y < 28; y += 3)
        this.beam(V(side * 79, y, 79), V(side * 88, y, 79), 0.1, "#f9d947");
    }
    // A picnic pavilion anchors the horizon, with asymmetric park planting behind it.
    this.box(24, 8, 12, "#74a6b0", -45, 5, 127);
    this.box(27, 1.2, 15, "#ed6550", -45, 10, 127);
    for (let j = 0; j < 6; j++)
      this.box(2.2, 0.2, 15, "#fff2d8", -56 + j * 4.5, 10.7, 127);
    for (const x of [-56, -34]) this.box(0.6, 11, 0.6, "#b87745", x, 5, 119);
    this.box(24, 12, 1, "#193a51", 0, 16, 123);
    this.box(26, 0.7, 1.6, "#ffc64e", 0, 22, 123);
    const sign = document.createElement("canvas");
    sign.width = 512;
    sign.height = 256;
    const sc = sign.getContext("2d")!;
    sc.fillStyle = "#17374a";
    sc.fillRect(0, 0, 512, 256);
    sc.textAlign = "center";
    sc.fillStyle = "#fff6dd";
    sc.font = "900 52px sans-serif";
    sc.fillText("PICNIC PARK", 256, 85);
    sc.fillStyle = "#f8cc56";
    sc.font = "700 28px sans-serif";
    sc.fillText("GOOD FOOD. GREAT GAME.", 256, 151);
    sc.fillStyle = "#72c4bd";
    sc.fillText("EST. 2019", 256, 204);
    const sm = new THREE.Mesh(
      new THREE.PlaneGeometry(23, 11),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sign) }),
    );
    sm.rotation.y = Math.PI;
    sm.position.set(0, 16, 122.4);
    this.scene.add(sm);
    for (let i = 0; i < 36; i++) {
      const a = -1.3 + (i / 35) * 2.6,
        r = 132 + ((i * 13) % 25),
        x = Math.sin(a) * r,
        z = Math.cos(a) * r,
        h = 12 + ((i * 7) % 17);
      this.box(1.5, h * 0.55, 1.5, "#916147", x, h * 0.25, z);
      const mat = new THREE.MeshToonMaterial({
        color: ["#388d58", "#4a9d51", "#317e5a", "#69a84d"][i % 4],
      });
      if (i % 4 === 0) {
        this.mesh(new THREE.ConeGeometry(6, h, 7), mat, x, h * 0.7, z);
        this.mesh(new THREE.ConeGeometry(5, h * 0.7, 7), mat, x, h * 1.1, z);
      } else {
        for (let j = 0; j < 3; j++) {
          const leaf = this.mesh(
            new THREE.IcosahedronGeometry(5 + ((j + i) % 4), 1),
            mat,
            x + (j - 1) * 3,
            h * 0.55 + j * 3,
            z + (j % 2) * 2,
          );
          leaf.scale.set(1, 1.2 + (i % 3) * 0.2, 0.9);
        }
      }
    }
    for (let i = 0; i < 7; i++) {
      const hill = this.mesh(
        new THREE.SphereGeometry(1, 20, 12),
        new THREE.MeshToonMaterial({ color: i % 2 ? "#73ad73" : "#88be7d" }),
        -190 + i * 65,
        5,
        210 + (i % 2) * 15,
      );
      hill.scale.set(60, 28 + ((i * 3) % 12), 50);
    }
    for (let i = 0; i < 9; i++) {
      const cloud = new THREE.Group();
      for (let j = 0; j < 4; j++) {
        const m = new THREE.Mesh(
          new THREE.SphereGeometry(4, 12, 8),
          new THREE.MeshBasicMaterial({ color: "#f1fbff" }),
        );
        m.position.set(j * 5, Math.sin(j * 2) * 2, 0);
        m.scale.set(1.4, 1, 0.7);
        cloud.add(m);
      }
      cloud.position.set(-175 + i * 43, 58 + (i % 3) * 9, 170);
      this.scene.add(cloud);
    }
    // Sparse flower clusters off the playable surface, deliberately avoiding stamped grass.
    for (let i = 0; i < 12; i++) {
      const side = i % 2 ? -1 : 1,
        x = side * (55 + (i % 3) * 8),
        z = 5 + ((i * 19) % 55);
      this.mesh(
        new THREE.SphereGeometry(0.6, 6, 5),
        new THREE.MeshToonMaterial({ color: i % 3 ? "#f6d95d" : "#f28564" }),
        x,
        0.6,
        z,
      );
    }
  }
  mergeScenery() {
    this.scene.updateMatrixWorld(true);
    const groups = new Map<
      string,
      {
        material: THREE.Material;
        geometries: THREE.BufferGeometry[];
        meshes: THREE.Mesh[];
      }
    >();
    this.scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh) || Array.isArray(object.material))
        return;
      const m = object.material as THREE.MeshToonMaterial;
      if (m.map || m.transparent) return;
      const key = m.type + ":" + m.color.getHexString();
      let g = groups.get(key);
      if (!g) {
        g = { material: m, geometries: [], meshes: [] };
        groups.set(key, g);
      }
      g.geometries.push(
        object.geometry.clone().applyMatrix4(object.matrixWorld),
      );
      g.meshes.push(object);
    });
    for (const group of groups.values()) {
      if (group.meshes.length < 2) continue;
      const geometry = mergeGeometries(
        group.geometries.map((g) => (g.index ? g.toNonIndexed() : g)),
        false,
      );
      if (!geometry) continue;
      group.meshes.forEach((m) => m.removeFromParent());
      const merged = new THREE.Mesh(geometry, group.material);
      merged.castShadow = true;
      merged.receiveShadow = true;
      this.scene.add(merged);
    }
  }
  shadow(size: number) {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.MeshBasicMaterial({
        map: this.shadowTexture,
        transparent: true,
        depthWrite: false,
      }),
    );
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.13;
    this.scene.add(m);
    return m;
  }
  actor(
    id: string,
    food: Food,
    clip: Clip,
    time: number,
    x: number,
    z: number,
    view: "front" | "side" | "rear",
    variation: number,
    glove: boolean,
    height = 8.8,
  ) {
    let a = this.actors.get(id);
    if (!a) {
      const canvas = document.createElement("canvas");
      const density = height >= 9.5 ? 2 : 1;
      canvas.width = 256 * density;
      canvas.height = 320 * density;
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.minFilter = THREE.LinearFilter;
      const geo = new THREE.PlaneGeometry(height * 0.8, height);
      geo.translate(0, height * 0.44, 0);
      const mesh = new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({
          map: texture,
          transparent: true,
          alphaTest: 0.08,
          depthWrite: true,
          side: THREE.DoubleSide,
        }),
      );
      mesh.rotation.y = Math.PI;
      mesh.renderOrder = 1;
      this.scene.add(mesh);
      a = {
        mesh,
        shadow: this.shadow(height * 0.62),
        canvas,
        texture,
        last: -1,
      };
      this.actors.set(id, a);
    }
    a.mesh.visible = true;
    a.shadow.visible = true;
    const mound = Math.hypot(x, z - 21) < 5;
    a.mesh.position.set(-x, mound ? 0.87 : 0.18, z);
    a.shadow.position.set(-x, mound ? 0.81 : 0.13, z);
    const frame = Math.floor(time * (clip === "idle" ? 12 : 30));
    if (a.last !== frame) {
      const c = a.canvas.getContext("2d")!;
      c.clearRect(0, 0, a.canvas.width, a.canvas.height);
      c.save();
      c.scale(a.canvas.width / 256, a.canvas.height / 320);
      drawCharacter(c, 128, 300, 2.1, food, clip, time, view, variation, glove);
      c.restore();
      a.texture.needsUpdate = true;
      a.last = frame;
    }
    return a;
  }
  resize(w: number, h: number) {
    if (this.width === w && this.height === h) return;
    this.width = w;
    this.height = h;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
  project(p: Vec, height = 0) {
    const v = V(-p.x, height, p.y).project(this.camera);
    return {
      x: (v.x * 0.5 + 0.5) * this.width,
      y: (-0.5 * v.y + 0.5) * this.height,
    };
  }
  zone() {
    const a = this.project({ x: 0, y: 0 }, 4.7),
      b = this.project({ x: 3.4, y: 0 }, 4.7),
      d = this.project({ x: 0, y: 0 }, 8.1);
    return {
      x: a.x,
      y: a.y,
      rx: Math.max(44, Math.abs(a.x - b.x)),
      ry: Math.max(44, Math.abs(a.y - d.y)),
    };
  }
  render(vm: ViewModel, dt: number, swingAt: number) {
    this.time += dt;
    const s = vm.state,
      t = s?.t ?? this.time;
    swingAt = s?.pitch?.swingAt ?? swingAt;
    const live = s?.phase === "live";
    if (live && !this.lastLive) this.contactAt = t;
    this.lastLive = !!live;
    const want = live && t - this.contactAt > 0.32 ? 1 : 0;
    this.wide = THREE.MathUtils.damp(this.wide, want, 3.6, dt);
    const k = this.wide;
    k < 0.001 && (this.wide = 0);
    this.camera.position.lerpVectors(V(0, 15, -35), V(0, 123, -100), k);
    const focus = V(0, 5, 27).lerp(V(0, 0, 43), k);
    this.camera.lookAt(focus);
    this.camera.updateMatrixWorld();
    for (const a of this.actors.values()) {
      a.mesh.visible = false;
      a.shadow.visible = false;
    }
    const defense = s ? defending(s) : 1,
      offense = s ? batting(s) : 0;
    if (live) {
      for (const f of s.fielders) {
        const clip =
          t - f.animAt > CLIPS[f.clip].duration && !CLIPS[f.clip].loop
            ? "idle"
            : f.clip;
        this.actor(
          `f${f.id}`,
          foodFor(defense, f.id),
          clip,
          t - f.animAt,
          f.x,
          f.y,
          f.y > s.ball.y ? "front" : "rear",
          f.id,
          true,
        );
      }
      for (const r of s.runners) {
        if (r.out || r.scored) continue;
        const p = runnerPos(r);
        const clip: Clip =
          r.origin === 0 && t - this.contactAt < 0.5
            ? "swing"
            : r.target !== null
              ? "run"
              : "idle";
        this.actor(
          `r${r.id}`,
          foodFor(offense, r.id - 1),
          clip,
          clip === "swing" ? t - swingAt : t,
          p.x,
          p.y,
          r.target === null
            ? "front"
            : Math.floor(r.p) === 1
              ? "rear"
              : Math.floor(r.p) === 2
                ? "side"
                : "side",
          r.id - 1,
          false,
        );
      }
    } else {
      this.actor(
        "pitcher",
        foodFor(defense, 0),
        s?.phase === "flight" ? "pitch" : "idle",
        s?.pitch ? t - s.pitch.start : t,
        0,
        21,
        "front",
        0,
        true,
        9.8,
      );
      const swinging = s?.pitch?.swung || t - swingAt < 0.66;
      const clip: Clip = s?.message.startsWith("Strikeout")
        ? "strikeout"
        : swinging
          ? "swing"
          : "ready";
      this.actor(
        "batter",
        foodFor(offense, s?.batter || 0),
        clip,
        swinging ? t - swingAt : t,
        -6,
        0,
        "side",
        s?.batter || 0,
        false,
        11.8,
      );
      if (!s) {
        this.actor(
          "popcorn",
          "popcorn",
          "idle",
          t,
          12,
          22,
          "front",
          1,
          false,
          9,
        );
        this.actor(
          "melon",
          "watermelon",
          "celebrate",
          t,
          -21,
          31,
          "front",
          2,
          false,
          9,
        );
      }
      for (let i = 1; i < 8; i++) {
        const f = FIELDERS[i];
        this.actor(
          `decor${i}`,
          foodFor(defense, i),
          "idle",
          t + i * 0.2,
          f.x,
          f.y,
          "front",
          i,
          true,
          8,
        );
      }
    }
    const selected = s?.runners.find(
      (r) => r.id === vm.selected && !r.out && !r.scored,
    );
    this.markers.forEach((m, i) => {
      m.visible =
        !!live &&
        (batting(s!) === vm.player
          ? !!selected && !selected.retouch && i + 1 >= Math.max(1, selected.p)
          : s!.ball.holder !== null);
      (m.material as THREE.MeshBasicMaterial).opacity =
        0.72 + Math.sin(this.time * 5) * 0.15;
    });
    this.ball.visible = false;
    this.ballShadow.visible = false;
    if (s?.phase === "flight" && s.pitch && t >= s.pitch.release) {
      const u = Math.max(
          0,
          Math.min(
            1.1,
            (t - s.pitch.release) / (s.pitch.arrival - s.pitch.release),
          ),
        ),
        p = vm.online ? { x: s.ball.x, y: s.ball.y } : ballAt(s);
      this.ball.position.set(-p.x * 3.4, 4.7 - p.y * 3.4, 21 * (1 - u));
      this.ball.visible = true;
      this.ball.scale.setScalar(0.75);
      this.ballShadow.position.set(
        this.ball.position.x,
        0.16,
        this.ball.position.z,
      );
      this.ballShadow.visible = true;
    } else if (live) {
      this.ball.position.set(
        -s.ball.x,
        s.ball.holder !== null ? 4 : s.ball.z + 0.65,
        s.ball.y,
      );
      this.ball.visible = true;
      this.ball.scale.setScalar(1.1);
      this.ballShadow.position.set(-s.ball.x, 0.16, s.ball.y);
      this.ballShadow.visible = true;
      this.ballShadow.scale.setScalar(1 + s.ball.z * 0.04);
    }
    const elapsed = t - this.contactAt;
    this.dust.forEach((p, i) => {
      const show = live && elapsed < 0.75;
      p.visible = show;
      if (show) {
        p.position.set(
          Math.cos(i * 2.4) * elapsed * 7,
          Math.sin(elapsed * Math.PI) * 2,
          Math.sin(i * 2.4) * elapsed * 6,
        );
        p.scale.setScalar(0.7 + elapsed * 2);
        (p.material as THREE.MeshBasicMaterial).opacity =
          (1 - elapsed / 0.75) * 0.55;
      }
    });
    this.renderer.render(this.scene, this.camera);
  }
}
