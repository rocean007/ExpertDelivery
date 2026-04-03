/**
 * TSP solver using nearest-neighbor heuristic + 2-opt improvement
 * Performance target: <500ms for 20 stops
 */

export function nearestNeighbor(
  distanceMatrix: number[][],
  startIndex: number
): number[] {
  const n = distanceMatrix.length;
  const visited = new Set<number>([startIndex]);
  const route: number[] = [startIndex];
  let current = startIndex;

  while (route.length < n) {
    let nearest = -1;
    let minDist = Infinity;

    for (let i = 0; i < n; i++) {
      if (!visited.has(i) && distanceMatrix[current][i] < minDist) {
        minDist = distanceMatrix[current][i];
        nearest = i;
      }
    }

    if (nearest === -1) break;

    visited.add(nearest);
    route.push(nearest);
    current = nearest;
  }

  return route;
}

export function twoOpt(
  route: number[],
  distanceMatrix: number[][],
  maxIterations = 1000
): number[] {
  const n = route.length;
  let improved = true;
  let iterations = 0;
  let best = [...route];
  let bestDistance = calculateRouteDistance(best, distanceMatrix);

  while (improved && iterations < maxIterations) {
    improved = false;
    iterations++;

    for (let i = 1; i < n - 1; i++) {
      for (let j = i + 1; j < n; j++) {
        const newRoute = twoOptSwap(best, i, j);
        const newDistance = calculateRouteDistance(newRoute, distanceMatrix);

        if (newDistance < bestDistance - 1e-10) {
          best = newRoute;
          bestDistance = newDistance;
          improved = true;
        }
      }
    }
  }

  return best;
}

function twoOptSwap(route: number[], i: number, j: number): number[] {
  const newRoute = [
    ...route.slice(0, i),
    ...route.slice(i, j + 1).reverse(),
    ...route.slice(j + 1),
  ];
  return newRoute;
}

export function calculateRouteDistance(
  route: number[],
  distanceMatrix: number[][]
): number {
  let total = 0;
  for (let i = 0; i < route.length - 1; i++) {
    total += distanceMatrix[route[i]][route[i + 1]];
  }
  return total;
}

export function optimizeTSP(
  distanceMatrix: number[][],
  startIndex = 0,
  maxTwoOptIterations = 500
): number[] {
  const nn = nearestNeighbor(distanceMatrix, startIndex);
  return twoOpt(nn, distanceMatrix, maxTwoOptIterations);
}
