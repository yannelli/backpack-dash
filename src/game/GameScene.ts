import Phaser from 'phaser';
import {
  ANIMATION_FRAMES,
  DEFAULT_RYAN_VISUAL,
  FRAME_HEIGHT,
  FRAME_WIDTH,
  jumpVisualForFrame,
  lookFrameForVector,
  registerRyanAnimations,
} from './atlas';
import { AudioManager } from './AudioManager';
import {
  FONT_FAMILY,
  GAME_HEIGHT,
  GAME_WIDTH,
  GRAVITY,
  GROUND_Y,
  MAX_COLLECTIBLES_PER_FLOOR,
  MAX_HAZARDS_PER_FLOOR,
  MAX_JUMP_HOLD_MS,
  PLAYER_SCALE,
  PLAYER_X,
  START_SPEED,
} from './constants';
import { floorLengthForFloor, generateFloorLayout, speedForFloor } from './generator';
import { JumpController, autoJumpScreenWindow, selectJumpImpulse } from './jump';
import { validatePatternLibrary } from './patterns';
import { createRng, seedFromUrl, type SeededRng } from './rng';
import { calculateScore } from './scoring';
import { commitRun, emptySave, loadSave, saveMuted } from './save';
import { THEMES, nextThemeIndex } from './themes';
import { createGameTextures } from './textures';
import type { GameUiAction, GameUiState } from './ui';
import type { GamePhase, RunStats, SaveDataV1, StorageLike, ThemeDefinition } from './types';

const EMPTY_STORAGE: StorageLike = {
  getItem: () => null,
  setItem: () => undefined,
};

export class GameScene extends Phaser.Scene {
  private phase: GamePhase = 'boot';
  private player!: Phaser.Physics.Arcade.Sprite;
  private playerVisual!: Phaser.GameObjects.Sprite;
  private groundCollider!: Phaser.GameObjects.Rectangle;
  private hazards!: Phaser.Physics.Arcade.Group;
  private collectibles!: Phaser.Physics.Arcade.Group;
  private rng!: SeededRng;
  private stats!: RunStats;
  private saveData: SaveDataV1 = emptySave();
  private storage: StorageLike = EMPTY_STORAGE;
  private audio!: AudioManager;
  private jumpController = new JumpController();

  private themeIndex = 0;
  private floorStartDistance = 0;
  private currentFloorTotal = 0;
  private currentFloorCollected = 0;
  private speed = START_SPEED;
  private actionHeld = false;
  private actionStartedAt = 0;
  private releasedBeforeLaunch = false;
  private wasGrounded = true;
  private retryAvailableAt = 0;
  private explicitSeed: string | null = null;
  private reducedMotion = false;
  private qaNoCollision = false;
  private qaAutoJump = false;

  private background?: Phaser.GameObjects.Image;
  private parallax?: Phaser.GameObjects.TileSprite;
  private groundVisual?: Phaser.GameObjects.TileSprite;

  private titleUi!: Phaser.GameObjects.Container;
  private titleStage!: Phaser.GameObjects.Container;
  private resultsReady = false;
  private isNewBest = false;
  private pauseAfterElevator = false;
  private activeMenuRyan?: Phaser.GameObjects.Sprite;
  private titleRyanTimer?: Phaser.Time.TimerEvent;
  private menuGazeTimer?: Phaser.Time.TimerEvent;
  private titleRyanCycle = 0;
  private elevatorUi!: Phaser.GameObjects.Container;
  private elevatorLeft!: Phaser.GameObjects.Rectangle;
  private elevatorRight!: Phaser.GameObjects.Rectangle;
  private elevatorFloorText!: Phaser.GameObjects.Text;

  constructor() {
    super('BackpackDash');
  }

  preload(): void {
    this.load.spritesheet('mini-ryan', 'assets/mini-ryan.webp', {
      frameWidth: FRAME_WIDTH,
      frameHeight: FRAME_HEIGHT,
    });
  }

  create(): void {
    const validation = validatePatternLibrary();
    if (!validation.ok) throw new Error(`Unsafe pattern library: ${validation.errors.join('; ')}`);

    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.storage = this.safeStorage();
    this.saveData = loadSave(this.storage);
    this.audio = new AudioManager(this.saveData.muted);
    const searchParams = new URL(window.location.href).searchParams;
    this.explicitSeed = searchParams.get('seed')?.trim() || null;
    this.qaNoCollision = searchParams.get('qaNoCollision') === '1';
    this.qaAutoJump = searchParams.get('qaAutoJump') === '1';

    createGameTextures(this);
    registerRyanAnimations(this);
    this.renderTheme(0);
    this.createPhysicsWorld();
    this.createElevatorUi();
    this.createTitleUi();
    this.setupInput();
    this.setupLifecycle();
    this.resizeUi();
    this.showTitle();
  }

