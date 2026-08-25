import * as THREE from "three";
import { MazeData, isRoomCell, mulberry32 } from "./maze";
import { BIOMES, BiomeId } from "./biomes";
import {
  stoneTex, dirtTex, planksTex, tileTex, grassTex, concreteTex, mossStoneTex,
  stainedTex, hazardTex, glowTex, cloudTex,
} from "./textures";

export const CELL = 4;

export interface Mood {
  fog: number; near: number; far: number;
  hemiSky: number; hemiGround: number; hemiI: number;
  sunI: number; sunColor: number; openness: number;
}

export const MOODS: Record<BiomeId, Mood> = {
  mine:     { fog: 0x171009, near: 3, far: 19, hemiSky: 0x4a3a26, hemiGround: 0x241a10, hemiI: 0.5, sunI: 0.12, sunColor: 0x8a6a4a, openness: 0 },
  basement: { fog: 0x12131b, near: 3, far: 21, hemiSky: 0x3c4152, hemiGround: 0x201d1a, hemiI: 0.55, sunI: 0.1, sunColor: 0x8a8fa8, openness: 0 },
  damp:     { fog: 0x0b1712, near: 2.2, far: 15, hemiSky: 0x2c4a3e, hemiGround: 0x14201a, hemiI: 0.5, sunI: 0.06, sunColor: 0x5f8a76, openness: 0 },
  wild:     { fog: 0xc9dde4, near: 12, far: 52, hemiSky: 0xbdd8ff, hemiGround: 0x7a8f62, hemiI: 1.0, sunI: 1.55, sunColor: 0xfff2d0, openness: 1 },
  church:   { fog: 0x151020, near: 3.5, far: 30, hemiSky: 0x4a3f5e, hemiGround: 0x241f2c, hemiI: 0.6, sunI: 0.4, sunColor: 0xd8b8ff, openness: 0.2 },
  bath:     { fog: 0x9fb4b0, near: 5, far: 26, hemiSky: 0xe8f4f0, hemiGround: 0xb0c0bc, hemiI: 1.05, sunI: 0.25, sunColor: 0xeafff6, openness: 0.12 },
  garden:   { fog: 0xd9ecd2, near: 12, far: 52, hemiSky: 0xc8e8ff, hemiGround: 0x6f9a52, hemiI: 1.0, sunI: 1.45, sunColor: 0xfff0c8, openness: 1 },
  tunnel:   { fog: 0x111318, near: 3, far: 23, hemiSky: 0x3a3f48, hemiGround: 0x1c1e22, hemiI: 0.5, sunI: 0.1, sunColor: 0x9aa2b0, openness: 0 },
};

export interface World {
  scene: THREE.Scene;
  update(camPos: THREE.Vector3, biome: BiomeId, dt: number, t: number): void;
}

interface Anchor {
  pos: THREE.Vector3;
  color: THREE.Color;
  intensity: number;
  flicker: boolean;
  phase: number;
}
interface SpriteRef { s: THREE.Sprite; base: number; phase: number; }
interface Flyer { g: THREE.Group; home: THREE.Vector3; phase: number; speed: number; radius: number; wings: THREE.Mesh[]; }
interface Spray { pts: THREE.Points; base: Float32Array; }

const DIRS = [
  { x: 0, z: -1 },
  { x: 1, z: 0 },
  { x: 0, z: 1 },
  { x: -1, z: 0 },
];

export function cellCenter(x: number, y: number, mazeW: number) {
  return new THREE.Vector3((x - (mazeW - 1) / 2) * CELL, 0, (y - (mazeW - 1) / 2) * CELL);
}

