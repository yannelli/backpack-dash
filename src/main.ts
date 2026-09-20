import Phaser from 'phaser';
import './styles.css';
import { GAME_HEIGHT, GAME_WIDTH } from './game/constants';
import { GameScene } from './game/GameScene';
import type { GameUiAction, GameUiState } from './game/ui';

const element = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;
const startButton = element<HTMLButtonElement>('start-button');
const retryButton = element<HTMLButtonElement>('retry-button');
const resumeButton = element<HTMLButtonElement>('resume-button');
const pauseButton = element<HTMLButtonElement>('pause-button');
const soundButton = element<HTMLButtonElement>('sound-button');
const jumpButton = element<HTMLButtonElement>('jump-button');
const progress = element('floor-progress');
const portrait = window.matchMedia('(max-width: 700px) and (orientation: portrait)');
const touch = window.matchMedia('(pointer: coarse)');
const compactLandscape = window.matchMedia('(orientation: landscape) and (max-height: 520px)');
const soundHome = soundButton.parentElement!;
const textElements = new Map<string, HTMLElement>();
let previousPhase: GameUiState['phase'] = 'boot';
let previousResultsReady = false;
let activePointer: number | null = null;
let keyHeld = false;

function action(value: GameUiAction): void {
  window.dispatchEvent(new CustomEvent<GameUiAction>('backpack:action', { detail: value }));
}

function setText(id: string, value: string): void {
  const target = textElements.get(id) ?? element(id);
  textElements.set(id, target);
  if (target.textContent !== value) target.textContent = value;
}

function releaseJump(): void {
  activePointer = null;
  keyHeld = false;
  jumpButton.classList.remove('is-held');
  action('up');
}

function activate(): void {
  action('down');
  action('up');
}

startButton.addEventListener('click', activate);
retryButton.addEventListener('click', activate);
resumeButton.addEventListener('click', () => action('pause'));
pauseButton.addEventListener('click', () => action('pause'));
soundButton.addEventListener('click', () => action('mute'));
element('music-button').addEventListener('click', () => action('music'));
document.querySelectorAll<HTMLButtonElement>('.home-button').forEach((button) => {
  button.addEventListener('click', () => action('home'));
});

jumpButton.addEventListener('pointerdown', (event) => {
  if (activePointer !== null || event.button !== 0 || jumpButton.disabled) return;
  event.preventDefault();
  activePointer = event.pointerId;
  jumpButton.setPointerCapture(event.pointerId);
  jumpButton.classList.add('is-held');
  action('down');
});
for (const name of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
  jumpButton.addEventListener(name, (event) => {
    if (event.pointerId === activePointer) releaseJump();
  });
}
jumpButton.addEventListener('contextmenu', (event) => event.preventDefault());
jumpButton.addEventListener('keydown', (event) => {
  if (event.code !== 'Space' && event.code !== 'Enter' && event.code !== 'ArrowUp') return;
  event.preventDefault();
  if (event.repeat || keyHeld) return;
  keyHeld = true;
  jumpButton.classList.add('is-held');
  action('down');
});
jumpButton.addEventListener('keyup', (event) => {
  if (event.code !== 'Space' && event.code !== 'Enter' && event.code !== 'ArrowUp') return;
  event.preventDefault();
  releaseJump();
});
jumpButton.addEventListener('click', (event) => {
  if (event.detail === 0 && !keyHeld) activate();
});
jumpButton.addEventListener('blur', releaseJump);
window.addEventListener('blur', releaseJump);

