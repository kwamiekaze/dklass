import Phaser from 'phaser';
import { getLevel } from './levels';
import { ScoreTracker, buildResult, deltaCue, labelOf, POINTS, TIER_NAMES, type PointKey } from './scoring';
import { touchControls } from './controls';
import { loadPlayerCarTexture, makeTextures, PED_TINTS, DOG_KEYS } from './textures';
import { GAME_EVENTS, getDifficulty, type LevelConfig, type ObstacleType, type Difficulty, type DifficultyConfig } from './types';
import { sound, pickTrackForLevel } from '../sound';

export const GAME_W = 480;
export const GAME_H = 800;

const ROAD_X = 60;
const ROAD_W = 360;
const LANE_X = [120, 240, 360];
const DIVIDERS = [180, 300];
const PLAYER_Y = 620;
const MPH_TO_PX = 5.5;
const DIFF_INDEX: Record<string, number> = { learner: 0, licensed: 1, instructor: 2, legend: 3 };

type WASD = Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;

interface Obstacle {
  type: ObstacleType;
  d: number;
  lane: number;
  sprite: Phaser.GameObjects.Image;
  line?: Phaser.GameObjects.Image;
  resolved?: boolean;
  hit?: boolean;
  stopped?: boolean;
  nearMissed?: boolean;
  mph?: number;
  phase?: number;
  state?: 'red' | 'yellow' | 'green';
  _ramped?: boolean;
  // pedestrian fields
  pedX?: number;         // current world x
  pedVx?: number;        // px/sec across road
  pedTelegraph?: number; // seconds remaining pausing before crossing
  pedCrossed?: boolean;  // fully across road
  pedSafeAwarded?: boolean;
  // shared: stroll = walks parallel on sidewalk, no collision
  stroll?: boolean;
  strollVy?: number;     // px/sec vertical relative to world (world scrolls up)
  // dog fields
  isRunaway?: boolean;
  barked?: boolean;
}


export class DrivingScene extends Phaser.Scene {
  private level!: LevelConfig;
  private difficulty!: DifficultyConfig;
  private effectiveLength = 0;
  private effectiveGap = 0;
  private tracker!: ScoreTracker;

  private road!: Phaser.GameObjects.TileSprite;
  private shoulderL!: Phaser.GameObjects.TileSprite;
  private shoulderR!: Phaser.GameObjects.TileSprite;
  private farBgL!: Phaser.GameObjects.TileSprite;
  private farBgR!: Phaser.GameObjects.TileSprite;
  private player!: Phaser.GameObjects.Image;
  private headlightL?: Phaser.GameObjects.Image;
  private headlightR?: Phaser.GameObjects.Image;
  private obstacles: Obstacle[] = [];
  private finishSprite!: Phaser.GameObjects.Image;

  // Animated score readout (lerps toward tracker.score)
  private displayScore = 0;


  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: WASD;

  private mph = 0;
  private prevMph = 0;
  private traveled = 0;
  private finished = false;
  private invulnUntil = 0;
  private speedingTimer = 0;
  private cleanTimer = 0;
  private laneCrossing = false;
  private laneCrossCooldown = 0;

  // Endless
  private lastRampAt = 0;
  private endlessSpawnCursor = 500;
  private endlessTrafficMul = 1;
  private endlessGap = 260;

  // HUD
  private scoreText!: Phaser.GameObjects.Text;
  private speedText!: Phaser.GameObjects.Text;
  private progressFill!: Phaser.GameObjects.Rectangle;
  private starHudText!: Phaser.GameObjects.Text;
  private comboText!: Phaser.GameObjects.Text;
  private shieldSprites: Phaser.GameObjects.Image[] = [];
  private muteBtn!: Phaser.GameObjects.Text;

  // Pickups: Star Magnet + Shield
  private magnetUntil = 0;
  private hasShield = false;
  private shieldAura?: Phaser.GameObjects.Image;
  private magnetHudBg?: Phaser.GameObjects.Rectangle;
  private magnetHudText?: Phaser.GameObjects.Text;
  private shieldHudIcon?: Phaser.GameObjects.Image;
  private magnetTrailAt = 0;

  // Adaptive endless intensity + Personal Best marker
  private lastIntensityStep = 0;
  private pbBestDistance = 0;
  private pbShown = false;

  // Skid marks pool
  private skidPool: Phaser.GameObjects.Rectangle[] = [];
  private skidLastAt = 0;

  constructor() {
    super('driving');
  }

  init(data: { levelId?: string; difficulty?: Difficulty }) {
    this.level = getLevel(data.levelId ?? 'parking-lot');
    this.difficulty = getDifficulty(data.difficulty);
    this.effectiveLength = this.level.endless ? Infinity : this.level.length * this.difficulty.lengthMul;
    this.effectiveGap = this.level.obstacleGap * this.difficulty.gapMul;
    this.tracker = new ScoreTracker();
    this.obstacles = [];
    this.mph = 0;
    this.prevMph = 0;
    this.traveled = 0;
    this.finished = false;
    this.invulnUntil = 0;
    this.speedingTimer = 0;
    this.cleanTimer = 0;
    this.laneCrossing = false;
    this.laneCrossCooldown = 0;
    this.lastRampAt = 0;
    this.endlessSpawnCursor = 500;
    this.endlessTrafficMul = 1;
    this.endlessGap = this.effectiveGap;
    this.shieldSprites = [];
    this.skidPool = [];
    this.skidLastAt = 0;
    this.magnetUntil = 0;
    this.hasShield = false;
    this.shieldAura = undefined;
    this.magnetHudBg = undefined;
    this.magnetHudText = undefined;
    this.shieldHudIcon = undefined;
    this.lastIntensityStep = 0;
    this.pbShown = false;
    this.pbBestDistance = 0;
    if (this.level.endless) {
      try {
        const raw = parseInt(localStorage.getItem('dk-game-endless-best-' + this.level.id) ?? '0', 10);
        this.pbBestDistance = Number.isFinite(raw) ? raw : 0;
      } catch { /* ignore */ }
    }
  }

  preload() {
    loadPlayerCarTexture(this);
  }

