import {
  DAY_NAMES,
  CHROMOSOME_LENGTH,
  DAYS_PER_WEEK,
  HOURS_PER_DAY,
  slotIndex,
  isSleepHour,
} from './constants.js';

function coerceNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : value;
  }
  return value;
}

function normalizeActivity(activity) {
  const normalized = {
    ...activity,
    energy_cost: coerceNumber(activity.energy_cost),
    total_duration_hours: coerceNumber(activity.total_duration_hours),
    hours_per_day: coerceNumber(activity.hours_per_day),
    times_per_week: coerceNumber(activity.times_per_week),
  };

  if (!activity.is_fixed) {
    const hoursPerDay = normalized.hours_per_day;
    const timesPerWeek = normalized.times_per_week;
    if (
      typeof hoursPerDay === 'number' &&
      typeof timesPerWeek === 'number' &&
      hoursPerDay >= 1 &&
      timesPerWeek >= 1
    ) {
      normalized.hours_per_day = hoursPerDay;
      normalized.times_per_week = timesPerWeek;
      normalized.total_duration_hours = hoursPerDay * timesPerWeek;
    }
  }

  if (Array.isArray(activity.fixed_slots)) {
    normalized.fixed_slots = activity.fixed_slots.map((slot) => ({
      ...slot,
      start_hour: coerceNumber(slot.start_hour),
      end_hour: coerceNumber(slot.end_hour),
    }));
  }

  return normalized;
}

export function validateScheduleInput(body) {
  const errors = [];

  if (!body || typeof body !== 'object') {
    return { valid: false, errors: ['Request body is required'] };
  }

  const activities = (body.activities ?? []).map(normalizeActivity);

  if (!Array.isArray(body.activities) || activities.length === 0) {
    errors.push('activities must be a non-empty array');
  }

  const rawPrefs = body.user_preferences ?? {};
  const prefs = {
    ...rawPrefs,
    max_daily_energy_cap:
      rawPrefs.max_daily_energy_cap !== undefined
        ? coerceNumber(rawPrefs.max_daily_energy_cap)
        : undefined,
    max_daily_productive_hours:
      rawPrefs.max_daily_productive_hours !== undefined
        ? coerceNumber(rawPrefs.max_daily_productive_hours)
        : undefined,
    target_productive_hours_per_day:
      rawPrefs.target_productive_hours_per_day !== undefined
        ? coerceNumber(rawPrefs.target_productive_hours_per_day)
        : undefined,
    default_sleep_start: coerceNumber(rawPrefs.default_sleep_start ?? 23),
    default_sleep_end: coerceNumber(rawPrefs.default_sleep_end ?? 5),
  };

  if (prefs.max_daily_energy_cap !== undefined) {
    if (typeof prefs.max_daily_energy_cap !== 'number' || prefs.max_daily_energy_cap <= 0) {
      errors.push('max_daily_energy_cap must be a positive number');
    }
  }

  if (prefs.max_daily_productive_hours !== undefined) {
    if (
      typeof prefs.max_daily_productive_hours !== 'number' ||
      prefs.max_daily_productive_hours < 1 ||
      prefs.max_daily_productive_hours > 24
    ) {
      errors.push('max_daily_productive_hours must be between 1 and 24');
    }
  }

  if (prefs.target_productive_hours_per_day !== undefined) {
    if (
      typeof prefs.target_productive_hours_per_day !== 'number' ||
      prefs.target_productive_hours_per_day < 1 ||
      prefs.target_productive_hours_per_day > 24
    ) {
      errors.push('target_productive_hours_per_day must be between 1 and 24');
    }
  }

  if (
    typeof prefs.default_sleep_start !== 'number' ||
    prefs.default_sleep_start < 0 ||
    prefs.default_sleep_start > 23
  ) {
    errors.push('default_sleep_start must be between 0 and 23');
  }

  if (
    typeof prefs.default_sleep_end !== 'number' ||
    prefs.default_sleep_end < 0 ||
    prefs.default_sleep_end > 23
  ) {
    errors.push('default_sleep_end must be between 0 and 23');
  }

  const activityIds = new Set();

  for (const [index, activity] of activities.entries()) {
    const prefix = `activities[${index}]`;

    if (!activity.id || typeof activity.id !== 'string') {
      errors.push(`${prefix}.id is required`);
    } else if (activityIds.has(activity.id)) {
      errors.push(`Duplicate activity id: ${activity.id}`);
    } else {
      activityIds.add(activity.id);
    }

    if (!activity.name || typeof activity.name !== 'string' || !activity.name.trim()) {
      errors.push(`${prefix}.name is required`);
    }

    if (typeof activity.energy_cost !== 'number' || activity.energy_cost < 1 || activity.energy_cost > 5) {
      errors.push(`${prefix}.energy_cost must be between 1 and 5`);
    }

    if (typeof activity.is_fixed !== 'boolean') {
      errors.push(`${prefix}.is_fixed must be a boolean`);
    }

    if (activity.is_fixed) {
      if (!Array.isArray(activity.fixed_slots) || activity.fixed_slots.length === 0) {
        errors.push(`${prefix}.fixed_slots required for fixed activities`);
      } else {
        validateFixedSlots(activity.fixed_slots, prefix, errors);
      }
    } else {
      const hoursPerDay = activity.hours_per_day;
      const timesPerWeek = activity.times_per_week;
      const hasSessionInput =
        typeof hoursPerDay === 'number' &&
        typeof timesPerWeek === 'number' &&
        hoursPerDay >= 1 &&
        timesPerWeek >= 1;

      if (hasSessionInput) {
        if (hoursPerDay > 24) {
          errors.push(`${prefix}.hours_per_day must be between 1 and 24`);
        }
        if (timesPerWeek > 7) {
          errors.push(`${prefix}.times_per_week must be between 1 and 7`);
        }
        const total = hoursPerDay * timesPerWeek;
        if (total > CHROMOSOME_LENGTH) {
          errors.push(
            `${prefix}: total jam/minggu (${total}) melebihi ${CHROMOSOME_LENGTH} jam`
          );
        }
      } else if (
        typeof activity.total_duration_hours !== 'number' ||
        activity.total_duration_hours < 1 ||
        activity.total_duration_hours > CHROMOSOME_LENGTH
      ) {
        errors.push(
          `${prefix}: isi hours_per_day dan times_per_week, atau total_duration_hours (1-${CHROMOSOME_LENGTH})`
        );
      }
    }
  }

  const overlapError = validateFixedSlotOverlaps(activities);
  if (overlapError) errors.push(overlapError);

  const capacityError = validateWeeklyCapacity(activities);
  if (capacityError) errors.push(capacityError);

  validateFixedSlotsAvoidSleep(activities, prefs, errors);

  const feasibilityError = validateFlexibleFeasibility(activities, prefs);
  if (feasibilityError) errors.push(feasibilityError);

  const valid = errors.length === 0;

  return {
    valid,
    errors,
    normalized: valid
      ? {
          user_preferences: prefs,
          activities,
          seed: body.seed,
          ga_config: body.ga_config,
        }
      : undefined,
  };
}

