import Phaser from 'phaser';

type Painter = (graphics: Phaser.GameObjects.Graphics) => void;

function makeTexture(
  scene: Phaser.Scene,
  key: string,
  width: number,
  height: number,
  paint: Painter,
): void {
  if (scene.textures.exists(key)) return;
  const graphics = scene.make.graphics({ x: 0, y: 0 }, false);
  paint(graphics);
  graphics.generateTexture(key, width, height);
  graphics.destroy();
}

function fill(graphics: Phaser.GameObjects.Graphics, color: number, x: number, y: number, w: number, h: number): void {
  graphics.fillStyle(color, 1);
  graphics.fillRect(x, y, w, h);
}

function officeTextures(scene: Phaser.Scene): void {
  makeTexture(scene, 'bg-office', 960, 540, (g) => {
    fill(g, 0x10172d, 0, 0, 960, 540);
    fill(g, 0x18213a, 0, 74, 960, 356);
    fill(g, 0x0b1022, 0, 0, 960, 74);
    for (let x = 56; x < 960; x += 180) {
      fill(g, 0xf4e4ad, x, 28, 110, 9);
      fill(g, 0x3b4565, x - 10, 24, 130, 17);
    }
    for (let x = 0; x < 960; x += 120) {
      fill(g, 0x202d4c, x, 78, 3, 350);
      fill(g, 0x11192f, x, 290, 120, 5);
    }
    fill(g, 0x293756, 0, 401, 960, 29);
  });
  makeTexture(scene, 'parallax-office', 480, 176, (g) => {
    for (let x = 18; x < 480; x += 118) {
      fill(g, 0x0b1022, x, 46, 70, 124);
      fill(g, 0x3c4d70, x + 5, 51, 60, 5);
      fill(g, 0x91a0b8, x + 18, 68, 34, 44);
      fill(g, 0x152039, x + 15, 118, 40, 9);
      fill(g, 0x33425f, x + 8, 154, 54, 16);
    }
  });
  makeTexture(scene, 'ground-office', 128, 110, (g) => {
    fill(g, 0x2b3550, 0, 0, 128, 12);
    fill(g, 0x161d33, 0, 12, 128, 98);
    for (let x = 0; x < 128; x += 32) fill(g, 0x202944, x, 34, 2, 76);
    fill(g, 0x3b4763, 0, 52, 128, 2);
  });
}

function rooftopTextures(scene: Phaser.Scene): void {
  makeTexture(scene, 'bg-rooftop', 960, 540, (g) => {
    fill(g, 0x09071d, 0, 0, 960, 540);
    fill(g, 0x17113b, 0, 110, 960, 320);
    fill(g, 0x2b1954, 0, 285, 960, 145);
    for (let x = 42; x < 960; x += 103) {
      fill(g, x % 206 === 42 ? 0x62ebff : 0xff4fa3, x, 45 + ((x * 7) % 130), 4, 4);
    }
    fill(g, 0xf6e7b0, 758, 70, 54, 54);
    fill(g, 0x17113b, 744, 64, 38, 38);
  });
  makeTexture(scene, 'parallax-rooftop', 480, 210, (g) => {
    for (let x = 0; x < 480; x += 62) {
      const height = 72 + ((x * 13) % 108);
      fill(g, 0x0b0a21, x, 210 - height, 52, height);
      fill(g, 0x2c2857, x + 7, 210 - height + 8, 38, 4);
      for (let y = 210 - height + 24; y < 192; y += 20) {
        fill(g, (x + y) % 40 === 0 ? 0xffd166 : 0x4d3d86, x + 9, y, 5, 7);
        fill(g, 0x62ebff, x + 27, y, 5, 7);
      }
    }
  });
  makeTexture(scene, 'ground-rooftop', 128, 110, (g) => {
    fill(g, 0xff4fa3, 0, 0, 128, 5);
    fill(g, 0x252342, 0, 5, 128, 105);
    for (let x = 0; x < 128; x += 32) {
      fill(g, 0x39355b, x, 18, 2, 92);
      fill(g, 0x15132d, x + 3, 56, 26, 3);
    }
  });
}