  create() {
    makeTextures(this);
    const lvl = this.level;

    // Far background silhouettes (parallax — scroll at 45% road speed)
    this.farBgL = this.add.tileSprite(0, 0, ROAD_X, GAME_H, 'far-bg').setOrigin(0);
    this.farBgR = this.add.tileSprite(ROAD_X + ROAD_W, 0, GAME_W - ROAD_X - ROAD_W, GAME_H, 'far-bg')
      .setOrigin(0).setFlipX(true);
    // Sidewalk + buildings + trees (scroll matched to road)
    this.shoulderL = this.add.tileSprite(0, 0, ROAD_X, GAME_H, 'shoulder-left').setOrigin(0);
    this.shoulderR = this.add.tileSprite(ROAD_X + ROAD_W, 0, GAME_W - ROAD_X - ROAD_W, GAME_H, 'shoulder-right').setOrigin(0);
    this.road = this.add.tileSprite(ROAD_X, 0, ROAD_W, GAME_H, 'road').setOrigin(0);

    if (lvl.nightAlpha) {
      this.add.rectangle(0, 0, GAME_W, GAME_H, 0x0a0a18, lvl.nightAlpha).setOrigin(0).setDepth(15);
    }
    if (lvl.weatherTint) {
      this.add.rectangle(0, 0, GAME_W, GAME_H, lvl.weatherTint.color, lvl.weatherTint.alpha)
        .setOrigin(0).setDepth(16);
    }

    if (lvl.endless) this.buildEndlessSeed();
    else this.buildCourse();

    this.displayScore = 0;


    this.player = this.add.image(LANE_X[1], PLAYER_Y, 'player-car').setDisplaySize(44, 92).setDepth(10);

    // Night headlight glow (rendered BELOW player)
    if (lvl.nightAlpha) {
      this.headlightL = this.add.image(LANE_X[1] - 12, PLAYER_Y - 40, 'headlight-glow')
        .setOrigin(0.5, 1).setScale(0.7, 0.9).setDepth(9).setAlpha(0.85);
      this.headlightR = this.add.image(LANE_X[1] + 12, PLAYER_Y - 40, 'headlight-glow')
        .setOrigin(0.5, 1).setScale(0.7, 0.9).setDepth(9).setAlpha(0.85);
    }

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = this.input.keyboard!.addKeys('W,A,S,D') as WASD;

    this.buildHud();
    this.showBanner(lvl.name, `${this.difficulty.label} · ${lvl.subtitle}`);

    // Sound: context was unlocked by the START button tap, so start engine + music
    // immediately on scene create. Keep input listeners as a fallback for edge cases
    // (e.g. direct deep-link into a game without a prior gesture).
    const trackId = pickTrackForLevel(lvl);
    sound.init();
    sound.startEngine();
    if (!sound.muted && !sound.musicMuted) sound.playTrack(trackId);
    const unlockAudio = () => {
      sound.init();
      if (sound.isReady()) {
        sound.startEngine();
        if (!sound.muted && !sound.musicMuted) sound.playTrack(trackId);
      }
    };
    this.input.keyboard!.on('keydown', unlockAudio);
    this.input.on('pointerdown', unlockAudio);


    this.events.once('shutdown', () => {
      sound.stopEngine();
      sound.stopMusic();
    });
  }


  // ------------------------------------------------------------- course ---
  private buildCourse() {
    const lvl = this.level;
    const has = (t: ObstacleType) => lvl.features.includes(t);
    const reserved: number[] = [];
    const reserve = (d: number) => reserved.push(d);
    const isFree = (d: number, pad = 220) => reserved.every((r) => Math.abs(r - d) > pad);
    const totalLen = this.effectiveLength;

    if (has('checkpoint')) {
      for (let i = 1; i <= 3; i++) {
        const d = (totalLen * i) / 4;
        reserve(d);
        this.spawn('checkpoint', d, 1);
      }
    }
    if (has('stopSign')) {
      for (let d = 1400; d < totalLen - 800; d += 2600) {
        if (!isFree(d)) continue;
        reserve(d);
        this.spawn('stopSign', d, 2);
      }
    }
    if (has('trafficLight')) {
      for (let d = 2600; d < totalLen - 800; d += 3200) {
        if (!isFree(d)) continue;
        reserve(d);
        this.spawn('trafficLight', d, 0);
      }
    }

    const rnd = new Phaser.Math.RandomDataGenerator([lvl.id, this.difficulty.id]);
    const pool: ObstacleType[] = [];
    if (has('cone')) pool.push('cone', 'cone');
    if (has('parkedCar')) pool.push('parkedCar');
    if (has('traffic')) pool.push('traffic');

    for (let d = 700; d < totalLen - 600; d += this.effectiveGap + rnd.between(-80, 120)) {
      if (!isFree(d, 180) || pool.length === 0) continue;
      const type = rnd.pick(pool);
      const lane = type === 'parkedCar' ? rnd.pick([0, 2]) : rnd.between(0, 2);
      this.spawn(type, d, lane, rnd);
    }

    // Sprinkle gold stars
    if (has('star')) {
      for (let d = 500; d < totalLen - 300; d += 380 + rnd.between(-60, 120)) {
        if (!isFree(d, 90)) continue;
        const lane = rnd.between(0, 2);
        this.spawn('star', d, lane);
      }
    }

    // Pedestrians — frequency scales with difficulty tier + optional level mul
    const pedMul = this.level.pedDensityMul ?? 1;
    const pedGap = Math.max(400, (1800 - 300 * DIFF_INDEX[this.difficulty.id]) / pedMul);
    for (let d = 1000; d < totalLen - 500; d += pedGap + rnd.between(-200, 300)) {
      if (!isFree(d, 200)) continue;
      this.spawn('pedestrian', d, 1, rnd);
    }
    // Sidewalk strollers (always some, extra with pedDensityMul)
    const strollGap = Math.max(320, 900 / pedMul);
    for (let d = 600; d < totalLen - 300; d += strollGap + rnd.between(-120, 200)) {
      this.spawnStroller(d, rnd);
    }
    // Dogs — some leashed strolling with an owner, some runaway crossing
    const dogMul = this.level.dogDensityMul ?? 1;
    if (dogMul > 0) {
      const dogGap = Math.max(700, 2400 / dogMul);
      for (let d = 1500; d < totalLen - 600; d += dogGap + rnd.between(-200, 400)) {
        if (!isFree(d, 180)) continue;
        this.spawnDog(d, rnd);
      }
    }

    // Sparse pickups (~1 per 2500 units), alternating types, never adjacent.
    let pkFlip = 0;
    let lastPickupD = -Infinity;
    for (let d = 1200; d < totalLen - 400; d += 2500 + rnd.between(-300, 300)) {
      if (!isFree(d, 200) || Math.abs(d - lastPickupD) < 500) continue;
      const type: ObstacleType = (pkFlip++ % 2 === 0) ? 'magnet' : 'shieldPickup';
      const lane = rnd.between(0, 2);
      this.spawn(type, d, lane);
      lastPickupD = d;
    }

    this.finishSprite = this.add.image(ROAD_X, -2000, 'finish').setOrigin(0, 0.5).setDepth(2);
  }

  /** Seed the endless course; more chunks appended in update(). */
  private buildEndlessSeed() {
    this.finishSprite = this.add.image(ROAD_X, -20000, 'finish').setOrigin(0, 0.5).setDepth(2).setVisible(false);
    this.appendEndlessChunk(500, 4500);
  }

  private endlessRnd = new Phaser.Math.RandomDataGenerator(['endless-' + Date.now()]);

