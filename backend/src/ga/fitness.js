import {
  REST_SLOT,
  HOURS_PER_DAY,
  CHROMOSOME_LENGTH,
} from '../constants.js';
import { countActivityHours } from './chromosome.js';
import {
  computeDayEnergy,
  computeDayActivityHours,
  computeDailyEnergy,
} from './energy.js';

export { computeDailyEnergy };

const BASE_FITNESS = 10000;
const HARD_PENALTY = 0;

export function evaluateFitness(chromosome, context) {
  const {
    activities,
    lockedMask,
    sleepMask,
    flexibleActivities,
    maxDailyEnergyCap,
    maxDailyProductiveHours,
    targetProductiveHoursPerDay,
    baseChromosome,
  } = context;

  if (!Array.isArray(chromosome) || chromosome.length < CHROMOSOME_LENGTH) {
    return { fitness: HARD_PENALTY, breakdown: { hard: 'invalid_chromosome' } };
  }

  const energyMap = new Map(activities.map((a) => [a.id, a.energy_cost]));

  if (!validateLockedSlots(chromosome, lockedMask, baseChromosome)) {
    return { fitness: HARD_PENALTY, breakdown: { hard: 'locked_violation' } };
  }

  if (!validateNoSleepActivities(chromosome, sleepMask)) {
    return { fitness: HARD_PENALTY, breakdown: { hard: 'sleep_violation' } };
  }

  for (const activity of flexibleActivities) {
    const actual = countActivityHours(chromosome, activity.id);
    if (actual !== activity.total_duration_hours) {
      return {
        fitness: HARD_PENALTY,
        breakdown: { hard: 'duration_mismatch', activity: activity.id, actual, expected: activity.total_duration_hours },
      };
    }
  }

  for (let day = 0; day < 7; day++) {
    const dayEnergy = computeDayEnergy(chromosome, day, energyMap);
    const dayHours = computeDayActivityHours(chromosome, day);
    if (dayEnergy > maxDailyEnergyCap) {
      return {
        fitness: HARD_PENALTY,
        breakdown: { hard: 'daily_energy_exceeded', day, total: dayEnergy, max: maxDailyEnergyCap },
      };
    }
    if (dayHours > maxDailyProductiveHours) {
      return {
        fitness: HARD_PENALTY,
        breakdown: {
          hard: 'daily_hours_exceeded',
          day,
          total: dayHours,
          max: maxDailyProductiveHours,
        },
      };
    }
  }

  let fitness = BASE_FITNESS;
  const breakdown = {};

  const backToBackPenalty = calcBackToBackPenalty(chromosome, energyMap);
  fitness -= backToBackPenalty;
  breakdown.back_to_back = backToBackPenalty;

  const dailyEnergyPenalty = calcDailyEnergyPenalty(chromosome, energyMap, maxDailyEnergyCap);
  fitness -= dailyEnergyPenalty;
  breakdown.daily_energy = dailyEnergyPenalty;

  const chunkingPenalty = calcChunkingPenalty(chromosome, flexibleActivities);
  fitness -= chunkingPenalty;
  breakdown.chunking = chunkingPenalty;

  const balanceBonus = calcEnergyBalanceBonus(
    chromosome,
    energyMap,
    maxDailyEnergyCap,
    maxDailyProductiveHours,
    targetProductiveHoursPerDay
  );
  fitness += balanceBonus;
  breakdown.balance_bonus = balanceBonus;

  const distributionBonus = calcLowEnergyDayBonus(
    chromosome,
    energyMap,
    targetProductiveHoursPerDay
  );
  fitness += distributionBonus;
  breakdown.distribution_bonus = distributionBonus;

  return { fitness: Math.max(fitness, 0), breakdown };
}

function validateLockedSlots(chromosome, lockedMask, baseChromosome) {
  if (!Array.isArray(chromosome) || !Array.isArray(lockedMask) || !Array.isArray(baseChromosome)) {
    return false;
  }
  for (let i = 0; i < CHROMOSOME_LENGTH; i++) {
    if (lockedMask[i] && chromosome[i] !== baseChromosome[i]) {
      return false;
    }
  }
  return true;
}

