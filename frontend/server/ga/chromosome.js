import { REST_SLOT, CHROMOSOME_LENGTH, slotIndex, createSleepMask } from '../constants.js';
import {
  createPlacementLimits,
  filterSlotsByDailyCap,
  getDayPlacementScore,
  pickPreferredSlot,
} from './energy.js';

export { createSleepMask };

export function createEmptyChromosome() {
  return new Array(CHROMOSOME_LENGTH).fill(REST_SLOT);
}

export function lockFixedSlots(chromosome, activities) {
  const lockedMask = new Array(CHROMOSOME_LENGTH).fill(false);

  for (const activity of activities) {
    if (!activity.is_fixed || !activity.fixed_slots) continue;

    for (const slot of activity.fixed_slots) {
      for (let hour = slot.start_hour; hour < slot.end_hour; hour++) {
        const index = slotIndex(slot.day, hour);
        if (index == null) continue;
        chromosome[index] = activity.id;
        lockedMask[index] = true;
      }
    }
  }

  return lockedMask;
}

export function getFreeSlotIndices(lockedMask, sleepMask = null) {
  const free = [];
  for (let i = 0; i < CHROMOSOME_LENGTH; i++) {
    if (lockedMask[i]) continue;
    if (sleepMask?.[i]) continue;
    free.push(i);
  }
  return free;
}

export function enforceNoSleepActivities(chromosome, sleepMask) {
  if (!sleepMask) return chromosome;
  for (let i = 0; i < CHROMOSOME_LENGTH; i++) {
    if (sleepMask[i] && chromosome[i] !== REST_SLOT) {
      chromosome[i] = REST_SLOT;
    }
  }
  return chromosome;
}

export function countActivityHours(chromosome, activityId) {
  let count = 0;
  for (const gene of chromosome) {
    if (gene === activityId) count += 1;
  }
  return count;
}

export function getActivityDurationMap(activities) {
  const map = new Map();
  for (const activity of activities) {
    if (!activity.is_fixed) {
      map.set(activity.id, activity.total_duration_hours);
    }
  }
  return map;
}

export function getActivityEnergyMap(activities) {
  const map = new Map();
  for (const activity of activities) {
    map.set(activity.id, activity.energy_cost);
  }
  return map;
}

export function getFlexibleActivities(activities) {
  return activities.filter((a) => !a.is_fixed);
}

export function cloneChromosome(chromosome) {
  return [...chromosome];
}

export function applyLockedSlots(chromosome, template, lockedMask) {
  if (!chromosome || !template || !lockedMask) return;
  const len = Math.min(chromosome.length, template.length, CHROMOSOME_LENGTH);
  for (let i = 0; i < len; i++) {
    if (lockedMask[i]) {
      chromosome[i] = template[i];
    }
  }
}

export function normalizeChromosome(chromosome, lockedMask, baseChromosome) {
  const normalized = createEmptyChromosome();
  for (let i = 0; i < CHROMOSOME_LENGTH; i++) {
    if (lockedMask[i]) {
      normalized[i] = baseChromosome[i];
    } else if (chromosome && i < chromosome.length && chromosome[i] !== undefined) {
      normalized[i] = chromosome[i];
    }
  }
  return normalized;
}

export function clearFlexibleSlots(chromosome, lockedMask, sleepMask = null) {
  for (let i = 0; i < chromosome.length; i++) {
    if (!lockedMask[i] && !sleepMask?.[i]) {
      chromosome[i] = REST_SLOT;
    }
  }
}

export function shuffleArray(array, rng) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function fillFlexibleRandomly(
  chromosome,
  lockedMask,
  flexibleActivities,
  rng,
  sleepMask = null,
  preferences = {},
  activities = []
) {
  clearFlexibleSlots(chromosome, lockedMask, sleepMask);

  const energyMap = new Map(activities.map((a) => [a.id, a.energy_cost]));
  const limits = createPlacementLimits(preferences);
  const freeSlots = shuffleArray(getFreeSlotIndices(lockedMask, sleepMask), rng);

  for (const activity of flexibleActivities) {
    const duration = activity.total_duration_hours;
    let available = freeSlots.filter((idx) => chromosome[idx] === REST_SLOT);
    available = filterSlotsByDailyCap(chromosome, available, activity.id, limits, energyMap);

    if (available.length < duration) continue;

    const useChunking = rng() > 0.3;
    if (useChunking && duration > 1) {
      placeContiguousBlock(chromosome, activity.id, duration, available, rng, limits, energyMap);
    } else {
      placeScattered(chromosome, activity.id, duration, available, rng, limits, energyMap);
    }
  }

  return chromosome;
}