  private appendEndlessChunk(from: number, to: number) {
    const lvl = this.level;
    const has = (t: ObstacleType) => lvl.features.includes(t);
    const rnd = this.endlessRnd;
    const gap = this.endlessGap;

    // Stop signs / lights on rhythm
    for (let d = from + 800; d < to; d += 2200 + rnd.between(-200, 300)) {
      const type: ObstacleType = rnd.pick(['stopSign', 'trafficLight']);
      const lane = type === 'stopSign' ? 2 : 0;
      this.spawn(type, d, lane);
    }
    const pool: ObstacleType[] = ['cone', 'cone', 'parkedCar', 'traffic', 'traffic'];
    for (let d = from; d < to; d += gap + rnd.between(-40, 60)) {
      const type = rnd.pick(pool);
      const lane = type === 'parkedCar' ? rnd.pick([0, 2]) : rnd.between(0, 2);
      this.spawn(type, d, lane, rnd);
    }
    if (has('star')) {
      for (let d = from + 200; d < to; d += 320 + rnd.between(-40, 80)) {
        this.spawn('star', d, rnd.between(0, 2));
      }
    }
    // Endless pedestrians — grow more frequent as the traffic multiplier grows.
    const pedGap = Math.max(500, 1500 / this.endlessTrafficMul);
    for (let d = from + 400; d < to; d += pedGap + rnd.between(-100, 200)) {
      this.spawn('pedestrian', d, 1, rnd);
    }
    // Sidewalk strollers + occasional runaway dog for variety
    for (let d = from + 200; d < to; d += 700 + rnd.between(-150, 250)) {
      this.spawnStroller(d, rnd);
    }
    for (let d = from + 900; d < to; d += 2200 + rnd.between(-300, 500)) {
      this.spawnDog(d, rnd);
    }
    // Pickups per chunk (~1 per 2500 units): two positions, alternating.
    const chunkFlipBase = Math.floor(from / 2500);
    const spots = [from + 1000, from + 3000];
    for (let i = 0; i < spots.length; i++) {
      const d = spots[i] + rnd.between(-120, 120);
      if (d <= from || d >= to) continue;
      const type: ObstacleType = ((chunkFlipBase + i) % 2 === 0) ? 'magnet' : 'shieldPickup';
      this.spawn(type, d, rnd.between(0, 2));
    }
    this.endlessSpawnCursor = to;
  }

  private spawn(type: ObstacleType, d: number, lane: number, rnd?: Phaser.Math.RandomDataGenerator) {
    let sprite: Phaser.GameObjects.Image | undefined;
    let line: Phaser.GameObjects.Image | undefined;
    let mph: number | undefined;
    let phase: number | undefined;
    let state: Obstacle['state'];

    const stopLine = () =>
      this.add.image(ROAD_X, -200, 'stop-line').setOrigin(0, 0.5).setDisplaySize(ROAD_W, 8).setDepth(3);

    switch (type) {
      case 'cone':
        sprite = this.add.image(LANE_X[lane], -200, 'cone').setDepth(4);
        break;
      case 'parkedCar': {
        const key = rnd ? rnd.pick(['car-gray', 'car-blue', 'car-white']) : 'car-gray';
        const x = lane === 0 ? ROAD_X + 30 : ROAD_X + ROAD_W - 30;
        sprite = this.add.image(x, -200, key).setDepth(4).setDisplaySize(44, 82);
        break;
      }
      case 'traffic': {
        const key = rnd ? rnd.pick(['car-red', 'car-blue', 'car-gray']) : 'car-red';
        sprite = this.add.image(LANE_X[lane], -200, key).setDepth(5).setDisplaySize(44, 82);
        const baseTrafficMul = this.difficulty.trafficMul * (this.level.endless ? this.endlessTrafficMul : 1);
        mph = this.level.speedLimit * (rnd ? rnd.realInRange(0.45, 0.7) : 0.6) * baseTrafficMul * this.difficulty.speedMul;
        break;
      }
      case 'stopSign':
        sprite = this.add.image(GAME_W - 26, -200, 'stop-sign').setDepth(6);
        line = stopLine();
        break;
      case 'trafficLight':
        sprite = this.add.image(26, -200, 'light-green').setDepth(6);
        line = stopLine();
        phase = Math.random() * 8;
        state = 'green';
        break;
      case 'checkpoint':
        sprite = this.add.image(ROAD_X, -200, 'checkpoint').setOrigin(0, 0.5).setDepth(3);
        break;
      case 'star':
        sprite = this.add.image(LANE_X[lane], -200, 'gold-star').setDepth(6);
        break;
      case 'pedestrian': {
        // Spawn on left or right sidewalk; walk across when telegraph elapses.
        const fromLeft = (rnd ? rnd.frac() : Math.random()) > 0.5;
        const startX = fromLeft ? ROAD_X - 4 : ROAD_X + ROAD_W + 4;
        sprite = this.add.image(startX, -200, 'pedestrian').setDepth(7).setDisplaySize(22, 32);
        // Outfit variety via tint
        const tint = rnd ? rnd.pick([...PED_TINTS]) : PED_TINTS[0];
        sprite.setTint(tint);
        // Speed scales lightly with difficulty; each ped has a slightly different pace
        const baseVx = (45 + (rnd ? rnd.between(0, 25) : 15)) * this.difficulty.speedMul;
        mph = fromLeft ? baseVx : -baseVx; // reuse mph field for horizontal velocity
        break;
      }
      case 'dog': {
        const key = rnd ? rnd.pick([...DOG_KEYS]) : DOG_KEYS[0];
        // Runaway dogs start on either side, cross fast
        const fromLeft = (rnd ? rnd.frac() : Math.random()) > 0.5;
        const startX = fromLeft ? ROAD_X - 4 : ROAD_X + ROAD_W + 4;
        sprite = this.add.image(startX, -200, key).setDepth(7).setDisplaySize(24, 18);
        const baseVx = (85 + (rnd ? rnd.between(0, 40) : 20)) * this.difficulty.speedMul;
        mph = fromLeft ? baseVx : -baseVx;
        break;
      }
      case 'magnet': {
        sprite = this.add.image(LANE_X[lane], -200, 'magnet').setDepth(6).setDisplaySize(34, 34);
        break;
      }
      case 'shieldPickup': {
        sprite = this.add.image(LANE_X[lane], -200, 'shield').setDepth(6).setDisplaySize(30, 34);
        break;
      }
    }
    if (!sprite) return;
    sprite.setVisible(false);
    line?.setVisible(false);
    const ob: Obstacle = { type, d, lane, sprite, line, mph, phase, state };
    if (type === 'pedestrian') {
      ob.pedX = sprite.x;
      ob.pedVx = mph;
      // Telegraph shrinks at higher difficulty (fair but riskier).
      ob.pedTelegraph = Math.max(0.35, 1.4 - 0.3 * DIFF_INDEX[this.difficulty.id]);
    }
    if (type === 'dog') {
      ob.pedX = sprite.x;
      ob.pedVx = mph;
      ob.isRunaway = true;
      // Shorter warning — audio bark gives fair cue
      ob.pedTelegraph = Math.max(0.25, 0.9 - 0.2 * DIFF_INDEX[this.difficulty.id]);
    }
    this.obstacles.push(ob);
  }

  /** Sidewalk stroller — decorative pedestrian on curb, no collision. */
  private spawnStroller(d: number, rnd: Phaser.Math.RandomDataGenerator) {
    const onLeft = rnd.frac() > 0.5;
    const x = onLeft ? ROAD_X - 20 : ROAD_X + ROAD_W + 20;
    const sprite = this.add.image(x, -200, 'pedestrian').setDepth(4).setDisplaySize(20, 28);
    sprite.setTint(rnd.pick([...PED_TINTS]));
    sprite.setVisible(false);
    // Some walk with the traffic (down = slower relative flow), some against.
    const strollVy = rnd.pick([-20, -14, 12, 18]);
    const ob: Obstacle = { type: 'pedestrian', d, lane: onLeft ? -1 : 3, sprite, stroll: true, strollVy };
    this.obstacles.push(ob);
    // 30% of strollers get a leashed dog beside them.
    if (rnd.frac() < 0.3) {
      const dogKey = rnd.pick([...DOG_KEYS]);
      const dogX = x + (onLeft ? 10 : -10);
      const dogSprite = this.add.image(dogX, -200, dogKey).setDepth(4).setDisplaySize(20, 14);
      dogSprite.setVisible(false);
      this.obstacles.push({
        type: 'dog', d: d + 12, lane: onLeft ? -1 : 3, sprite: dogSprite,
        stroll: true, strollVy,
      });
    }
  }

