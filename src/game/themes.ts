import type { ThemeDefinition } from './types';

export const THEMES: readonly ThemeDefinition[] = [
  {
    id: 'office',
    name: 'OFFICE 404',
    kicker: 'THE MEETING MOVED AGAIN',
    backgroundKey: 'bg-office',
    parallaxKey: 'parallax-office',
    groundKey: 'ground-office',
    accent: 0xffc857,
    accentCss: '#ffc857',
    hazardKeys: {
      low: 'hazard-chair',
      tall: 'hazard-boxes',
      wide: 'hazard-coffee',
    },
    musicScale: [0, 3, 7, 10, 12, 15, 19, 22],
  },
  {
    id: 'rooftop',
    name: 'NEON ROOFTOP',
    kicker: 'GOOD SIGNAL. BAD IDEAS.',
    backgroundKey: 'bg-rooftop',
    parallaxKey: 'parallax-rooftop',
    groundKey: 'ground-rooftop',
    accent: 0xff4fa3,
    accentCss: '#ff4fa3',
    hazardKeys: {
      low: 'hazard-vent',
      tall: 'hazard-antenna',
      wide: 'hazard-puddle',
    },
    musicScale: [0, 2, 5, 7, 9, 12, 14, 17],
  },
  {
    id: 'subway',
    name: 'MIDNIGHT SUBWAY',
    kicker: 'UPTOWN? TECHNICALLY.',
    backgroundKey: 'bg-subway',
    parallaxKey: 'parallax-subway',
    groundKey: 'ground-subway',
    accent: 0x5df2a9,
    accentCss: '#5df2a9',
    hazardKeys: {
      low: 'hazard-bag',
      tall: 'hazard-barrier',
      wide: 'hazard-track-gap',
    },
    musicScale: [0, 3, 5, 7, 10, 12, 15, 17],
  },
  {
    id: 'server',
    name: 'SERVER BASEMENT',
    kicker: 'DO NOT UNPLUG RYAN',
    backgroundKey: 'bg-server',
    parallaxKey: 'parallax-server',
    groundKey: 'ground-server',
    accent: 0x62ebff,
    accentCss: '#62ebff',
    hazardKeys: {
      low: 'hazard-bug',
      tall: 'hazard-rack',
      wide: 'hazard-cable',
    },
    musicScale: [0, 2, 3, 7, 9, 10, 14, 15],
  },
];

export function nextThemeIndex(current: number, randomValue: number): number {
  const candidates = THEMES.map((_, index) => index).filter((index) => index !== current);
  const selected = Math.floor(Math.max(0, Math.min(0.999_999, randomValue)) * candidates.length);
  return candidates[selected] as number;
}
