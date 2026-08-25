import { useCallback, useEffect, useRef, useState } from "react";
import { Engine, Snapshot } from "./game/engine";
import { BIOMES, BIOME_LIST, BiomeId, SECTOR_NAMES } from "./game/biomes";

interface Toast {
  id: number;
  title: string;
  sub?: string;
  color: string;
}

/* ---------------- biome icons (procedural inline SVG) ---------------- */
function BiomeIcon({ b, size = 18 }: { b: BiomeId; size?: number }) {
  const p = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (b) {
    case "mine":
      return (
        <svg {...p}>
          <path d="M4 20 L11 13" />
          <path d="M8 5 C11 3 17 3 20 6 C16 6 12 8 9.5 11.5 C8 9 7.5 7 8 5 Z" fill="currentColor" fillOpacity="0.25" />
          <circle cx="16" cy="16" r="1.4" fill="currentColor" />
          <circle cx="19" cy="13" r="1" fill="currentColor" />
        </svg>
      );
    case "basement":
      return (
        <svg {...p}>
          <path d="M3 20 h4 v-4 h4 v-4 h4 v-4 h4 V6" />
          <path d="M3 20 h18" />
        </svg>
      );
    case "damp":
      return (
        <svg {...p}>
          <path d="M12 3 C8.5 8.5 6.5 11.5 6.5 14.5 a5.5 5.5 0 0 0 11 0 C17.5 11.5 15.5 8.5 12 3 Z" fill="currentColor" fillOpacity="0.2" />
          <path d="M9 15 a3 3 0 0 0 2.5 3" />
        </svg>
      );
    case "wild":
      return (
        <svg {...p}>
          <circle cx="12" cy="8" r="3.5" fill="currentColor" fillOpacity="0.25" />
          <path d="M12 2.5 v1.5 M5 8 h1.5 M17.5 8 H19 M7 3.5 l1 1 M17 3.5 l-1 1" />
          <path d="M4 20 l3.5 -5 M20 20 l-3.5 -5 M12 20 v-7" />
        </svg>
      );
    case "church":
      return (
        <svg {...p}>
          <path d="M5 20 V11 L12 4 L19 11 V20" />
          <path d="M12 9 v6 M9.5 11.5 h5" />
          <path d="M3 20 h18" />
        </svg>
      );
    case "bath":
      return (
        <svg {...p}>
          <path d="M7 5 a2 2 0 0 1 4 0" />
          <path d="M5 9 h8 a4 4 0 0 1 4 4 v1" />
          <path d="M8 12.5 v.01 M11 12.5 v.01 M14 12.5 v.01 M8 15.5 v.01 M11 15.5 v.01" />
          <path d="M4 20 h16" />
        </svg>
      );
    case "garden":
      return (
        <svg {...p}>
          <circle cx="12" cy="10" r="2.2" fill="currentColor" fillOpacity="0.3" />
          <circle cx="12" cy="5.5" r="2" />
          <circle cx="16.3" cy="8.6" r="2" />
          <circle cx="14.6" cy="13.6" r="2" />
          <circle cx="9.4" cy="13.6" r="2" />
          <circle cx="7.7" cy="8.6" r="2" />
          <path d="M12 16 v5" />
        </svg>
      );
    case "tunnel":
      return (
        <svg {...p}>
          <path d="M5 20 V12 a7 7 0 0 1 14 0 V20" />
          <path d="M9 20 V13 a3 3 0 0 1 6 0 V20" />
          <path d="M3 20 h18" />
        </svg>
      );
  }
}