  /** Runaway dog + optional chasing owner. Same catastrophic collision as pedestrian. */
  private spawnDog(d: number, rnd: Phaser.Math.RandomDataGenerator) {
    this.spawn('dog', d, 1, rnd);
    // 55% chance an owner comes chasing shortly after
    if (rnd.frac() < 0.55) {
      this.spawn('pedestrian', d + 40, 1, rnd);
    }
  }

  // ---------------------------------------------------------------- HUD ---
  private buildHud() {
    const lvl = this.level;
    const hudStyle = { fontFamily: '"Bebas Neue", sans-serif', fontSize: '22px', color: '#ffffff' };
    this.add.rectangle(0, 0, GAME_W, 68, 0x101014, 0.85).setOrigin(0).setDepth(20);

    this.scoreText = this.add.text(10, 8, 'SCORE 0', { ...hudStyle, color: '#f2c14e' }).setDepth(21);
    this.speedText = this.add.text(GAME_W - 10, 8, `0 MPH · LIMIT ${lvl.speedLimit}`, hudStyle)
      .setOrigin(1, 0).setDepth(21);

    this.starHudText = this.add.text(10, 34, '★ 0', { ...hudStyle, fontSize: '18px', color: '#f2c14e' }).setDepth(21);
    this.comboText = this.add.text(GAME_W / 2, 34, '×1', { ...hudStyle, fontSize: '20px', color: '#ffe89a' })
      .setOrigin(0.5, 0).setDepth(21);

    // Safety record: three shields on every course
    for (let i = 0; i < 3; i++) {
      const s = this.add.image(GAME_W - 52 - i * 24, 50, 'shield').setDepth(22).setScale(0.7);
      this.shieldSprites.push(s);
    }
    if (!this.level.endless) {
      this.add.rectangle(GAME_W / 2, 58, 220, 6, 0x3a3a40).setDepth(21);
      this.progressFill = this.add.rectangle(GAME_W / 2 - 110, 58, 1, 6, 0xf2c14e)
        .setOrigin(0, 0.5).setDepth(22);
    }

    // Mute toggle
    this.muteBtn = this.add.text(GAME_W - 8, 40, sound.muted ? '🔇' : '🔊', {
      fontFamily: 'Inter, sans-serif', fontSize: '20px', color: '#ffffff',
    }).setOrigin(1, 0).setDepth(22).setInteractive({ useHandCursor: true });
    this.muteBtn.on('pointerdown', (p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
      e.stopPropagation();
      sound.init();
      const nowMuted = sound.toggleMute();
      this.muteBtn.setText(nowMuted ? '🔇' : '🔊');
    });
  }

  private showBanner(title: string, sub: string) {
    const t = this.add.text(GAME_W / 2, 300, title.toUpperCase(), {
      fontFamily: '"Bebas Neue", sans-serif', fontSize: '48px', color: '#f2c14e',
      stroke: '#101014', strokeThickness: 8,
    }).setOrigin(0.5).setDepth(30);
    const s = this.add.text(GAME_W / 2, 348, sub, {
      fontFamily: 'Inter, sans-serif', fontSize: '14px', color: '#ffffff',
      stroke: '#101014', strokeThickness: 5, align: 'center', wordWrap: { width: GAME_W - 40 },
    }).setOrigin(0.5).setDepth(30);
    this.tweens.add({
      targets: [t, s], alpha: 0, delay: 2000, duration: 600,
      onComplete: () => { t.destroy(); s.destroy(); },
    });
  }

  private float(text: string, color: string, x = this.player.x, y = this.player.y - 60) {
    const f = this.add.text(x, y, text, {
      fontFamily: '"Bebas Neue", sans-serif', fontSize: '26px', color,
      stroke: '#101014', strokeThickness: 6,
    }).setOrigin(0.5).setDepth(30);
    this.tweens.add({
      targets: f, y: y - 70, alpha: 0, duration: 1100, ease: 'Cubic.easeOut',
      onComplete: () => f.destroy(),
    });
  }

  private award(key: PointKey, label?: string): number {
    const pts = this.tracker.add(key);
    const d = this.tracker.last!, cue = deltaCue(d), good = d.severity === 'reward';
    const comboTag = good && this.tracker.combo > 1 ? ` ×${this.tracker.combo}` : '';
    this.float(`${label ?? ''} ${cue.chip}${comboTag}`.trim(), good ? '#f2c14e' : '#ff5a4e');
    if (cue.sub && (cue.tierUp || cue.tierDown || cue.kind === 'strike' || cue.kind === 'crit')) this.float(cue.sub, good ? '#ffe89a' : '#ff9a8e', GAME_W / 2, 150);
    if (good) {
      if (cue.tierUp) sound.tierUp();
      this.scoreText.setColor('#fff3c4'); this.time.delayedCall(260, () => this.scoreText.setColor('#f2c14e'));
      this.tweens.add({ targets: this.scoreText, scale: 1.18, yoyo: true, duration: 120 });
    } else {
      this.cleanTimer = 0;
      this.cameras.main.shake(cue.kind === 'strike' || cue.kind === 'crit' ? 260 : 120, cue.kind === 'strike' || cue.kind === 'crit' ? 0.01 : 0.004);
      this.player.setTint(0xff6b5e);
      this.time.delayedCall(200, () => this.player.clearTint());
      this.scoreText.setColor('#ff5a4e'); this.time.delayedCall(420, () => this.scoreText.setColor('#f2c14e'));
      if (cue.kind === 'strike') { sound.strikeHit(); this.cameras.main.flash(180, 255, 60, 40); }
      else if (cue.tierDown) sound.tierDown();
    }
    // Safety record shields: one goes dark for each strike. The third ends the exam.
    this.shieldSprites.forEach((sh, i) => { if (i >= 3 - this.tracker.strikes) this.tweens.add({ targets: sh, alpha: 0.2, scale: 0.4, duration: 300 }); });
    // score display is lerped by animateScore()

    this.updateComboHud();
    if (d.severity === 'strike' && this.tracker.examOver && !this.finished) {
      this.float('EXAM OVER', '#ff5a4e', GAME_W / 2, 300);
      this.time.delayedCall(700, () => this.finish());
    }
    return pts;
  }

  private updateComboHud() {
    const c = this.tracker.combo;
    this.comboText.setText(c > 1 ? `${TIER_NAMES[c - 1]} ×${c}` : '×1');
    const scale = 1 + (c - 1) * 0.12;
    this.comboText.setScale(scale);
    this.comboText.setColor(c >= 5 ? '#ffe89a' : c >= 3 ? '#f2c14e' : '#ffffff');
    this.starHudText.setText(`★ ${this.tracker.starsCollected}`);
    // Each combo step raises positive SFX pitch by a semitone.
    sound.setSfxPitchStep(Math.max(0, c - 1));
  }