  update(time: number, delta: number): void {
    const dt = Math.min(delta, 34) / 1_000;

    if (this.phase === 'title' || this.phase === 'gameOver') {
      this.scrollBackdrop(12 * dt);
      return;
    }
    if (this.phase !== 'running') return;

    this.stats.distancePixels += this.speed * dt;
    this.stats.score = calculateScore(
      this.stats.distancePixels,
      this.stats.lostPixels,
      this.stats.cleanFloors,
    );

    this.updatePlayer(time);
    this.updateEntities(time, dt);
    this.scrollBackdrop(this.speed * dt);
    this.updateHud();

    if (this.stats.distancePixels - this.floorStartDistance >= floorLengthForFloor(this.stats.floor)) {
      this.completeFloor();
    }
  }

  private createPhysicsWorld(): void {
    this.physics.world.gravity.y = GRAVITY;

    this.groundCollider = this.add.rectangle(GAME_WIDTH / 2, GROUND_Y + 55, GAME_WIDTH, 110, 0x000000, 0);
    this.physics.add.existing(this.groundCollider, true);

    const standingY = GROUND_Y - (FRAME_HEIGHT * PLAYER_SCALE) / 2 + 5;
    this.player = this.physics.add.sprite(PLAYER_X, standingY, 'mini-ryan', ANIMATION_FRAMES.idle[0]);
    this.player.setScale(PLAYER_SCALE).setVisible(false);
    this.playerVisual = this.add
      .sprite(PLAYER_X, standingY, 'mini-ryan', ANIMATION_FRAMES.idle[0])
      .setScale(PLAYER_SCALE)
      .setDepth(20)
      .setVisible(false);
    this.player.setCollideWorldBounds(false);
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setSize(74, 160).setOffset(59, 40);
    body.setMaxVelocity(0, 900);
    this.physics.add.collider(this.player, this.groundCollider);

    this.hazards = this.physics.add.group({ allowGravity: false, maxSize: MAX_HAZARDS_PER_FLOOR });
    this.collectibles = this.physics.add.group({ allowGravity: false, maxSize: MAX_COLLECTIBLES_PER_FLOOR });
    this.physics.add.overlap(this.player, this.hazards, () => this.crash(), undefined, this);
    this.physics.add.overlap(
      this.player,
      this.collectibles,
      (_player, item) => this.collectPixel(item as Phaser.Physics.Arcade.Image),
      undefined,
      this,
    );
  }

