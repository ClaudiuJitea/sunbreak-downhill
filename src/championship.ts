import type { RiderState } from './types';

export interface StageResult {
  stage: number;
  rank: number;
  points: number;
  time: number;
  styleBonus: number;
}

export interface ChampionshipRider {
  id: number;
  name: string;
  color: number;
  totalPoints: number;
  stageResults: StageResult[];
}

export interface ChampionshipState {
  active: boolean;
  currentStage: number; // 0 to 4
  totalStages: number;
  completed: boolean;
  riders: ChampionshipRider[];
}

const POSITION_POINTS = [25, 18, 15, 12];

const STORAGE_KEY = 'sunbreak.championship.v1';

const DEFAULT_RIDERS: ChampionshipRider[] = [
  { id: 0, name: 'YOU', color: 0xff5500, totalPoints: 0, stageResults: [] },
  { id: 1, name: 'JUN', color: 0x517462, totalPoints: 0, stageResults: [] },
  { id: 2, name: 'KAI', color: 0xcd6238, totalPoints: 0, stageResults: [] },
  { id: 3, name: 'NIKO', color: 0x243e47, totalPoints: 0, stageResults: [] },
];

export class ChampionshipManager {
  state: ChampionshipState;

  constructor() {
    this.state = this.load();
  }

  load(): ChampionshipState {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return this.createDefault();
      const parsed = JSON.parse(raw);
      return {
        active: !!parsed.active,
        currentStage: Math.min(4, Math.max(0, parsed.currentStage || 0)),
        totalStages: 5,
        completed: !!parsed.completed,
        riders: parsed.riders && parsed.riders.length === 4 ? parsed.riders : this.createDefault().riders
      };
    } catch {
      return this.createDefault();
    }
  }

  save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch {
      /* ignore */
    }
  }

  createDefault(): ChampionshipState {
    return {
      active: false,
      currentStage: 0,
      totalStages: 5,
      completed: false,
      riders: DEFAULT_RIDERS.map(r => ({ ...r, totalPoints: 0, stageResults: [] }))
    };
  }

  start(): void {
    this.state = {
      active: true,
      currentStage: 0,
      totalStages: 5,
      completed: false,
      riders: DEFAULT_RIDERS.map(r => ({ ...r, totalPoints: 0, stageResults: [] }))
    };
    this.save();
  }

  recordStage(order: RiderState[], playerStyleScore: number): {
    stage: number;
    stageRankings: Array<{ id: number; name: string; rank: number; points: number; time: number; styleBonus: number }>;
    isFinal: boolean;
  } {
    const stage = this.state.currentStage;
    const stageRankings: Array<{ id: number; name: string; rank: number; points: number; time: number; styleBonus: number }> = [];

    order.forEach((r, idx) => {
      const rank = idx + 1;
      const basePoints = POSITION_POINTS[idx] ?? 10;
      const styleBonus = r.id === 0 ? Math.floor(playerStyleScore / 500) : 0;
      const totalStagePoints = basePoints + styleBonus;

      const champRider = this.state.riders.find(cr => cr.id === r.id);
      if (champRider) {
        champRider.totalPoints += totalStagePoints;
        champRider.stageResults.push({
          stage,
          rank,
          points: totalStagePoints,
          time: r.finishTime,
          styleBonus
        });
        stageRankings.push({
          id: r.id,
          name: champRider.name,
          rank,
          points: totalStagePoints,
          time: r.finishTime,
          styleBonus
        });
      }
    });

    const isFinal = stage >= this.state.totalStages - 1;
    if (isFinal) {
      this.state.completed = true;
    }
    this.save();

    return { stage, stageRankings, isFinal };
  }

  advanceStage(): number {
    if (this.state.currentStage < this.state.totalStages - 1) {
      this.state.currentStage++;
      this.save();
    }
    return this.state.currentStage;
  }

  getStandings(): ChampionshipRider[] {
    return [...this.state.riders].sort((a, b) => b.totalPoints - a.totalPoints);
  }

  reset(): void {
    this.state = this.createDefault();
    this.save();
  }
}