  private handlePickup(ob: Obstacle, time: number) {
    if (ob.resolved) return;
    const dx = Math.abs(this.player.x - ob.sprite.x);
    const dy = Math.abs(this.player.y - ob.sprite.y);
    if (dx > 26 || dy > 34) return;
    ob.resolved = true;
    ob.sprite.setVisible(false);
    if (ob.type === 'magnet') {
      this.magnetUntil = time + 10000;
      sound.magnetPickup();
      this.float('★ MAGNET', '#f2c14e');
    } else {
      if (!this.hasShield) {
        this.hasShield = true;
        this.shieldAura = this.add.image(this.player.x, this.player.y, 'shield-aura')
          .setDepth(9).setAlpha(0.9).setBlendMode(Phaser.BlendModes.ADD);
        this.tweens.add({ targets: this.shieldAura, alpha: 0.6, yoyo: true, repeat: -1, duration: 700, ease: 'Sine.easeInOut' });
      }
      sound.shieldPickup();
      this.float('🛡 SHIELD', '#f2c14e');
    }
    for (let i = 0; i < 6; i++) {
      const s = this.add.image(ob.sprite.x, ob.sprite.y, 'spark').setDepth(25).setTint(0xf2c14e);
      this.tweens.add({
        targets: s, x: s.x + Phaser.Math.Between(-40, 40), y: s.y + Phaser.Math.Between(-40, 40),
        alpha: 0, scale: 0, duration: 450, onComplete: () => s.destroy(),
      });
    }
  }

  private updatePickupsHud(time: number) {
    if (this.shieldAura) {
      this.shieldAura.x = this.player.x;
      this.shieldAura.y = this.player.y;
      this.shieldAura.setVisible(this.hasShield);
    }
    const magActive = time < this.magnetUntil;
    if (magActive) {
      const secs = Math.max(0, Math.ceil((this.magnetUntil - time) / 1000));
      if (!this.magnetHudBg) {
        this.magnetHudBg = this.add.rectangle(GAME_W / 2, 78, 118, 22, 0xf2c14e, 0.22)
          .setStrokeStyle(1.5, 0xf2c14e).setDepth(22);
        this.magnetHudText = this.add.text(GAME_W / 2, 78, `★ MAGNET ${secs}s`, {
          fontFamily: '"Bebas Neue", sans-serif', fontSize: '15px', color: '#ffe89a',
        }).setOrigin(0.5).setDepth(23);
      } else {
        this.magnetHudText?.setText(`★ MAGNET ${secs}s`);
      }
      if (time - this.magnetTrailAt > 60) {
        this.magnetTrailAt = time;
        const s = this.add.image(this.player.x + Phaser.Math.Between(-10, 10), this.player.y + 20, 'spark')
          .setDepth(9).setTint(0xf2c14e).setScale(0.5);
        this.tweens.add({ targets: s, alpha: 0, scale: 0, y: s.y + 30, duration: 500, onComplete: () => s.destroy() });
      }
    } else if (this.magnetHudBg) {
      this.magnetHudBg.destroy(); this.magnetHudBg = undefined;
      this.magnetHudText?.destroy(); this.magnetHudText = undefined;
    }
    if (this.hasShield && !this.shieldHudIcon) {
      this.shieldHudIcon = this.add.image(58, 42, 'shield').setDepth(22).setScale(0.55);
    } else if (!this.hasShield && this.shieldHudIcon) {
      this.shieldHudIcon.destroy(); this.shieldHudIcon = undefined;
    }
  }

  private sparks(x: number, y: number) {
    for (let i = 0; i < 6; i++) {
      const s = this.add.image(x, y, 'spark').setDepth(25).setScale(0.6);
      this.tweens.add({
        targets: s, x: x + Phaser.Math.Between(-40, 40), y: y + Phaser.Math.Between(-40, 40),
        alpha: 0, scale: 0, duration: 350, onComplete: () => s.destroy(),
      });
    }
  }

  // ------------------------------------------------------------- update ---
  update(time: number, deltaMs: number) {
    const dt = Math.min(deltaMs, 50) / 1000;
    if (this.finished) return;

    this.prevMph = this.mph;
    this.handleDriving(dt);
    const scroll = this.mph * MPH_TO_PX * dt;
    this.road.tilePositionY -= scroll;
    this.shoulderL.tilePositionY -= scroll;
    this.shoulderR.tilePositionY -= scroll;
    // Parallax: distant silhouettes scroll slower
    this.farBgL.tilePositionY -= scroll * 0.45;
    this.farBgR.tilePositionY -= scroll * 0.45;

    // Update engine sound
    sound.updateEngine(Math.min(1, this.mph / this.level.maxSpeed));

    if (this.headlightL && this.headlightR) {
      this.headlightL.x = this.player.x - 12;
      this.headlightR.x = this.player.x + 12;
    }

    // Skid marks on hard braking
    this.trySkidMark(time);

    if (this.level.endless) this.updateEndless();
    else this.updateProgressiveRamp();
    this.updateObstacles(time, dt);
    this.checkLaneDiscipline(dt);
    this.checkSpeeding(dt);
    this.checkSmoothDriving(dt);
    this.updateHud();
    this.animateScore(dt);

    if (!this.level.endless && this.traveled >= this.effectiveLength) this.finish(true);
  }

  /** Smoothly counts the displayed score toward the tracked score. */
  private animateScore(dt: number) {
    const target = this.tracker.score;
    if (this.displayScore === target) return;
    const diff = target - this.displayScore;
    const step = Math.sign(diff) * Math.max(1, Math.ceil(Math.abs(diff) * Math.min(1, dt * 6)));
    if (Math.abs(step) >= Math.abs(diff)) this.displayScore = target;
    else this.displayScore += step;
    this.scoreText.setText(`SCORE ${this.displayScore}`);
  }

  /** Non-endless levels also ramp subtly the longer a run goes. */
  private updateProgressiveRamp() {
    // Squeeze gap by up to 25% over full course; traffic speeds by up to 20%.
    const p = Phaser.Math.Clamp(this.traveled / Math.max(1, this.effectiveLength), 0, 1);
    const gapFactor = 1 - 0.25 * p;
    const trafficFactor = 1 + 0.20 * p;
    // Apply to still-unseen obstacles (cheap: nudge their d spacing lazily via mph).
    for (const ob of this.obstacles) {
      if (ob.type === 'traffic' && ob.mph && !ob._ramped) {
        ob.mph *= trafficFactor;
        ob._ramped = true;
      }
    }
    // Store for future spawns (used only in endless path); keep effectiveGap fresh for UI feel.
    this.effectiveGap = this.level.obstacleGap * this.difficulty.gapMul * gapFactor;
  }


  private trySkidMark(time: number) {
    const braking = (this.cursors.down.isDown || this.wasd.S.isDown || touchControls.brake);
    if (braking && this.prevMph > 20 && time - this.skidLastAt > 40) {
      this.skidLastAt = time;
      const mk = (dx: number) => {
        const r = this.add.rectangle(this.player.x + dx, this.player.y + 30, 4, 12, 0x151517, 0.55).setDepth(6);
        this.skidPool.push(r);
        this.tweens.add({ targets: r, alpha: 0, duration: 1400, onComplete: () => r.destroy() });
      };
      mk(-14); mk(14);
      if (this.skidPool.length > 60) {
        const old = this.skidPool.shift();
        old?.destroy();
      }
    }
  }

