/**
 * Menyiapkan aktivitas fleksibel untuk API: total jam/minggu = jam per hari × frekuensi/minggu.
 */
export function normalizeFlexibleActivity(activity) {
  if (activity.is_fixed) return activity;

  const rawHours = Number(activity.hours_per_day);
  const rawTimes = Number(activity.times_per_week);
  const hasSession =
    Number.isFinite(rawHours) && rawHours >= 1 && Number.isFinite(rawTimes) && rawTimes >= 1;

  if (hasSession) {
    return {
      ...activity,
      hours_per_day: rawHours,
      times_per_week: rawTimes,
      total_duration_hours: rawHours * rawTimes,
    };
  }

  const fallbackTotal = Number(activity.total_duration_hours) || 1;
  const hoursPerDay = fallbackTotal;
  const timesPerWeek = 1;

  return {
    ...activity,
    hours_per_day: hoursPerDay,
    times_per_week: timesPerWeek,
    total_duration_hours: hoursPerDay * timesPerWeek,
  };
}

export function prepareActivitiesForApi(activities) {
  return activities.map(normalizeFlexibleActivity);
}
