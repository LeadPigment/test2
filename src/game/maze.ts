import { BiomeId, BIOME_LIST } from "./biomes";

export interface MazeData {
  w: number;
  h: number;
  /** 1 = walkable (room or passage), 0 = solid wall */
  grid: Uint8Array;
  /** biome per walkable cell (walls = -1 index handled by caller) */
  biome: Int8Array;
  start: { x: number; y: number };
  rooms: number;
}

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DIRS = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

export function generateMaze(seed: number): MazeData {
  const rng = mulberry32(seed);
  const w = 21;
  const h = 21;
  const grid = new Uint8Array(w * h);
  const idx = (x: number, y: number) => y * w + x;

  // recursive backtracker over odd-lattice rooms
  const visited = new Uint8Array(w * h);
  const stack: Array<[number, number]> = [[1, 1]];
  visited[idx(1, 1)] = 1;
  grid[idx(1, 1)] = 1;
  while (stack.length) {
    const [cx, cy] = stack[stack.length - 1];
    const options: Array<[number, number]> = [];
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx * 2;
      const ny = cy + dy * 2;
      if (nx > 0 && ny > 0 && nx < w - 1 && ny < h - 1 && !visited[idx(nx, ny)]) {
        options.push([dx, dy]);
      }
    }
    if (!options.length) {
      stack.pop();
      continue;
    }
    const [dx, dy] = options[Math.floor(rng() * options.length)];
    const nx = cx + dx * 2;
    const ny = cy + dy * 2;
    grid[idx(nx, ny)] = 1;
    grid[idx(cx + dx, cy + dy)] = 1;
    visited[idx(nx, ny)] = 1;
    stack.push([nx, ny]);
  }

  // punch extra loops so navigation feels fair (wall cell with rooms both sides)
  let loops = 0;
  for (let y = 1; y < h - 1 && loops < 26; y++) {
    for (let x = 1; x < w - 1 && loops < 26; x++) {
      if (grid[idx(x, y)]) continue;
      const horiz = grid[idx(x - 1, y)] && grid[idx(x + 1, y)] && !grid[idx(x, y - 1)] && !grid[idx(x, y + 1)];
      const vert = grid[idx(x, y - 1)] && grid[idx(x, y + 1)] && !grid[idx(x - 1, y)] && !grid[idx(x + 1, y)];
      if ((horiz || vert) && rng() < 0.16) {
        grid[idx(x, y)] = 1;
        loops++;
      }
    }
  }

  // collect room cells (odd lattice) and passages
  const roomCells: Array<[number, number]> = [];
  for (let y = 1; y < h; y += 2) {
    for (let x = 1; x < w; x += 2) {
      if (grid[idx(x, y)]) roomCells.push([x, y]);
    }
  }

  // ---- biome seeding with soft placement rules ----
  const biomeOf = new Map<BiomeId, number>();
  BIOME_LIST.forEach((b, i) => biomeOf.set(b, i));

  // graph distance helper (BFS over walkable cells)
  const distFrom = (sx: number, sy: number) => {
    const dist = new Int16Array(w * h).fill(-1);
    const q: Array<[number, number]> = [[sx, sy]];
    dist[idx(sx, sy)] = 0;
    while (q.length) {
      const [cx, cy] = q.shift()!;
      for (const [dx, dy] of DIRS) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        if (!grid[idx(nx, ny)] || dist[idx(nx, ny)] !== -1) continue;
        dist[idx(nx, ny)] = dist[idx(cx, cy)] + 1;
        q.push([nx, ny]);
      }
    }
    return dist;
  };

  // start room: odd cell nearest to center
  const start: [number, number] = [11, 11];
  grid[idx(start[0], start[1])] = 1;

  const seeds = new Map<BiomeId, [number, number]>();
  const placeSeed = (b: BiomeId, predicate: (x: number, y: number) => boolean, tries = 400) => {
    for (let i = 0; i < tries; i++) {
      const [x, y] = roomCells[Math.floor(rng() * roomCells.length)];
      if (seeds.has(b)) break;
      let tooClose = false;
      for (const [sx, sy] of seeds.values()) {
        if (Math.abs(sx - x) + Math.abs(sy - y) < 6) {
          tooClose = true;
          break;
        }
      }
      if (tooClose) continue;
      if (!predicate(x, y)) continue;
      seeds.set(b, [x, y]);
      return;
    }
    // fallback: anywhere far enough from others
    for (let i = 0; i < tries; i++) {
      const [x, y] = roomCells[Math.floor(rng() * roomCells.length)];
      let ok = true;
      for (const [sx, sy] of seeds.values()) {
        if (sx === x && sy === y) ok = false;
      }
      if (ok) {
        seeds.set(b, [x, y]);
        return;
      }
    }
  };

  // basement anchors the start
  seeds.set("basement", start);
  // damp must cling to basement region
  const dBasement = distFrom(start[0], start[1]);
  placeSeed("damp", (x, y) => dBasement[idx(x, y)] >= 3 && dBasement[idx(x, y)] <= 9);
  // tunnel links mine & basement: place mine far, tunnel mid-ish
  placeSeed("mine", (x, y) => dBasement[idx(x, y)] >= 6);
  placeSeed("tunnel", (x, y) => dBasement[idx(x, y)] >= 4 && dBasement[idx(x, y)] <= 12);
  // wilds far from start; garden near wilds
  placeSeed("wild", (x, y) => dBasement[idx(x, y)] >= 7);
  const wildSeed = seeds.get("wild") ?? start;
  const dWild = distFrom(wildSeed[0], wildSeed[1]);
  placeSeed("garden", (x, y) => dWild[idx(x, y)] >= 2 && dWild[idx(x, y)] <= 7);
  // church & bath: quiet corners, apart from each other
  placeSeed("church", (x, y) => dBasement[idx(x, y)] >= 5);
  const churchSeed = seeds.get("church");
  if (churchSeed) {
    const dChurch = distFrom(churchSeed[0], churchSeed[1]);
    placeSeed("bath", (x, y) => dChurch[idx(x, y)] >= 4);
  } else {
    placeSeed("bath", () => true);
  }
  for (const b of BIOME_LIST) if (!seeds.has(b)) placeSeed(b, () => true);

  // ---- multi-source BFS voronoi over walkable graph ----
  const biome = new Int8Array(w * h).fill(-1);
  const q: Array<[number, number]> = [];
  for (const [b, [sx, sy]] of seeds) {
    biome[idx(sx, sy)] = biomeOf.get(b)!;
    q.push([sx, sy]);
  }
  let head = 0;
  while (head < q.length) {
    const [cx, cy] = q[head++];
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      if (!grid[idx(nx, ny)] || biome[idx(nx, ny)] !== -1) continue;
      biome[idx(nx, ny)] = biome[idx(cx, cy)];
      q.push([nx, ny]);
    }
  }

  return { w, h, grid, biome, start: { x: start[0], y: start[1] }, rooms: roomCells.length };
}

export const isRoomCell = (x: number, y: number) => x % 2 === 1 && y % 2 === 1;
