export type BiomeId =
  | "mine"
  | "basement"
  | "damp"
  | "wild"
  | "church"
  | "bath"
  | "garden"
  | "tunnel";

export interface BiomeDef {
  id: BiomeId;
  name: string;
  en: string;
  desc: string;
  /** wall / floor / ceiling base tint multiplied over procedural texture */
  wall: string;
  floor: string;
  ceil: string;
  /** minimap color */
  map: string;
  /** accent for HUD chips */
  accent: string;
  fog: string;
  fogNear: number;
  fogFar: number;
  hemi: number;
  sun: number;
  /** ceiling height, sky biome = 0 means open */
  height: number;
  sky: boolean;
  /** player lantern tint */
  lamp: string;
  lampIntensity: number;
}

export const BIOMES: Record<BiomeId, BiomeDef> = {
  mine: {
    id: "mine",
    name: "矿道",
    en: "MINE SHAFT",
    desc: "木梁支撑的幽深矿穴，晶簇在暗处发光",
    wall: "#8a6a4a",
    floor: "#6e5138",
    ceil: "#7a5c3e",
    map: "#c08a4a",
    accent: "#e8a33d",
    fog: "#171009",
    fogNear: 3,
    fogFar: 19,
    hemi: 0.34,
    sun: 0.1,
    height: 3.5,
    sky: false,
    lamp: "#ffb45e",
    lampIntensity: 7,
  },
  basement: {
    id: "basement",
    name: "地下室",
    en: "OLD CELLAR",
    desc: "砖石酒窖，火把噼啪，木桶成排",
    wall: "#787d8a",
    floor: "#5b5f6b",
    ceil: "#4e525d",
    map: "#8b8fa3",
    accent: "#a8b0c8",
    fog: "#12131b",
    fogNear: 3,
    fogFar: 21,
    hemi: 0.36,
    sun: 0.08,
    height: 3.6,
    sky: false,
    lamp: "#ff9d4d",
    lampIntensity: 7,
  },
  damp: {
    id: "damp",
    name: "潮湿地下室",
    en: "DAMP VAULT",
    desc: "渗水的地下穹室，苔藓爬行，水珠滴落",
    wall: "#4f6a60",
    floor: "#3c524b",
    ceil: "#37493f",
    map: "#4f9e86",
    accent: "#6fd0a8",
    fog: "#0b1712",
    fogNear: 2.2,
    fogFar: 15,
    hemi: 0.3,
    sun: 0.05,
    height: 3.6,
    sky: false,
    lamp: "#7fe0b0",
    lampIntensity: 6,
  },
  wild: {
    id: "wild",
    name: "野外",
    en: "WILDS",
    desc: "树篱围出的旷野，日光正好，蝶影纷飞",
    wall: "#4e7a3a",
    floor: "#5f9440",
    ceil: "#000000",
    map: "#7cbf5e",
    accent: "#9ed862",
    fog: "#c9dde4",
    fogNear: 18,
    fogFar: 92,
    hemi: 0.95,
    sun: 1.55,
    height: 2.5,
    sky: true,
    lamp: "#ffe9b0",
    lampIntensity: 2.2,
  },
  church: {
    id: "church",
    name: "教堂",
    en: "CHAPEL",
    desc: "高耸的石殿，彩窗投下斑斓圣光",
    wall: "#8d8498",
    floor: "#6e6679",
    ceil: "#554e61",
    map: "#c9a0dc",
    accent: "#d4b45f",
    fog: "#151020",
    fogNear: 3.5,
    fogFar: 30,
    hemi: 0.44,
    sun: 0.34,
    height: 5.6,
    sky: false,
    lamp: "#ffc46b",
    lampIntensity: 6,
  },
  bath: {
    id: "bath",
    name: "卫生间",
    en: "WASHROOM",
    desc: "瓷砖与白瓷洁具，日光灯微微闪烁",
    wall: "#c9d8d4",
    floor: "#b7c9c5",
    ceil: "#d7e2de",
    map: "#6fc3c9",
    accent: "#7fd8de",
    fog: "#9fb4b0",
    fogNear: 5,
    fogFar: 26,
    hemi: 1.05,
    sun: 0.22,
    height: 3.2,
    sky: false,
    lamp: "#dffcf2",
    lampIntensity: 8,
  },
  garden: {
    id: "garden",
    name: "花园",
    en: "GARDEN",
    desc: "藤架下的花圃，喷泉水声潺潺",
    wall: "#6e8f52",
    floor: "#77a24e",
    ceil: "#000000",
    map: "#e07ba0",
    accent: "#ef9dc0",
    fog: "#d9ecd2",
    fogNear: 16,
    fogFar: 88,
    hemi: 0.95,
    sun: 1.45,
    height: 2.7,
    sky: true,
    lamp: "#ffe4a0",
    lampIntensity: 2.2,
  },
  tunnel: {
    id: "tunnel",
    name: "隧道",
    en: "SERVICE TUNNEL",
    desc: "混凝土检修隧道，管线纵横，警示条纹斑驳",
    wall: "#7d7f85",
    floor: "#5c5e63",
    ceil: "#4b4d52",
    map: "#a89b57",
    accent: "#d8c56a",
    fog: "#111318",
    fogNear: 3,
    fogFar: 23,
    hemi: 0.36,
    sun: 0.1,
    height: 3.6,
    sky: false,
    lamp: "#ffd98a",
    lampIntensity: 7,
  },
};

export const BIOME_LIST: BiomeId[] = [
  "mine",
  "basement",
  "damp",
  "wild",
  "church",
  "bath",
  "garden",
  "tunnel",
];

export const SECTOR_NAMES = ["北", "西北", "西", "西南", "南", "东南", "东", "东北"];
