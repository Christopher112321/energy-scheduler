export const HOURS_PER_DAY = 24;
export const DAYS_PER_WEEK = 7;
export const CHROMOSOME_LENGTH = HOURS_PER_DAY * DAYS_PER_WEEK;

export const REST_SLOT = 0;

export const DAY_NAMES = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

export const DAY_INDEX = Object.fromEntries(
  DAY_NAMES.map((day, index) => [day, index])
);

export function slotIndex(day, hour) {
  const dayIndex = typeof day === 'string' ? DAY_INDEX[day] : day;
  if (
    dayIndex == null ||
    dayIndex < 0 ||
    dayIndex >= DAYS_PER_WEEK ||
    hour < 0 ||
    hour >= HOURS_PER_DAY
  ) {
    return null;
  }
  return dayIndex * HOURS_PER_DAY + hour;
}

export function slotToDayHour(index) {
  return {
    day: Math.floor(index / HOURS_PER_DAY),
    hour: index % HOURS_PER_DAY,
  };
}

export function isSleepHour(hour, sleepStart, sleepEnd) {
  if (sleepStart > sleepEnd) {
    return hour >= sleepStart || hour < sleepEnd;
  }
  return hour >= sleepStart && hour < sleepEnd;
}

export function createSleepMask(sleepStart = 23, sleepEnd = 5) {
  const mask = new Array(CHROMOSOME_LENGTH).fill(false);
  for (let i = 0; i < CHROMOSOME_LENGTH; i++) {
    const hour = i % HOURS_PER_DAY;
    if (isSleepHour(hour, sleepStart, sleepEnd)) {
      mask[i] = true;
    }
  }
  return mask;
}