export function buildWorld(maze: MazeData): World {
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x12131b, 3, 21);
  const W = maze.w;
  const idx = (x: number, y: number) => y * W + x;
  const cc = (x: number, y: number) => cellCenter(x, y, W);

  // ---------- shared resources ----------
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const unitCyl = new THREE.CylinderGeometry(1, 1, 1, 12);
  const unitCone = new THREE.ConeGeometry(1, 1, 8);
  const unitSphere = new THREE.SphereGeometry(1, 10, 8);
  const unitOcta = new THREE.OctahedronGeometry(1);
  const unitPlane = new THREE.PlaneGeometry(1, 1);
  const unitCircle = new THREE.CircleGeometry(1, 26);

  const texStone = stoneTex(3);
  const texDirt = dirtTex(11);
  const texPlanks = planksTex(5);
  const texTile = tileTex(9);
  const texGrass = grassTex(21);
  const texConcrete = concreteTex(13);
  const texMoss = mossStoneTex(17);
  const texStained = stainedTex(2);
  const texHazard = hazardTex();
  texHazard.repeat.set(4, 0.5);
  const texGlow = glowTex();
  const texCloud = cloudTex(31);

  const std = (map: THREE.Texture, color: string, rough = 0.92, extra?: Partial<THREE.MeshStandardMaterialParameters>) =>
    new THREE.MeshStandardMaterial({ map, color, roughness: rough, metalness: 0.02, ...extra });

  const wallMat: Record<BiomeId, THREE.MeshStandardMaterial> = {
    mine: std(texDirt, "#9a7a55"), basement: std(texStone, "#838899"), damp: std(texMoss, "#6f8a7c"),
    wild: std(texGrass, "#5d8a44", 0.98), church: std(texStone, "#948ba3"), bath: std(texTile, "#e8f2ee", 0.55),
    garden: std(texStone, "#7d9468"), tunnel: std(texConcrete, "#8a8d94", 0.85),
  };
  const floorMat: Record<BiomeId, THREE.MeshStandardMaterial> = {
    mine: std(texDirt, "#7d5f42"), basement: std(texStone, "#686d7c"), damp: std(texMoss, "#54705f"),
    wild: std(texGrass, "#6fa24a", 0.98), church: std(texStone, "#7a7288"), bath: std(texTile, "#cfe0dc", 0.4),
    garden: std(texGrass, "#7fae55", 0.98), tunnel: std(texConcrete, "#6b6e75", 0.8),
  };
  const ceilMat: Record<BiomeId, THREE.MeshStandardMaterial> = {
    mine: std(texPlanks, "#8a6742"), basement: std(texStone, "#565b68"), damp: std(texStone, "#42524a"),
    wild: std(texGrass, "#000000"), church: std(texStone, "#5d5570"), bath: std(texTile, "#e2ece8", 0.6),
    garden: std(texGrass, "#000000"), tunnel: std(texConcrete, "#585b62"),
  };
  const biomeOf = (i: number): BiomeId => (Object.keys(BIOMES) as BiomeId[])[i];

  // prop materials
  const woodDark = std(texPlanks, "#6e4f30", 0.9);
  const woodLight = std(texPlanks, "#a58254", 0.9);
  const stoneDark = std(texStone, "#5a5f6c", 0.95);
  const metalDark = new THREE.MeshStandardMaterial({ color: 0x3a3d44, roughness: 0.45, metalness: 0.75 });
  const metalCopper = new THREE.MeshStandardMaterial({ color: 0xa06a3a, roughness: 0.4, metalness: 0.8 });
  const whitePorcelain = new THREE.MeshStandardMaterial({ color: 0xf2f6f4, roughness: 0.25, metalness: 0.05 });
  const redCloth = new THREE.MeshStandardMaterial({ color: 0x8a2f35, roughness: 0.9 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x4e8a3a, roughness: 0.95 });
  const leafDark = new THREE.MeshStandardMaterial({ color: 0x3a6a2c, roughness: 0.95 });
  const trunkMat = std(texDirt, "#6e4a2c", 0.95);
  const crystalMat = new THREE.MeshStandardMaterial({ color: 0x9adcff, emissive: 0x2f9fe8, emissiveIntensity: 1.8, roughness: 0.2 });
  const crystalAmber = new THREE.MeshStandardMaterial({ color: 0xffd9a0, emissive: 0xe8862f, emissiveIntensity: 1.6, roughness: 0.25 });
  const shroomCap = new THREE.MeshStandardMaterial({ color: 0xa8f0c8, emissive: 0x3fd08a, emissiveIntensity: 1.7, roughness: 0.5 });
  const stemMat = new THREE.MeshStandardMaterial({ color: 0xd8d0b8, roughness: 0.8 });
  const glassMat = new THREE.MeshBasicMaterial({ map: texStained });
  const mirrorMat = new THREE.MeshStandardMaterial({ color: 0xbfe8ea, roughness: 0.08, metalness: 0.85 });
  const hazardMat = new THREE.MeshStandardMaterial({ map: texHazard, roughness: 0.8 });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xeafff6 });
  const warmLampMat = new THREE.MeshStandardMaterial({ color: 0xffe0a0, emissive: 0xffb454, emissiveIntensity: 2.2, roughness: 0.4 });
  const waterMat = new THREE.MeshPhongMaterial({ color: 0x1a4a48, shininess: 130, specular: 0x9fd8d0, transparent: true, opacity: 0.82 });
  const duckYellow = new THREE.MeshStandardMaterial({ color: 0xf2c834, roughness: 0.5 });
  const duckOrange = new THREE.MeshStandardMaterial({ color: 0xe8862f, roughness: 0.5 });
  const flowerMats = ["#f2789f", "#ffd98a", "#f2f2f2", "#c86bfa", "#ff8a5c"].map(
    (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, emissive: c, emissiveIntensity: 0.12 })
  );

  const B = (mat: THREE.Material, sx: number, sy: number, sz: number, x: number, y: number, z: number, cast = true) => {
    const m = new THREE.Mesh(unitBox, mat);
    m.scale.set(sx, sy, sz);
    m.position.set(x, y, z);
    m.castShadow = cast;
    m.receiveShadow = true;
    return m;
  };
  const C = (mat: THREE.Material, r: number, h: number, x: number, y: number, z: number, segs?: number) => {
    const m = new THREE.Mesh(unitCyl, mat);
    m.scale.set(r, h, r);
    if (segs) void segs;
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  };

  const anchors: Anchor[] = [];
  const sprites: SpriteRef[] = [];
  const flyers: Flyer[] = [];
  const sprays: Spray[] = [];
  const cellGroups: Array<{ g: THREE.Group; x: number; y: number }> = [];

  const addAnchor = (world: THREE.Vector3, color: string, intensity: number, flicker: boolean) =>
    anchors.push({ pos: world, color: new THREE.Color(color), intensity, flicker, phase: Math.random() * 100 });

  const addFlame = (parent: THREE.Object3D, x: number, y: number, z: number, color: string, scale: number) => {
    const sm = new THREE.SpriteMaterial({ map: texGlow, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const s = new THREE.Sprite(sm);
    s.position.set(x, y, z);
    s.scale.setScalar(scale);
    parent.add(s);
    sprites.push({ s, base: scale, phase: Math.random() * 100 });
    return s;
  };

  // ---------- sky, sun, ground ----------
  const skyGeo = new THREE.SphereGeometry(260, 24, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      topColor: { value: new THREE.Color(0x3a7bd5) },
      horizonColor: { value: new THREE.Color(0xcfe4ec) },
      sunDir: { value: new THREE.Vector3(0.45, 0.72, 0.3).normalize() },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      varying vec3 vDir; uniform vec3 topColor; uniform vec3 horizonColor; uniform vec3 sunDir;
      void main(){
        float h = max(vDir.y, 0.0);
        vec3 col = mix(horizonColor, topColor, pow(h, 0.55));
        if (vDir.y < 0.0) col = mix(horizonColor, horizonColor * 0.82, min(-vDir.y * 3.0, 1.0));
        float s = max(dot(vDir, sunDir), 0.0);
        col += vec3(1.0, 0.92, 0.7) * (pow(s, 420.0) * 1.4 + pow(s, 10.0) * 0.22);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  scene.add(sky);

  const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texGlow, color: 0xfff2c8, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  sunSprite.position.copy(skyMat.uniforms.sunDir.value as THREE.Vector3).multiplyScalar(230);
  sunSprite.scale.setScalar(70);
  scene.add(sunSprite);

  const clouds: THREE.Sprite[] = [];
  const crng = mulberry32(77);
  for (let i = 0; i < 9; i++) {
    const cs = new THREE.Sprite(new THREE.SpriteMaterial({ map: texCloud, transparent: true, opacity: 0.5 + crng() * 0.3, depthWrite: false }));
    const a = crng() * Math.PI * 2;
    const r = 60 + crng() * 130;
    cs.position.set(Math.cos(a) * r, 42 + crng() * 34, Math.sin(a) * r);
    cs.scale.set(55 + crng() * 55, 20 + crng() * 16, 1);
    scene.add(cs);
    clouds.push(cs);
  }

  const ground = new THREE.Mesh(new THREE.CircleGeometry(300, 40), new THREE.MeshBasicMaterial({ color: 0x7d9e63 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.09;
  scene.add(ground);

  // distant tree silhouettes for outdoor horizon
  const treeRing = new THREE.Group();
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + crng() * 0.3;
    const r = 95 + crng() * 55;
    const t = new THREE.Group();
    const trunk = new THREE.Mesh(unitCyl, trunkMat);
    trunk.scale.set(0.8, 7, 0.8);
    trunk.position.y = 3.5;
    const crown = new THREE.Mesh(unitSphere, leafDark);
    crown.scale.set(5 + crng() * 3, 7 + crng() * 3, 5 + crng() * 3);
    crown.position.y = 9.5;
    t.add(trunk, crown);
    t.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    treeRing.add(t);
  }
  scene.add(treeRing);

  // ---------- lights ----------
  const hemi = new THREE.HemisphereLight(0x3c4152, 0x201d1a, 0.55);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2d0, 0.1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -18;
  sun.shadow.camera.right = 18;
  sun.shadow.camera.top = 18;
  sun.shadow.camera.bottom = -18;
  sun.shadow.camera.near = 5;
  sun.shadow.camera.far = 130;
  sun.shadow.bias = -0.0025;
  scene.add(sun);
  scene.add(sun.target);
  const SUN_OFFSET = new THREE.Vector3(26, 38, 16);

  const pool: THREE.PointLight[] = [];
  for (let i = 0; i < 6; i++) {
    const pl = new THREE.PointLight(0xffffff, 0, 12, 1.9);
    scene.add(pl);
    pool.push(pl);
  }

  // ---------- helpers for cell content ----------
  const faceYaw = (dx: number, dz: number) => Math.atan2(-dx, -dz);

  function faceGroup(g: THREE.Group, dx: number, dz: number) {
    const fg = new THREE.Group();
    fg.position.set(dx * 1.86, 0, dz * 1.86);
    fg.rotation.y = faceYaw(dx, dz);
    g.add(fg);
    return fg;
  }

  // decor applied on the room-side face of a solid wall
  function faceDecor(biome: BiomeId, g: THREE.Group, dx: number, dz: number, rng: () => number, worldPos: THREE.Vector3) {
    const fg = faceGroup(g, dx, dz);
    switch (biome) {
      case "mine": {
        fg.add(B(woodDark, 0.24, 2.8, 0.24, -1.25, 1.4, 0.06));
        fg.add(B(woodDark, 0.24, 2.8, 0.24, 1.25, 1.4, 0.06));
        fg.add(B(woodDark, 2.9, 0.3, 0.28, 0, 2.82, 0.06));
        if (rng() < 0.4) {
          const side = rng() > 0.5 ? -1.25 : 1.25;
          const lantern = B(metalDark, 0.2, 0.26, 0.2, side, 2.35, 0.06, false);
          fg.add(lantern);
          addFlame(fg, side, 2.35, 0.12, "#ffb45e", 0.7);
          addAnchor(worldPos.clone().add(new THREE.Vector3(dx * 1.5, 2.3, dz * 1.5)), "#ffb45e", 7, true);
        }
        break;
      }
      case "basement": {
        if (rng() < 0.42) {
          fg.add(B(metalDark, 0.1, 0.34, 0.1, 0, 2.1, 0.04, false));
          const torch = C(woodLight, 0.045, 0.42, 0, 2.3, 0.09);
          torch.rotation.x = 0.35;
          fg.add(torch);
          addFlame(fg, 0, 2.56, 0.13, "#ff9a3c", 0.85);
          addAnchor(worldPos.clone().add(new THREE.Vector3(dx * 1.5, 2.5, dz * 1.5)), "#ff9a3c", 9, true);
        } else if (rng() < 0.3) {
          fg.add(B(stoneDark, 1.7, 0.12, 0.36, 0, 1.25, 0.08, false));
          for (let i = 0; i < 3; i++) fg.add(C(metalCopper, 0.07 + rng() * 0.04, 0.3, -0.5 + i * 0.5, 1.46, 0.08, 8));
        }
        break;
      }
      case "damp": {
        for (let i = 0; i < 3; i++) {
          const blob = new THREE.Mesh(unitSphere, leafMat);
          blob.scale.set(0.3 + rng() * 0.4, 0.2 + rng() * 0.25, 0.12);
          blob.position.set(-1.2 + rng() * 2.4, 0.3 + rng() * 1.8, 0.02);
          fg.add(blob);
        }
        if (rng() < 0.45) {
          const mx = -0.8 + rng() * 1.6;
          fg.add(C(stemMat, 0.05, 0.18, mx, 0.09, 0.1, 6));
          const cap = new THREE.Mesh(unitSphere, shroomCap);
          cap.scale.set(0.14, 0.09, 0.14);
          cap.position.set(mx, 0.22, 0.1);
          fg.add(cap);
          addAnchor(worldPos.clone().add(new THREE.Vector3(dx * 1.4, 0.4, dz * 1.4)), "#4fe09a", 3.4, false);
        }
        break;
      }
      case "wild": {
        if (rng() < 0.5) {
          for (let i = 0; i < 3; i++) {
            const f = new THREE.Mesh(unitSphere, flowerMats[Math.floor(rng() * flowerMats.length)]);
            f.scale.setScalar(0.07 + rng() * 0.05);
            f.position.set(-1.4 + rng() * 2.8, 0.16, 0.06 + rng() * 0.06);
            fg.add(f);
          }
        }
        break;
      }
      case "church": {
        const win = new THREE.Mesh(unitPlane, glassMat);
        win.scale.set(1.5, 2.4, 1);
        win.position.set(0, 3.5, 0.03);
        fg.add(win);
        fg.add(B(stoneDark, 1.7, 0.14, 0.16, 0, 2.26, 0.1, false));
        fg.add(B(stoneDark, 0.14, 2.5, 0.16, -0.82, 3.5, 0.1, false));
        fg.add(B(stoneDark, 0.14, 2.5, 0.16, 0.82, 3.5, 0.1, false));
        if (rng() < 0.5) {
          const cols = ["#e84545", "#3e92cc", "#f2b134", "#6fd08c"];
          addAnchor(worldPos.clone().add(new THREE.Vector3(dx * 1.2, 3.2, dz * 1.2)), cols[Math.floor(rng() * 4)], 5, false);
        }
        break;
      }
      case "bath": {
        if (rng() < 0.5) {
          const mir = new THREE.Mesh(unitPlane, mirrorMat);
          mir.scale.set(1.1, 1.4, 1);
          mir.position.set(0, 1.8, 0.04);
          fg.add(mir);
          fg.add(B(whitePorcelain, 1.3, 0.1, 0.3, 0, 1.0, 0.14, false));
        } else if (rng() < 0.5) {
          const pipe = C(metalCopper, 0.06, 3.0, -1.6, 1.5, 0.08, 8);
          fg.add(pipe);
          fg.add(B(metalCopper, 0.2, 0.2, 0.2, -1.6, 2.2, 0.08, false));
        }
        break;
      }
      case "garden": {
        for (let i = -1; i <= 1; i++) fg.add(B(woodDark, 0.07, 2.2, 0.07, i * 0.9, 1.1, 0.05, false));
        for (let j = 0; j < 3; j++) fg.add(B(woodDark, 2.4, 0.06, 0.06, 0, 0.5 + j * 0.7, 0.05, false));
        for (let i = 0; i < 5; i++) {
          const lf = new THREE.Mesh(unitSphere, rng() > 0.5 ? leafMat : leafDark);
          lf.scale.set(0.16 + rng() * 0.14, 0.12, 0.1);
          lf.position.set(-1 + rng() * 2, 0.4 + rng() * 1.6, 0.12);
          fg.add(lf);
        }
        if (rng() < 0.3) {
          fg.add(B(metalDark, 0.16, 0.22, 0.16, 0.9, 1.9, 0.08, false));
          addFlame(fg, 0.9, 1.9, 0.12, "#ffe08a", 0.55);
          addAnchor(worldPos.clone().add(new THREE.Vector3(dx * 1.4, 1.9, dz * 1.4)), "#ffe08a", 4.5, true);
        }
        break;
      }
      case "tunnel": {
        const p1 = C(metalDark, 0.11, 3.9, 0, 3.05, -0.04, 10);
        p1.rotation.z = Math.PI / 2;
        const p2 = C(metalCopper, 0.06, 3.9, 0, 2.78, -0.02, 8);
        p2.rotation.z = Math.PI / 2;
        fg.add(p1, p2);
        const band = new THREE.Mesh(unitPlane, hazardMat);
        band.scale.set(3.9, 0.42, 1);
        band.position.set(0, 0.36, 0.03);
        fg.add(band);
        if (rng() < 0.4) {
          fg.add(B(metalDark, 0.5, 0.1, 0.24, rng() > 0.5 ? -1 : 1, 2.5, 0.16, false));
          const lamp = B(lampMat, 0.36, 0.06, 0.16, rng() > 0.5 ? -1 : 1, 2.42, 0.16, false);
          fg.add(lamp);
        }
        break;
      }
    }
  }

  function roomProps(biome: BiomeId, g: THREE.Group, rng: () => number, worldPos: THREE.Vector3) {
    const P = (m: THREE.Object3D) => g.add(m);
    const corner = () => {
      const s1 = rng() > 0.5 ? 1 : -1;
      const s2 = rng() > 0.5 ? 1 : -1;
      return [s1 * (1.1 + rng() * 0.55), s2 * (1.1 + rng() * 0.55)];
    };
    switch (biome) {
      case "mine": {
        if (rng() < 0.85) {
          const [cx, cz] = corner();
          const n = 2 + Math.floor(rng() * 2);
          for (let i = 0; i < n; i++) {
            const cr = new THREE.Mesh(unitOcta, rng() > 0.35 ? crystalMat : crystalAmber);
            const s = 0.16 + rng() * 0.3;
            cr.scale.set(s, s * (1.4 + rng()), s);
            cr.position.set(cx + (rng() - 0.5) * 0.5, s * 0.9, cz + (rng() - 0.5) * 0.5);
            cr.rotation.y = rng() * 3;
            P(cr);
          }
          addAnchor(worldPos.clone().add(new THREE.Vector3(cx, 0.6, cz)), "#5fc8ff", 4.5, false);
        }
        if (rng() < 0.4) {
          const [cx, cz] = corner();
          const cart = new THREE.Group();
          cart.add(B(metalDark, 0.95, 0.42, 0.62, 0, 0.42, 0));
          for (const wx of [-0.32, 0.32]) for (const wz of [-0.26, 0.26]) {
            const wh = C(metalDark, 0.13, 0.06, wx, 0.13, wz, 10);
            wh.rotation.x = Math.PI / 2;
            cart.add(wh);
          }
          const ore = new THREE.Mesh(unitOcta, stoneDark);
          ore.scale.set(0.24, 0.18, 0.22);
          ore.position.set(0, 0.7, 0);
          cart.add(ore);
          const glint = new THREE.Mesh(unitOcta, crystalMat);
          glint.scale.setScalar(0.1);
          glint.position.set(0.14, 0.78, 0.1);
          cart.add(glint);
          cart.position.set(cx, 0, cz);
          cart.rotation.y = rng() * 3;
          P(cart);
        }
        for (let i = 0; i < 3; i++) {
          const r = new THREE.Mesh(unitOcta, stoneDark);
          const s = 0.1 + rng() * 0.16;
          r.scale.setScalar(s);
          r.position.set((rng() - 0.5) * 3, s * 0.6, (rng() - 0.5) * 3);
          P(r);
        }
        break;
      }
      case "basement": {
        const nb = 1 + Math.floor(rng() * 3);
        for (let i = 0; i < nb; i++) {
          const [cx, cz] = corner();
          const barrel = C(woodDark, 0.34, 0.82, cx, 0.41, cz, 12);
          P(barrel);
          const hoop1 = C(metalDark, 0.35, 0.05, cx, 0.62, cz, 12);
          const hoop2 = C(metalDark, 0.35, 0.05, cx, 0.22, cz, 12);
          P(hoop1); P(hoop2);
          if (rng() < 0.4) {
            const laid = C(woodDark, 0.3, 0.7, cx + (rng() - 0.5), 0.3, cz + (rng() - 0.5) * 0.6, 12);
            laid.rotation.z = Math.PI / 2;
            laid.rotation.y = rng();
            P(laid);
          }
        }
        if (rng() < 0.6) {
          const [cx, cz] = corner();
          P(B(woodLight, 0.72, 0.72, 0.72, cx, 0.36, cz));
          if (rng() < 0.5) P(B(woodLight, 0.55, 0.55, 0.55, cx + 0.05, 1.0, cz - 0.04));
        }
        break;
      }
      case "damp": {
        const np = 1 + Math.floor(rng() * 2);
        for (let i = 0; i < np; i++) {
          const pud = new THREE.Mesh(unitCircle, waterMat);
          pud.rotation.x = -Math.PI / 2;
          const s = 0.5 + rng() * 0.8;
          pud.scale.setScalar(s);
          pud.position.set((rng() - 0.5) * 2.4, 0.015, (rng() - 0.5) * 2.4);
          pud.receiveShadow = true;
          P(pud);
        }
        if (rng() < 0.6) {
          const [cx, cz] = corner();
          for (let i = 0; i < 3; i++) {
            P(C(stemMat, 0.05, 0.2 + rng() * 0.14, cx + (rng() - 0.5) * 0.5, 0.1, cz + (rng() - 0.5) * 0.5, 6));
            const cap = new THREE.Mesh(unitSphere, shroomCap);
            cap.scale.set(0.15, 0.1, 0.15);
            cap.position.set(cx + (rng() - 0.5) * 0.5, 0.24, cz + (rng() - 0.5) * 0.5);
            P(cap);
          }
          addAnchor(worldPos.clone().add(new THREE.Vector3(cx, 0.5, cz)), "#4fe09a", 4, false);
        }
        break;
      }
      case "wild": {
        for (let i = 0; i < 4; i++) {
          const tuft = new THREE.Mesh(unitCone, rng() > 0.5 ? leafMat : leafDark);
          tuft.scale.set(0.12, 0.32 + rng() * 0.2, 0.12);
          tuft.position.set((rng() - 0.5) * 3.2, 0.16, (rng() - 0.5) * 3.2);
          P(tuft);
        }
        if (rng() < 0.5) {
          const [cx, cz] = corner();
          P(C(trunkMat, 0.28, 0.42, cx, 0.21, cz, 10));
          const top = new THREE.Mesh(unitCircle, woodLight);
          top.rotation.x = -Math.PI / 2;
          top.scale.setScalar(0.28);
          top.position.set(cx, 0.425, cz);
          P(top);
        }
        if (rng() < 0.4) {
          for (let i = 0; i < 4; i++) {
            const f = new THREE.Mesh(unitSphere, flowerMats[Math.floor(rng() * flowerMats.length)]);
            f.scale.setScalar(0.08);
            f.position.set((rng() - 0.5) * 3, 0.22, (rng() - 0.5) * 3);
            P(f);
            P(C(leafDark, 0.015, 0.22, f.position.x, 0.11, f.position.z, 5));
          }
        }
        break;
      }
      case "church": {
        for (let row = 0; row < 2; row++)
          for (const side of [-1, 1]) {
            const pew = new THREE.Group();
            pew.add(B(woodDark, 1.5, 0.09, 0.42, 0, 0.42, 0));
            pew.add(B(woodDark, 1.5, 0.55, 0.07, 0, 0.72, -0.19));
            pew.add(B(woodDark, 0.09, 0.42, 0.42, -0.7, 0.21, 0));
            pew.add(B(woodDark, 0.09, 0.42, 0.42, 0.7, 0.21, 0));
            pew.position.set(side * 1.15, 0, -0.3 + row * 1.05);
            pew.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
            P(pew);
          }
        const runner = new THREE.Mesh(unitPlane, redCloth);
        runner.rotation.x = -Math.PI / 2;
        runner.scale.set(0.85, 3.4, 1);
        runner.position.set(0, 0.012, 0.3);
        P(runner);
        break;
      }
      case "bath": {
        const [tx, tz] = corner();
        const toilet = new THREE.Group();
        toilet.add(B(whitePorcelain, 0.44, 0.3, 0.5, 0, 0.15, 0));
        toilet.add(C(whitePorcelain, 0.23, 0.1, 0, 0.35, 0.03, 14));
        toilet.add(B(whitePorcelain, 0.44, 0.46, 0.15, 0, 0.53, -0.22));
        toilet.position.set(tx, 0, tz);
        toilet.rotation.y = Math.atan2(-tx, -tz);
        P(toilet);
        const [sx2, sz2] = corner();
        P(C(whitePorcelain, 0.06, 0.78, sx2, 0.39, sz2, 8));
        P(C(whitePorcelain, 0.27, 0.12, sx2, 0.84, sz2, 14));
        if (rng() < 0.55) {
          const [bx, bz] = corner();
          const tub = new THREE.Group();
          tub.add(B(whitePorcelain, 1.5, 0.5, 0.72, 0, 0.25, 0));
          const water = new THREE.Mesh(unitPlane, waterMat);
          water.rotation.x = -Math.PI / 2;
          water.scale.set(1.3, 0.55, 1);
          water.position.set(0, 0.48, 0);
          tub.add(water);
          const duck = new THREE.Group();
          const body = new THREE.Mesh(unitSphere, duckYellow);
          body.scale.set(0.11, 0.09, 0.13);
          body.position.y = 0.55;
          const head = new THREE.Mesh(unitSphere, duckYellow);
          head.scale.setScalar(0.06);
          head.position.set(0, 0.63, 0.09);
          const beak = new THREE.Mesh(unitCone, duckOrange);
          beak.scale.set(0.025, 0.05, 0.025);
          beak.rotation.x = Math.PI / 2;
          beak.position.set(0, 0.62, 0.16);
          duck.add(body, head, beak);
          tub.add(duck);
          tub.position.set(bx, 0, bz);
          tub.rotation.y = rng() * 3;
          P(tub);
        }
        if (rng() < 0.6) {
          const cone = new THREE.Mesh(unitCone, new THREE.MeshStandardMaterial({ color: 0xe8c83a, roughness: 0.6 }));
          cone.scale.set(0.17, 0.44, 0.17);
          cone.position.set((rng() - 0.5) * 2, 0.22, (rng() - 0.5) * 2);
          cone.castShadow = true;
          P(cone);
        }
        break;
      }
      case "garden": {
        if (rng() < 0.75) {
          const [cx, cz] = corner();
          const bed = new THREE.Group();
          bed.add(B(woodDark, 1.7, 0.28, 0.7, 0, 0.14, 0));
          bed.add(B(trunkMat, 1.55, 0.12, 0.55, 0, 0.3, 0, false));
          for (let i = 0; i < 6; i++) {
            const f = new THREE.Mesh(unitSphere, flowerMats[Math.floor(rng() * flowerMats.length)]);
            f.scale.setScalar(0.07 + rng() * 0.04);
            f.position.set(-0.65 + i * 0.26, 0.44, (rng() - 0.5) * 0.35);
            bed.add(f);
            bed.add(C(leafDark, 0.014, 0.16, f.position.x, 0.36, f.position.z, 5));
          }
          bed.position.set(cx, 0, cz);
          bed.rotation.y = rng() * 3;
          P(bed);
        }
        if (rng() < 0.22) {
          const ftn = new THREE.Group();
          ftn.add(C(stoneDark, 1.05, 0.46, 0, 0.23, 0, 18));
          ftn.add(C(stoneDark, 0.85, 0.16, 0, 0.54, 0, 18));
          ftn.add(C(stoneDark, 0.14, 0.8, 0, 0.85, 0, 10));
          ftn.add(C(stoneDark, 0.34, 0.12, 0, 1.28, 0, 12));
          const water = new THREE.Mesh(unitCircle, waterMat);
          water.rotation.x = -Math.PI / 2;
          water.scale.setScalar(0.8);
          water.position.y = 0.6;
          ftn.add(water);
          ftn.position.set((rng() > 0.5 ? 1 : -1) * 0.85, 0, (rng() > 0.5 ? 1 : -1) * 0.85);
          P(ftn);
          const n = 26;
          const pos = new Float32Array(n * 3);
          const base = new Float32Array(n * 3);
          for (let i = 0; i < n; i++) {
            const a = rng() * Math.PI * 2;
            const r = 0.05 + rng() * 0.3;
            base[i * 3] = Math.cos(a) * r;
            base[i * 3 + 1] = rng();
            base[i * 3 + 2] = Math.sin(a) * r;
          }
          pos.set(base);
          const pg = new THREE.BufferGeometry();
          pg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
          const pm = new THREE.PointsMaterial({ color: 0xbfe8f0, size: 0.05, transparent: true, opacity: 0.85 });
          const pts = new THREE.Points(pg, pm);
          pts.position.set(0, 1.3, 0);
          ftn.add(pts);
          sprays.push({ pts, base });
          addAnchor(worldPos.clone().add(new THREE.Vector3(0, 1.4, 0)), "#bfe8f0", 3.5, false);
        }
        if (rng() < 0.5) {
          const [cx, cz] = corner();
          const post = new THREE.Group();
          post.add(C(metalDark, 0.05, 1.7, 0, 0.85, 0, 8));
          post.add(B(warmLampMat, 0.2, 0.26, 0.2, 0, 1.78, 0, false));
          const capm = new THREE.Mesh(unitCone, metalDark);
          capm.scale.set(0.2, 0.16, 0.2);
          capm.position.y = 1.98;
          post.add(capm);
          post.position.set(cx, 0, cz);
          P(post);
          addFlame(g, cx, 1.78, cz, "#ffe4a0", 0.8);
          addAnchor(worldPos.clone().add(new THREE.Vector3(cx, 1.8, cz)), "#ffe4a0", 6, true);
        }
        break;
      }
      case "tunnel": {
        if (rng() < 0.5) {
          const [cx, cz] = corner();
          P(B(woodLight, 0.9, 0.14, 0.9, cx, 0.07, cz));
          P(B(woodLight, 0.8, 0.62, 0.8, cx, 0.45, cz));
          if (rng() < 0.4) P(B(woodLight, 0.6, 0.5, 0.6, cx + 0.08, 1.01, cz - 0.05));
        }
        if (rng() < 0.4) {
          const [cx, cz] = corner();
          const reel = C(woodDark, 0.42, 0.16, cx, 0.42, cz, 14);
          reel.rotation.x = Math.PI / 2;
          P(reel);
          P(C(metalCopper, 0.3, 0.1, cx, 0.42, cz + 0.05, 14));
        }
        if (rng() < 0.35) {
          const cone = new THREE.Mesh(unitCone, new THREE.MeshStandardMaterial({ color: 0xe86a2a, roughness: 0.6 }));
          cone.scale.set(0.16, 0.4, 0.16);
          cone.position.set((rng() - 0.5) * 2.2, 0.2, (rng() - 0.5) * 2.2);
          cone.castShadow = true;
          P(cone);
        }
        if (rng() < 0.4) {
          const pud = new THREE.Mesh(unitCircle, waterMat);
          pud.rotation.x = -Math.PI / 2;
          pud.scale.setScalar(0.4 + rng() * 0.4);
          pud.position.set((rng() - 0.5) * 2.4, 0.015, (rng() - 0.5) * 2.4);
          P(pud);
        }
        break;
      }
    }
  }

  // ---------- build cells ----------
  const roomBiome = (x: number, y: number): BiomeId => biomeOf(maze.biome[idx(x, y)]);

  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      if (!maze.grid[idx(x, y)]) continue;
      const g = new THREE.Group();
      const center = cc(x, y);
      g.position.copy(center);
      const room = isRoomCell(x, y);
      const biome = roomBiome(x, y);
      const def = BIOMES[biome];
      const rng = mulberry32((x * 73856093) ^ (y * 19349663) ^ 0x5eed);

      if (room) {
        // floor
        const floor = B(floorMat[biome], CELL, 0.3, CELL, 0, -0.15, 0, false);
        g.add(floor);
        // ceiling
        if (!def.sky) {
          g.add(B(ceilMat[biome], CELL + 0.34, 0.3, CELL + 0.34, 0, def.height + 0.15, 0, false));
          if (biome === "church")
            for (let bI = -1; bI <= 1; bI++) g.add(B(stoneDark, CELL + 0.2, 0.26, 0.34, 0, def.height - 0.12, bI * 1.3, false));
          if (biome === "mine")
            for (const bI of [-1.2, 1.2]) g.add(B(woodDark, CELL + 0.2, 0.2, 0.26, 0, def.height - 0.08, bI, false));
          if (biome === "bath") {
            g.add(B(lampMat, 1.7, 0.08, 0.34, 0, def.height - 0.05, 0, false));
            addAnchor(center.clone().add(new THREE.Vector3(0, def.height - 0.4, 0)), "#dffcf2", 11, true);
          }
          if (biome === "tunnel" && rng() < 0.7) {
            g.add(B(metalDark, 0.5, 0.12, 0.3, 0, def.height - 0.08, 0, false));
            g.add(B(lampMat, 0.4, 0.06, 0.22, 0, def.height - 0.16, 0, false));
            addAnchor(center.clone().add(new THREE.Vector3(0, def.height - 0.5, 0)), "#ffd98a", 8, true);
          }
        }
        // face decors + wall-side details
        for (const d of DIRS) {
          const nx = x + d.x;
          const ny = y + d.z;
          const solid = nx < 0 || ny < 0 || nx >= W || ny >= W || !maze.grid[idx(nx, ny)];
          if (solid) faceDecor(biome, g, d.x, d.z, rng, center);
        }
        roomProps(biome, g, rng, center);
        // butterflies in sky biomes
        if (def.sky && rng() < 0.55 && flyers.length < 8) {
          const fg = new THREE.Group();
          const wingMat = new THREE.MeshBasicMaterial({
            color: [0xf2b134, 0xc86bfa, 0xf2789f, 0x9adcff][Math.floor(rng() * 4)],
            side: THREE.DoubleSide,
          });
          const wings: THREE.Mesh[] = [];
          for (const s of [-1, 1]) {
            const w = new THREE.Mesh(unitPlane, wingMat);
            w.scale.set(0.16, 0.11, 1);
            w.position.x = s * 0.09;
            fg.add(w);
            wings.push(w);
          }
          fg.position.set((rng() - 0.5) * 2, 1.4 + rng(), (rng() - 0.5) * 2);
          g.add(fg);
          flyers.push({ g: fg, home: fg.position.clone(), phase: rng() * 10, speed: 0.7 + rng() * 0.8, radius: 0.7 + rng() * 0.7, wings });
        }
      } else {
        // passage cell
        const horiz = x % 2 === 0; // runs along X
        const [ax, ay] = horiz ? [x - 1, y] : [x, y - 1];
        const [bx2, by2] = horiz ? [x + 1, y] : [x, y + 1];
        const bA = roomBiome(ax, ay);
        const bB = roomBiome(bx2, by2);
        const dA = BIOMES[bA];
        const dB = BIOMES[bB];
        const bothSky = dA.sky && dB.sky;
        const h = Math.min(dA.sky ? 99 : dA.height, dB.sky ? 99 : dB.height);
        // split floor for biome transition
        const halfA = B(floorMat[bA], horiz ? CELL / 2 : CELL, 0.3, horiz ? CELL : CELL / 2, horiz ? -CELL / 4 : 0, -0.15, horiz ? 0 : -CELL / 4, false);
        const halfB = B(floorMat[bB], horiz ? CELL / 2 : CELL, 0.3, horiz ? CELL : CELL / 2, horiz ? CELL / 4 : 0, -0.15, horiz ? 0 : CELL / 4, false);
        g.add(halfA, halfB);
        if (bothSky) {
          // pergola
          for (const px of [-1.5, 1.5]) for (const pz of [-1.5, 1.5]) g.add(C(woodDark, 0.09, 2.35, horiz ? px : pz, 1.17, horiz ? pz : px, 8));
          for (let i = -1; i <= 1; i++)
            g.add(B(woodDark, horiz ? CELL : 0.14, 0.1, horiz ? 0.14 : CELL, 0, 2.42, horiz ? i * 1.1 : 0, false));
        } else {
          // doorway throat: jambs + ceiling
          const jOff = horiz ? [0, 1.45] : [1.45, 0];
          g.add(B(stoneDark, horiz ? CELL : 1.1, h, horiz ? 1.1 : CELL, horiz ? 0 : jOff[0], h / 2, horiz ? jOff[1] : 0));
          g.add(B(stoneDark, horiz ? CELL : 1.1, h, horiz ? 1.1 : CELL, horiz ? 0 : -jOff[0], h / 2, horiz ? -jOff[1] : 0));
          g.add(B(ceilMat[dA.sky ? bB : bA], CELL + 0.3, 0.3, CELL + 0.3, 0, h + 0.15, 0, false));
          // styled door trim on both room-facing ends
          const doorBiome = dA.sky ? bB : dB.sky ? bA : rng() > 0.5 ? bA : bB;
          for (const s of [-1, 1]) {
            const e = s * (CELL / 2 - 0.12);
            const frameMat = doorBiome === "mine" ? woodDark : doorBiome === "tunnel" ? metalDark : doorBiome === "bath" ? whitePorcelain : stoneDark;
            const jx = horiz ? e : 0;
            const jz = horiz ? 0 : e;
            g.add(B(frameMat, horiz ? 0.24 : 2.3, 2.7, horiz ? 2.3 : 0.24, jx, 1.35, jz));
            if (doorBiome === "tunnel") {
              const band = new THREE.Mesh(unitPlane, hazardMat);
              band.scale.set(horiz ? 0.26 : 2.3, 2.7, 1);
              band.rotation.y = horiz ? Math.PI / 2 : 0;
              band.position.set(horiz ? jx + s * 0.14 : jx, 1.35, horiz ? jz : jz + s * 0.14);
              g.add(band);
            }
          }
        }
      }
      scene.add(g);
      cellGroups.push({ g, x, y });
    }
  }

  // ---------- solid wall blocks (volumetric) ----------
  const wallGroups: Array<{ g: THREE.Group; x: number; y: number }> = [];
  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      if (maze.grid[idx(x, y)]) continue;
      let h = 3.6;
      let biome: BiomeId = "basement";
      let found = false;
      let outdoorTop = false;
      for (const d of DIRS) {
        const nx = x + d.x;
        const ny = y + d.z;
        if (nx < 0 || ny < 0 || nx >= W || ny >= W || !maze.grid[idx(nx, ny)]) continue;
        const nb = roomBiome(nx, ny);
        const nh = BIOMES[nb].sky ? BIOMES[nb].height : BIOMES[nb].height;
        if (!found) {
          biome = nb;
          found = true;
        }
        if (BIOMES[nb].sky) outdoorTop = true;
        if (nh > h || !found) h = Math.max(h, nh);
      }
      if (!found) h = 4.2;
      const g = new THREE.Group();
      g.position.copy(cc(x, y));
      const mat = wallMat[biome];
      const base = B(mat, CELL + 0.5, 1.0, CELL + 0.5, 0, 0.5, 0);
      const body = B(mat, CELL + 0.08, h - 0.9, CELL + 0.08, 0, 1 + (h - 0.9) / 2, 0);
      g.add(base, body);
      if (outdoorTop) {
        const cap = B(leafMat, CELL + 0.66, 0.5, CELL + 0.66, 0, h + 0.25, 0);
        g.add(cap);
        const lrng = mulberry32(x * 91 + y * 173);
        for (let i = 0; i < 3; i++) {
          const lump = new THREE.Mesh(unitSphere, lrng() > 0.5 ? leafMat : leafDark);
          const s = 0.5 + lrng() * 0.55;
          lump.scale.set(s, s * 0.7, s);
          lump.position.set((lrng() - 0.5) * 2.6, h + 0.5, (lrng() - 0.5) * 2.6);
          lump.castShadow = true;
          g.add(lump);
        }
      } else {
        g.add(B(stoneDark, CELL + 0.26, 0.24, CELL + 0.26, 0, h - 0.02, 0, false));
      }
      scene.add(g);
      wallGroups.push({ g, x, y });
    }
  }

  // ---------- ambient particles ----------
  const dustN = 170;
  const dustPos = new Float32Array(dustN * 3);
  const drng = mulberry32(999);
  for (let i = 0; i < dustN; i++) {
    dustPos[i * 3] = (drng() - 0.5) * 18;
    dustPos[i * 3 + 1] = drng() * 3.2;
    dustPos[i * 3 + 2] = (drng() - 0.5) * 18;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
  const dustMat = new THREE.PointsMaterial({ color: 0xd8c8a0, size: 0.035, transparent: true, opacity: 0.35, depthWrite: false });
  const dust = new THREE.Points(dustGeo, dustMat);
  scene.add(dust);

  const dripN = 70;
  const dripPos = new Float32Array(dripN * 3);
  const dripSpeed = new Float32Array(dripN);
  for (let i = 0; i < dripN; i++) {
    dripPos[i * 3] = (Math.random() - 0.5) * 16;
    dripPos[i * 3 + 1] = Math.random() * 3.3;
    dripPos[i * 3 + 2] = (Math.random() - 0.5) * 16;
    dripSpeed[i] = 1.4 + Math.random() * 1.8;
  }
  const dripGeo = new THREE.BufferGeometry();
  dripGeo.setAttribute("position", new THREE.BufferAttribute(dripPos, 3));
  const drips = new THREE.Points(dripGeo, new THREE.PointsMaterial({ color: 0x9fe8c8, size: 0.055, transparent: true, opacity: 0.8, depthWrite: false }));
  drips.visible = false;
  scene.add(drips);

  // ---------- update ----------
  const tmpV = new THREE.Vector3();
  function update(camPos: THREE.Vector3, biome: BiomeId, dt: number, t: number) {
    // culling (radius matched to fog reach so nothing pops)
    const pcx = Math.round(camPos.x / CELL + (W - 1) / 2);
    const pcy = Math.round(camPos.z / CELL + (W - 1) / 2);
    const R = MOODS[biome].openness > 0.5 ? 13 : 7;
    for (const c of cellGroups) {
      const dx = c.x - pcx;
      const dy = c.y - pcy;
      c.g.visible = dx * dx + dy * dy <= R * R;
    }
    for (const wG of wallGroups) {
      const dx = wG.x - pcx;
      const dy = wG.y - pcy;
      wG.g.visible = dx * dx + dy * dy <= (R + 1) * (R + 1);
    }

    // sun follows player
    sun.position.copy(camPos).add(SUN_OFFSET);
    sun.target.position.copy(camPos);
    sun.target.updateMatrixWorld();
    sky.position.set(camPos.x, 0, camPos.z);
    ground.position.x = camPos.x;
    ground.position.z = camPos.z;
    treeRing.visible = MOODS[biome].openness > 0.5;

    // clouds drift
    for (const cl of clouds) {
      cl.position.x += dt * 1.4;
      if (cl.position.x > 210) cl.position.x = -210;
    }

    // light pool
    const open = MOODS[biome].openness;
    for (let i = 0; i < pool.length; i++) {
      let best: Anchor | null = null;
      let bestD = 30;
      for (const a of anchors) {
        if ((a as Anchor & { taken?: boolean }).taken) continue;
        const d = a.pos.distanceTo(camPos);
        if (d < bestD) {
          bestD = d;
          best = a;
        }
      }
      const pl = pool[i];
      if (best) {
        (best as Anchor & { taken?: boolean }).taken = true;
        pl.position.copy(best.pos);
        pl.color.copy(best.color);
        let it = best.intensity * (1 - open * 0.55);
        if (best.flicker) {
          const fl = 0.78 + 0.16 * Math.sin(t * 13 + best.phase) + 0.09 * Math.sin(t * 29.7 + best.phase * 2);
          it *= fl;
          if (biome === "bath" && Math.sin(t * 47 + best.phase) < -0.94) it *= 0.2;
        }
        pl.intensity = it;
        pl.distance = 12;
      } else {
        pl.intensity = 0;
      }
    }
    for (const a of anchors) (a as Anchor & { taken?: boolean }).taken = false;

    // sprites flicker
    for (const sr of sprites) {
      if (sr.s.parent && (sr.s.parent as THREE.Object3D).visible !== false) {
        const k = 0.8 + 0.25 * Math.sin(t * 16 + sr.phase) + 0.1 * Math.sin(t * 31 + sr.phase * 3);
        sr.s.scale.setScalar(sr.base * k);
      }
    }

    // butterflies
    for (const f of flyers) {
      const wp = tmpV.copy(f.home);
      f.g.parent?.localToWorld(wp);
      if (wp.distanceTo(camPos) > 30) continue;
      const a = t * f.speed + f.phase;
      f.g.position.set(
        f.home.x + Math.cos(a) * f.radius,
        f.home.y + Math.sin(a * 1.7) * 0.35,
        f.home.z + Math.sin(a) * f.radius
      );
      f.g.rotation.y = -a;
      const flap = Math.sin(t * 22 + f.phase) * 0.9;
      f.wings[0].rotation.y = flap;
      f.wings[1].rotation.y = -flap;
    }

    // fountain sprays
    for (const sp of sprays) {
      if (!sp.pts.parent) continue;
      sp.pts.getWorldPosition(tmpV);
      if (tmpV.distanceTo(camPos) > 40) continue;
      const attr = sp.pts.geometry.getAttribute("position") as THREE.BufferAttribute;
      for (let i = 0; i < attr.count; i++) {
        let yy = attr.getY(i) + dt * (1.1 - sp.base[i * 3 + 1] * 1.6);
        if (yy < -0.68) yy = 0.02;
        attr.setXYZ(i, sp.base[i * 3] * (1 + (0.02 - yy) * 0.6), yy, sp.base[i * 3 + 2] * (1 + (0.02 - yy) * 0.6));
      }
      attr.needsUpdate = true;
    }

    // dust follows camera, wraps
    dust.position.set(camPos.x, 0, camPos.z);
    dustMat.opacity = 0.16 + (1 - open) * 0.22;
    const dAttr = dustGeo.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < dustN; i++) {
      let yy = dAttr.getY(i) + dt * 0.12 * Math.sin(t + i);
      if (yy > 3.3) yy = 0.05;
      if (yy < 0) yy = 3.2;
      dAttr.setY(i, yy);
    }
    dAttr.needsUpdate = true;

    // drips in damp vaults
    drips.visible = biome === "damp";
    if (drips.visible) {
      drips.position.set(camPos.x, 0, camPos.z);
      const attr = dripGeo.getAttribute("position") as THREE.BufferAttribute;
      for (let i = 0; i < dripN; i++) {
        let yy = attr.getY(i) - dt * dripSpeed[i];
        if (yy < 0.03) {
          yy = 3.3;
          attr.setX(i, (Math.random() - 0.5) * 16);
          attr.setZ(i, (Math.random() - 0.5) * 16);
        }
        attr.setY(i, yy);
      }
      attr.needsUpdate = true;
    }
  }

  return { scene, update };
}
