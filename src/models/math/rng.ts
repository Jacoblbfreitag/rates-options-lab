/**
 * Random numbers for Monte Carlo.
 *
 * Math.random() cannot be seeded, which makes results jump around every time
 * you press "run". A seeded generator gives the same paths for the same seed,
 * so you can change ONE input and see its effect alone.
 */

/** Mulberry32: a tiny, fast, seeded uniform generator on [0, 1). */
export function makeUniform(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal draws via the Box–Muller transform (two normals per pair of uniforms). */
export function makeGaussian(seed: number): () => number {
  const u = makeUniform(seed);
  let spare: number | null = null;
  return () => {
    if (spare !== null) {
      const s = spare;
      spare = null;
      return s;
    }
    let u1 = u();
    while (u1 <= 1e-300) u1 = u();
    const u2 = u();
    const r = Math.sqrt(-2 * Math.log(u1));
    spare = r * Math.sin(2 * Math.PI * u2);
    return r * Math.cos(2 * Math.PI * u2);
  };
}
