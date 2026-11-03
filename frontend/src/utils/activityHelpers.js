export function getNamedActivities(activities) {
  return (activities ?? []).filter((a) => a.name?.trim());
}

export function canGenerateSchedule(activities) {
  return getNamedActivities(activities).length > 0;
}

export function parseSeedInput(seedStr) {
  if (seedStr === '' || seedStr === undefined || seedStr === null) {
    return { seed: undefined, warning: null };
  }
  const parsed = parseInt(String(seedStr), 10);
  if (Number.isNaN(parsed)) {
    return { seed: undefined, warning: 'Seed tidak valid; generate tanpa seed tetap.' };
  }
  return { seed: parsed, warning: null };
}