function validateFixedSlots(slots, prefix, errors) {
  for (const [i, slot] of slots.entries()) {
    if (!DAY_NAMES.includes(slot.day)) {
      errors.push(`${prefix}.fixed_slots[${i}].day must be one of: ${DAY_NAMES.join(', ')}`);
    }
    if (typeof slot.start_hour !== 'number' || slot.start_hour < 0 || slot.start_hour > 23) {
      errors.push(`${prefix}.fixed_slots[${i}].start_hour must be 0-23`);
    }
    if (typeof slot.end_hour !== 'number' || slot.end_hour < 1 || slot.end_hour > 24) {
      errors.push(`${prefix}.fixed_slots[${i}].end_hour must be 1-24`);
    }
    if (typeof slot.start_hour === 'number' && typeof slot.end_hour === 'number' && slot.start_hour >= slot.end_hour) {
      errors.push(`${prefix}.fixed_slots[${i}]: start_hour must be less than end_hour`);
    }
  }
}

function validateFixedSlotOverlaps(activities) {
  const slotOwner = new Map();

  for (const activity of activities) {
    if (!activity.is_fixed || !activity.fixed_slots) continue;

    for (const slot of activity.fixed_slots) {
      if (typeof slot.start_hour !== 'number' || typeof slot.end_hour !== 'number') continue;

      for (let hour = slot.start_hour; hour < slot.end_hour; hour++) {
        const index = slotIndex(slot.day, hour);
        if (index == null) continue;

        if (slotOwner.has(index)) {
          const other = slotOwner.get(index);
          return `Fixed slot overlap on ${slot.day} ${hour}:00 — "${activity.name}" conflicts with "${other.name}"`;
        }

        slotOwner.set(index, { id: activity.id, name: activity.name });
      }
    }
  }

  return null;
}

