export interface BikeUpgrades {
  suspension: number; // 1 to 5
  tires: number;      // 1 to 5
  drivetrain: number; // 1 to 5
  springs: number;    // 1 to 5
}

export interface CustomColors {
  frame: number;
  jersey: number;
  helmet: number;
}

export interface GarageState {
  credits: number;
  upgrades: BikeUpgrades;
  colors: CustomColors;
}

export const UPGRADE_COSTS = [0, 0, 450, 950, 1650, 2600]; // 1-indexed (lvl 1 is free)

export const COLOR_PRESETS = {
  frame: [
    { name: 'SUNSET ORANGE', hex: 0xff5500, css: '#ff5500' },
    { name: 'ELECTRIC CYAN', hex: 0x00f0ff, css: '#00f0ff' },
    { name: 'STEALTH MATTE', hex: 0x1e2328, css: '#1e2328' },
    { name: 'VIPER LIME', hex: 0x76ff03, css: '#76ff03' },
    { name: 'ALPINE WHITE', hex: 0xf2f4f8, css: '#f2f4f8' },
    { name: 'CHERRY RED', hex: 0xd90429, css: '#d90429' },
    { name: 'RAW GOLD', hex: 0xffb703, css: '#ffb703' },
    { name: 'PURPLE HAZE', hex: 0x7209b7, css: '#7209b7' }
  ],
  jersey: [
    { name: 'RACING ORANGE', hex: 0xeb5e28, css: '#eb5e28' },
    { name: 'AQUA FLOW', hex: 0x00f5d4, css: '#00f5d4' },
    { name: 'SHADOW SLATE', hex: 0x2b2d42, css: '#2b2d42' },
    { name: 'FOREST GREEN', hex: 0x2d6a4f, css: '#2d6a4f' },
    { name: 'HOT PINK', hex: 0xf72585, css: '#f72585' },
    { name: 'SNOW WHITE', hex: 0xf8f9fa, css: '#f8f9fa' }
  ],
  helmet: [
    { name: 'SUNBURST', hex: 0xfbb64b, css: '#fbb64b' },
    { name: 'ELECTRIC CYAN', hex: 0x00b4d8, css: '#00b4d8' },
    { name: 'CARBON BLACK', hex: 0x181818, css: '#181818' },
    { name: 'SIGNAL RED', hex: 0xd00000, css: '#d00000' },
    { name: 'ACID YELLOW', hex: 0xffea00, css: '#ffea00' },
    { name: 'GLOSS WHITE', hex: 0xffffff, css: '#ffffff' }
  ]
};

const DEFAULT_STATE: GarageState = {
  credits: 750,
  upgrades: {
    suspension: 1,
    tires: 1,
    drivetrain: 1,
    springs: 1
  },
  colors: {
    frame: 0xff5500,
    jersey: 0xeb5e28,
    helmet: 0xfbb64b
  }
};

const STORAGE_KEY = 'sunbreak.garage.v1';

export function loadGarageState(): GarageState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_STATE, upgrades: { ...DEFAULT_STATE.upgrades }, colors: { ...DEFAULT_STATE.colors } };
    const parsed = JSON.parse(raw);
    return {
      credits: Number.isFinite(parsed.credits) ? parsed.credits : DEFAULT_STATE.credits,
      upgrades: {
        suspension: Math.min(5, Math.max(1, parsed.upgrades?.suspension || 1)),
        tires: Math.min(5, Math.max(1, parsed.upgrades?.tires || 1)),
        drivetrain: Math.min(5, Math.max(1, parsed.upgrades?.drivetrain || 1)),
        springs: Math.min(5, Math.max(1, parsed.upgrades?.springs || 1))
      },
      colors: {
        frame: parsed.colors?.frame || DEFAULT_STATE.colors.frame,
        jersey: parsed.colors?.jersey || DEFAULT_STATE.colors.jersey,
        helmet: parsed.colors?.helmet || DEFAULT_STATE.colors.helmet
      }
    };
  } catch {
    return { ...DEFAULT_STATE, upgrades: { ...DEFAULT_STATE.upgrades }, colors: { ...DEFAULT_STATE.colors } };
  }
}

export function saveGarageState(state: GarageState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore storage denial */
  }
}

export interface UpgradeMultipliers {
  suspensionDamp: number;
  tiresGrip: number;
  drivetrainPush: number;
  topSpeed: number;
  hopForce: number;
}

export function getUpgradeMultipliers(upgrades: BikeUpgrades): UpgradeMultipliers {
  return {
    suspensionDamp: 1.0 + (upgrades.suspension - 1) * 0.15,
    tiresGrip: 1.0 + (upgrades.tires - 1) * 0.14,
    drivetrainPush: 1.0 + (upgrades.drivetrain - 1) * 0.16,
    topSpeed: 1.0 + (upgrades.drivetrain - 1) * 0.05,
    hopForce: 1.0 + (upgrades.springs - 1) * 0.15
  };
}