  private updateEndless() {
    // Ramp difficulty every 500 units — asymptotic (capped) so the run stays
    // hard-yet-survivable no matter how far the player goes. Endless truly is endless:
    // the run ends only via existing rules (3 vehicle-crash strikes, or a catastrophic
    // pedestrian/dog hit). No distance, time, score, or entity-count cap exists.
    const step = Math.floor(this.traveled / 500);
    if (step > this.lastRampAt) {
      this.lastRampAt = step;
      this.endlessGap = Math.max(140, this.endlessGap * 0.96);
      this.endlessTrafficMul = Math.min(2.2, this.endlessTrafficMul * 1.02);
    }
    // Extend the world
    if (this.traveled + 4000 > this.endlessSpawnCursor) {
      this.appendEndlessChunk(this.endlessSpawnCursor, this.endlessSpawnCursor + 4000);
    }
    // Distance bonus: 1pt per 10 units. Accrue in 100-unit chunks.
    const chunk = Math.floor(this.traveled / 100);
    if (chunk > this._lastDistChunk) {
      const gain = (chunk - this._lastDistChunk) * 10;
      this._lastDistChunk = chunk;
      this.tracker.addDistanceBonus(gain);
      this.scoreText.setText(`SCORE ${this.tracker.score}`);
    }
    // Adaptive music intensity: step up every 2000 units, capped at 3.
    const intensity = Math.min(3, Math.floor(this.traveled / 2000));
    if (intensity !== this.lastIntensityStep) {
      this.lastIntensityStep = intensity;
      sound.setEndlessIntensity(intensity);
    }
    // Personal Best marker — gold sweep + fanfare when we cross prior best.
    if (!this.pbShown && this.pbBestDistance > 0 && this.traveled >= this.pbBestDistance) {
      this.pbShown = true;
      this.showPersonalBest();
    }
  }

  private showPersonalBest() {
    sound.personalBest();
    const line = this.add.rectangle(ROAD_X, this.player.y - 40, ROAD_W, 6, 0xf2c14e, 0.95).setOrigin(0, 0.5).setDepth(35);
    const label = this.add.text(GAME_W / 2, this.player.y - 100, 'NEW BEST!', {
      fontFamily: '"Bebas Neue", sans-serif', fontSize: '48px', color: '#f2c14e',
      stroke: '#101014', strokeThickness: 8,
    }).setOrigin(0.5).setDepth(36).setScale(0.2);
    this.tweens.add({ targets: label, scale: 1, duration: 320, ease: 'Back.easeOut' });
    this.tweens.add({ targets: line, scaleY: 3, alpha: 0, duration: 900, ease: 'Cubic.easeOut',
      onComplete: () => line.destroy() });
    this.tweens.add({ targets: label, alpha: 0, y: label.y - 20, delay: 1400, duration: 600,
      onComplete: () => label.destroy() });
  }
  private _lastDistChunk = 0;

  private handleDriving(dt: number) {
    const k = this.cursors;
    const w = this.wasd;
    const gas = k.up.isDown || w.W.isDown || touchControls.gas;
    const brake = k.down.isDown || w.S.isDown || touchControls.brake;
    const left = k.left.isDown || w.A.isDown || touchControls.left;
    const right = k.right.isDown || w.D.isDown || touchControls.right;

    if (gas) this.mph += 32 * dt;
    else if (brake) this.mph -= 70 * dt;
    else this.mph -= 9 * dt;
    this.mph = Phaser.Math.Clamp(this.mph, 0, this.level.maxSpeed * this.difficulty.speedMul);

    this.traveled += this.mph * MPH_TO_PX * dt;

    const steer = 240 * Phaser.Math.Clamp(this.mph / 18, 0, 1);
    if (left) this.player.x -= steer * dt;
    if (right) this.player.x += steer * dt;
    this.player.x = Phaser.Math.Clamp(this.player.x, ROAD_X + 26, ROAD_X + ROAD_W - 26);
    this.player.setAngle((Number(right) - Number(left)) * 4);

    // Tire screech when steering hard at speed OR braking hard
    if (this.mph > 35 && ((left || right) && this.mph > this.level.speedLimit - 5)) {
      sound.tireScreech(Math.min(1, this.mph / this.level.maxSpeed));
    } else if (brake && this.prevMph > 40 && this.mph < this.prevMph - 2) {
      sound.tireScreech(0.6);
    }
  }




  private screenY(d: number) {
    return PLAYER_Y - (d - this.traveled);
  }

  // Reused per-frame rectangles to avoid allocation in the hot path.
  private _pRect = new Phaser.Geom.Rectangle(0, 0, 36, 84);
  private _oRect = new Phaser.Geom.Rectangle(0, 0, 22, 22);

  private updateObstacles(time: number, dt: number) {
    this._pRect.x = this.player.x - 18;
    this._pRect.y = this.player.y - 42;

    // Cleanup obstacles far behind (endless)
    if (this.level.endless) {
      for (let i = this.obstacles.length - 1; i >= 0; i--) {
        if (this.obstacles[i].d < this.traveled - 400) {
          this.obstacles[i].sprite.destroy();
          this.obstacles[i].line?.destroy();
          this.obstacles.splice(i, 1);
        }
      }
    }

    for (const ob of this.obstacles) {
      if (ob.type === 'traffic' && ob.mph) ob.d += ob.mph * MPH_TO_PX * dt;

      const y = this.screenY(ob.d);
      // Collected stars stay hidden even when back on screen.
      const collectedStar = ob.type === 'star' && ob.resolved;
      const visible = !collectedStar && y > -140 && y < GAME_H + 140;
      ob.sprite.setVisible(visible);
      ob.line?.setVisible(visible);
      if (!visible) continue;

      ob.sprite.y = y;
      if (ob.line) ob.line.y = y;

      switch (ob.type) {
        case 'trafficLight':
          this.updateTrafficLight(ob, time);
          this.handleStopZone(ob, true);
          break;
        case 'stopSign':
          this.handleStopZone(ob, false);
          break;
        case 'checkpoint':
          if (!ob.resolved && this.traveled >= ob.d) {
            ob.resolved = true;
            this.award('CHECKPOINT', 'CHECKPOINT');
            sound.checkpoint();
          }
          break;
        case 'star':
          this.handleStar(ob);
          break;
        case 'pedestrian':
          if (ob.stroll) this.handleStroller(ob, time, dt);
          else this.handlePedestrian(ob, time, dt);
          break;
        case 'dog':
          if (ob.stroll) this.handleStroller(ob, time, dt);
          else this.handlePedestrian(ob, time, dt);
          break;
        case 'cone':
        case 'parkedCar':
        case 'traffic':
          this.handleCollision(ob, time);
          break;
        case 'magnet':
        case 'shieldPickup':
          this.handlePickup(ob, time);
          break;
      }
    }
    this.updatePickupsHud(time);
  }

  /** Sidewalk stroller update — pure decoration, moves in world Y, no collision. */
  private handleStroller(ob: Obstacle, time: number, dt: number) {
    // Move in world coords by drifting d so screenY() places it naturally.
    if (ob.strollVy != null) {
      ob.d += ob.strollVy * dt;
    }
    ob.sprite.setAngle(Math.sin(time / 90 + ob.d * 0.01) * 6);
  }

  /** Replaces the earlier handlePedestrian below with dog-aware variant. */