function validateWeeklyCapacity(activities) {
  let fixedHours = 0;
  let flexibleHours = 0;

  for (const activity of activities) {
    if (activity.is_fixed) {
      for (const slot of activity.fixed_slots ?? []) {
        if (typeof slot.start_hour === 'number' && typeof slot.end_hour === 'number') {
          fixedHours += slot.end_hour - slot.start_hour;
        }
      }
    } else {
      flexibleHours += activity.total_duration_hours ?? 0;
    }
  }

  if (fixedHours + flexibleHours > CHROMOSOME_LENGTH) {
    return `Total scheduled hours (${fixedHours + flexibleHours}) exceeds ${CHROMOSOME_LENGTH} hours per week`;
  }

  return null;
}

function validateFixedSlotsAvoidSleep(activities, prefs, errors) {
  const sleepStart = prefs.default_sleep_start ?? 23;
  const sleepEnd = prefs.default_sleep_end ?? 5;

  for (const activity of activities) {
    if (!activity.is_fixed || !activity.fixed_slots) continue;

    for (const slot of activity.fixed_slots) {
      if (typeof slot.start_hour !== 'number' || typeof slot.end_hour !== 'number') continue;

      for (let hour = slot.start_hour; hour < slot.end_hour; hour++) {
        if (!isSleepHour(hour, sleepStart, sleepEnd)) continue;

        errors.push(
          `"${activity.name}" tidak boleh di jam tidur: ${slot.day} pukul ${String(hour).padStart(2, '0')}:00 (tidur ${formatSleepRange(sleepStart, sleepEnd)})`
        );
      }
    }
  }
}

function formatSleepRange(sleepStart, sleepEnd) {
  const fmt = (h) => `${String(h).padStart(2, '0')}:00`;
  if (sleepStart > sleepEnd) {
    return `${fmt(sleepStart)}–${fmt(sleepEnd)}`;
  }
  return `${fmt(sleepStart)}–${fmt(sleepEnd)}`;
}

function validateFlexibleFeasibility(activities, prefs) {
  const sleepStart = prefs.default_sleep_start ?? 23;
  const sleepEnd = prefs.default_sleep_end ?? 5;
  const occupied = new Set();
  let flexibleHours = 0;

  for (let day = 0; day < DAYS_PER_WEEK; day++) {
    for (let hour = 0; hour < HOURS_PER_DAY; hour++) {
      if (isSleepHour(hour, sleepStart, sleepEnd)) {
        occupied.add(day * 24 + hour);
      }
    }
  }

  for (const activity of activities) {
    if (activity.is_fixed) {
      for (const slot of activity.fixed_slots ?? []) {
        if (typeof slot.start_hour !== 'number' || typeof slot.end_hour !== 'number') continue;
        for (let hour = slot.start_hour; hour < slot.end_hour; hour++) {
          const index = slotIndex(slot.day, hour);
          if (index != null) occupied.add(index);
        }
      }
    } else {
      flexibleHours += activity.total_duration_hours ?? 0;
    }
  }

  const freeSlots = CHROMOSOME_LENGTH - occupied.size;
  if (flexibleHours > freeSlots) {
    return `Flexible activities need ${flexibleHours}h but only ${freeSlots}h remain after fixed schedule and sleep hours`;
  }

  return null;
}

export function getSampleInput() {
  return {
    user_preferences: {
      max_daily_energy_cap: 15,
      max_daily_productive_hours: 8,
      target_productive_hours_per_day: 8,
      default_sleep_start: 23,
      default_sleep_end: 5,
    },
    activities: [
      {
        id: 'ACT_FIX_01',
        name: 'Kuliah Teknik Informatika (Semester 4)',
        is_fixed: true,
        energy_cost: 4,
        fixed_slots: [
          { day: 'Monday', start_hour: 8, end_hour: 12 },
          { day: 'Wednesday', start_hour: 13, end_hour: 16 },
        ],
      },
      {
        id: 'ACT_FIX_02',
        name: 'Shift Kerja Part-Time',
        is_fixed: true,
        energy_cost: 3,
        fixed_slots: [{ day: 'Friday', start_hour: 17, end_hour: 21 }],
      },
      {
        id: 'ACT_FLEX_01',
        name: 'Coding Proyek Backend (Node.js & PostgreSQL)',
        is_fixed: false,
        energy_cost: 5,
        hours_per_day: 2,
        times_per_week: 4,
      },
      {
        id: 'ACT_FLEX_02',
        name: 'Eksperimen Desain UI/UX di Figma',
        is_fixed: false,
        energy_cost: 2,
        hours_per_day: 2,
        times_per_week: 2,
      },
      {
        id: 'ACT_FLEX_03',
        name: 'Olahraga / Gym',
        is_fixed: false,
        energy_cost: 4,
        hours_per_day: 1,
        times_per_week: 3,
      },
    ],
  };
}