function placeContiguousBlock(
  chromosome,
  activityId,
  duration,
  available,
  rng,
  limits,
  energyMap
) {
  const availableSet = new Set(available);
  const candidates = [];

  for (const startIdx of available) {
    let contiguous = true;
    for (let offset = 0; offset < duration; offset++) {
      const idx = startIdx + offset;
      if (!availableSet.has(idx) || chromosome[idx] !== REST_SLOT) {
        contiguous = false;
        break;
      }
      const startDay = Math.floor(startIdx / 24);
      const idxDay = Math.floor(idx / 24);
      if (idxDay !== startDay) {
        contiguous = false;
        break;
      }
    }
    if (contiguous) candidates.push(startIdx);
  }

  if (candidates.length === 0) {
    placeScattered(chromosome, activityId, duration, available, rng, limits, energyMap);
    return;
  }

  const dayScores = candidates.map((startIdx) => ({
    startIdx,
    score: getBlockPlacementScore(chromosome, startIdx, duration, activityId, limits, energyMap),
  }));
  dayScores.sort((a, b) => a.score - b.score);
  const top = dayScores.slice(0, Math.min(3, dayScores.length));
  const start = top[Math.floor(rng() * top.length)].startIdx;

  for (let offset = 0; offset < duration; offset++) {
    chromosome[start + offset] = activityId;
  }
}

function getBlockPlacementScore(chromosome, startIdx, duration, activityId, limits, energyMap) {
  const day = Math.floor(startIdx / 24);
  for (let offset = 0; offset < duration; offset++) {
    const idx = startIdx + offset;
    const sim = [...chromosome];
    sim[idx] = activityId;
    if (!filterSlotsByDailyCap(sim, [idx], activityId, limits, energyMap).length) {
      return Infinity;
    }
  }
  return getDayPlacementScore(chromosome, day, energyMap, limits);
}

function placeScattered(chromosome, activityId, duration, available, rng, limits, energyMap) {
  let remaining = duration;
  let pool = available.filter((idx) => chromosome[idx] === REST_SLOT);

  while (remaining > 0 && pool.length > 0) {
    const idx = pickPreferredSlot(chromosome, pool, activityId, limits, energyMap, rng);
    if (idx == null) break;
    chromosome[idx] = activityId;
    pool = pool.filter((i) => i !== idx);
    remaining -= 1;
  }
}

export function repairChromosome(
  chromosome,
  lockedMask,
  flexibleActivities,
  rng,
  sleepMask = null,
  preferences = {},
  activities = []
) {
  applyLockedSlots(chromosome, chromosome, lockedMask);
  enforceNoSleepActivities(chromosome, sleepMask);

  const energyMap = new Map(activities.map((a) => [a.id, a.energy_cost]));
  const limits = createPlacementLimits(preferences);

  for (const activity of flexibleActivities) {
    const target = activity.total_duration_hours;
    let current = countActivityHours(chromosome, activity.id);

    if (current > target) {
      removeExcessHours(chromosome, activity.id, current - target, lockedMask);
      current = countActivityHours(chromosome, activity.id);
    }

    if (current < target) {
      addMissingHours(
        chromosome,
        activity.id,
        target - current,
        lockedMask,
        rng,
        sleepMask,
        limits,
        energyMap
      );
    }
  }

  enforceNoSleepActivities(chromosome, sleepMask);
  return chromosome;
}

function removeExcessHours(chromosome, activityId, hoursToRemove, lockedMask) {
  let removed = 0;
  for (let i = 0; i < chromosome.length && removed < hoursToRemove; i++) {
    if (!lockedMask[i] && chromosome[i] === activityId) {
      chromosome[i] = REST_SLOT;
      removed += 1;
    }
  }
}

function addMissingHours(
  chromosome,
  activityId,
  needed,
  lockedMask,
  rng,
  sleepMask = null,
  limits,
  energyMap
) {
  let freeSlots = getFreeSlotIndices(lockedMask, sleepMask).filter((idx) => chromosome[idx] === REST_SLOT);
  freeSlots = filterSlotsByDailyCap(chromosome, freeSlots, activityId, limits, energyMap);

  let placed = 0;
  while (placed < needed && freeSlots.length > 0) {
    const idx = pickPreferredSlot(chromosome, freeSlots, activityId, limits, energyMap, rng);
    if (idx == null) break;
    chromosome[idx] = activityId;
    freeSlots = freeSlots.filter((i) => i !== idx);
    freeSlots = filterSlotsByDailyCap(chromosome, freeSlots, activityId, limits, energyMap);
    placed += 1;
  }
}

export function chromosomeToSchedule(chromosome, activities) {
  const genes =
    Array.isArray(chromosome) && chromosome.length >= CHROMOSOME_LENGTH
      ? chromosome.slice(0, CHROMOSOME_LENGTH)
      : createEmptyChromosome();
  const activityMap = Object.fromEntries(activities.map((a) => [a.id, a]));
  const slots = genes.map((gene, index) => {
    const day = Math.floor(index / 24);
    const hour = index % 24;
    const activity = gene !== REST_SLOT ? activityMap[gene] : null;
    return {
      index,
      day,
      hour,
      gene,
      is_locked: activity?.is_fixed ?? false,
      activity_id: gene !== REST_SLOT ? gene : null,
      activity_name: activity?.name ?? null,
      energy_cost: activity?.energy_cost ?? 0,
    };
  });

  return { slots, chromosome: [...genes] };
}