  private renderTheme(index: number): void {
    this.themeIndex = index;
    const theme = this.theme;
    this.background?.destroy();
    this.parallax?.destroy();
    this.groundVisual?.destroy();

    this.background = this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, theme.backgroundKey).setDepth(-30);
    this.parallax = this.add
      .tileSprite(GAME_WIDTH / 2, GROUND_Y, GAME_WIDTH, 190, theme.parallaxKey)
      .setOrigin(0.5, 1)
      .setDepth(-20);
    this.groundVisual = this.add
      .tileSprite(GAME_WIDTH / 2, GROUND_Y, GAME_WIDTH, GAME_HEIGHT - GROUND_Y, theme.groundKey)
      .setOrigin(0.5, 0)
      .setDepth(-10);
    this.cameras.main.setBackgroundColor('#050711');
    if (this.audio) this.audio.setTheme(theme);
  }

  private createElevatorUi(): void {
    this.elevatorLeft = this.add.rectangle(-240, GAME_HEIGHT / 2, GAME_WIDTH / 2, GAME_HEIGHT, 0x17213a);
    this.elevatorRight = this.add.rectangle(1_200, GAME_HEIGHT / 2, GAME_WIDTH / 2, GAME_HEIGHT, 0x17213a);
    this.elevatorLeft.setStrokeStyle(5, 0x3c4d70, 1);
    this.elevatorRight.setStrokeStyle(5, 0x3c4d70, 1);
    const seamLeft = this.add.rectangle(-20, 270, 8, 540, 0x62ebff, 0.8);
    const seamRight = this.add.rectangle(980, 270, 8, 540, 0x62ebff, 0.8);
    this.elevatorFloorText = this.text(GAME_WIDTH / 2, 240, 'FLOOR 002', 38, '#fff2ba').setOrigin(0.5);
    const subtitle = this.text(GAME_WIDTH / 2, 292, 'GOING SOMEWHERE, PROBABLY', 13, '#d9def4').setOrigin(0.5);
    this.elevatorUi = this.add
      .container(0, 0, [
        this.elevatorLeft,
        this.elevatorRight,
        seamLeft,
        seamRight,
        this.elevatorFloorText,
        subtitle,
      ])
      .setDepth(140)
      .setVisible(false);
    seamLeft.setName('seam-left');
    seamRight.setName('seam-right');
    this.elevatorFloorText.setAlpha(0);
    subtitle.setAlpha(0);
  }

  private createTitleUi(): void {
    const shade = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x070b18, 0.58);
    const frame = this.add.rectangle(0, 273, 264, 332, 0x070b18, 0.9).setStrokeStyle(2, 0x62ebff, 0.65);
    const inner = this.add.rectangle(0, 280, 228, 280, 0x18213a, 0.8).setStrokeStyle(1, 0x334264);
    const light = this.add.rectangle(0, 126, 64, 6, 0xffc857);
    const pedestal = this.add.ellipse(0, 443, 204, 24, 0x62ebff, 0.18);
    this.titleStage = this.add.container(744, 0, [frame, inner, light, pedestal]);
    const ryan = this.add.sprite(744, 310, 'mini-ryan', ANIMATION_FRAMES.idle[0]).setScale(1.15);
    ryan.anims.timeScale = 0.2;
    this.titleUi = this.add.container(0, 0, [shade, this.titleStage, ryan]).setDepth(100);
    this.activeMenuRyan = ryan;
  }

  private resizeUi(): void {
    const width = this.scale.gameSize.width;
    const mobile = width < GAME_WIDTH;
    const scrollX = mobile ? 80 : 0;
    this.cameras.main.setScroll(scrollX, 0);
    const actorX = scrollX + (mobile ? width * 0.8 : 744);
    this.titleStage.setX(actorX).setScale(mobile ? 0.78 : 1, 1);
    const ryan = this.titleUi.list.find((item) => item instanceof Phaser.GameObjects.Sprite) as Phaser.GameObjects.Sprite;
    ryan.setPosition(actorX, 310).setScale(mobile ? 1.05 : 1.15);
    this.elevatorUi.setPosition(scrollX, 0).setScale(width / GAME_WIDTH, 1);
  }

  private setupInput(): void {
    const onKeyDown = (event: KeyboardEvent): void => {
      if ((event.code === 'Space' || event.code === 'ArrowUp') &&
        event.target instanceof HTMLElement && event.target.closest('button, input, textarea, select, a')) return;
      if (['Space', 'ArrowUp', 'KeyP', 'Escape', 'KeyM'].includes(event.code)) event.preventDefault();
      if (event.repeat) return;
      if (event.code === 'Space' || event.code === 'ArrowUp') this.actionDown();
      else if (event.code === 'KeyP' || event.code === 'Escape') this.togglePause();
      else if (event.code === 'KeyM') this.toggleMute();
    };
    const onKeyUp = (event: KeyboardEvent): void => {
      if (event.code === 'Space' || event.code === 'ArrowUp') this.actionUp();
    };
    const onAction = (event: Event): void => {
      const action = (event as CustomEvent<GameUiAction>).detail;
      if (action === 'down') this.actionDown();
      else if (action === 'up') this.actionUp();
      else if (action === 'pause') this.togglePause();
      else if (action === 'mute') this.toggleMute();
      else if (action === 'music' && this.phase === 'title') this.previewTitleMusic();
      else if (action === 'home' && (this.phase === 'paused' || this.phase === 'gameOver')) this.showTitle();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('backpack:action', onAction);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('backpack:action', onAction);
    });
    this.input.on('pointerdown', () => this.actionDown());
    this.input.on('pointerup', () => this.actionUp());
    this.input.on('pointerupoutside', () => this.actionUp());
    this.input.on('gameout', () => this.actionUp());
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) =>
      this.pointMenuRyan(pointer.x + this.cameras.main.scrollX, pointer.y));
  }

  private setupLifecycle(): void {
    const suspend = (): void => {
      this.clearAction();
      if (this.phase === 'running') this.pauseRun();
      else if (this.phase === 'elevator') this.pauseAfterElevator = true;
    };
    const onVisibilityChange = (): void => {
      if (document.hidden) suspend();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('blur', suspend);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.resizeUi, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('blur', suspend);
      this.scale.off(Phaser.Scale.Events.RESIZE, this.resizeUi, this);
      this.audio.destroy();
    });
  }

  private clearAction(): void {
    this.actionHeld = false;
    this.releasedBeforeLaunch = false;
    this.jumpController.clear();
  }

  private showTitle(): void {
    this.clearAction();
    this.time.removeAllEvents();
    this.tweens.killAll();
    for (const child of [...this.children.list]) {
      if (child.name === 'run-effect') child.destroy();
    }
    this.titleRyanTimer = undefined;
    this.menuGazeTimer = undefined;
    this.resultsReady = false;
    this.isNewBest = false;
    this.pauseAfterElevator = false;
    this.anims.resumeAll();
    this.physics.world.pause();
    this.clearGroup(this.hazards);
    this.clearGroup(this.collectibles);
    this.renderTheme(0);
    this.audio.setIntensity(1);
    this.player.setVisible(false).disableBody(true, true);
    this.playerVisual.setVisible(false);
    this.elevatorUi.setVisible(false);
    this.titleUi.setVisible(true);
    this.activeMenuRyan = this.titleUi.list.find((item) => item instanceof Phaser.GameObjects.Sprite) as Phaser.GameObjects.Sprite;
    this.setPhase('title');
    this.startTitleRyanLoop(true);
    void this.audio.resume();
  }

  private startRun(): void {
    void this.audio.unlock().then(() => this.audio.play('start'));
    this.actionHeld = false;
    this.releasedBeforeLaunch = false;
    this.jumpController.clear();
    this.clearGroup(this.hazards);
    this.clearGroup(this.collectibles);
    this.resultsReady = false;
    this.isNewBest = false;
    this.titleUi.setVisible(false);
    this.activeMenuRyan = undefined;
    this.titleRyanTimer?.remove(false);
    this.menuGazeTimer?.remove(false);
    this.titleRyanTimer = undefined;
    this.menuGazeTimer = undefined;
    document.body.dataset.menuAnimation = '';
    this.elevatorUi.setVisible(false);

    const seed = this.explicitSeed ?? seedFromUrl(window.location.href, () => `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`);
    this.rng = createRng(seed);
    this.stats = {
      seed,
      distancePixels: 0,
      lostPixels: 0,
      cleanFloors: 0,
      floor: 1,
      score: 0,
      startedAt: new Date().toISOString(),
    };
    this.floorStartDistance = 0;
    this.currentFloorCollected = 0;
    this.currentFloorTotal = 0;
    this.speed = START_SPEED;
    this.renderTheme(0);
    this.audio.setTheme(this.theme);
    this.audio.setIntensity(1);

    const standingY = GROUND_Y - (FRAME_HEIGHT * PLAYER_SCALE) / 2 + 5;
    this.player.enableBody(true, PLAYER_X, standingY, true, false);
    this.player.setScale(PLAYER_SCALE).setVelocity(0, 0);
    this.playerVisual
      .setVisible(true)
      .setPosition(PLAYER_X, standingY)
      .setScale(PLAYER_SCALE)
      .setAngle(0)
      .play('ryan-run-right');
    this.wasGrounded = true;
    this.physics.world.resume();
    this.spawnFloorContent();
    this.setPhase('running');
    this.updateHud();
  }

  private actionDown(): void {
    void this.audio.unlock();
    if (this.phase !== 'title' && this.phase !== 'running' && this.phase !== 'gameOver') return;
    if (this.actionHeld) return;
    this.actionHeld = true;
    this.actionStartedAt = this.time.now;

    if (this.phase === 'title') {
      this.startRun();
      return;
    }
    if (this.phase === 'gameOver') {
      if (this.time.now >= this.retryAvailableAt) this.startRun();
      return;
    }
    if (this.phase === 'running') {
      this.releasedBeforeLaunch = false;
      this.jumpController.queue(this.time.now);
    }
  }

  private actionUp(): void {
    if (!this.actionHeld) return;
    const heldFor = this.time.now - this.actionStartedAt;
    this.actionHeld = false;
    if (this.phase !== 'running' || heldFor >= MAX_JUMP_HOLD_MS) return;
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    if (body.velocity.y < -120) {
      body.setVelocityY(body.velocity.y * 0.52);
    } else {
      this.releasedBeforeLaunch = true;
    }
  }

  private updatePlayer(time: number): void {
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    this.player.x = PLAYER_X;
    body.setVelocityX(0);
    const grounded = body.blocked.down || body.touching.down;
    if (grounded) {
      this.jumpController.touchGround(time);
      if (!this.wasGrounded) this.audio.play('land');
    }

    if (this.qaAutoJump) this.queueAutoJump(time);

    if (this.jumpController.consume(time)) {
      body.setVelocityY(-selectJumpImpulse(this.actionHeld, this.releasedBeforeLaunch));
      this.releasedBeforeLaunch = false;
      this.playerVisual.play('ryan-jump', true);
      this.audio.play('jump');
    } else if (grounded && this.playerVisual.anims.currentAnim?.key !== 'ryan-run-right') {
      this.playerVisual.play('ryan-run-right', true);
    }
    this.wasGrounded = grounded && body.velocity.y >= 0;
    this.syncPlayerVisual();
  }

  private queueAutoJump(time: number): void {
    if (this.phase !== 'running' || this.actionHeld) return;

    let nextHazardX = Number.POSITIVE_INFINITY;
    for (const child of this.hazards.getChildren()) {
      const hazard = child as Phaser.Physics.Arcade.Image;
      if (!hazard.active) continue;
      if (hazard.x >= PLAYER_X - 30 && hazard.x < nextHazardX) {
        nextHazardX = hazard.x;
      }
    }
    if (!Number.isFinite(nextHazardX)) return;

    // Tall crates overlap the player roughly from x=171–257. Jumping at the
    // leading edge of a wide window lands on the crate; take off ~0.21–0.28s
    // before first contact so the arc still clears at last contact.
    const { minX, maxX } = autoJumpScreenWindow(this.speed);
    if (nextHazardX <= minX || nextHazardX >= maxX) return;

    this.actionHeld = true;
    this.actionStartedAt = time;
    this.releasedBeforeLaunch = false;
    this.jumpController.queue(time);
    this.time.delayedCall(MAX_JUMP_HOLD_MS + 20, () => {
      if (this.phase === 'running' && this.actionHeld) this.actionUp();
    });
  }

  private spawnFloorContent(): void {
    this.clearGroup(this.hazards);
    this.clearGroup(this.collectibles);
    this.currentFloorCollected = 0;
    this.currentFloorTotal = 0;

    const layout = generateFloorLayout(this.stats.floor, this.rng);
    for (const hazard of layout.hazards) {
      this.spawnHazard(this.floorStartDistance + hazard.offset, hazard.kind);
    }
    for (const collectible of layout.collectibles) {
      this.spawnCollectible(this.floorStartDistance + collectible.offset, collectible.height);
    }
  }

  private spawnHazard(worldDistance: number, kind: 'low' | 'tall' | 'wide'): void {
    const key = this.theme.hazardKeys[kind];
    const image = this.hazards.get(0, 0, key) as Phaser.Physics.Arcade.Image | null;
    if (!image) return;
    image.setTexture(key).setOrigin(0.5, 1).setDepth(12).setActive(true).setVisible(true);
    image.setPosition(PLAYER_X + worldDistance - this.stats.distancePixels, GROUND_Y);
    image.setData('worldDistance', worldDistance);
    image.body?.enable;
    const body = image.body as Phaser.Physics.Arcade.Body;
    body.enable = true;
    body.setAllowGravity(false);
    body.setImmovable(true);
    body.setSize(Math.max(18, image.width - 14), Math.max(12, image.height - 5));
    body.setOffset(7, 3);
  }

  private spawnCollectible(worldDistance: number, height: number): void {
    const item = this.collectibles.get(0, 0, 'lost-pixel') as Phaser.Physics.Arcade.Image | null;
    if (!item) return;
    const baseY = GROUND_Y - height;
    item
      .setTexture('lost-pixel')
      .setPosition(PLAYER_X + worldDistance - this.stats.distancePixels, baseY)
      .setDepth(14)
      .setActive(true)
      .setVisible(true)
      .setData('worldDistance', worldDistance)
      .setData('baseY', baseY)
      .setData('phase', this.rng.next() * Math.PI * 2);
    const body = item.body as Phaser.Physics.Arcade.Body;
    body.enable = true;
    body.setAllowGravity(false);
    body.setCircle(11, 4, 4);
    this.currentFloorTotal += 1;
  }

  private updateEntities(time: number, dt: number): void {
    let nextHazardX = Number.POSITIVE_INFINITY;
    let nextHazardDistance = Number.POSITIVE_INFINITY;
    for (const child of this.hazards.getChildren()) {
      const hazard = child as Phaser.Physics.Arcade.Image;
      if (!hazard.active) continue;
      const worldDistance = hazard.getData('worldDistance') as number;
      hazard.x = PLAYER_X + worldDistance - this.stats.distancePixels;
      if (hazard.x >= PLAYER_X - 30 && hazard.x < nextHazardX) {
        nextHazardX = hazard.x;
        nextHazardDistance = worldDistance;
      }
      if (hazard.x < -120) hazard.disableBody(true, true);
    }
    for (const child of this.collectibles.getChildren()) {
      const item = child as Phaser.Physics.Arcade.Image;
      if (!item.active) continue;
      const worldDistance = item.getData('worldDistance') as number;
      const baseY = item.getData('baseY') as number;
      const phase = item.getData('phase') as number;
      item.x = PLAYER_X + worldDistance - this.stats.distancePixels;
      item.y = baseY + Math.sin(time * 0.006 + phase) * 5;
      item.angle += 68 * dt;
      if (item.x < -80) item.disableBody(true, true);
    }
    document.body.dataset.nextHazardX = Number.isFinite(nextHazardX) ? String(Math.round(nextHazardX)) : '';
    document.body.dataset.nextHazardDistance = Number.isFinite(nextHazardDistance)
      ? String(Math.round(nextHazardDistance))
      : '';
    document.body.dataset.activeHazards = String(this.hazards.countActive(true));
    document.body.dataset.activeCollectibles = String(this.collectibles.countActive(true));
  }

  private collectPixel(item: Phaser.Physics.Arcade.Image): void {
    if (this.phase !== 'running' || !item.active) return;
    const x = item.x;
    const y = item.y;
    item.disableBody(true, true);
    this.stats.lostPixels += 1;
    this.currentFloorCollected += 1;
    this.stats.score = calculateScore(
      this.stats.distancePixels,
      this.stats.lostPixels,
      this.stats.cleanFloors,
    );
    this.audio.play('pickup', this.currentFloorCollected);

    const spark = this.add.image(x, y, 'pixel-spark').setName('run-effect').setDepth(30).setScale(1.5);
    this.tweens.add({
      targets: spark,
      y: y - 46,
      alpha: 0,
      scale: 0.2,
      duration: 360,
      onComplete: () => spark.destroy(),
    });
  }

  private completeFloor(): void {
    if (this.phase !== 'running') return;
    const cleanFloor = this.currentFloorTotal > 0 && this.currentFloorCollected === this.currentFloorTotal;
    if (cleanFloor) {
      this.stats.cleanFloors += 1;
    }
    this.stats.score = calculateScore(
      this.stats.distancePixels,
      this.stats.lostPixels,
      this.stats.cleanFloors,
    );
    this.clearAction();
    this.setPhase('elevator');
    this.physics.world.pause();
    this.playerVisual.play('ryan-wave', true);
    this.syncPlayerVisual();
    this.audio.play('elevatorEnter', this.stats.floor);
    document.body.dataset.elevatorSoundSequence = 'entry';
    this.clearGroup(this.hazards);
    this.clearGroup(this.collectibles);
    this.runElevatorTransition(cleanFloor);
  }

  private runElevatorTransition(cleanFloor: boolean): void {
    const nextFloor = this.stats.floor + 1;
    this.elevatorUi.setVisible(true);
    this.elevatorLeft.x = -240;
    this.elevatorRight.x = 1_200;
    const seamLeft = this.elevatorUi.getByName('seam-left') as Phaser.GameObjects.Rectangle;
    const seamRight = this.elevatorUi.getByName('seam-right') as Phaser.GameObjects.Rectangle;
    seamLeft.x = -20;
    seamRight.x = 980;
    this.elevatorFloorText.setText(`FLOOR ${String(nextFloor).padStart(3, '0')}`).setAlpha(0);
    const subtitle = this.elevatorUi.list.find(
      (item) => item instanceof Phaser.GameObjects.Text && item !== this.elevatorFloorText,
    ) as Phaser.GameObjects.Text;
    subtitle.setAlpha(0);

    this.tweens.add({
      targets: [this.elevatorLeft, seamLeft],
      x: (target: Phaser.GameObjects.GameObject) => (target === this.elevatorLeft ? 240 : 476),
      duration: 420,
      ease: 'Cubic.easeInOut',
    });
    this.tweens.add({
      targets: [this.elevatorRight, seamRight],
      x: (target: Phaser.GameObjects.GameObject) => (target === this.elevatorRight ? 720 : 484),
      duration: 420,
      ease: 'Cubic.easeInOut',
    });

    this.time.delayedCall(450, () => {
      this.stats.floor = nextFloor;
      this.floorStartDistance = this.stats.distancePixels;
      this.speed = speedForFloor(nextFloor);
      const nextIndex = nextThemeIndex(this.themeIndex, this.rng.next());
      this.renderTheme(nextIndex);
      this.audio.setTheme(this.theme);
      this.audio.setIntensity(nextFloor);
      this.audio.play('elevatorTravel', nextFloor);
      document.body.dataset.elevatorSoundSequence = 'entry>travel';
      this.spawnFloorContent();
      this.updateHud();
      this.elevatorFloorText.setAlpha(1);
      subtitle.setText(this.theme.kicker).setColor(this.theme.accentCss).setAlpha(1);
    });

    this.time.delayedCall(750, () => {
      this.audio.play('elevatorExit', nextFloor);
      document.body.dataset.elevatorSoundSequence = 'entry>travel>exit';
      this.elevatorFloorText.setAlpha(0);
      subtitle.setAlpha(0);
      this.tweens.add({
        targets: [this.elevatorLeft, seamLeft],
        x: (target: Phaser.GameObjects.GameObject) => (target === this.elevatorLeft ? -240 : -20),
        duration: 450,
        ease: 'Cubic.easeInOut',
      });
      this.tweens.add({
        targets: [this.elevatorRight, seamRight],
        x: (target: Phaser.GameObjects.GameObject) => (target === this.elevatorRight ? 1_200 : 980),
        duration: 450,
        ease: 'Cubic.easeInOut',
        onComplete: () => {
          this.elevatorUi.setVisible(false);
          this.physics.world.resume();
          this.playerVisual.play('ryan-run-right', true);
          this.syncPlayerVisual();
          this.setPhase('running');
          if (document.hidden || this.pauseAfterElevator) {
            this.pauseAfterElevator = false;
            this.pauseRun();
          }
          if (cleanFloor) {
            this.audio.play('cleanFloor');
            document.body.dataset.elevatorSoundSequence = 'entry>travel>exit>clean';
          }
          this.showToast(this.theme.name, this.theme.kicker, this.theme.accentCss);
        },
      });
    });
  }

  private crash(): void {
    if (this.phase !== 'running' || this.qaNoCollision) return;
    this.clearAction();
    this.resultsReady = false;
    this.setPhase('gameOver');
    this.physics.world.pause();
    this.playerVisual.play('ryan-failed', true);
    this.syncPlayerVisual();
    this.audio.play('failure');
    if (!this.reducedMotion) this.cameras.main.shake(180, 0.007);
    this.stats.score = calculateScore(
      this.stats.distancePixels,
      this.stats.lostPixels,
      this.stats.cleanFloors,
    );
    const result = commitRun(this.storage, this.saveData, this.stats);
    this.saveData = result.save;
    this.isNewBest = result.isNewBest;
    this.updateHud();
    if (result.isNewBest) {
      this.time.delayedCall(280, () => this.audio.play('newBest'));
    }
    this.retryAvailableAt = this.time.now + 700;
    this.time.delayedCall(700, () => this.showResults(result.isNewBest));
  }

  private showResults(isNewBest: boolean): void {
    if (this.phase !== 'gameOver') return;
    this.resultsReady = true;
    this.isNewBest = isNewBest;
    this.emitUiState();
  }

  private togglePause(): void {
    if (this.phase === 'running') {
      this.pauseRun();
    } else if (this.phase === 'paused') {
      this.resumeRun();
    }
  }

  private pauseRun(): void {
    if (this.phase !== 'running') return;
    this.clearAction();
    this.setPhase('paused');
    this.physics.world.pause();
    this.anims.pauseAll();
    this.audio.play('pause');
    window.setTimeout(() => {
      if (this.phase === 'paused') void this.audio.pause();
    }, 120);
  }

  private resumeRun(): void {
    if (this.phase !== 'paused') return;
    this.physics.world.resume();
    this.anims.resumeAll();
    this.setPhase('running');
    void this.audio.resume().then(() => this.audio.play('resume'));
  }

  private toggleMute(): void {
    const muted = this.audio.toggleMuted();
    this.saveData = saveMuted(this.storage, this.saveData, muted);
    if (!muted) void this.audio.unlock().then(() => this.audio.play('resume'));
    this.emitUiState();
    this.showToast(muted ? 'AUDIO MUTED' : 'AUDIO ON', muted ? 'STEALTH COMMUTE' : 'CHIPTUNE RESTORED', '#62ebff');
  }

  private updateHud(): void {
    document.body.dataset.score = String(this.stats.score);
    document.body.dataset.floor = String(this.stats.floor);
    document.body.dataset.seed = this.stats.seed;
    this.emitUiState();
  }

  private showToast(titleValue: string, subtitleValue: string, color: string): void {
    const panel = this.add.rectangle(GAME_WIDTH / 2, 105, 370, 65, 0x070b18, 0.92);
    panel.setStrokeStyle(2, Phaser.Display.Color.HexStringToColor(color).color, 1);
    const title = this.text(GAME_WIDTH / 2, 91, titleValue, 17, '#ffffff').setOrigin(0.5);
    const subtitle = this.text(GAME_WIDTH / 2, 116, subtitleValue, 10, color).setOrigin(0.5);
    const toast = this.add.container(this.cameras.main.scrollX + this.scale.gameSize.width / 2 - GAME_WIDTH / 2, -28, [panel, title, subtitle]).setName('run-effect').setDepth(120).setAlpha(0);
    this.tweens.add({
      targets: toast,
      y: 0,
      alpha: 1,
      duration: 220,
      hold: 850,
      yoyo: true,
      onComplete: () => toast.destroy(true),
    });
  }

  private pointMenuRyan(x: number, y: number): void {
    if (!this.activeMenuRyan?.visible) return;
    const ryan = this.activeMenuRyan;
    this.titleRyanTimer?.remove(false);
    this.titleRyanTimer = undefined;
    this.menuGazeTimer?.remove(false);
    ryan.stop();
    ryan.setFrame(lookFrameForVector(x - ryan.x, y - ryan.y));
    document.body.dataset.menuAnimation = 'pointer-gaze';
    this.menuGazeTimer = this.time.delayedCall(1_800, () => {
      if (this.activeMenuRyan !== ryan || !ryan.visible) return;
      if (this.phase === 'title') this.startTitleRyanLoop();
      else if (this.phase === 'gameOver') {
        ryan.play('ryan-review');
        document.body.dataset.menuAnimation = 'ryan-review';
      }
    });
  }

  private startTitleRyanLoop(reset = false): void {
    if (this.phase !== 'title' || !this.activeMenuRyan?.visible) return;
    if (reset) this.titleRyanCycle = 0;
    this.titleRyanTimer?.remove(false);
    const sequence = [
      { key: 'ryan-review', duration: 6_000 },
      { key: 'ryan-waiting', duration: 5_500 },
      { key: 'ryan-working', duration: 5_000 },
      { key: 'ryan-idle', duration: 6_500 },
    ] as const;
    const state = sequence[this.titleRyanCycle % sequence.length] as (typeof sequence)[number];
    this.titleRyanCycle += 1;
    this.activeMenuRyan.play(state.key, true);
    document.body.dataset.menuAnimation = state.key;
    document.body.dataset.menuAnimationRate = String(this.activeMenuRyan.anims.timeScale);
    this.titleRyanTimer = this.time.delayedCall(state.duration, () => this.startTitleRyanLoop());
  }

  private previewTitleMusic(): void {
    if (this.audio.isMuted) {
      this.audio.setMuted(false);
      this.saveData = saveMuted(this.storage, this.saveData, false);
    }
    void this.audio.unlock().then(() => {
      if (this.phase !== 'title') return;
      this.audio.setIntensity(1);
      this.audio.play('resume');
      document.body.dataset.titleMusic = 'playing';
      this.emitUiState();
    });
  }

  private scrollBackdrop(distance: number): void {
    if (this.reducedMotion) return;
    if (this.parallax) this.parallax.tilePositionX += distance * 0.18;
    if (this.groundVisual) this.groundVisual.tilePositionX += distance;
  }

  private syncPlayerVisual(): void {
    if (!this.playerVisual.visible) return;
    const frame = Number(this.playerVisual.frame.name);
    const visual = this.playerVisual.anims.currentAnim?.key === 'ryan-jump'
      ? jumpVisualForFrame(frame)
      : DEFAULT_RYAN_VISUAL;
    this.playerVisual
      .setPosition(this.player.x, this.player.y + visual.y)
      .setScale(visual.scale)
      .setAngle(visual.angle);
  }

  private clearGroup(group: Phaser.Physics.Arcade.Group): void {
    for (const child of group.getChildren()) {
      (child as Phaser.Physics.Arcade.Image).disableBody(true, true);
    }
  }

  private setPhase(phase: GamePhase): void {
    this.phase = phase;
    document.body.dataset.gamePhase = phase;
    this.emitUiState();
  }

  private get theme(): ThemeDefinition {
    return THEMES[this.themeIndex] as ThemeDefinition;
  }

  private emitUiState(): void {
    const stats = this.phase === 'title' ? undefined : this.stats;
    const state: GameUiState = {
      phase: this.phase,
      score: stats?.score ?? 0,
      bestScore: this.saveData.bestScore,
      floor: stats?.floor ?? 1,
      bestFloor: this.saveData.bestFloor,
      pixels: stats?.lostPixels ?? 0,
      distance: Math.floor((stats?.distancePixels ?? 0) / 10),
      cleanFloors: stats?.cleanFloors ?? 0,
      theme: this.theme.name,
      themeId: this.theme.id,
      progress: stats ? Math.min(1, (stats.distancePixels - this.floorStartDistance) / floorLengthForFloor(stats.floor)) : 0,
      muted: this.audio.isMuted,
      isNewBest: this.isNewBest,
      resultsReady: this.resultsReady,
    };
    window.dispatchEvent(new CustomEvent<GameUiState>('backpack:state', { detail: state }));
  }

  private text(x: number, y: number, value: string, size: number, color: string): Phaser.GameObjects.Text {
    return this.add.text(x, y, value, {
      fontFamily: FONT_FAMILY,
      fontSize: `${size}px`,
      color,
      resolution: 2,
    });
  }

  private safeStorage(): StorageLike {
    try {
      const testKey = '__backpack_dash_probe__';
      window.localStorage.setItem(testKey, '1');
      window.localStorage.removeItem(testKey);
      return window.localStorage;
    } catch {
      return EMPTY_STORAGE;
    }
  }
}