function calcBackToBackPenalty(chromosome, energyMap) {
  let penalty = 0;
  const HIGH_ENERGY_THRESHOLD = 4;
  const MAX_CONSECUTIVE = 3;

  for (let day = 0; day < 7; day++) {
    let streak = 0;
    for (let hour = 0; hour < HOURS_PER_DAY; hour++) {
      const idx = day * HOURS_PER_DAY + hour;
      const gene = chromosome[idx];

      if (gene === REST_SLOT) {
        streak = 0;
        continue;
      }

      const energy = energyMap.get(gene) ?? 0;
      if (energy >= HIGH_ENERGY_THRESHOLD) {
        streak += 1;
        if (streak > MAX_CONSECUTIVE) {
          penalty += 150 * (streak - MAX_CONSECUTIVE);
        }
      } else {
        streak = 0;
      }
    }
  }

  return penalty;
}

function calcDailyEnergyPenalty(chromosome, energyMap, maxCap) {
  let penalty = 0;

  for (let day = 0; day < 7; day++) {
    const dailyEnergy = computeDayEnergy(chromosome, day, energyMap);
    if (dailyEnergy > maxCap) {
      penalty += 200 * (dailyEnergy - maxCap);
    } else if (dailyEnergy === maxCap) {
      penalty += 30;
    }
  }

  return penalty;
}

function calcChunkingPenalty(chromosome, flexibleActivities) {
  let penalty = 0;

  for (const activity of flexibleActivities) {
    const segments = getContiguousSegments(chromosome, activity.id);
    if (segments.length <= 1) continue;

    const totalHours = segments.reduce((sum, s) => sum + s.length, 0);
    const idealSegments = Math.ceil(totalHours / 3);
    const extraFragments = Math.max(0, segments.length - idealSegments);
    penalty += extraFragments * 80;

    for (const segment of segments) {
      if (segment.length === 1 && totalHours > 1) {
        penalty += 40;
      }
    }
  }

  return penalty;
}

function getContiguousSegments(chromosome, activityId) {
  const segments = [];
  let current = null;

  for (let i = 0; i < chromosome.length; i++) {
    if (chromosome[i] === activityId) {
      if (current === null) {
        current = { start: i, length: 1 };
      } else {
        const prevDay = Math.floor((i - 1) / HOURS_PER_DAY);
        const currDay = Math.floor(i / HOURS_PER_DAY);
        if (currDay === prevDay && chromosome[i - 1] === activityId) {
          current.length += 1;
        } else {
          segments.push(current);
          current = { start: i, length: 1 };
        }
      }
    } else if (current !== null) {
      segments.push(current);
      current = null;
    }
  }

  if (current !== null) segments.push(current);
  return segments;
}

function validateNoSleepActivities(chromosome, sleepMask) {
  if (!sleepMask) return true;
  for (let i = 0; i < CHROMOSOME_LENGTH; i++) {
    if (sleepMask[i] && chromosome[i] !== REST_SLOT) {
      return false;
    }
  }
  return true;
}

function calcEnergyBalanceBonus(chromosome, energyMap, maxCap, maxHours, targetHours) {
  const dailyEnergy = [];
  const dailyHours = [];

  for (let day = 0; day < 7; day++) {
    dailyEnergy.push(computeDayEnergy(chromosome, day, energyMap));
    dailyHours.push(computeDayActivityHours(chromosome, day));
  }

  const mean = dailyEnergy.reduce((a, b) => a + b, 0) / dailyEnergy.length;
  const variance =
    dailyEnergy.reduce((sum, val) => sum + (val - mean) ** 2, 0) / dailyEnergy.length;

  const underCapDays = dailyEnergy.filter((d) => d <= maxCap && d > 0).length;
  const underHourTargetDays = dailyHours.filter((h) => h > 0 && h < targetHours).length;
  const withinHourCapDays = dailyHours.filter((h) => h <= maxHours).length;

  return (
    Math.max(0, 300 - variance * 10) +
    underCapDays * 15 +
    underHourTargetDays * 20 +
    withinHourCapDays * 5
  );
}

function calcLowEnergyDayBonus(chromosome, energyMap, targetHours) {
  let bonus = 0;
  for (let day = 0; day < 7; day++) {
    const energy = computeDayEnergy(chromosome, day, energyMap);
    const hours = computeDayActivityHours(chromosome, day);
    if (hours === 0) continue;
    if (energy <= 5 && hours < targetHours) bonus += 25;
    else if (hours < targetHours) bonus += 10;
  }
  return bonus;
}
