import * as THREE from "three";
import { mulberry32 } from "./maze";

function makeCanvas(size: number, draw: (ctx: CanvasRenderingContext2D, s: number) => void, seed = 7) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  draw(ctx, size);
  void seed;
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

const speckle = (ctx: CanvasRenderingContext2D, s: number, n: number, alpha: number, light: boolean, rnd: () => number) => {
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = light ? `rgba(255,255,255,${alpha * rnd()})` : `rgba(0,0,0,${alpha * rnd()})`;
    ctx.fillRect(rnd() * s, rnd() * s, 1 + rnd() * 2, 1 + rnd() * 2);
  }
};

export function stoneTex(seed = 3) {
  const rnd = mulberry32(seed);
  return makeCanvas(256, (ctx, s) => {
    ctx.fillStyle = "#8f929c";
    ctx.fillRect(0, 0, s, s);
    const rows = 6;
    const bh = s / rows;
    for (let r = 0; r < rows; r++) {
      let x = r % 2 ? -bh : 0;
      while (x < s) {
        const bw = bh * (1.1 + rnd() * 0.8);
        const shade = 118 + Math.floor(rnd() * 40);
        ctx.fillStyle = `rgb(${shade},${shade + 2},${shade + 9})`;
        ctx.fillRect(x + 2, r * bh + 2, bw - 4, bh - 4);
        x += bw;
      }
    }
    speckle(ctx, s, 900, 0.16, false, rnd);
    speckle(ctx, s, 400, 0.1, true, rnd);
  });
}

export function dirtTex(seed = 11) {
  const rnd = mulberry32(seed);
  return makeCanvas(256, (ctx, s) => {
    ctx.fillStyle = "#7a5c3e";
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 260; i++) {
      const sh = rnd();
      ctx.fillStyle = sh > 0.5 ? `rgba(60,40,22,${0.25 * rnd()})` : `rgba(160,120,80,${0.22 * rnd()})`;
      const r = 2 + rnd() * 9;
      ctx.beginPath();
      ctx.arc(rnd() * s, rnd() * s, r, 0, 7);
      ctx.fill();
    }
    for (let i = 0; i < 60; i++) {
      ctx.fillStyle = `rgba(120,125,135,${0.5 * rnd()})`;
      const r = 1.5 + rnd() * 3;
      ctx.beginPath();
      ctx.arc(rnd() * s, rnd() * s, r, 0, 7);
      ctx.fill();
    }
    speckle(ctx, s, 700, 0.2, false, rnd);
  });
}

export function planksTex(seed = 5) {
  const rnd = mulberry32(seed);
  return makeCanvas(256, (ctx, s) => {
    ctx.fillStyle = "#8a6742";
    ctx.fillRect(0, 0, s, s);
    const n = 6;
    const ph = s / n;
    for (let i = 0; i < n; i++) {
      const shade = 108 + Math.floor(rnd() * 36);
      ctx.fillStyle = `rgb(${shade + 22},${shade - 14},${shade - 48})`;
      ctx.fillRect(0, i * ph + 1.5, s, ph - 3);
      ctx.strokeStyle = "rgba(40,24,10,0.55)";
      for (let g = 0; g < 4; g++) {
        ctx.beginPath();
        ctx.moveTo(0, i * ph + 3 + rnd() * (ph - 6));
        ctx.bezierCurveTo(s * 0.3, i * ph + rnd() * ph, s * 0.6, i * ph + rnd() * ph, s, i * ph + 3 + rnd() * (ph - 6));
        ctx.stroke();
      }
      ctx.fillStyle = "rgba(30,18,8,0.8)";
      ctx.fillRect(rnd() * s, i * ph + ph / 2 - 1.5, 4, 3);
    }
  });
}

export function tileTex(seed = 9) {
  const rnd = mulberry32(seed);
  return makeCanvas(256, (ctx, s) => {
    ctx.fillStyle = "#9db4ae";
    ctx.fillRect(0, 0, s, s);
    const n = 8;
    const t = s / n;
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const v = 216 + Math.floor(rnd() * 22);
        ctx.fillStyle = `rgb(${v - 8},${v},${v - 4})`;
        ctx.fillRect(x * t + 2, y * t + 2, t - 4, t - 4);
        if (rnd() > 0.82) {
          ctx.fillStyle = "rgba(120,160,155,0.5)";
          ctx.fillRect(x * t + 2, y * t + t * 0.6, t - 4, t * 0.4 - 2);
        }
      }
  });
}

export function grassTex(seed = 21) {
  const rnd = mulberry32(seed);
  return makeCanvas(256, (ctx, s) => {
    ctx.fillStyle = "#5d8f3e";
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 2400; i++) {
      const g = 90 + Math.floor(rnd() * 90);
      ctx.fillStyle = `rgba(${40 + Math.floor(rnd() * 40)},${g},${30 + Math.floor(rnd() * 30)},0.5)`;
      ctx.fillRect(rnd() * s, rnd() * s, 1.6, 2.5 + rnd() * 3);
    }
    for (let i = 0; i < 26; i++) {
      ctx.fillStyle = "rgba(120,90,50,0.35)";
      ctx.beginPath();
      ctx.arc(rnd() * s, rnd() * s, 2 + rnd() * 5, 0, 7);
      ctx.fill();
    }
  });
}

