/**
 * Cholesky decomposition: write a correlation matrix as C = L·Lᵀ.
 * If Z is a vector of independent normals, then L·Z has correlation C.
 * That is how we make correlated Brownian motions in the LIBOR Market Model.
 */
export function cholesky(c: number[][]): number[][] {
  const n = c.length;
  const l = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = c[i][j];
      for (let k = 0; k < j; k++) sum -= l[i][k] * l[j][k];
      if (i === j) {
        if (sum <= 0) throw new Error('Matrix is not positive definite');
        l[i][i] = Math.sqrt(sum);
      } else {
        l[i][j] = sum / l[j][j];
      }
    }
  }
  return l;
}