  private handlePedestrian(ob: Obstacle, time: number, dt: number) {
    if (ob.resolved) return;
    // Fair audio cue: bark once when a runaway dog first appears on screen.
    if (ob.type === 'dog' && !ob.barked && ob.sprite.y > -50 && ob.sprite.y < GAME_H) {
      ob.barked = true;
      sound.dogBark();
    }
    // Telegraph — stand still at curb, small bob
    if ((ob.pedTelegraph ?? 0) > 0) {
      ob.pedTelegraph! -= dt;
      // subtle bob so player notices
      ob.sprite.setScale(1 + Math.sin(time / 120) * 0.05);
      return;
    }
    // Cross the road
    if (ob.pedX != null && ob.pedVx != null && !ob.pedCrossed) {
      ob.pedX += ob.pedVx * dt;
      ob.sprite.x = ob.pedX;
      // walking wobble
      ob.sprite.setAngle(Math.sin(time / 80) * 8);
      const past = (ob.pedVx > 0 && ob.pedX > ROAD_X + ROAD_W + 4) ||
                   (ob.pedVx < 0 && ob.pedX < ROAD_X - 4);
      if (past) {
        ob.pedCrossed = true;
        ob.resolved = true;
        // Safe-pass bonus if player already went past this ped without hitting.
        if (!ob.hit && !ob.pedSafeAwarded && this.traveled > ob.d + 20) {
          ob.pedSafeAwarded = true;
          this.award('PED_SAFE_PASS', 'YIELDED');
          sound.checkpoint();
          this.sparks(ob.sprite.x, ob.sprite.y);
        }
        ob.sprite.setVisible(false);
        return;
      }
    }
    // Collision — player bbox overlap => catastrophic
    if (!ob.hit && time > this.invulnUntil) {
      const dx = Math.abs(this.player.x - ob.sprite.x);
      const dy = Math.abs(this.player.y - ob.sprite.y);
      if (dx < 22 && dy < 44) {
        ob.hit = true;
        this.pedestrianCatastrophe(ob);
        return;
      }
    }
    // Safe pass — passed while crossing but didn't hit
    if (!ob.hit && !ob.pedSafeAwarded && this.traveled > ob.d + 30 && (ob.pedTelegraph ?? 0) <= 0) {
      ob.pedSafeAwarded = true;
      this.award('PED_SAFE_PASS', 'YIELDED');
      sound.checkpoint();
    }
  }

  private pedestrianCatastrophe(ob: Obstacle) {
    const isDog = ob.type === 'dog';
    // Zero score, dramatic FX, end run.
    this.award(isDog ? 'HIT_ANIMAL' : 'HIT_PEDESTRIAN', isDog ? 'ANIMAL' : 'PEDESTRIAN');
    sound.catastrophe();
    if (isDog) sound.ownerShout();
    try { navigator.vibrate?.([80, 40, 120]); } catch { /* ignore */ }
    this.cameras.main.shake(500, 0.02);
    this.cameras.main.flash(400, 255, 40, 40);
    // Slow-mo
    this.time.timeScale = 0.35;
    this.tweens.add({ targets: ob.sprite, alpha: 0.2, angle: 90, y: ob.sprite.y + 20, duration: 400 });
    // Banner
    const bannerLabel = isDog ? 'GAME OVER: HIT A DOG!\nYou keep 25% of your points' : 'GAME OVER: PEDESTRIAN!\nYou keep 10% of your points';
    const banner = this.add.text(GAME_W / 2, 340, bannerLabel, {
      fontFamily: '"Bebas Neue", sans-serif', fontSize: '38px', color: '#ff5a4e',
      stroke: '#101014', strokeThickness: 8, align: 'center', wordWrap: { width: GAME_W - 30 },
    }).setOrigin(0.5).setDepth(60).setScale(0.2);
    this.tweens.add({ targets: banner, scale: 1, duration: 350, ease: 'Back.easeOut' });
    this.mph = 0;
    // Restore time and finish run
    window.setTimeout(() => { this.time.timeScale = 1; this.finish(); }, 1200);
  }


  private handleStar(ob: Obstacle) {
    if (ob.resolved) return;
    const now = this.time.now;
    const magActive = now < this.magnetUntil;
    // Magnet: within 1.5 lanes (~180px), drift the star toward the player.
    if (magActive) {
      const distX = this.player.x - ob.sprite.x;
      const distY = this.player.y - ob.sprite.y;
      const flat = Math.hypot(distX, distY);
      if (Math.abs(distX) < 180) {
        const pull = 6; // stronger the closer we get
        ob.sprite.x += Math.sign(distX) * Math.min(Math.abs(distX), pull);
        ob.sprite.y += Math.sign(distY) * Math.min(Math.abs(distY), pull * 1.3);
        if (flat < 40) {
          ob.resolved = true;
          ob.sprite.setVisible(false);
          this.award('STAR', 'STAR');
          sound.starPickup();
          return;
        }
      }
    }
    const dx = Math.abs(this.player.x - ob.sprite.x);
    const dy = Math.abs(this.player.y - ob.sprite.y);
    if (dx < 22 && dy < 26) {
      ob.resolved = true;
      ob.sprite.setVisible(false);
      this.award('STAR', 'STAR');
      sound.starPickup();
      for (let i = 0; i < 4; i++) {
        const s = this.add.image(ob.sprite.x, ob.sprite.y, 'spark').setDepth(25).setTint(0xf2c14e);
        this.tweens.add({ targets: s, x: s.x + Phaser.Math.Between(-30, 30), y: s.y - 40,
          alpha: 0, scale: 0, duration: 500, onComplete: () => s.destroy() });
      }
    }
  }

  private updateTrafficLight(ob: Obstacle, time: number) {
    const t = (time / 1000 + (ob.phase ?? 0)) % 8.2;
    const state: 'green' | 'yellow' | 'red' = t < 4 ? 'green' : t < 5.2 ? 'yellow' : 'red';
    if (state !== ob.state) {
      ob.state = state;
      ob.sprite.setTexture(`light-${state}`);
    }
  }

  private handleStopZone(ob: Obstacle, isLight: boolean) {
    if (ob.resolved) return;
    const dist = ob.d - this.traveled;
    if (dist > 0 && dist < 150 && this.mph <= 2) ob.stopped = true;
    if (dist <= 0) {
      ob.resolved = true;
      if (isLight) {
        if (ob.state === 'red') { this.award('RAN_RED_LIGHT', 'RED LIGHT!'); sound.yieldBuzz(); }
        else if (ob.state === 'green') { this.award('GREEN_LIGHT', 'GREEN LIGHT'); sound.checkpoint(); }
      } else {
        if (ob.stopped) { this.award('FULL_STOP', 'FULL STOP'); sound.stopDing(); }
        else { this.award('RAN_STOP_SIGN', 'STOP SIGN!'); sound.yieldBuzz(); }
      }
    }
  }

