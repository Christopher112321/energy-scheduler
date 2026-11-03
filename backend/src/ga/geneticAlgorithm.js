import {
  createEmptyChromosome,
  lockFixedSlots,
  fillFlexibleRandomly,
  cloneChromosome,
  applyLockedSlots,
  repairChromosome,
  getFlexibleActivities,
  shuffleArray,
  normalizeChromosome,
  createSleepMask,
} from './chromosome.js';
import { evaluateFitness } from './fitness.js';
import { canPlaceActivityAt, createPlacementLimits } from './energy.js';
import { CHROMOSOME_LENGTH, REST_SLOT } from '../constants.js';

const DEFAULT_CONFIG = {
  populationSize: 80,
  generations: 120,
  crossoverRate: 0.85,
  mutationRate: 0.12,
  elitismCount: 4,
  tournamentSize: 5,
};

function createRng(seed) {
  let state = seed ?? Date.now();
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

export function runGeneticAlgorithm(input, options = {}) {
  const config = { ...DEFAULT_CONFIG, ...options };
  const rng = createRng(config.seed);

  const activities = input.activities;
  const flexibleActivities = getFlexibleActivities(activities);
  const preferences = input.user_preferences ?? {};

  const maxDailyEnergyCap = preferences.max_daily_energy_cap ?? 15;
  const maxDailyProductiveHours = preferences.max_daily_productive_hours ?? 8;
  const targetProductiveHoursPerDay = preferences.target_productive_hours_per_day ?? 8;
  const sleepStart = preferences.default_sleep_start ?? 23;
  const sleepEnd = preferences.default_sleep_end ?? 5;

  const baseChromosome = createEmptyChromosome();
  const lockedMask = lockFixedSlots(baseChromosome, activities);
  const sleepMask = createSleepMask(sleepStart, sleepEnd);

  const context = {
    activities,
    flexibleActivities,
    lockedMask,
    sleepMask,
    baseChromosome,
    maxDailyEnergyCap,
    maxDailyProductiveHours,
    targetProductiveHoursPerDay,
    preferences,
    sleepStart,
    sleepEnd,
    energyMap: new Map(activities.map((a) => [a.id, a.energy_cost])),
  };

  let population = initializePopulation(context, config.populationSize, rng);

  let best = null;
  let bestFitness = -Infinity;
  let stagnantGenerations = 0;

  for (let gen = 0; gen < config.generations; gen++) {
    const evaluated = population.map((chromosome) => {
      const result = evaluateFitness(chromosome, context);
      return { chromosome, fitness: result.fitness, breakdown: result.breakdown };
    });

    evaluated.sort((a, b) => b.fitness - a.fitness);

    if (evaluated[0].fitness > bestFitness) {
      bestFitness = evaluated[0].fitness;
      best = cloneChromosome(evaluated[0].chromosome);
      stagnantGenerations = 0;
    } else {
      stagnantGenerations += 1;
    }

    if (stagnantGenerations >= 25 && bestFitness > 0) break;

    const nextGen = [];

    for (let i = 0; i < config.elitismCount; i++) {
      nextGen.push(cloneChromosome(evaluated[i].chromosome));
    }

    while (nextGen.length < config.populationSize) {
      const parent1 = tournamentSelect(evaluated, config.tournamentSize, rng) ?? baseChromosome;
      const parent2 = tournamentSelect(evaluated, config.tournamentSize, rng) ?? baseChromosome;

      let child1, child2;
      if (rng() < config.crossoverRate) {
        [child1, child2] = crossover(parent1, parent2, lockedMask, sleepMask, rng);
      } else {
        child1 = cloneChromosome(parent1);
        child2 = cloneChromosome(parent2);
      }

      if (!child1 || !child2) continue;

      mutate(
        child1,
        lockedMask,
        sleepMask,
        flexibleActivities,
        config.mutationRate,
        rng,
        preferences,
        context.energyMap
      );
      mutate(
        child2,
        lockedMask,
        sleepMask,
        flexibleActivities,
        config.mutationRate,
        rng,
        preferences,
        context.energyMap
      );

      repairChromosome(child1, lockedMask, flexibleActivities, rng, sleepMask, preferences, activities);
      repairChromosome(child2, lockedMask, flexibleActivities, rng, sleepMask, preferences, activities);

      nextGen.push(normalizeChromosome(child1, lockedMask, baseChromosome));
      if (nextGen.length < config.populationSize) {
        nextGen.push(normalizeChromosome(child2, lockedMask, baseChromosome));
      }
    }

    population = nextGen;
  }

  if (!best || !Array.isArray(best) || best.length < CHROMOSOME_LENGTH) {
    const fallback =
      population.find((c) => Array.isArray(c) && c.length >= CHROMOSOME_LENGTH) ?? baseChromosome;
    best = cloneChromosome(fallback);
  }

  best = normalizeChromosome(best, lockedMask, baseChromosome);
  repairChromosome(best, lockedMask, flexibleActivities, rng, sleepMask, preferences, activities);
  let finalEval = evaluateFitness(best, context);

  if (finalEval.breakdown?.hard === 'duration_mismatch' && flexibleActivities.length > 0) {
    const repaired = cloneChromosome(baseChromosome);
    fillFlexibleRandomly(repaired, lockedMask, flexibleActivities, rng, sleepMask, preferences, activities);
    repairChromosome(repaired, lockedMask, flexibleActivities, rng, sleepMask, preferences, activities);
    const retryEval = evaluateFitness(repaired, context);
    if (!retryEval.breakdown?.hard) {
      best = repaired;
      finalEval = retryEval;
    }
  }

  return {
    chromosome: best,
    fitness: finalEval.fitness,
    breakdown: finalEval.breakdown,
    config: {
      seed: config.seed ?? null,
      generations: config.generations,
      populationSize: config.populationSize,
    },
  };
}

function initializePopulation(context, size, rng) {
  const population = [];
  const {
    lockedMask,
    sleepMask,
    baseChromosome,
    flexibleActivities,
    preferences,
    activities,
  } = context;

  for (let i = 0; i < size; i++) {
    const chromosome = cloneChromosome(baseChromosome);
    fillFlexibleRandomly(
      chromosome,
      lockedMask,
      flexibleActivities,
      rng,
      sleepMask,
      preferences,
      activities
    );
    repairChromosome(
      chromosome,
      lockedMask,
      flexibleActivities,
      rng,
      sleepMask,
      preferences,
      activities
    );
    population.push(chromosome);
  }

  return population;
}

function tournamentSelect(evaluated, tournamentSize, rng) {
  if (!evaluated.length) return null;
  let best = null;
  for (let i = 0; i < tournamentSize; i++) {
    const idx = Math.floor(rng() * evaluated.length);
    const candidate = evaluated[idx];
    if (!candidate?.chromosome) continue;
    if (!best || candidate.fitness > best.fitness) {
      best = candidate;
    }
  }
  return best?.chromosome ?? evaluated[0]?.chromosome ?? null;
}

function crossover(parent1, parent2, lockedMask, sleepMask, rng) {
  if (!parent1 || !parent2) {
    return [
      parent1 ? cloneChromosome(parent1) : null,
      parent2 ? cloneChromosome(parent2) : null,
    ];
  }
  const child1 = cloneChromosome(parent1);
  const child2 = cloneChromosome(parent2);

  const freeIndices = [];
  for (let i = 0; i < CHROMOSOME_LENGTH; i++) {
    if (!lockedMask[i] && !sleepMask[i]) freeIndices.push(i);
  }

  if (freeIndices.length === 0) return [child1, child2];

  const point = freeIndices[Math.floor(rng() * freeIndices.length)];

  for (let i = 0; i < CHROMOSOME_LENGTH; i++) {
    if (lockedMask[i] || sleepMask[i]) continue;

    if (i < point) {
      child1[i] = parent2[i];
      child2[i] = parent1[i];
    } else {
      child1[i] = parent1[i];
      child2[i] = parent2[i];
    }
  }

  applyLockedSlots(child1, parent1, lockedMask);
  applyLockedSlots(child2, parent2, lockedMask);

  return [child1, child2];
}

function mutate(
  chromosome,
  lockedMask,
  sleepMask,
  flexibleActivities,
  mutationRate,
  rng,
  preferences,
  energyMap
) {
  const limits = createPlacementLimits(preferences);

  for (let i = 0; i < CHROMOSOME_LENGTH; i++) {
    if (lockedMask[i] || sleepMask[i]) continue;
    if (rng() > mutationRate) continue;

    const mutationType = rng();

    if (mutationType < 0.4) {
      chromosome[i] = REST_SLOT;
    } else if (mutationType < 0.8 && flexibleActivities.length > 0) {
      const activity = flexibleActivities[Math.floor(rng() * flexibleActivities.length)];
      if (activity?.id && canPlaceActivityAt(chromosome, i, activity.id, limits, energyMap)) {
        chromosome[i] = activity.id;
      }
    } else if (flexibleActivities.length >= 2) {
      swapFlexibleSlots(chromosome, lockedMask, sleepMask, flexibleActivities, rng);
      return;
    }
  }
}

function swapFlexibleSlots(chromosome, lockedMask, sleepMask, flexibleActivities, rng) {
  const freeIndices = [];
  for (let i = 0; i < CHROMOSOME_LENGTH; i++) {
    if (!lockedMask[i] && !sleepMask[i]) freeIndices.push(i);
  }

  if (freeIndices.length < 2) return;

  const shuffled = shuffleArray(freeIndices, rng);
  const a = shuffled[0];
  const b = shuffled[1];
  [chromosome[a], chromosome[b]] = [chromosome[b], chromosome[a]];
}