function subwayTextures(scene: Phaser.Scene): void {
  makeTexture(scene, 'bg-subway', 960, 540, (g) => {
    fill(g, 0x0b161d, 0, 0, 960, 540);
    fill(g, 0x16313a, 0, 58, 960, 372);
    for (let y = 62; y < 430; y += 34) {
      fill(g, 0x21444a, 0, y, 960, 2);
    }
    for (let x = 0; x < 960; x += 68) {
      fill(g, 0x21444a, x, 58, 2, 372);
    }
    fill(g, 0xd7d2a4, 0, 104, 960, 10);
    fill(g, 0x5df2a9, 0, 114, 960, 4);
  });
  makeTexture(scene, 'parallax-subway', 480, 184, (g) => {
    for (let x = 22; x < 480; x += 152) {
      fill(g, 0x081014, x, 22, 116, 152);
      fill(g, 0x284c51, x + 5, 27, 106, 7);
      fill(g, 0x132328, x + 12, 48, 92, 112);
      fill(g, 0xffc857, x + 24, 66, 68, 8);
      fill(g, 0x5df2a9, x + 24, 86, 42, 5);
    }
  });
  makeTexture(scene, 'ground-subway', 128, 110, (g) => {
    fill(g, 0xe7dfb7, 0, 0, 128, 10);
    fill(g, 0x1a2c31, 0, 10, 128, 100);
    fill(g, 0xffc857, 0, 16, 128, 7);
    for (let x = 0; x < 128; x += 26) fill(g, 0x2d484d, x, 46, 16, 3);
  });
}

function serverTextures(scene: Phaser.Scene): void {
  makeTexture(scene, 'bg-server', 960, 540, (g) => {
    fill(g, 0x050b18, 0, 0, 960, 540);
    fill(g, 0x0b1629, 0, 52, 960, 378);
    for (let x = 18; x < 960; x += 94) {
      fill(g, 0x101f37, x, 68, 70, 350);
      fill(g, 0x203651, x + 5, 74, 60, 5);
      for (let y = 94; y < 398; y += 22) {
        fill(g, 0x06101e, x + 9, y, 52, 13);
        fill(g, y % 44 === 6 ? 0x62ebff : 0xff4fa3, x + 14, y + 4, 4, 4);
        fill(g, 0x5df2a9, x + 24, y + 4, 4, 4);
      }
    }
  });
  makeTexture(scene, 'parallax-server', 480, 180, (g) => {
    g.lineStyle(3, 0x25496b, 1);
    for (let x = 18; x < 480; x += 68) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, 42);
      g.lineTo(x + 34, 74);
      g.lineTo(x + 34, 180);
      g.strokePath();
      fill(g, 0x62ebff, x - 3, 38, 7, 7);
    }
  });
  makeTexture(scene, 'ground-server', 128, 110, (g) => {
    fill(g, 0x62ebff, 0, 0, 128, 5);
    fill(g, 0x0a1426, 0, 5, 128, 105);
    for (let x = 0; x < 128; x += 28) {
      fill(g, 0x1b2e48, x, 24, 20, 4);
      fill(g, 0x1b2e48, x + 9, 58, 20, 4);
    }
  });
}

function itemTextures(scene: Phaser.Scene): void {
  makeTexture(scene, 'lost-pixel', 30, 30, (g) => {
    fill(g, 0x62ebff, 10, 2, 10, 4);
    fill(g, 0x62ebff, 6, 6, 18, 4);
    fill(g, 0xfff2a8, 2, 10, 26, 10);
    fill(g, 0xffc857, 6, 20, 18, 4);
    fill(g, 0xffc857, 10, 24, 10, 4);
    fill(g, 0xffffff, 10, 8, 6, 6);
  });
  makeTexture(scene, 'pixel-spark', 8, 8, (g) => fill(g, 0xfff2a8, 0, 0, 8, 8));
}

