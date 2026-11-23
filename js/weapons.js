// Datos de las armas. Ángulos de dispersión en grados.
export const WEAPONS = {
  rifle: {
    id: 'rifle', kind: 'rifle', name: 'Fusil Vesper', short: 'Fusil',
    dmg: 23, head: 1.6, interval: 0.115, mag: 30, reserve: 120, reload: 2.0,
    spread: 0.3, bloom: 0.3, bloomMax: 2.4, recover: 5.5, pellets: 1, kick: 0.011,
    range: 260, fall0: 45, fall1: 110, fallMin: 0.6, struct: 1.0,
    ideal: 22, botRange: 60, burst: [3, 6], ammoGain: 30,
  },
  shotgun: {
    id: 'shotgun', kind: 'shotgun', name: 'Escopeta Tajo', short: 'Escopeta',
    dmg: 11, head: 1.35, interval: 0.82, mag: 6, reserve: 24, reload: 2.3,
    spread: 3.4, bloom: 0, bloomMax: 0, recover: 5, pellets: 9, kick: 0.05,
    range: 60, fall0: 9, fall1: 28, fallMin: 0.2, struct: 0.9,
    ideal: 7, botRange: 18, burst: [1, 2], ammoGain: 6,
  },
  smg: {
    id: 'smg', kind: 'smg', name: 'Subfusil Chispa', short: 'Subfusil',
    dmg: 15, head: 1.5, interval: 0.075, mag: 28, reserve: 140, reload: 1.6,
    spread: 0.8, bloom: 0.2, bloomMax: 3.0, recover: 7, pellets: 1, kick: 0.008,
    range: 160, fall0: 18, fall1: 50, fallMin: 0.45, struct: 0.8,
    ideal: 12, botRange: 34, burst: [5, 9], ammoGain: 28,
  },
};

export const ORDER = ['rifle', 'shotgun', 'smg'];

export function falloff(def, dist) {
  if (dist <= def.fall0) return 1;
  if (dist >= def.fall1) return def.fallMin;
  return 1 + (def.fallMin - 1) * ((dist - def.fall0) / (def.fall1 - def.fall0));
}