window.addEventListener('backpack:state', ((event: CustomEvent<GameUiState>) => {
  const state = event.detail;
  const inRun = ['running', 'paused', 'elevator'].includes(state.phase);
  element('title-screen').hidden = state.phase !== 'title';
  element('pause-screen').hidden = state.phase !== 'paused';
  element('result-screen').hidden = state.phase !== 'gameOver' || !state.resultsReady;
  element('run-hud').hidden = !inRun;
  element('loading-label').hidden = state.phase !== 'boot';
  progress.hidden = !inRun;
  jumpButton.hidden = !inRun;
  jumpButton.disabled = state.phase !== 'running';
  pauseButton.hidden = !inRun;
  pauseButton.disabled = state.phase === 'elevator';
  pauseButton.setAttribute('aria-label', state.phase === 'paused' ? 'Resume game' : 'Pause game');
  setText('pause-button', state.phase === 'paused' ? '▷ Resume' : 'Ⅱ Pause');
  soundButton.setAttribute('aria-pressed', String(state.muted));
  soundButton.setAttribute('aria-label', state.muted ? 'Unmute sound' : 'Mute sound');
  setText('sound-label', state.muted ? 'Sound off' : 'Sound on');
  const status = { boot: 'LOADING THE ELEVATOR', title: 'READY TO CLOCK IN', running: 'ON THE CLOCK', paused: 'ON A BREAK', elevator: 'GOING UP', gameOver: 'SHIFT COMPLETE' };
  setText('status-label', status[state.phase]);
  setText('score', String(state.score).padStart(6, '0'));
  setText('best-score', String(state.bestScore).padStart(6, '0'));
  setText('floor', String(state.floor).padStart(3, '0'));
  setText('theme-name', state.theme);
  setText('pixels', String(state.pixels).padStart(2, '0'));
  progress.style.setProperty('--progress', String(state.progress));
  progress.setAttribute('aria-valuenow', String(Math.floor(state.progress * 100)));
  document.querySelectorAll<HTMLElement>('.floor-stop').forEach((stop) => {
    stop.classList.toggle('is-current', stop.dataset.theme === state.themeId);
  });
  if (state.phase === 'gameOver' && state.resultsReady) {
    setText('result-eyebrow', state.isNewBest ? 'NEW PERSONAL BEST' : 'END OF SHIFT');
    setText('result-title', state.isNewBest ? 'Big day at work.' : 'Rough floor.');
    setText('result-score', String(state.score).padStart(6, '0'));
    setText('result-floor', String(state.floor));
    setText('result-distance', `${state.distance}m`);
    setText('result-pixels', String(state.pixels));
  }
  if (document.body.dataset.titleMusic === 'playing') {
    setText('music-button', state.muted ? '♫ Soundtrack muted' : '♫ Soundtrack playing');
  }
  if (state.phase !== previousPhase) {
    releaseJump();
    if (state.phase === 'running' && document.activeElement instanceof HTMLButtonElement) document.activeElement.blur();
    if (state.phase === 'paused') resumeButton.focus({ preventScroll: true });
    if (state.phase === 'title' && previousPhase !== 'boot') startButton.focus({ preventScroll: true });
    const announcements: Partial<Record<GameUiState['phase'], string>> = {
      running: `Floor ${state.floor}. ${state.theme}.`, paused: 'Game paused.', title: 'Ready to clock in.', elevator: 'Going up to the next floor.',
    };
    if (announcements[state.phase]) setText('game-announcement', announcements[state.phase] as string);
  }
  if (state.resultsReady && !previousResultsReady) {
    retryButton.focus({ preventScroll: true });
    setText('game-announcement', `Shift complete. Score ${state.score}. Floor ${state.floor}.${state.isNewBest ? ' New personal best.' : ''}`);
  }
  previousPhase = state.phase;
  previousResultsReady = state.resultsReady;
}) as EventListener);

function updateControlHint(): void {
  setText('control-hint', touch.matches || navigator.maxTouchPoints > 0 ? 'Tap to jump. Hold to go higher.' : 'Space / ↑ / click to jump. Hold to go higher.');
}
updateControlHint();
touch.addEventListener('change', updateControlHint);

function placeSoundButton(): void {
  const parent = compactLandscape.matches ? document.querySelector('.cabinet-bar')! : soundHome;
  parent.appendChild(soundButton);
}
placeSoundButton();
compactLandscape.addEventListener('change', placeSoundButton);

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: portrait.matches ? 640 : GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#050711',
  pixelArt: true,
  antialias: false,
  roundPixels: true,
  transparent: false,
  render: { antialias: false, pixelArt: true, roundPixels: true },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: portrait.matches ? 640 : GAME_WIDTH,
    height: GAME_HEIGHT,
  },
  physics: {
    default: 'arcade',
    arcade: { gravity: { x: 0, y: 1_600 }, debug: false },
  },
  scene: [GameScene],
});

portrait.addEventListener('change', () => {
  releaseJump();
  game.scale.setGameSize(portrait.matches ? 640 : GAME_WIDTH, GAME_HEIGHT);
});
const resizeObserver = new ResizeObserver(() => game.scale.refresh());
resizeObserver.observe(element('game'));
window.addEventListener('beforeunload', () => {
  resizeObserver.disconnect();
  game.destroy(true);
});
