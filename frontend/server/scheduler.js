import { runGeneticAlgorithm } from './ga/geneticAlgorithm.js';
import { chromosomeToSchedule } from './ga/chromosome.js';
import { computeDailyEnergy, computeDailyHours } from './ga/energy.js';
import { validateScheduleInput } from './validation.js';
import { DAY_NAMES } from './constants.js';

const SCHEDULE_CANDIDATE_RUNS = 5;
const TOP_SCHEDULE_COUNT = 3;

export function generateSchedule(rawInput, options = {}) {
  const validation = validateScheduleInput(rawInput);
  const input = validation.valid ? validation.normalized : rawInput;

  const startTime = Date.now();
  const prefs = input.user_preferences ?? {};
  const maxCap = prefs.max_daily_energy_cap ?? 15;
  const maxHours = prefs.max_daily_productive_hours ?? 8;

  const baseSeed =
    options.seed !== undefined && options.seed !== null && !Number.isNaN(Number(options.seed))
      ? Number(options.seed)
      : Date.now();

  const candidates = [];

  for (let i = 0; i < SCHEDULE_CANDIDATE_RUNS; i++) {
    const runSeed = baseSeed + i * 104729;
    const result = runGeneticAlgorithm(input, { ...options, seed: runSeed });
    const key = result.chromosome?.join(',');
    if (candidates.some((c) => c.key === key)) continue;

    candidates.push({
      key,
      ga: result,
      seed: runSeed,
    });
  }

  candidates.sort((a, b) => b.ga.fitness - a.ga.fitness);

  const top = candidates.slice(0, TOP_SCHEDULE_COUNT).map((c, index) =>
    formatScheduleCandidate(c.ga, input, {
      rank: index + 1,
      seed: c.seed,
      maxCap,
      maxHours,
    })
  );

  while (top.length < TOP_SCHEDULE_COUNT && candidates.length > 0) {
    const extra = candidates[top.length];
    if (!extra) break;
    top.push(
      formatScheduleCandidate(extra.ga, input, {
        rank: top.length + 1,
        seed: extra.seed,
        maxCap,
        maxHours,
      })
    );
  }

  const best = top[0] ?? formatScheduleCandidate(
    runGeneticAlgorithm(input, { ...options, seed: baseSeed }),
    input,
    { rank: 1, seed: baseSeed, maxCap, maxHours }
  );

  const elapsedMs = Date.now() - startTime;
  const warnings = buildScheduleWarnings(best, input);

  return {
    success: true,
    schedules: top,
    schedule: best.schedule,
    fitness: best.fitness,
    fitness_breakdown: best.fitness_breakdown,
    daily_energy: best.daily_energy,
    daily_hours: best.daily_hours,
    warnings,
    meta: {
      elapsed_ms: elapsedMs,
      seed: options.seed ?? null,
      ga_config: best.meta?.ga_config,
      candidates_evaluated: candidates.length,
      top_count: top.length,
    },
  };
}

function formatScheduleCandidate(gaResult, input, { rank, seed, maxCap, maxHours }) {
  const schedule = chromosomeToSchedule(gaResult.chromosome, input.activities);
  const dailyEnergy = computeDailyEnergy(gaResult.chromosome, input.activities);
  const dailyHours = computeDailyHours(gaResult.chromosome);

  const dailyEnergyFormatted = dailyEnergy.map((d) => ({
    day: DAY_NAMES[d.day],
    day_index: d.day,
    total_energy: d.total,
    max_cap: maxCap,
    status: getEnergyStatus(d.total, maxCap),
  }));

  const dailyHoursFormatted = dailyHours.map((d) => ({
    day: DAY_NAMES[d.day],
    day_index: d.day,
    total_hours: d.total,
    max_hours: maxHours,
    status: getHoursStatus(d.total, maxHours),
  }));

  return {
    rank,
    seed,
    schedule: {
      slots: schedule.slots,
      chromosome: schedule.chromosome,
    },
    fitness: gaResult.fitness,
    fitness_breakdown: gaResult.breakdown,
    daily_energy: dailyEnergyFormatted,
    daily_hours: dailyHoursFormatted,
    meta: {
      ga_config: gaResult.config,
    },
  };
}

function buildScheduleWarnings(best, input) {
  const warnings = [];
  const maxCap = input.user_preferences?.max_daily_energy_cap ?? 15;
  const maxHours = input.user_preferences?.max_daily_productive_hours ?? 8;
  const result = { breakdown: best.fitness_breakdown, fitness: best.fitness };
  const dailyEnergy = best.daily_energy ?? [];
  const dailyHours = best.daily_hours ?? [];

  if (result.breakdown?.hard === 'sleep_violation') {
    warnings.push(
      'Jadwal melanggar jam tidur: tidak boleh ada aktivitas selama periode istirahat. Sesuaikan jam tidur atau regenerate.'
    );
  } else if (result.breakdown?.hard === 'daily_energy_exceeded') {
    warnings.push(
      'Jadwal melanggar batas energi harian. Kurangi kegiatan berat, naikkan batas energi, atau kurangi frekuensi kegiatan fleksibel.'
    );
  } else if (result.breakdown?.hard === 'daily_hours_exceeded') {
    warnings.push(
      `Jadwal melanggar batas jam produktif harian (maks ${maxHours} jam/hari). Kurangi durasi atau sebar ke hari lain.`
    );
  } else if (result.breakdown?.hard) {
    warnings.push(
      'Jadwal belum memenuhi semua batasan keras. Coba kurangi total jam atau jalankan generate ulang.'
    );
  } else if (result.fitness <= 0) {
    warnings.push(
      'Jadwal dibuat, tetapi skor kualitas sangat rendah. Periksa batas energi dan jam produktif harian.'
    );
  } else if (result.fitness < 3000) {
    warnings.push(
      'Jadwal dapat ditingkatkan: pertimbangkan mendistribusikan aktivitas ke hari yang energinya masih rendah.'
    );
  }

  const overEnergy = dailyEnergy.filter((d) => d.status === 'over');
  if (overEnergy.length > 0) {
    warnings.push(
      `${overEnergy.length} hari melebihi batas energi (${maxCap}): ${overEnergy.map((d) => d.day).join(', ')}.`
    );
  }

  const overHours = dailyHours.filter((d) => d.status === 'over');
  if (overHours.length > 0) {
    warnings.push(
      `${overHours.length} hari melebihi batas jam (${maxHours} jam): ${overHours.map((d) => d.day).join(', ')}.`
    );
  }

  return warnings;
}

function getEnergyStatus(total, maxCap) {
  if (total > maxCap) return 'over';
  if (total >= maxCap * 0.85) return 'warning';
  return 'ok';
}

function getHoursStatus(total, maxHours) {
  if (total > maxHours) return 'over';
  if (total >= maxHours * 0.85) return 'warning';
  return 'ok';
}