  private handleCollision(ob: Obstacle, time: number) {
    // Near-miss detection first
    if (!ob.hit && !ob.nearMissed && !ob.resolved) {
      const dy = ob.sprite.y - this.player.y;
      if (dy > -30 && dy < 60) {
        const dx = Math.abs(this.player.x - ob.sprite.x);
        if (dx > 22 && dx < 40 && this.mph > 10) {
          ob.nearMissed = true;
          this.award('NEAR_MISS', 'CLOSE!');
          sound.nearMissWhoosh();
        }
      }
    }

    if (ob.hit || time < this.invulnUntil) return;
    const s = ob.sprite;
    const w = ob.type === 'cone' ? 22 : 40;
    const h = ob.type === 'cone' ? 22 : 76;
    this._oRect.x = s.x - w / 2;
    this._oRect.y = s.y - h / 2;
    this._oRect.width = w;
    this._oRect.height = h;
    if (!Phaser.Geom.Rectangle.Overlaps(this._pRect, this._oRect)) return;

    ob.hit = true;
    this.sparks(s.x, s.y);

    // Shield absorbs the next car collision entirely (traffic + parked car).
    if (this.hasShield && (ob.type === 'traffic' || ob.type === 'parkedCar')) {
      this.hasShield = false;
      if (this.shieldAura) { this.shieldAura.destroy(); this.shieldAura = undefined; }
      sound.shieldBreak();
      this.float('SHIELD ABSORBED', '#ffe89a');
      this.invulnUntil = time + 900;
      this.cameras.main.flash(200, 242, 193, 78);
      // Blow the obstacle out of the way harmlessly.
      this.tweens.add({
        targets: s, x: s.x + Phaser.Math.Between(-140, 140), y: s.y + 200,
        angle: 200, alpha: 0.2, duration: 600,
      });
      return;
    }

    if (ob.type === 'cone') {
      this.award('HIT_CONE', 'CONE');
      sound.collision();
      this.tweens.add({
        targets: s, x: s.x + Phaser.Math.Between(-90, 90), y: s.y + 160,
        angle: 240, alpha: 0.4, duration: 500,
      });
    } else {
      this.award(ob.type === 'traffic' ? 'HIT_TRAFFIC' : 'HIT_PARKED_CAR', 'CRASH');
      sound.collision();
      this.mph *= 0.35;
      this.invulnUntil = time + 1200;
      this.tweens.add({
        targets: this.player, alpha: 0.35, yoyo: true, repeat: 4, duration: 120,
        onComplete: () => this.player.setAlpha(1),
      });
    }
  }

  private checkLaneDiscipline(dt: number) {
    this.laneCrossCooldown = Math.max(0, this.laneCrossCooldown - dt);
    const onDivider = DIVIDERS.some((d) => Math.abs(this.player.x - d) < 18);
    if (onDivider && this.mph > 6) {
      if (!this.laneCrossing && this.laneCrossCooldown === 0) {
        this.laneCrossing = true;
        this.laneCrossCooldown = 1.2;
        // Determine target lane: the lane the player is moving toward
        const px = this.player.x;
        let targetLane = 0;
        let bestDist = Infinity;
        for (let i = 0; i < LANE_X.length; i++) {
          const d = Math.abs(px - LANE_X[i]);
          if (d < bestDist) { bestDist = d; targetLane = i; }
        }
        // Unsafe if: (a) a traffic vehicle or parked car in target lane is within
        // close proximity of the player (would force a brake / cut-off), or
        // (b) a pedestrian is in the road near the player during the change.
        const PROX_AHEAD = 220; // px ahead in target lane considered "close"
        const PROX_BEHIND = 90; // px behind considered a cut-off
        let unsafe = false;
        let reason = 'UNSAFE LANE CHANGE';
        for (const ob of this.obstacles) {
          if (ob.resolved || ob.hit) continue;
          const sy = ob.sprite.y;
          const sx = ob.sprite.x;
          const dy = PLAYER_Y - sy; // >0 means obstacle is ahead of player
          if (ob.type === 'traffic' || ob.type === 'parkedCar') {
            if (ob.lane === targetLane && dy > -PROX_BEHIND && dy < PROX_AHEAD) {
              unsafe = true;
              reason = ob.type === 'parkedCar' ? 'UNSAFE LANE CHANGE' : 'CUT OFF A CAR';
              break;
            }
          } else if (ob.type === 'pedestrian' && !ob.stroll) {
            if (Math.abs(sx - LANE_X[targetLane]) < 60 && Math.abs(sy - PLAYER_Y) < 160) {
              unsafe = true;
              reason = 'UNSAFE LANE CHANGE';
              break;
            }
          }
        }
        if (unsafe) {
          this.award('LANE_CROSS', reason);
        }
        // Safe lane change → no penalty, no feedback.
      }
    } else if (!onDivider) {
      this.laneCrossing = false;
    }
  }

  private checkSpeeding(dt: number) {
    if (this.mph > this.level.speedLimit + this.difficulty.speedTolerance) {
      this.speedingTimer += dt;
      if (this.speedingTimer >= 2) {
        this.speedingTimer = 0;
        this.award('SPEEDING', 'SPEEDING');
      }
    } else {
      this.speedingTimer = 0;
    }
  }

  private checkSmoothDriving(dt: number) {
    if (this.mph > 8) this.cleanTimer += dt;
    if (this.cleanTimer >= 6) {
      this.cleanTimer = 0;
      this.award('SMOOTH_DRIVING', 'SMOOTH');
    }
  }

  private updateHud() {
    const over = this.mph > this.level.speedLimit + this.difficulty.speedTolerance;
    this.speedText.setText(`${Math.round(this.mph)} MPH · LIMIT ${this.level.speedLimit}`)
      .setColor(over ? '#ff5a4e' : '#ffffff');

    if (!this.level.endless && this.progressFill) {
      const p = Phaser.Math.Clamp(this.traveled / this.effectiveLength, 0, 1);
      this.progressFill.width = 220 * p;
      this.finishSprite.y = this.screenY(this.effectiveLength);
      this.finishSprite.setVisible(this.finishSprite.y > -60 && this.finishSprite.y < GAME_H + 60);
    }
  }

  public endEarly() { this.finish(); }

  private finish(completed = false) {
    if (this.finished) return;
    this.finished = true;
    const paid = completed && !this.level.endless && !this.tracker.examOver;
    if (paid) {
      this.tracker.add('FINISH_BONUS');
      this.tracker.settle();
      (['NO_CRASH_BONUS', 'SPOTLESS_BONUS', 'STREAK_MASTER'] as const).filter((k) => this.tracker.countOf(k) > 0)
        .forEach((k, i) => this.time.delayedCall(350 * (i + 1), () => this.float(`${labelOf(k)} +${POINTS[k]}`, '#ffe89a', GAME_W / 2, 220 + i * 34)));
    }
    this.scoreText.setText(`SCORE ${this.tracker.score}`);
    sound.fanfare();
    sound.setSfxPitchStep(0);
    sound.setEndlessIntensity(0);
    if (this.level.endless) {
      try {
        const d = Math.round(this.traveled);
        if (d > this.pbBestDistance) localStorage.setItem('dk-game-endless-best-' + this.level.id, String(d));
      } catch { /* ignore */ }
    }

    const label = this.level.endless ? 'RUN OVER' : paid ? 'FINISH!' : 'EXAM OVER';
    const banner = this.add.text(GAME_W / 2, 340, label, {
      fontFamily: '"Bebas Neue", sans-serif', fontSize: '68px', color: '#f2c14e',
      stroke: '#101014', strokeThickness: 10,
    }).setOrigin(0.5).setDepth(40).setScale(0.2);
    this.tweens.add({ targets: banner, scale: 1, duration: 400, ease: 'Back.easeOut' });

    this.time.delayedCall(1500, () => {
      this.game.events.emit(
        GAME_EVENTS.LEVEL_COMPLETE,
        buildResult(this.level, this.tracker, this.difficulty, { distance: Math.round(this.traveled), completed: paid })
      );
    });
  }
}

export { POINTS };