/* ---------------- compass geometry ---------------- */
const CXY = 60;
function polar(r: number, aDeg: number): [number, number] {
  const a = (aDeg * Math.PI) / 180;
  return [CXY + r * Math.sin(a), CXY - r * Math.cos(a)];
}
function wedgePath(i: number) {
  const a0 = -i * 45 - 22.5;
  const a1 = -i * 45 + 22.5;
  const [x0, y0] = polar(52, a0);
  const [x1, y1] = polar(52, a1);
  const [x2, y2] = polar(33, a1);
  const [x3, y3] = polar(33, a0);
  return `M${x0.toFixed(2)} ${y0.toFixed(2)} A52 52 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)} L${x2.toFixed(2)} ${y2.toFixed(2)} A33 33 0 0 0 ${x3.toFixed(2)} ${y3.toFixed(2)} Z`;
}
const WEDGES = Array.from({ length: 8 }, (_, i) => wedgePath(i));
const CARDINAL_POS = [0, 2, 4, 6].map((i) => ({ name: SECTOR_NAMES[i], pos: polar(42.5, -i * 45) }));

const fmtTime = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mapRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [sector, setSector] = useState(0);
  const [coarse] = useState(() => window.matchMedia("(pointer: coarse)").matches);
  const [bumpKey, setBumpKey] = useState(0);

  // continuous-update refs (no React state churn)
  const ringRef = useRef<SVGCircleElement>(null);
  const roseRef = useRef<SVGGElement>(null);
  const warnRef = useRef<HTMLDivElement>(null);
  const sectorLabelRef = useRef<HTMLDivElement>(null);
  const keyEls = useRef<Record<"w" | "a" | "s" | "d", HTMLDivElement | null>>({ w: null, a: null, s: null, d: null });
  const sectorRef = useRef(-1);
  const toastId = useRef(0);

  const addToast = useCallback((title: string, color: string, sub?: string) => {
    const id = ++toastId.current;
    setToasts((t) => [...t.slice(-3), { id, title, sub, color }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2800);
  }, []);

  useEffect(() => {
    if (!canvasRef.current) return;
    const engine = new Engine(canvasRef.current);
    engineRef.current = engine;
    engine.attachView({
      setSnap,
      toast: addToast,
      setRing: (p, valid, busy) => {
        const c = ringRef.current;
        if (c) {
          const C = 2 * Math.PI * 26;
          c.style.strokeDashoffset = String(C * (1 - p));
          c.style.stroke = busy ? "#ffffff" : valid ? "#ffd98a" : "#ff6b5d";
          c.style.opacity = p > 0 || busy ? "1" : "0.25";
        }
        if (warnRef.current) warnRef.current.style.opacity = p > 0.05 && !valid && !busy ? "1" : "0";
      },
      setNeedle: (deg) => {
        roseRef.current?.setAttribute("transform", `rotate(${deg.toFixed(2)} ${CXY} ${CXY})`);
      },
      setSector: (idx) => {
        if (sectorRef.current === idx) return;
        sectorRef.current = idx;
        setSector(idx);
        if (sectorLabelRef.current) {
          sectorLabelRef.current.textContent = SECTOR_NAMES[idx];
        }
      },
      setKeyFill: (k, f, pressed, blocked) => {
        const el = keyEls.current[k];
        if (!el) return;
        const fill = el.querySelector<HTMLSpanElement>(".fill");
        if (fill) fill.style.height = `${(f * 100).toFixed(1)}%`;
        el.classList.toggle("pressed", pressed);
        el.classList.toggle("blocked", blocked);
      },
      bumpFlash: () => setBumpKey((k) => k + 1),
    });
    engine.attachMinimap(mapRef.current);
    return () => engine.dispose();
  }, [addToast]);

  useEffect(() => {
    engineRef.current?.attachMinimap(mapRef.current);
  }, [snap?.mapOpen]);

  const eng = () => engineRef.current;
  const biome = snap ? BIOMES[snap.biome] : BIOMES.basement;
  const RING_C = 2 * Math.PI * 26;

  const hold = (k: "w" | "a" | "s" | "d") => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      eng()?.setVirtualKey(k, true);
    },
    onPointerUp: () => eng()?.setVirtualKey(k, false),
    onPointerLeave: () => eng()?.setVirtualKey(k, false),
    onPointerCancel: () => eng()?.setVirtualKey(k, false),
  });

  return (
    <div className="fixed inset-0 overflow-hidden bg-ink font-body text-parch select-none">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full cursor-grab active:cursor-grabbing" style={{ touchAction: "none" }} />

      {/* vignette + bump flash */}
      <div className="vignette pointer-events-none absolute inset-0" />
      {bumpKey > 0 && (
        <div key={bumpKey} className="bump-flash pointer-events-none absolute inset-0" style={{ background: "radial-gradient(ellipse at center, transparent 40%, rgba(255,60,40,0.5) 100%)" }} />
      )}

      {/* ============ HUD ============ */}
      {snap && snap.state !== "menu" && (
        <div className="pointer-events-none absolute inset-0">
          {/* top-left biome plate */}
          <div className="plate absolute left-3 top-3 flex items-center gap-3 px-4 py-2.5">
            <div className="grid h-10 w-10 place-items-center" style={{ color: biome.accent }}>
              <BiomeIcon b={snap.biome} size={30} />
            </div>
            <div>
              <div className="font-display engraved text-xl leading-tight" style={{ color: biome.accent }}>
                {biome.name}
                {snap.allFound && <span className="ml-2 align-middle text-xs text-brasshi">★ 八境皆明</span>}
              </div>
              <div className="text-[10px] tracking-[0.25em] text-mist">{biome.en}</div>
            </div>
            <div className="ml-3 border-l border-brass/25 pl-3 text-right text-[11px] leading-4 text-mist">
              <div>
                群系 <span className="font-bold text-brasshi">{snap.discovered.length}</span>/8
              </div>
              <div>
                房间 <span className="font-bold text-brasshi">{snap.visited}</span>/{snap.totalRooms}
              </div>
            </div>
          </div>

          {/* toasts */}
          <div className="absolute left-1/2 top-16 flex -translate-x-1/2 flex-col items-center gap-2">
            {toasts.map((t) => (
              <div key={t.id} className="toast-anim plate-sm flex items-center gap-2.5 px-4 py-2">
                <span className="chip inline-block h-3 w-3" style={{ background: t.color }} />
                <span className="font-display engraved text-base" style={{ color: t.color }}>
                  {t.title}
                </span>
                {t.sub && <span className="text-xs text-mist">{t.sub}</span>}
              </div>
            ))}
          </div>

          {/* top-right: compass + map */}
          <div className="absolute right-3 top-3 flex flex-col items-end gap-2">
            <div className="flex items-center gap-2">
              <button
                className="btn-ghost pointer-events-auto px-2.5 py-1.5 text-xs"
                onClick={() => eng()?.toggleMute()}
              >
                {snap.muted ? "♪ 已静音" : "♪ 音效开"}
              </button>
              <div className="plate relative h-[132px] w-[132px]">
                <svg viewBox="0 0 120 120" className="h-full w-full">
                  <circle cx={CXY} cy={CXY} r={56} fill="rgba(10,12,18,0.75)" stroke="rgba(224,164,74,0.5)" strokeWidth="1.5" />
                  <g ref={roseRef}>
                    {WEDGES.map((d, i) => (
                      <path key={i} d={d} fill={i === sector ? (sector % 2 === 0 ? "rgba(224,164,74,0.4)" : "rgba(159,178,200,0.22)") : "rgba(255,255,255,0.045)"} stroke="rgba(224,164,74,0.25)" strokeWidth="0.6" />
                    ))}
                    {CARDINAL_POS.map((c) => (
                      <text key={c.name} x={c.pos[0]} y={c.pos[1] + 3.5} textAnchor="middle" fontSize="11" fontWeight="700" fill="#efe3c6" fontFamily="'Noto Sans SC'">
                        {c.name}
                      </text>
                    ))}
                    {[1, 3, 5, 7].map((i) => {
                      const [x, y] = polar(42.5, -i * 45);
                      return <circle key={i} cx={x} cy={y} r="1.8" fill="rgba(224,164,74,0.7)" />;
                    })}
                  </g>
                  <polygon points="60,3 55.5,14 64.5,14" fill="#ffd98a" stroke="#7a5a20" strokeWidth="0.8" />
                  <circle cx={CXY} cy={CXY} r="3.4" fill="#e0a44a" stroke="#1a1206" strokeWidth="1" />
                </svg>
              </div>
            </div>
            <div className="plate flex items-center gap-2 px-3 py-1">
              <div ref={sectorLabelRef} className="font-display engraved w-12 text-center text-lg leading-none text-brasshi">
                {SECTOR_NAMES[sector]}
              </div>
              <div className="text-[10px] leading-tight text-mist">
                {sector % 2 === 0 ? <span className="text-mossy">正向 · 可通行</span> : <span className="text-mist">斜向 · 需对准</span>}
              </div>
            </div>
            {snap.mapOpen && (
              <div className="plate pointer-events-auto p-2">
                <div className="mb-1 flex items-center justify-between px-1 text-[10px] tracking-widest text-mist">
                  <span>迷宫地图</span>
                  <span className="text-brass">M</span>
                </div>
                <canvas ref={mapRef} width={210} height={210} className="block h-[168px] w-[168px]" />
                <div className="mt-1 flex justify-between px-1 text-[9px] text-mist">
                  <span>
                    <span className="mr-1 inline-block h-2 w-2 align-middle" style={{ background: "#39414f" }} />
                    不可通行
                  </span>
                  <span>
                    <span className="mr-1 inline-block h-2 w-2 align-middle" style={{ background: "#7cbf5e" }} />
                    已探索
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* center crosshair + hold ring */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <svg width="72" height="72" viewBox="0 0 72 72">
              <circle cx="36" cy="36" r="30" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="2" />
              <circle
                ref={ringRef}
                cx="36"
                cy="36"
                r="26"
                fill="none"
                stroke="#ffd98a"
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeDasharray={RING_C}
                strokeDashoffset={RING_C}
                transform="rotate(-90 36 36)"
                style={{ transition: "opacity 0.2s", opacity: 0.25 }}
              />
              <rect x="33.5" y="33.5" width="5" height="5" transform="rotate(45 36 36)" fill="rgba(255,217,138,0.9)" />
            </svg>
            <div ref={warnRef} className="pulse-warn absolute left-1/2 top-[76px] -translate-x-1/2 whitespace-nowrap text-xs font-bold text-ember" style={{ opacity: 0, transition: "opacity 0.15s" }}>
              未对准正向 · 转向 东 / 南 / 西 / 北
            </div>
          </div>

          {/* bottom-left keycaps */}
          <div className="absolute bottom-4 left-4 hidden flex-col items-center gap-1.5 sm:flex">
            <div ref={(el) => void (keyEls.current.w = el)} className="keycap">
              <span className="fill" />
              <span className="keycap-label">W</span>
            </div>
            <div className="flex gap-1.5">
              <div ref={(el) => void (keyEls.current.a = el)} className="keycap">
                <span className="fill" />
                <span className="keycap-label">A</span>
              </div>
              <div ref={(el) => void (keyEls.current.s = el)} className="keycap">
                <span className="fill" />
                <span className="keycap-label">S</span>
              </div>
              <div ref={(el) => void (keyEls.current.d = el)} className="keycap">
                <span className="fill" />
                <span className="keycap-label">D</span>
              </div>
            </div>
            <div className="mt-1 text-[10px] tracking-wider text-mist">长按 0.5s 触发 · W/S 前进后退 · A/D 转向</div>
          </div>

          {/* bottom-right hint / touch controls */}
          {coarse ? (
            <div className="pointer-events-auto absolute bottom-4 right-4 grid grid-cols-3 gap-1.5">
              <div />
              <button className="touch-btn" {...hold("w")}>W</button>
              <div />
              <button className="touch-btn" {...hold("a")}>A</button>
              <button className="touch-btn" {...hold("s")}>S</button>
              <button className="touch-btn" {...hold("d")}>D</button>
            </div>
          ) : (
            <div className="absolute bottom-4 right-4 text-right text-[11px] leading-5 text-mist/80">
              拖动鼠标转动视角 · 方向键微调
              <br />M 地图 · Esc 暂停
            </div>
          )}
        </div>
      )}

      {/* ============ START SCREEN ============ */}
      {(!snap || snap.state === "menu") && (
        <div className="absolute inset-0 flex items-center justify-center" style={{ background: "radial-gradient(ellipse at 50% 30%, rgba(11,13,18,0.42) 0%, rgba(8,9,14,0.88) 78%)" }}>
          {Array.from({ length: 14 }).map((_, i) => (
            <span
              key={i}
              className="ember"
              style={{
                left: `${8 + i * 6.5}%`,
                animationDuration: `${4 + (i % 5)}s`,
                animationDelay: `${i * 0.55}s`,
                ["--drift" as string]: `${(i % 2 ? 1 : -1) * (14 + i * 3)}px`,
              }}
            />
          ))}
          <div className="mx-4 flex max-w-3xl flex-col items-center text-center">
            <div className="rise-in text-[11px] tracking-[0.6em] text-brass">FIRST-PERSON MAZE SANCTUM</div>
            <h1 className="title-glow rise-in font-display mt-3 text-6xl leading-tight text-brasshi sm:text-7xl" style={{ animationDelay: "0.08s" }}>
              迷境回廊
            </h1>
            <p className="rise-in mt-3 max-w-xl text-sm leading-6 text-mist" style={{ animationDelay: "0.16s" }}>
              一座由 <span className="text-brasshi">100 间房</span> 构成的立体迷宫，藏有八种截然不同的群系——
              从滴水苔藓的地下穹室，到蝶影纷飞的露天庭院。你始终立于房间正中，转动视角，长按按键，一步步把整座秘境看遍。
            </p>

            <div className="rise-in mt-6 grid w-full grid-cols-2 gap-x-8 gap-y-2 sm:grid-cols-4" style={{ animationDelay: "0.24s" }}>
              {BIOME_LIST.map((b) => (
                <div key={b} className="plate-sm flex items-center gap-2 px-2.5 py-1.5" style={{ color: BIOMES[b].accent }}>
                  <BiomeIcon b={b} size={17} />
                  <span className="font-display text-sm text-parch">{BIOMES[b].name}</span>
                </div>
              ))}
            </div>

            <div className="rise-in plate mt-6 grid grid-cols-1 gap-x-10 gap-y-2 px-6 py-4 text-left text-xs leading-6 text-mist sm:grid-cols-2" style={{ animationDelay: "0.32s" }}>
              <div>
                <div className="mb-1 text-[10px] tracking-[0.3em] text-brass">视角</div>
                <div>按住鼠标拖动 / 方向键 —— 自由转动镜头</div>
                <div>罗盘将圆周分为八向，仅 <span className="text-brasshi">东 · 南 · 西 · 北</span> 正向区间可通行</div>
              </div>
              <div>
                <div className="mb-1 text-[10px] tracking-[0.3em] text-brass">行动（长按 0.5 秒）</div>
                <div><b className="text-parch">W / S</b> —— 向 facing 正向房间 前进 / 后退</div>
                <div><b className="text-parch">A / D</b> —— 视角左转 / 右转 90°</div>
              </div>
            </div>

            <button className="btn-brass rise-in pointer-events-auto mt-8 px-12 py-3.5 text-xl" style={{ animationDelay: "0.4s" }} onClick={() => eng()?.startGame()}>
              提灯启程
            </button>
            <div className="rise-in mt-3 text-[10px] tracking-widest text-mist/60" style={{ animationDelay: "0.48s" }}>
              支持键盘与触屏 · 音效将在开始后启用
            </div>
          </div>
        </div>
      )}

      {/* ============ PAUSE ============ */}
      {snap?.state === "paused" && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60">
          <div className="plate rise-in mx-4 w-full max-w-md px-8 py-7 text-center">
            <div className="text-[10px] tracking-[0.5em] text-brass">PAUSED</div>
            <h2 className="font-display engraved mt-1 text-4xl text-brasshi">暂歇片刻</h2>
            <div className="mt-5 grid grid-cols-3 gap-3 text-center">
              <div className="plate-sm px-2 py-3">
                <div className="font-display text-2xl text-brasshi">{fmtTime(snap.elapsed)}</div>
                <div className="mt-1 text-[10px] tracking-widest text-mist">探索用时</div>
              </div>
              <div className="plate-sm px-2 py-3">
                <div className="font-display text-2xl text-brasshi">
                  {snap.visited}/{snap.totalRooms}
                </div>
                <div className="mt-1 text-[10px] tracking-widest text-mist">房间</div>
              </div>
              <div className="plate-sm px-2 py-3">
                <div className="font-display text-2xl text-brasshi">{snap.discovered.length}/8</div>
                <div className="mt-1 text-[10px] tracking-widest text-mist">群系</div>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap justify-center gap-1.5">
              {BIOME_LIST.map((b) => {
                const found = snap.discovered.includes(b);
                return (
                  <span key={b} className="chip flex items-center gap-1 px-2 py-1 text-[11px]" style={{ background: found ? `${BIOMES[b].accent}26` : "rgba(255,255,255,0.05)", color: found ? BIOMES[b].accent : "#5a6274" }}>
                    <BiomeIcon b={b} size={13} />
                    {found ? BIOMES[b].name : "？？"}
                  </span>
                );
              })}
            </div>
            <div className="mt-6 flex justify-center gap-3">
              <button className="btn-brass pointer-events-auto px-8 py-2.5 text-base" onClick={() => eng()?.togglePause()}>
                继续探索
              </button>
              <button className="btn-ghost pointer-events-auto px-5 py-2.5 text-sm" onClick={() => eng()?.toggleMute()}>
                {snap.muted ? "开启音效" : "静音"}
              </button>
            </div>
            <div className="mt-4 text-[10px] text-mist/70">Esc 继续 · 拖动鼠标转向 · 长按 WASD 行动</div>
          </div>
        </div>
      )}

      {/* ============ FINALE ============ */}
      {snap?.allFound && !snap.finaleDismissed && snap.state === "playing" && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/55">
          <div className="plate badge-pop mx-4 w-full max-w-lg px-8 py-8 text-center" style={{ borderColor: "rgba(255,217,138,0.7)" }}>
            <div className="text-[10px] tracking-[0.5em] text-brass">ALL EIGHT REALMS</div>
            <h2 className="title-glow font-display mt-2 text-5xl text-brasshi">八境皆明</h2>
            <p className="mt-3 text-sm leading-6 text-mist">
              矿道的晶簇、教堂的彩窗、花园的喷泉、隧道的管线……
              八种群系已全部收入眼底。回廊深处，仍有 {snap.totalRooms - snap.visited} 间房等待你的脚步。
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {BIOME_LIST.map((b) => (
                <span key={b} className="chip flex items-center gap-1.5 px-2.5 py-1.5 text-xs" style={{ background: `${BIOMES[b].accent}26`, color: BIOMES[b].accent }}>
                  <BiomeIcon b={b} size={14} />
                  {BIOMES[b].name}
                </span>
              ))}
            </div>
            <button className="btn-brass pointer-events-auto mt-7 px-10 py-3 text-lg" onClick={() => eng()?.dismissFinale()}>
              继续漫游
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
