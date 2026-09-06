import type { RiderState, World } from './types';
import { COLOR_PRESETS, UPGRADE_COSTS, type GarageState, type BikeUpgrades } from './garage';
import type { ChampionshipRider } from './championship';

export type Phase = 'title' | 'countdown' | 'racing' | 'paused' | 'results';
export interface HudState {
  phase: Phase;
  player: RiderState;
  riders: RiderState[];
  time: number;
  countdown: number;
  world: World;
  best: number;
  split: string;
  fps: number;
  replay: boolean;
  celebration?: boolean;
  earnedCredits?: number;
  champActive?: boolean;
  champStage?: number;
  champStandings?: ChampionshipRider[];
  isFinalStage?: boolean;
}

const time = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, '0')}`;

export class HUD {
  root: HTMLDivElement;
  private noticeTime = 0;
  private notice = '';
  private lastPhase = '';
  private currentGarageTab: 'upgrades' | 'paint' = 'upgrades';
  private garageState: GarageState | null = null;
  private isChamp = false;

  constructor(action: (a: string) => void) {
    this.root = document.createElement('div');
    this.root.id = 'hud';
    document.body.append(this.root);
    this.root.innerHTML = `
    <div class="frame-top"><a class="wordmark" href="#" aria-label="Sunbreak home">SUNBREAK<span>DOWNHILL CLUB</span></a><div class="edition">MT. KOMOREBI <i>↗</i><span>35° 21′ N &nbsp; / &nbsp; 138° 43′ E</span></div><button class="sound-btn" data-action="mute" title="Toggle synthesized audio (M)">SOUND <b id="sound-state">ON</b><span>▥</span></button></div>
    <div id="title-panel" class="title-panel">
      <div class="eyebrow"><span></span> THE MOUNTAIN IS YOURS</div>
      <h1>CHASE<br>THE <em>DAYLIGHT.</em></h1>
      <p>Four riders. Five courses. No second thoughts.</p>
      <div class="mode-selector">
        <button class="mode-btn active" data-action="mode-single">SINGLE DESCENT</button>
        <button class="mode-btn" data-action="mode-champ">CHAMPIONSHIP TOUR</button>
      </div>
      <div class="course-card" data-action="track" title="Click to cycle track (or press T)">
        <div class="course-number" id="course-number">01</div>
        <div><b id="course-title">THE SUNBREAK DESCENT</b><span id="course-subtitle">SUMMIT → RIVER VALLEY</span></div>
        <span class="course-arrow">↗</span>
      </div>
      <div class="track-selector" id="track-selector">
        <button class="track-btn active" data-action="set-track-0">01 DESCENT</button>
        <button class="track-btn" data-action="set-track-1">02 RIDGE</button>
        <button class="track-btn" data-action="set-track-2">03 GRAVITY</button>
        <button class="track-btn" data-action="set-track-3">04 CANYON</button>
        <button class="track-btn" data-action="set-track-4">05 FOREST</button>
      </div>
      <button class="garage-btn" data-action="open-garage">PRO SHOP · UPGRADES & PAINT SHOP <span>⚙</span></button>
      <div class="course-stats">
        <div><b id="course-length">2.4</b><span>KM OF FREEDOM</span></div>
        <div><b id="course-drop">414</b><span>METERS DOWN</span></div>
        <div><b>04</b><span>RIDERS. ONE LINE.</span></div>
      </div>
      <button class="ride-btn" data-action="start">DROP IN <span>↗</span><small>ENTER</small></button>
      <div class="title-hint">BUILT FOR THE DESCENT. &nbsp; MADE OF SUNSHINE & DIRT. · PRESS T TO SWITCH TRACK · G GHOST</div>
    </div>
    <div class="title-bottom" id="title-bottom"><div><span class="tiny-square"></span> ALPINE FREERIDE SERIES <b>VOL. 001 / DAWN PATROL</b></div><div>100% PROCEDURAL <span class="seal">山</span></div></div>
    <div id="race-hud" class="hidden">
      <div class="race-left"><div class="position"><b id="position">1</b><span>/ 4<br><small>POSITION</small></span></div><div id="leaderboard" class="leaderboard"></div></div>
      <div class="race-top"><span id="section">SUMMIT RIDGE</span><strong id="timer">0:00.00</strong><small id="split">CHASE THE DAYLIGHT</small></div>
      <div class="corner"><span>NEXT UP</span><b id="corner-icon">↗</b><strong id="corner-label">FIND YOUR FLOW</strong></div>
      <div class="speed-panel"><span class="speed-label">LET IT RUN</span><div><b id="speed">0</b><span>KM/H</span></div><div class="boost-track"><i id="boost-fill"></i></div><small>BOOST <span>HOLD SHIFT</span></small></div>
      <div class="progress-panel"><div><span>SUMMIT <b>▲</b></span><span>VALLEY <b>⚑</b></span></div><svg viewBox="0 0 360 55"><path class="profile-fill" d="M0 4 L25 9 42 7 70 19 100 17 115 24 145 21 180 35 208 29 244 42 280 43 317 50 360 50 L360 55H0Z"/><path class="profile-stroke" d="M0 4 L25 9 42 7 70 19 100 17 115 24 145 21 180 35 208 29 244 42 280 43 317 50 360 50"/><circle id="route-dot" cx="0" cy="4" r="5"/></svg><div><small id="distance">0.00 KM</small><small id="checkpoint">CHECKPOINT 1 / 6</small></div></div>
      <div class="score-panel"><span>STYLE POINTS</span><b id="score">0000</b></div>
      <div id="trick-popup" class="trick-popup"></div>
      <div id="countdown" class="countdown"></div>
      <div class="race-controls">W <span>PEDAL</span> A D <span>STEER</span> S <span>BRAKE</span> SPACE <span>PUMP / HOP</span> 1–0 / B <span>TRICKS (9 BACKFLIP · 8 360 · 3 SUPERMAN · 0 FRONTFLIP)</span> G <span>GHOST</span> ESC <span>PAUSE</span></div>
      <div id="replay-label" class="replay-label hidden" data-action="skip-replay" title="Click or press Space to skip">● &nbsp; YOUR BIGGEST AIR <span>CINEMATIC REPLAY · CLICK OR SPACE TO VIEW RESULTS</span></div>
    </div>
    <div id="pause-panel" class="modal hidden">
      <span class="eyebrow">TAKE A BREATH</span>
      <h2>MOUNTAIN<br>ON HOLD.</h2>
      <button class="ride-btn" data-action="pause">KEEP RIDING <span>↗</span></button>
      <button class="text-btn" data-action="open-garage">PRO SHOP & BIKE CUSTOMIZE ⚙</button>
      <button class="text-btn" data-action="restart">RESTART DESCENT ↻</button>
      <p>W / ↑ pedal · A D / ← → steer · S / ↓ brake<br>Space hold to preload, release to hop · Shift boost<br>1 tabletop · 2 x-up · 3 superman · 4 can-can · 5 no-hander<br>6 nac-nac · 7 tailwhip · 8 360 · 9 / B backflip · 0 frontflip<br>Air shortcuts: S / ↓ / B backflip · Space+W frontflip · Space+A 360<br>G toggle ghost · T switch track</p>
    </div>
    <div id="results-panel" class="modal results hidden">
      <span class="eyebrow" id="result-eyebrow">THE VALLEY REMEMBERS</span>
      <h2 id="result-title">WHAT A<br>DESCENT.</h2>
      <div id="result-stats" class="result-stats"></div>
      <div id="result-riders"></div>
      <div id="champ-stage-box" class="hidden" style="margin-top:14px;"></div>
      <div id="result-actions" style="margin-top:20px;">
        <button class="ride-btn" id="result-primary-btn" data-action="restart">ONE MORE RUN <span>↗</span><small>R</small></button>
      </div>
      <button class="text-btn" data-action="replay">REPLAY BIGGEST AIR ↗</button>
      <button class="text-btn" data-action="open-garage">PRO SHOP & UPGRADES ⚙</button>
    </div>
    <div id="garage-panel" class="modal garage-modal hidden">
      <div class="garage-header">
        <div><span class="eyebrow">SUNBREAK PRO SHOP</span><h2 style="font-size:38px;margin:10px 0 0;">TUNING & GEAR</h2></div>
        <div class="credits-badge"><span>BALANCE</span><b id="garage-credits">$0</b></div>
      </div>
      <div class="garage-tabs">
        <button class="tab-btn active" data-action="tab-upgrades" id="btn-tab-upgrades">UPGRADES</button>
        <button class="tab-btn" data-action="tab-paint" id="btn-tab-paint">PAINT SHOP</button>
      </div>
      <div id="tab-upgrades-content" class="tab-content">
        <div class="upgrade-grid" id="upgrade-grid"></div>
      </div>
      <div id="tab-paint-content" class="tab-content hidden">
        <div class="paint-sections" id="paint-sections"></div>
      </div>
      <button class="ride-btn" data-action="close-garage" style="margin-top:20px;width:100%;">BACK TO MOUNTAIN <span>↗</span></button>
    </div>
    <div id="champ-ceremony" class="modal results hidden">
      <span class="eyebrow">SUNBREAK GRAND PRIX</span>
      <h2>CHAMPION OF<br>THE PEAKS.</h2>
      <div id="champ-podium" class="champ-podium"></div>
      <button class="ride-btn" data-action="champ-restart" style="width:100%;">NEW CHAMPIONSHIP <span>↻</span></button>
      <button class="text-btn" data-action="close-champ" style="margin-top:15px;">RETURN TO TITLE ↗</button>
    </div>
    <div id="finish-banner" class="finish-banner hidden">
      <div class="finish-banner-inner" id="finish-banner-inner">
        <div class="finish-trophy-badge" id="finish-trophy-badge" aria-label="Finish Position"></div>
        <div class="finish-main-info">
          <div class="finish-badge-tag" id="finish-badge-tag">VICTORY · 1ST PLACE</div>
          <div class="finish-main-title" id="finish-main-title">YOU WON THE RACE!</div>
          <div class="finish-stat-chips" id="finish-stat-chips"></div>
        </div>
        <div class="finish-actions" id="finish-actions">
          <div class="finish-countdown-box">
            <span>REPLAY IN <b id="finish-countdown-sec">4</b>s</span>
            <div class="finish-progress-track"><div id="finish-progress-fill"></div></div>
          </div>
          <div class="finish-btn-row" id="finish-btn-row">
            <button class="finish-skip-btn" data-action="skip-celebration">SKIP TO REPLAY <span>↗</span> <kbd>SPACE</kbd></button>
          </div>
        </div>
      </div>
    </div>
    <div id="finish-confetti" class="finish-confetti hidden"></div>
    <div id="screen-dim" class="screen-dim"></div>
    <div id="loading" class="loading"><span class="wordmark">SUNBREAK</span><p>CARVING THE MOUNTAIN…</p><div></div></div>`;

    const effectsBar = document.createElement('div');
    effectsBar.className = 'effects-controls';
    effectsBar.innerHTML = '<button data-action="effects" id="effects-toggle" aria-pressed="true" title="Toggle full/reduced motion effects (F)">FX <b>FULL</b><kbd>F</kbd></button><button data-action="weather" id="weather-toggle" aria-pressed="false" title="Toggle dawn rain (V)">WEATHER <b>DAWN</b><kbd>V</kbd></button><button data-action="ghost" id="ghost-toggle" aria-pressed="true" title="Toggle PB ghost replay (G)">GHOST <b>ON</b><kbd>G</kbd></button>';
    this.root.append(effectsBar);

    this.root.addEventListener('click', e => {
      const button = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
      if (button) action(button.dataset.action!);
    });
  }

  setEffects(enabled: boolean, rain: boolean) {
    const fx = this.el('effects-toggle'), weather = this.el('weather-toggle');
    if (fx) {
      fx.querySelector('b')!.textContent = enabled ? 'FULL' : 'REDUCED';
      fx.setAttribute('aria-pressed', String(enabled));
    }
    if (weather) {
      weather.querySelector('b')!.textContent = rain ? 'RAIN' : 'DAWN';
      weather.setAttribute('aria-pressed', String(rain));
    }
  }

  setGhost(enabled: boolean) {
    const g = this.el('ghost-toggle');
    if (g) {
      g.querySelector('b')!.textContent = enabled ? 'ON' : 'OFF';
      g.setAttribute('aria-pressed', String(enabled));
    }
  }

  setMode(mode: 'single' | 'champ') {
    this.isChamp = mode === 'champ';
    this.root.querySelectorAll('.mode-btn').forEach(btn => {
      btn.classList.toggle('active', (btn as HTMLElement).dataset.action === `mode-${mode}`);
    });
    this.el('track-selector').classList.toggle('hidden', this.isChamp);
  }

  ready() { this.el('loading').classList.add('hidden'); }
  el(id: string) { return document.getElementById(id)!; }
  notify(message: string) { this.notice = message; this.noticeTime = 3; }
  setMuted(muted: boolean) { this.el('sound-state').textContent = muted ? 'OFF' : 'ON'; }

  openGarage(state: GarageState) {
    this.garageState = state;
    this.el('garage-panel').classList.remove('hidden');
    this.renderGarage();
  }

  closeGarage() {
    this.el('garage-panel').classList.add('hidden');
  }

  setGarageTab(tab: 'upgrades' | 'paint') {
    this.currentGarageTab = tab;
    this.el('btn-tab-upgrades').classList.toggle('active', tab === 'upgrades');
    this.el('btn-tab-paint').classList.toggle('active', tab === 'paint');
    this.el('tab-upgrades-content').classList.toggle('hidden', tab !== 'upgrades');
    this.el('tab-paint-content').classList.toggle('hidden', tab !== 'paint');
  }

  renderGarage(state?: GarageState) {
    if (state) this.garageState = state;
    if (!this.garageState) return;
    const g = this.garageState;
    this.el('garage-credits').textContent = `$${g.credits.toLocaleString()}`;

    // Upgrades list
    const upgradeDefs: Array<{ key: keyof BikeUpgrades; name: string; desc: string }> = [
      { key: 'suspension', name: 'FRAME & SUSPENSION', desc: 'Dampens hard landings, reduces wipeout recovery time.' },
      { key: 'tires', name: 'TIRES & TRACTION', desc: 'Sharper cornering response, higher grip in high-speed berms.' },
      { key: 'drivetrain', name: 'DRIVETRAIN & GEARING', desc: 'Boosts pedaling acceleration and downhill top speed.' },
      { key: 'springs', name: 'SPRINGS & PRELOAD', desc: 'Higher bunny hop clearance, extended airtime for big tricks.' },
    ];

    this.el('upgrade-grid').innerHTML = upgradeDefs.map(u => {
      const lvl = g.upgrades[u.key];
      const isMax = lvl >= 5;
      const cost = isMax ? 0 : UPGRADE_COSTS[lvl + 1];
      const canAfford = !isMax && g.credits >= cost;
      const pips = [1, 2, 3, 4, 5].map(i => `<i class="pip ${i <= lvl ? 'filled' : ''}"></i>`).join('');
      return `
      <div class="upgrade-card">
        <div class="upgrade-info">
          <b>${u.name} · LVL ${lvl}</b>
          <span>${u.desc}</span>
          <div class="upgrade-pips">${pips}</div>
        </div>
        <button class="upgrade-action-btn" data-action="upgrade-${u.key}" ${isMax || !canAfford ? 'disabled' : ''}>
          ${isMax ? 'MAX LEVEL' : `UPGRADE · $${cost}`}
        </button>
      </div>`;
    }).join('');

    // Paint Shop swatches
    const renderSwatches = (part: 'frame' | 'jersey' | 'helmet', presets: typeof COLOR_PRESETS['frame']) => {
      const currentHex = g.colors[part];
      return presets.map(p => `
        <button class="swatch-btn ${p.hex === currentHex ? 'active' : ''}" style="background:${p.css};" data-action="color-${part}-${p.hex}" title="${p.name}"></button>
      `).join('');
    };

    this.el('paint-sections').innerHTML = `
      <div class="paint-group">
        <label>BIKE FRAME FINISH</label>
        <div class="swatch-row">${renderSwatches('frame', COLOR_PRESETS.frame)}</div>
      </div>
      <div class="paint-group">
        <label>RIDER JERSEY / KIT</label>
        <div class="swatch-row">${renderSwatches('jersey', COLOR_PRESETS.jersey)}</div>
      </div>
      <div class="paint-group">
        <label>HELMET COLOR</label>
        <div class="swatch-row">${renderSwatches('helmet', COLOR_PRESETS.helmet)}</div>
      </div>
    `;
  }

  showChampionshipCeremony(standings: ChampionshipRider[]) {
    this.el('results-panel').classList.add('hidden');
    const modal = this.el('champ-ceremony');
    modal.classList.remove('hidden');
    const podium = this.el('champ-podium');
    podium.innerHTML = standings.map((r, i) => `
      <div class="champ-row p${i + 1}">
        <div><b>0${i + 1}</b><span>${r.name}${r.id === 0 ? ' (YOU)' : ''}</span></div>
        <strong>${r.totalPoints} PTS</strong>
      </div>
    `).join('');
  }

  closeChampionshipCeremony() {
    this.el('champ-ceremony').classList.add('hidden');
  }

  private resultsPopulated = false;

  update(s: HudState, dt: number) {
    const title = s.phase === 'title', result = s.phase === 'results';
    this.el('title-panel').classList.toggle('hidden', !title);
    this.el('title-bottom').classList.toggle('hidden', !title);
    this.el('race-hud').classList.toggle('hidden', title || result || s.replay || !!s.celebration);
    this.el('pause-panel').classList.toggle('hidden', s.phase !== 'paused');
    this.el('results-panel').classList.toggle('hidden', !result || s.replay || !!s.celebration);
    this.el('replay-label').classList.toggle('hidden', !s.replay);

    const order = [...s.riders].sort((a, b) => b.s - a.s);
    const p = s.player;
    this.el('course-length').textContent = (s.world.length / 1000).toFixed(1);
    this.el('course-drop').textContent = String(Math.round(s.world.sample(0).position.y - s.world.sample(s.world.length).position.y));

    const trackId = s.world.trackId ?? 0;
    this.el('course-number').textContent = `0${trackId + 1}`;
    this.el('course-title').textContent = s.world.trackName || 'THE SUNBREAK DESCENT';
    this.el('course-subtitle').textContent = s.champActive
      ? `STAGE 0${(s.champStage ?? 0) + 1} OF 05 · ${s.world.trackName}`
      : s.world.trackSubtitle || 'SUMMIT → RIVER VALLEY';

    this.root.querySelectorAll('.track-btn').forEach((btn, idx) => btn.classList.toggle('active', idx === trackId));

    if (result && (!this.resultsPopulated || this.lastPhase !== s.phase)) {
      this.resultsPopulated = true;
      const rank = order.findIndex(r => r.id === 0) + 1;
      const grade = p.score >= 3500 ? 'S · FLOW MASTER' : p.score >= 2000 ? 'A · CLEAN FLOW' : p.score >= 1000 ? 'B · SOLID SEND' : 'C · DESCENT CLEAR';
      this.el('result-title').innerHTML = rank === 1 ? 'FIRST TO<br>THE SUN.' : rank === 2 ? 'SECOND TO<br>THE VALLEY.' : rank === 3 ? 'THIRD ON<br>THE PODIUM.' : 'WHAT A<br>DESCENT.';
      this.el('result-eyebrow').textContent = s.champActive ? `CHAMPIONSHIP TOUR · STAGE 0${(s.champStage ?? 0) + 1}` : 'THE VALLEY REMEMBERS';

      const earnedText = s.earnedCredits ? ` · +$${s.earnedCredits.toLocaleString()} CREDITS` : '';
      this.el('result-stats').innerHTML = `
        <div><span>YOUR TIME</span><b>${time(p.finishTime || s.time)}</b></div>
        <div><span>STYLE (${grade})</span><b>${p.score}</b></div>
        <div><span>PERSONAL BEST</span><b>${s.best ? time(s.best) : '—'}</b></div>
      `;

      this.el('result-riders').innerHTML = order.map((r, i) => `
        <div class="result-row ${r.id === 0 ? 'you' : ''}">
          <b>0${i + 1}</b><span>${r.name}${r.id === 0 ? ' / YOU' : ''}</span>
          <strong>${r.finishTime ? time(r.finishTime) : time(s.time)}</strong>
        </div>
      `).join('');

      const champBox = this.el('champ-stage-box');
      if (s.champActive && s.champStandings) {
        champBox.classList.remove('hidden');
        champBox.innerHTML = `
          <div class="champ-badge">CHAMPIONSHIP STANDINGS</div>
          <div class="champ-podium">
            ${s.champStandings.map((r, i) => `
              <div class="champ-row p${i + 1}">
                <div><b>0${i + 1}</b><span>${r.name}${r.id === 0 ? ' (YOU)' : ''}</span></div>
                <strong>${r.totalPoints} PTS</strong>
              </div>
            `).join('')}
          </div>
        `;
      } else {
        champBox.classList.add('hidden');
      }

      const actions = this.el('result-actions');
      if (s.champActive) {
        if (s.isFinalStage) {
          actions.innerHTML = `<button class="ride-btn" data-action="champ-finish">VIEW TOUR CEREMONY <span>↗</span></button>`;
        } else {
          actions.innerHTML = `<button class="ride-btn" data-action="champ-next">NEXT STAGE 0${(s.champStage ?? 0) + 2} <span>↗</span><small>ENTER</small></button>`;
        }
      } else {
        actions.innerHTML = `<button class="ride-btn" data-action="restart">ONE MORE RUN <span>↗</span><small>R</small></button>`;
      }
    }
    if (!result) this.resultsPopulated = false;
    this.lastPhase = s.phase;
    if (title) return;

    this.el('position').textContent = String(order.findIndex(r => r.id === 0) + 1);
    this.el('timer').textContent = time(s.time);
    this.el('speed').textContent = String(Math.round(p.speed * 3.6));
    this.el('boost-fill').style.width = `${p.boost <= 1 ? p.boost * 100 : p.boost}%`;
    this.el('score').textContent = String(p.score).padStart(4, '0');
    const sample = s.world.sample(p.s);
    this.el('section').textContent = s.champActive
      ? `STAGE 0${(s.champStage ?? 0) + 1} · ${sample.section.toUpperCase()}`
      : sample.section.toUpperCase();
    this.el('split').textContent = s.split || 'CHASE THE DAYLIGHT';
    this.el('leaderboard').innerHTML = order.map(r => `
      <div class="${r.id === 0 ? 'you' : ''}">
        <i style="background:#${r.color.toString(16).padStart(6, '0')}"></i>
        <span>${r.name}</span>
        <b>${r.id === 0 ? 'YOU' : `${r.s > p.s ? '+' : '−'}${(Math.abs(r.s - p.s) / Math.max(p.speed, 5)).toFixed(1)}s`}</b>
      </div>
    `).join('');

    const ahead = s.world.sample(Math.min(s.world.length, p.s + 48));
    this.el('corner-icon').textContent = ahead.jump > .1 ? '↟' : Math.abs(ahead.curvature) > .007 ? (ahead.curvature > 0 ? '↱' : '↰') : '↓';
    this.el('corner-label').textContent = ahead.jump > .1 ? 'GET READY TO FLY' : Math.abs(ahead.curvature) > .007 ? 'BRAKE · LEAN · RELEASE' : ahead.section.toUpperCase();

    const progress = Math.min(1, p.s / s.world.length);
    this.el('route-dot').setAttribute('cx', String(progress * 360));
    this.el('route-dot').setAttribute('cy', String(4 + progress * 46));
    this.el('distance').textContent = `${(Math.min(p.s, s.world.length) / 1000).toFixed(2)} / ${(s.world.length / 1000).toFixed(2)} KM`;
    this.el('checkpoint').textContent = `CHECKPOINT ${s.world.checkpoints.filter(c => p.s >= c).length} / ${s.world.checkpoints.length}`;
    this.el('countdown').textContent = s.phase === 'countdown' ? s.countdown > 0 ? String(Math.ceil(s.countdown)) : 'GO!' : '';

    this.noticeTime -= dt;
    this.el('trick-popup').innerHTML = p.crash > 0
      ? '<small>SHAKE IT OFF</small>BACK ON THE BIKE'
      : p.airborne && p.trick
        ? `<small>HOLD YOUR LINE</small>${p.trick.toUpperCase()}`
        : this.noticeTime > 0
          ? this.notice
          : p.airborne
            ? '<small>AIR TRICKS</small>9 / B BACKFLIP · 8 360 · 3 SUPERMAN · 0 FRONTFLIP · 1–7'
            : '';
  }

  showFinishBanner(data: {
    rank: number;
    time: number;
    score: number;
    earnedCredits?: number;
    champActive?: boolean;
    champStage?: number;
    isFinalStage?: boolean;
  }) {
    const banner = this.el('finish-banner');
    if (!banner) return;
    const rank = data.rank;
    const trophy = this.el('finish-trophy-badge');
    const tag = this.el('finish-badge-tag');
    const title = this.el('finish-main-title');
    const chips = this.el('finish-stat-chips');
    const btnRow = this.el('finish-btn-row');

    banner.className = 'finish-banner ' + (rank === 1 ? 'winner' : rank === 2 ? 'second' : rank === 3 ? 'third' : 'placed');

    if (trophy) {
      const pLabel = rank === 1 ? 'P1' : rank === 2 ? 'P2' : rank === 3 ? 'P3' : `P${rank}`;
      const subLabel = rank === 1 ? 'WIN' : rank <= 3 ? 'POD' : 'FIN';
      trophy.innerHTML = `
        <svg class="finish-rank-svg" viewBox="0 0 48 48" width="48" height="48" aria-hidden="true">
          <polygon points="24,3 45,10 45,28 24,45 3,28 3,10" fill="currentColor" fill-opacity="0.18" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/>
          <line x1="14" y1="27" x2="34" y2="27" stroke="currentColor" stroke-width="1" stroke-opacity="0.45"/>
          <text x="24" y="23" text-anchor="middle" font-family="Arial Black, Impact, sans-serif" font-weight="900" font-size="16" fill="currentColor">${pLabel}</text>
          <text x="24" y="37" text-anchor="middle" font-family="Arial, sans-serif" font-weight="800" font-size="7.5" letter-spacing="1.5" fill="#fff8e7">${subLabel}</text>
        </svg>
      `;
    }

    if (tag) {
      tag.textContent = rank === 1
        ? 'RACE WINNER · 1ST PLACE'
        : rank === 2
          ? 'PODIUM FINISH · 2ND PLACE'
          : rank === 3
            ? 'PODIUM FINISH · 3RD PLACE'
            : `DESCENT COMPLETED · ${rank}TH PLACE`;
    }

    if (title) {
      title.textContent = rank === 1
        ? 'YOU WON THE RACE!'
        : rank === 2
          ? 'YOU FINISHED SECOND!'
          : rank === 3
            ? 'YOU FINISHED THIRD!'
            : `YOU FINISHED ${rank === 4 ? 'FOURTH' : `${rank}TH`}`;
    }

    if (chips) {
      chips.innerHTML = `
        <div><span>TIME</span><b>${time(data.time)}</b></div>
        <div><span>STYLE</span><b>${data.score} PTS</b></div>
        ${data.earnedCredits ? `<div><span>PRIZE</span><b>+$${data.earnedCredits.toLocaleString()}</b></div>` : ''}
      `;
    }

    if (btnRow) {
      btnRow.innerHTML = `
        <button class="finish-skip-btn" data-action="skip-celebration">SKIP TO REPLAY <span>↗</span> <kbd>SPACE</kbd></button>
      `;
    }

    banner.classList.remove('hidden');
    if (rank <= 3) {
      this.spawnConfetti();
    }
  }

  updateFinishBannerProgress(fraction: number, secondsLeft: number) {
    const fill = document.getElementById('finish-progress-fill');
    const sec = document.getElementById('finish-countdown-sec');
    if (fill) fill.style.width = `${Math.max(0, Math.min(100, fraction * 100))}%`;
    if (sec) sec.textContent = String(Math.max(1, Math.ceil(secondsLeft)));
  }

  hideFinishBanner() {
    const banner = this.el('finish-banner');
    if (banner) banner.classList.add('hidden');
    const confetti = this.el('finish-confetti');
    if (confetti) {
      confetti.classList.add('hidden');
      confetti.innerHTML = '';
    }
  }

  setDimmed(dimmed: boolean) {
    const dim = this.el('screen-dim');
    if (dim) dim.classList.toggle('dimmed', dimmed);
  }

  private spawnConfetti() {
    const container = this.el('finish-confetti');
    if (!container) return;
    container.innerHTML = '';
    container.classList.remove('hidden');
    const colors = ['#ffd700', '#e97843', '#ffebc7', '#25a18e', '#f43f5e', '#ffffff'];
    for (let i = 0; i < 48; i++) {
      const piece = document.createElement('div');
      piece.className = 'confetti-piece';
      const left = Math.random() * 100;
      const delay = Math.random() * 1.8;
      const duration = 2.2 + Math.random() * 1.8;
      const size = 6 + Math.random() * 8;
      const color = colors[Math.floor(Math.random() * colors.length)];
      piece.style.cssText = `left:${left}vw;animation-delay:${delay}s;animation-duration:${duration}s;background:${color};width:${size}px;height:${size * (0.5 + Math.random() * 0.8)}px;transform:rotate(${Math.random() * 360}deg);`;
      container.appendChild(piece);
    }
  }
}