function hazardTextures(scene: Phaser.Scene): void {
  makeTexture(scene, 'hazard-chair', 62, 62, (g) => {
    fill(g, 0x17213a, 21, 4, 27, 25);
    fill(g, 0x53627e, 17, 28, 34, 10);
    fill(g, 0x25324e, 30, 38, 7, 16);
    fill(g, 0x53627e, 12, 50, 43, 5);
    fill(g, 0x0a0e1d, 9, 54, 10, 8);
    fill(g, 0x0a0e1d, 48, 54, 10, 8);
  });
  makeTexture(scene, 'hazard-boxes', 58, 82, (g) => {
    fill(g, 0xc88642, 4, 46, 50, 34);
    fill(g, 0x8f552d, 4, 46, 50, 5);
    fill(g, 0xf0b65f, 27, 46, 5, 34);
    fill(g, 0xb76f36, 13, 15, 40, 31);
    fill(g, 0xf0b65f, 31, 15, 5, 31);
    fill(g, 0x8f552d, 13, 15, 40, 5);
    fill(g, 0xd89a4a, 2, 0, 34, 16);
  });
  makeTexture(scene, 'hazard-coffee', 94, 24, (g) => {
    fill(g, 0x4e2f26, 4, 10, 82, 10);
    fill(g, 0x7b4930, 17, 5, 58, 8);
    fill(g, 0xc58b61, 31, 2, 28, 5);
    fill(g, 0xf5e9cf, 79, 2, 12, 15);
  });
  makeTexture(scene, 'hazard-vent', 68, 54, (g) => {
    fill(g, 0x373c5b, 4, 18, 60, 34);
    fill(g, 0x70769d, 10, 8, 48, 12);
    for (let y = 24; y < 48; y += 7) fill(g, 0x171a33, 12, y, 44, 3);
  });
  makeTexture(scene, 'hazard-antenna', 48, 92, (g) => {
    fill(g, 0x8084a6, 21, 18, 6, 70);
    fill(g, 0xff4fa3, 18, 5, 12, 12);
    fill(g, 0x62ebff, 2, 22, 17, 4);
    fill(g, 0x62ebff, 29, 22, 17, 4);
    fill(g, 0x373c5b, 8, 82, 32, 9);
  });
  makeTexture(scene, 'hazard-puddle', 94, 22, (g) => {
    fill(g, 0x291f58, 4, 8, 86, 10);
    fill(g, 0xff4fa3, 20, 4, 47, 5);
    fill(g, 0x62ebff, 50, 14, 27, 4);
  });
  makeTexture(scene, 'hazard-bag', 54, 48, (g) => {
    fill(g, 0x263c40, 7, 14, 40, 32);
    fill(g, 0x5df2a9, 12, 20, 30, 5);
    g.lineStyle(5, 0x405e5f, 1);
    g.strokeRoundedRect(16, 2, 22, 22, 7);
  });
  makeTexture(scene, 'hazard-barrier', 64, 78, (g) => {
    fill(g, 0xede2aa, 6, 8, 52, 48);
    fill(g, 0xffc857, 6, 15, 52, 9);
    fill(g, 0x1a2c31, 6, 33, 52, 8);
    fill(g, 0x5d6b65, 13, 56, 7, 21);
    fill(g, 0x5d6b65, 44, 56, 7, 21);
  });
  makeTexture(scene, 'hazard-track-gap', 98, 24, (g) => {
    fill(g, 0x05090b, 2, 5, 94, 17);
    fill(g, 0x5df2a9, 8, 2, 82, 4);
    for (let x = 12; x < 94; x += 18) fill(g, 0x4d5d5f, x, 9, 8, 11);
  });
  makeTexture(scene, 'hazard-bug', 58, 54, (g) => {
    fill(g, 0xff4fa3, 14, 13, 30, 34);
    fill(g, 0x09101f, 20, 6, 18, 10);
    fill(g, 0x09101f, 21, 20, 6, 7);
    fill(g, 0x09101f, 32, 20, 6, 7);
    fill(g, 0x62ebff, 22, 21, 3, 3);
    fill(g, 0x62ebff, 33, 21, 3, 3);
    for (const y of [15, 29, 42]) {
      fill(g, 0xff4fa3, 3, y, 12, 5);
      fill(g, 0xff4fa3, 43, y, 12, 5);
    }
  });
  makeTexture(scene, 'hazard-rack', 62, 88, (g) => {
    fill(g, 0x1c3150, 5, 2, 52, 84);
    fill(g, 0x3c5d79, 10, 8, 42, 6);
    for (let y = 19; y < 78; y += 15) {
      fill(g, 0x07101e, 10, y, 42, 10);
      fill(g, y % 30 === 19 ? 0x62ebff : 0x5df2a9, 15, y + 3, 4, 4);
    }
  });
  makeTexture(scene, 'hazard-cable', 98, 24, (g) => {
    g.lineStyle(7, 0x62ebff, 1);
    g.beginPath();
    g.moveTo(3, 15);
    g.lineTo(24, 5);
    g.lineTo(48, 18);
    g.lineTo(72, 6);
    g.lineTo(95, 16);
    g.strokePath();
    fill(g, 0xff4fa3, 45, 14, 8, 8);
  });
}

export function createGameTextures(scene: Phaser.Scene): void {
  officeTextures(scene);
  rooftopTextures(scene);
  subwayTextures(scene);
  serverTextures(scene);
  itemTextures(scene);
  hazardTextures(scene);
}
