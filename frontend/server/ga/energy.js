import { REST_SLOT, HOURS_PER_DAY } from '../constants.js';

export const DEFAULT_MAX_DAILY_ENERGY = 15;
export const DEFAULT_MAX_DAILY_HOURS = 8;
export const DEFAULT_TARGET_HOURS_PER_DAY = 8;

export function createPlacementLimits(preferences = {}) {
  return {
    maxEnergy: preferences.max_daily_energy_cap ?? DEFAULT_MAX_DAILY_ENERGY,
    maxHours: preferences.max_daily_productive_hours ?? DEFAULT_MAX_DAILY_HOURS,
    targetHours: preferences.target_productive_hours_per_day ?? DEFAULT_TARGET_HOURS_PER_DAY,
  };
}

export function getActivityIdsOnDay(chromosome, day) {
  const ids = new Set();
  const start = day * HOURS_PER_DAY;
  for (let hour = 0; hour < HOURS_PER_DAY; hour++) {
    const gene = chromosome[start + hour];
    if (gene !== REST_SLOT) ids.add(gene);
  }
  return ids;
}

export function computeDayActivityHours(chromosome, day) {
  let hours = 0;
  const start = day * HOURS_PER_DAY;
  for (let h = 0; h < HOURS_PER_DAY; h++) {
    if (chromosome[start + h] !== REST_SLOT) hours += 1;
  }
  return hours;
}

export function computeDayEnergy(chromosome, day, energyMap) {
  let total = 0;
  for (const id of getActivityIdsOnDay(chromosome, day)) {
    total += energyMap.get(id) ?? 0;
  }
  return total;
}

export function computeDailyEnergy(chromosome, activities) {
  const energyMap = new Map(activities.map((a) => [a.id, a.energy_cost]));
  const daily = [];
  for (let day = 0; day < 7; day++) {
    daily.push({ day, total: computeDayEnergy(chromosome, day, energyMap) });
  }
  return daily;
}

export function computeDailyHours(chromosome) {
  const daily = [];
  for (let day = 0; day < 7; day++) {
    daily.push({ day, total: computeDayActivityHours(chromosome, day) });
  }
  return daily;
}

/** Skor lebih rendah = hari lebih diutamakan (energi rendah, jam masih di bawah target). */
export function getDayPlacementScore(chromosome, day, energyMap, limits) {
  const energy = computeDayEnergy(chromosome, day, energyMap);
  const hours = computeDayActivityHours(chromosome, day);
  const { targetHours, maxEnergy, maxHours } = limits;

  let score = energy * 100;

  if (hours < targetHours) {
    score -= (targetHours - hours) * 40;
  } else {
    score += (hours - targetHours) * 80;
  }

  if (energy >= maxEnergy) score += 5000;
  if (hours >= maxHours) score += 5000;

  return score;
}

export function sortSlotsByDayPriority(chromosome, slotIndices, energyMap, limits, rng = null) {
  const sorted = [...slotIndices].sort((a, b) => {
    const dayA = Math.floor(a / HOURS_PER_DAY);
    const dayB = Math.floor(b / HOURS_PER_DAY);
    const diff =
      getDayPlacementScore(chromosome, dayA, energyMap, limits) -
      getDayPlacementScore(chromosome, dayB, energyMap, limits);
    if (diff !== 0) return diff;
    return a - b;
  });

  if (!rng || sorted.length <= 1) return sorted;

  const topCount = Math.min(5, sorted.length);
  const top = sorted.slice(0, topCount);
  const pick = top[Math.floor(rng() * top.length)];
  return [pick, ...sorted.filter((s) => s !== pick)];
}

export function canPlaceActivityAt(chromosome, slotIndex, activityId, limits, energyMap) {
  const day = Math.floor(slotIndex / HOURS_PER_DAY);
  const dayEnergy = computeDayEnergy(chromosome, day, energyMap);
  const dayHours = computeDayActivityHours(chromosome, day);
  const { maxEnergy, maxHours } = limits;

  if (dayEnergy >= maxEnergy || dayHours >= maxHours) return false;

  const idsOnDay = getActivityIdsOnDay(chromosome, day);
  if (idsOnDay.has(activityId)) {
    return dayHours + 1 <= maxHours;
  }

  const cost = energyMap.get(activityId) ?? 0;
  if (dayEnergy + cost > maxEnergy) return false;
  if (dayHours + 1 > maxHours) return false;
  return true;
}

export function filterSlotsByDailyCap(chromosome, slotIndices, activityId, limits, energyMap) {
  return slotIndices.filter((idx) => canPlaceActivityAt(chromosome, idx, activityId, limits, energyMap));
}

export function pickPreferredSlot(chromosome, slotIndices, activityId, limits, energyMap, rng) {
  const allowed = filterSlotsByDailyCap(chromosome, slotIndices, activityId, limits, energyMap);
  if (allowed.length === 0) return null;
  const ordered = sortSlotsByDayPriority(chromosome, allowed, energyMap, limits, rng);
  return ordered[0];
}
