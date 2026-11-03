export const DAY_NAMES = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

export const DAY_SHORT = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];

export function createEmptyActivity(isFixed = false) {
  return {
    id: `ACT_${Date.now()}`,
    name: '',
    is_fixed: isFixed,
    energy_cost: 3,
    fixed_slots: isFixed ? [{ day: 'Monday', start_hour: 9, end_hour: 10 }] : undefined,
    hours_per_day: isFixed ? undefined : 2,
    times_per_week: isFixed ? undefined : 1,
    total_duration_hours: isFixed ? undefined : 2,
  };
}

export const SAMPLE_PREFERENCES = {
  max_daily_energy_cap: 15,
  max_daily_productive_hours: 8,
  target_productive_hours_per_day: 8,
  default_sleep_start: 23,
  default_sleep_end: 5,
};
