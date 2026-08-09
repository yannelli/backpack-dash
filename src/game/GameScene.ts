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
import { JumpController, selectJumpImpulse } from './jump';
import { validatePatternLibrary } from './patterns';
import { createRng, seedFromUrl, type SeededRng } from './rng';
import { calculateScore } from './scoring';
import { commitRun, emptySave, loadSave, saveMuted } from './save';
import { THEMES, nextThemeIndex } from './themes';
import { createGameTextures } from './textures';
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

  private background?: Phaser.GameObjects.Image;
  private parallax?: Phaser.GameObjects.TileSprite;
  private groundVisual?: Phaser.GameObjects.TileSprite;

  private titleUi!: Phaser.GameObjects.Container;
  private resultUi?: Phaser.GameObjects.Container;
  private hud!: Phaser.GameObjects.Container;
  private pauseUi!: Phaser.GameObjects.Container;
  private activeMenuRyan?: Phaser.GameObjects.Sprite;
  private titleRyanTimer?: Phaser.Time.TimerEvent;
  private menuGazeTimer?: Phaser.Time.TimerEvent;
  private titleRyanCycle = 0;
  private scoreText!: Phaser.GameObjects.Text;
  private floorText!: Phaser.GameObjects.Text;
  private themeText!: Phaser.GameObjects.Text;
  private pixelsText!: Phaser.GameObjects.Text;
  private bestText!: Phaser.GameObjects.Text;
  private muteText!: Phaser.GameObjects.Text;
  private tutorialText!: Phaser.GameObjects.Text;

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
    this.explicitSeed = new URL(window.location.href).searchParams.get('seed')?.trim() || null;
    this.qaNoCollision = new URL(window.location.href).searchParams.get('qaNoCollision') === '1';

    createGameTextures(this);
    registerRyanAnimations(this);
    this.renderTheme(0);
    this.createPhysicsWorld();
    this.createHud();
    this.createPauseUi();
    this.createElevatorUi();
    this.createTitleUi();
    this.setupInput();
    this.setupLifecycle();
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

  private createHud(): void {
    const panel = this.add.rectangle(GAME_WIDTH / 2, 38, GAME_WIDTH - 30, 58, 0x070b18, 0.84);
    panel.setStrokeStyle(2, 0x334264, 1);
    this.scoreText = this.text(28, 24, 'SCORE 000000', 20, '#fff2ba').setOrigin(0, 0.5);
    this.floorText = this.text(366, 17, 'FLOOR 001', 18, '#ffffff').setOrigin(0.5, 0);
    this.themeText = this.text(366, 40, 'OFFICE 404', 11, '#ffc857').setOrigin(0.5, 0);
    this.pixelsText = this.text(545, 24, 'PIXELS 00', 16, '#62ebff').setOrigin(0, 0.5);
    this.bestText = this.text(718, 24, 'BEST 000000', 14, '#d9def4').setOrigin(0, 0.5);
    this.muteText = this.text(924, 24, '♪', 22, '#ffffff').setOrigin(1, 0.5);
    this.tutorialText = this.text(
      GAME_WIDTH / 2,
      495,
      'SPACE / TAP TO JUMP  •  HOLD FOR HEIGHT',
      15,
      '#ffffff',
    )
      .setOrigin(0.5)
      .setShadow(2, 2, '#000000', 0, false, true);

    this.hud = this.add
      .container(0, 0, [
        panel,
        this.scoreText,
        this.floorText,
        this.themeText,
        this.pixelsText,
        this.bestText,
        this.muteText,
        this.tutorialText,
      ])
      .setDepth(60)
      .setVisible(false);
  }

  private createPauseUi(): void {
    const shade = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x050711, 0.8);
    const border = this.add.rectangle(GAME_WIDTH / 2, 270, 430, 180, 0x121a34, 0.96);
    border.setStrokeStyle(4, 0x62ebff, 1);
    const title = this.text(GAME_WIDTH / 2, 230, 'ELEVATOR ON HOLD', 28, '#fff2ba').setOrigin(0.5);
    const copy = this.text(GAME_WIDTH / 2, 286, 'P / ESC TO RESUME  •  M TO MUTE', 14, '#d9def4').setOrigin(0.5);
    this.pauseUi = this.add.container(0, 0, [shade, border, title, copy]).setDepth(160).setVisible(false);
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
    const shade = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x060914, 0.48);
    const rail = this.add.rectangle(64, 272, 8, 310, 0xffc857, 1);
    const overline = this.text(96, 128, 'RYAN YANNELLI PRESENTS', 14, '#62ebff');
    const title = this.text(94, 159, 'FLOOR ∞', 58, '#fff2ba').setShadow(4, 4, '#0b1022', 0, false, true);
    const subtitle = this.text(98, 228, 'BACKPACK DASH', 26, '#ffffff');
    const quip = this.text(99, 274, 'One elevator. Infinite bad floors.', 15, '#d9def4');
    const promptBox = this.add.rectangle(300, 354, 404, 62, 0x121a34, 0.96);
    promptBox.setStrokeStyle(3, 0xffc857, 1);
    const prompt = this.text(300, 354, 'TAP / SPACE TO CLOCK IN', 17, '#fff2ba').setOrigin(0.5);
    const controls = this.text(99, 410, 'ONE BUTTON: JUMP  •  HOLD FOR HEIGHT', 12, '#8f9bc5');
    const best = this.text(99, 450, '', 14, '#62ebff').setName('title-best');
    const ryan = this.add.sprite(744, 303, 'mini-ryan', ANIMATION_FRAMES.idle[0]).setScale(0.92);
    ryan.anims.timeScale = 0.2;
    const hint = this.text(744, 438, 'thinks • chills • follows your cursor', 10, '#8f9bc5').setOrigin(0.5);
    const musicBox = this.add.rectangle(744, 477, 246, 40, 0x121a34, 0.96).setInteractive({ useHandCursor: true });
    musicBox.setStrokeStyle(2, 0x62ebff, 1);
    const musicPrompt = this.text(744, 477, '♪  PREVIEW TITLE MUSIC', 12, '#fff2ba').setOrigin(0.5);
    musicBox.on(
      'pointerdown',
      (
        _pointer: Phaser.Input.Pointer,
        _localX: number,
        _localY: number,
        event: Phaser.Types.Input.EventData,
      ) => {
        event.stopPropagation();
        this.previewTitleMusic(musicBox, musicPrompt);
      },
    );

    this.titleUi = this.add
      .container(0, 0, [
        shade,
        rail,
        overline,
        title,
        subtitle,
        quip,
        promptBox,
        prompt,
        controls,
        best,
        ryan,
        hint,
        musicBox,
        musicPrompt,
      ])
      .setDepth(100);
    this.activeMenuRyan = ryan;
  }

  private setupInput(): void {
    const space = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    const up = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.UP);
    const pause = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.P);
    const escape = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    const mute = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.M);

    space?.on('down', () => this.actionDown());
    space?.on('up', () => this.actionUp());
    up?.on('down', () => this.actionDown());
    up?.on('up', () => this.actionUp());
    pause?.on('down', () => this.togglePause());
    escape?.on('down', () => this.togglePause());
    mute?.on('down', () => this.toggleMute());

    this.input.on('pointerdown', () => this.actionDown());
    this.input.on('pointerup', () => this.actionUp());
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => this.pointMenuRyan(pointer.x, pointer.y));
  }

  private setupLifecycle(): void {
    const onVisibilityChange = (): void => {
      if (document.hidden && this.phase === 'running') this.pauseRun();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      this.audio.destroy();
    });
  }

  private showTitle(): void {
    this.setPhase('title');
    this.renderTheme(0);
    this.player.setVisible(false).disableBody(true, true);
    this.playerVisual.setVisible(false);
    this.hud.setVisible(false);
    this.pauseUi.setVisible(false);
    this.elevatorUi.setVisible(false);
    this.resultUi?.destroy(true);
    this.resultUi = undefined;
    this.titleUi.setVisible(true);
    const best = this.titleUi.getByName('title-best') as Phaser.GameObjects.Text;
    best.setText(`LOCAL BEST  ${this.padScore(this.saveData.bestScore)}  •  FLOOR ${String(this.saveData.bestFloor).padStart(3, '0')}`);
    const ryan = this.titleUi.list.find((item) => item instanceof Phaser.GameObjects.Sprite) as Phaser.GameObjects.Sprite;
    this.activeMenuRyan = ryan;
    this.startTitleRyanLoop(true);
  }

  private startRun(): void {
    void this.audio.unlock().then(() => this.audio.play('start'));
    this.actionHeld = false;
    this.releasedBeforeLaunch = false;
    this.jumpController.clear();
    this.clearGroup(this.hazards);
    this.clearGroup(this.collectibles);
    this.resultUi?.destroy(true);
    this.resultUi = undefined;
    this.titleUi.setVisible(false);
    this.activeMenuRyan = undefined;
    this.titleRyanTimer?.remove(false);
    this.menuGazeTimer?.remove(false);
    this.titleRyanTimer = undefined;
    this.menuGazeTimer = undefined;
    document.body.dataset.menuAnimation = '';
    this.hud.setVisible(true);
    this.pauseUi.setVisible(false);
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

    this.tutorialText.setVisible(true).setAlpha(1);
    this.tweens.add({
      targets: this.tutorialText,
      alpha: 0,
      delay: 3_400,
      duration: 600,
      onComplete: () => this.tutorialText.setVisible(false),
    });
  }

  private actionDown(): void {
    void this.audio.unlock();
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

    const spark = this.add.image(x, y, 'pixel-spark').setDepth(30).setScale(1.5);
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
    if (result.isNewBest) {
      this.time.delayedCall(280, () => this.audio.play('newBest'));
    }
    this.retryAvailableAt = this.time.now + 700;
    this.time.delayedCall(520, () => this.showResults(result.isNewBest));
  }

  private showResults(isNewBest: boolean): void {
    const shade = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x050711, 0.76);
    const card = this.add.rectangle(390, 282, 650, 370, 0x11182f, 0.97);
    card.setStrokeStyle(4, isNewBest ? 0xffc857 : 0x62ebff, 1);
    const eyebrow = this.text(112, 123, isNewBest ? 'NEW LOCAL BEST' : 'ELEVATOR MISSED', 14, isNewBest ? '#ffc857' : '#ff7a9d');
    const title = this.text(108, 153, isNewBest ? 'ABSOLUTELY HUGE.' : 'ROUGH FLOOR.', 34, '#fff2ba');
    const score = this.text(112, 216, this.padScore(this.stats.score), 48, '#ffffff');
    const detail = this.text(
      114,
      286,
      `FLOOR ${String(this.stats.floor).padStart(3, '0')}  •  ${Math.floor(this.stats.distancePixels / 10)}m  •  ${this.stats.lostPixels} PIXELS`,
      15,
      '#d9def4',
    );
    const clean = this.text(114, 322, `${this.stats.cleanFloors} CLEAN FLOOR${this.stats.cleanFloors === 1 ? '' : 'S'}`, 13, '#5df2a9');
    const seed = this.text(114, 352, `SEED  ${this.stats.seed}`, 10, '#7582ae');
    seed.setMaxLines(1).setFixedSize(420, 18);
    const retryBox = this.add.rectangle(324, 407, 422, 58, isNewBest ? 0x3d321e : 0x17233d, 1);
    retryBox.setStrokeStyle(2, isNewBest ? 0xffc857 : 0x62ebff, 1);
    const retry = this.text(324, 407, 'TAP / SPACE TO RUN IT BACK', 16, '#fff2ba').setOrigin(0.5);
    const ryan = this.add.sprite(760, 298, 'mini-ryan', ANIMATION_FRAMES.review[0]).setScale(0.78);
    ryan.play('ryan-review');
    const pointerHint = this.text(760, 435, 'still watching', 10, '#7582ae').setOrigin(0.5);
    this.resultUi = this.add
      .container(0, 0, [shade, card, eyebrow, title, score, detail, clean, seed, retryBox, retry, ryan, pointerHint])
      .setDepth(130);
    this.activeMenuRyan = ryan;
    document.body.dataset.menuAnimation = 'ryan-review';
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
    this.setPhase('paused');
    this.physics.world.pause();
    this.anims.pauseAll();
    this.pauseUi.setVisible(true);
    this.audio.play('pause');
    window.setTimeout(() => {
      if (this.phase === 'paused') void this.audio.pause();
    }, 120);
  }

  private resumeRun(): void {
    if (this.phase !== 'paused') return;
    this.pauseUi.setVisible(false);
    this.physics.world.resume();
    this.anims.resumeAll();
    this.setPhase('running');
    void this.audio.resume().then(() => this.audio.play('resume'));
  }

  private toggleMute(): void {
    const muted = this.audio.toggleMuted();
    this.saveData = saveMuted(this.storage, this.saveData, muted);
    if (!muted) void this.audio.unlock().then(() => this.audio.play('resume'));
    this.muteText.setText(muted ? '×' : '♪');
    this.showToast(muted ? 'AUDIO MUTED' : 'AUDIO ON', muted ? 'STEALTH COMMUTE' : 'CHIPTUNE RESTORED', '#62ebff');
  }

  private updateHud(): void {
    this.scoreText.setText(`SCORE ${this.padScore(this.stats.score)}`);
    this.floorText.setText(`FLOOR ${String(this.stats.floor).padStart(3, '0')}`);
    this.themeText.setText(this.theme.name).setColor(this.theme.accentCss);
    this.pixelsText.setText(`PIXELS ${String(this.stats.lostPixels).padStart(2, '0')}`);
    this.bestText.setText(`BEST ${this.padScore(Math.max(this.saveData.bestScore, this.stats.score))}`);
    this.muteText.setText(this.audio.isMuted ? '×' : '♪');
    document.body.dataset.score = String(this.stats.score);
    document.body.dataset.floor = String(this.stats.floor);
    document.body.dataset.seed = this.stats.seed;
  }

  private showToast(titleValue: string, subtitleValue: string, color: string): void {
    const panel = this.add.rectangle(GAME_WIDTH / 2, 105, 370, 65, 0x070b18, 0.92);
    panel.setStrokeStyle(2, Phaser.Display.Color.HexStringToColor(color).color, 1);
    const title = this.text(GAME_WIDTH / 2, 91, titleValue, 17, '#ffffff').setOrigin(0.5);
    const subtitle = this.text(GAME_WIDTH / 2, 116, subtitleValue, 10, color).setOrigin(0.5);
    const toast = this.add.container(0, -28, [panel, title, subtitle]).setDepth(120).setAlpha(0);
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

  private previewTitleMusic(
    box: Phaser.GameObjects.Rectangle,
    prompt: Phaser.GameObjects.Text,
  ): void {
    if (this.audio.isMuted) {
      this.audio.setMuted(false);
      this.saveData = saveMuted(this.storage, this.saveData, false);
    }
    void this.audio.unlock().then(() => {
      if (this.phase !== 'title') return;
      this.audio.setIntensity(1);
      this.audio.play('resume');
      box.setStrokeStyle(2, 0x5df2a9, 1);
      prompt.setText('♪  TITLE SOUNDTRACK LIVE').setColor('#5df2a9');
      document.body.dataset.titleMusic = 'playing';
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
  }

  private get theme(): ThemeDefinition {
    return THEMES[this.themeIndex] as ThemeDefinition;
  }

  private padScore(score: number): string {
    return String(Math.max(0, Math.floor(score))).padStart(6, '0');
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