export function concreteTex(seed = 13) {
  const rnd = mulberry32(seed);
  return makeCanvas(256, (ctx, s) => {
    ctx.fillStyle = "#9a9ca2";
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = `rgba(60,62,68,${0.1 + rnd() * 0.14})`;
      ctx.beginPath();
      ctx.arc(rnd() * s, rnd() * s, 6 + rnd() * 26, 0, 7);
      ctx.fill();
    }
    ctx.strokeStyle = "rgba(40,42,48,0.5)";
    ctx.lineWidth = 1.4;
    for (let i = 0; i < 7; i++) {
      ctx.beginPath();
      let x = rnd() * s;
      let y = 0;
      ctx.moveTo(x, y);
      while (y < s) {
        x += (rnd() - 0.5) * 26;
        y += 12 + rnd() * 22;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    speckle(ctx, s, 800, 0.12, false, rnd);
  });
}

export function mossStoneTex(seed = 17) {
  const rnd = mulberry32(seed);
  const c = makeCanvas(256, (ctx, s) => {
    ctx.fillStyle = "#6d7a72";
    ctx.fillRect(0, 0, s, s);
    const rows = 6;
    const bh = s / rows;
    for (let r = 0; r < rows; r++) {
      let x = r % 2 ? -bh : 0;
      while (x < s) {
        const bw = bh * (1.1 + rnd() * 0.8);
        const shade = 92 + Math.floor(rnd() * 30);
        ctx.fillStyle = `rgb(${shade - 8},${shade + 4},${shade - 4})`;
        ctx.fillRect(x + 2, r * bh + 2, bw - 4, bh - 4);
        x += bw;
      }
    }
    for (let i = 0; i < 130; i++) {
      ctx.fillStyle = `rgba(${40 + Math.floor(rnd() * 30)},${110 + Math.floor(rnd() * 60)},${50 + Math.floor(rnd() * 30)},${0.25 + rnd() * 0.4})`;
      ctx.beginPath();
      ctx.arc(rnd() * s, rnd() * s, 2 + rnd() * 8, 0, 7);
      ctx.fill();
    }
    speckle(ctx, s, 700, 0.2, false, rnd);
  });
  return c;
}

export function stainedTex(seed = 2) {
  const rnd = mulberry32(seed);
  const palette = ["#e84545", "#f2b134", "#3e92cc", "#6fd08c", "#c86bfa", "#f2789f", "#ffd98a"];
  return makeCanvas(128, (ctx, s) => {
    ctx.fillStyle = "#171320";
    ctx.fillRect(0, 0, s, s);
    const cols = 4;
    const rows = 6;
    const cw = s / cols;
    const chh = s / rows;
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        ctx.fillStyle = palette[Math.floor(rnd() * palette.length)];
        ctx.fillRect(x * cw + 4, y * chh + 4, cw - 8, chh - 8);
        ctx.fillStyle = "rgba(255,255,255,0.25)";
        ctx.fillRect(x * cw + 4, y * chh + 4, cw - 8, (chh - 8) * 0.3);
      }
    ctx.strokeStyle = "#171320";
    ctx.lineWidth = 5;
    for (let x = 0; x <= cols; x++) {
      ctx.beginPath();
      ctx.moveTo(x * cw, 0);
      ctx.lineTo(x * cw, s);
      ctx.stroke();
    }
    for (let y = 0; y <= rows; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * chh);
      ctx.lineTo(s, y * chh);
      ctx.stroke();
    }
  });
}

export function hazardTex() {
  return makeCanvas(128, (ctx, s) => {
    ctx.fillStyle = "#d8b23a";
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = "#20232a";
    ctx.save();
    ctx.translate(s / 2, s / 2);
    ctx.rotate(Math.PI / 4);
    for (let i = -6; i < 7; i++) ctx.fillRect(i * 36 - 9, -s, 18, s * 2);
    ctx.restore();
  });
}

export function glowTex() {
  return makeCanvas(128, (ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 2, s / 2, s / 2, s / 2);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.25, "rgba(255,240,200,0.55)");
    g.addColorStop(1, "rgba(255,220,150,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  });
}

export function cloudTex(seed = 31) {
  const rnd = mulberry32(seed);
  return makeCanvas(256, (ctx, s) => {
    ctx.clearRect(0, 0, s, s);
    for (let i = 0; i < 22; i++) {
      const x = s * 0.2 + rnd() * s * 0.6;
      const y = s * 0.3 + rnd() * s * 0.4;
      const r = 18 + rnd() * 34;
      const g = ctx.createRadialGradient(x, y, 2, x, y, r);
      g.addColorStop(0, "rgba(255,255,255,0.85)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, 7);
      ctx.fill();
    }
  });
}
