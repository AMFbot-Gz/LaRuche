/**
 * organic_input.js — Contrôle HID Organique Anti-Bot
 * Bézier cubique + Gaussian jitter + WPM variable
 * Réutilisé depuis la spec LaRuche v3.0
 */

import robot from "robotjs";

// Distribution gaussienne pour le jitter naturel
const gaussian = (mean = 0, std = 1) => {
  const u = 1 - Math.random();
  const v = Math.random();
  return mean + std * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

// Point sur courbe de Bézier cubique
function cubicBezier(t, p0, p1, p2, p3) {
  const mt = 1 - t;
  return {
    x: mt ** 3 * p0.x + 3 * mt ** 2 * t * p1.x + 3 * mt * t ** 2 * p2.x + t ** 3 * p3.x,
    y: mt ** 3 * p0.y + 3 * mt ** 2 * t * p1.y + 3 * mt * t ** 2 * p2.y + t ** 3 * p3.y,
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let currentX = 0;
let currentY = 0;

export async function organicMouseMove(x2, y2) {
  const x1 = currentX;
  const y1 = currentY;
  const dist = Math.hypot(x2 - x1, y2 - y1);
  const duration = 150 + dist * 0.8 + gaussian(0, 30);
  const overshoot = Math.min(dist * 0.1, 25);

  const cp1 = {
    x: x1 + (x2 - x1) * 0.25 + gaussian(0, 20),
    y: y1 + (y2 - y1) * 0.25 + gaussian(0, 20),
  };
  const cp2 = {
    x: x2 - (x2 - x1) * 0.1 + overshoot * Math.sign(x2 - x1),
    y: y2 + gaussian(0, 10),
  };

  const steps = Math.round(duration / 8);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    const pos = cubicBezier(ease, { x: x1, y: y1 }, cp1, cp2, { x: x2, y: y2 });
    robot.moveMouse(
      Math.round(pos.x + gaussian(0, 0.8)),
      Math.round(pos.y + gaussian(0, 0.8))
    );
    await sleep(8 + gaussian(0, 2));
  }

  currentX = x2;
  currentY = y2;
}

export async function organicType(text, targetWPM = 65) {
  for (let i = 0; i < text.length; i++) {
    const delay = (60000 / (targetWPM * 5)) * (1 + gaussian(0, 0.3));
    if (Math.random() < 0.003) {
      robot.keyTap("backspace");
      await sleep(gaussian(120, 30));
    }
    robot.typeString(text[i]);
    await sleep(Math.max(30, delay));
  }
}

export async function organicClick(x, y, button = "left") {
  await organicMouseMove(x, y);
  await sleep(50 + gaussian(0, 20));
  robot.mouseClick(button);
}

export function calibrate() {
  const screen = robot.getScreenSize();
  currentX = Math.round(screen.width / 2);
  currentY = Math.round(screen.height / 2);
  return screen;
}
