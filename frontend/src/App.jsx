import { useState, useCallback, useMemo } from 'react';
import ActivityForm from './components/ActivityForm';
import CalendarView from './components/CalendarView';
import EnergyBoard from './components/EnergyBoard';
import { generateSchedule, fetchSampleInput } from './api/scheduleApi';
import { IconSparkles } from './components/icons';
import { SAMPLE_PREFERENCES } from './utils/constants';
import { canGenerateSchedule, getNamedActivities, parseSeedInput } from './utils/activityHelpers';
import { prepareActivitiesForApi } from './utils/activityPayload';

function applyScheduleToView(candidate, baseMeta, hooks) {
  hooks.setSchedule(candidate.schedule);
  hooks.setDailyEnergy(candidate.daily_energy ?? []);
  hooks.setDailyHours(candidate.daily_hours ?? []);
  hooks.setFitness(candidate.fitness);
  hooks.setMeta({
    ...baseMeta,
    ...candidate.meta,
    seed: candidate.seed,
    rank: candidate.rank,
  });
}

export default function App() {
  const [activities, setActivities] = useState([]);
  const [preferences, setPreferences] = useState(SAMPLE_PREFERENCES);
  const [schedules, setSchedules] = useState([]);
  const [selectedRank, setSelectedRank] = useState(1);
  const [schedule, setSchedule] = useState(null);
  const [dailyEnergy, setDailyEnergy] = useState([]);
  const [dailyHours, setDailyHours] = useState([]);
  const [meta, setMeta] = useState(null);
  const [runMeta, setRunMeta] = useState(null);
  const [fitness, setFitness] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [warnings, setWarnings] = useState([]);
  const [seed, setSeed] = useState('');

  const generateReady = useMemo(() => canGenerateSchedule(activities), [activities]);

  const selectSchedule = useCallback((candidate) => {
    setSelectedRank(candidate.rank);
    applyScheduleToView(candidate, runMeta, {
      setSchedule,
      setDailyEnergy,
      setDailyHours,
      setFitness,
      setMeta,
    });
  }, [runMeta]);

  const runGenerate = useCallback(
    async (customSeed) => {
      const named = getNamedActivities(activities);
      if (named.length === 0) {
        setError('Tambahkan minimal satu aktivitas dengan nama sebelum generate.');
        return;
      }

      setLoading(true);
      setError(null);
      setWarnings([]);

      const seedInput = customSeed !== undefined ? customSeed : seed;
      const { seed: parsedSeed, warning: seedWarning } = parseSeedInput(seedInput);

      try {
        const payload = {
          user_preferences: preferences,
          activities: prepareActivitiesForApi(named),
        };

        if (parsedSeed !== undefined) {
          payload.seed = parsedSeed;
        }

        const result = await generateSchedule(payload);
        const topSchedules = result.schedules ?? [];

        setRunMeta(result.meta);
        setSchedules(topSchedules);

        const best = topSchedules[0] ?? {
          schedule: result.schedule,
          daily_energy: result.daily_energy,
          daily_hours: result.daily_hours,
          fitness: result.fitness,
          fitness_breakdown: result.fitness_breakdown,
          rank: 1,
          seed: result.meta?.seed,
          meta: result.meta,
        };

        applyScheduleToView(best, result.meta, {
          setSchedule,
          setDailyEnergy,
          setDailyHours,
          setFitness,
          setMeta,
        });
        setSelectedRank(best.rank ?? 1);

        const allWarnings = [
          ...(seedWarning ? [seedWarning] : []),
          ...(result.warnings ?? []),
        ];
        if (topSchedules.length > 1) {
          allWarnings.push(
            `${topSchedules.length} jadwal dihasilkan — pilih tab dengan fitness tertinggi sesuai kebutuhan Anda.`
          );
        }
        setWarnings(allWarnings);
      } catch (err) {
        setError(err.message);
        setSchedules([]);
        setSchedule(null);
        setDailyEnergy([]);
        setDailyHours([]);
        setMeta(null);
        setFitness(null);
      } finally {
        setLoading(false);
      }
    },
    [activities, preferences, seed]
  );

  async function loadSample() {
    try {
      const sample = await fetchSampleInput();
      setActivities(sample.activities);
      setPreferences(sample.user_preferences);
      setSchedules([]);
      setSchedule(null);
      setDailyEnergy([]);
      setDailyHours([]);
      setFitness(null);
      setWarnings([]);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }

  function handleRegenerate() {
    if (seed.trim() !== '') {
      runGenerate(seed);
      return;
    }
    runGenerate(undefined);
  }

  const hasSchedule = Boolean(schedule?.slots?.length);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="header-eyebrow">
          <span className="app-badge">
            <IconSparkles />
            Genetic Algorithm
          </span>
          {hasSchedule && (
            <span className="status-pill status-pill--active">Jadwal siap diunduh</span>
          )}
        </div>
        <h1>Energy-Aware Weekly Scheduler</h1>
        <p>
          Penjadwal mingguan bertenaga Genetic Algorithm. Menghasilkan 3 jadwal terbaik (fitness
          tertinggi) dengan batas energi dan jam produktif harian.
        </p>
      </header>

      <div className="action-bar panel action-bar-panel">
        <div className="action-bar-primary">
          <button
            type="button"
            className="btn btn-primary"
            disabled={loading || !generateReady}
            onClick={() => runGenerate(seed)}
            title={!generateReady ? 'Isi nama minimal satu aktivitas' : undefined}
          >
            {loading ? (
              <>
                <span className="btn-spinner" aria-hidden="true" />
                Mengoptimalkan 3 jadwal...
              </>
            ) : (
              'Generate 3 Jadwal Terbaik'
            )}
          </button>
          <button type="button" className="btn btn-secondary" onClick={loadSample}>
            Muat Contoh PRD
          </button>
        </div>
        <label className="seed-input">
          <span>Seed (opsional)</span>
          <input
            type="number"
            placeholder="42"
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
          />
        </label>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {warnings.length > 0 && (
        <div className="warning-banner" role="status">
          {warnings.map((w) => (
            <p key={w}>{w}</p>
          ))}
        </div>
      )}

      <div className="app-grid">
        <ActivityForm
          activities={activities}
          setActivities={setActivities}
          preferences={preferences}
          setPreferences={setPreferences}
        />

        <div className="main-content">
          {schedules.length > 0 && (
            <div className="schedule-tabs panel" role="tablist" aria-label="Pilih jadwal">
              {schedules.map((s) => (
                <button
                  key={s.rank}
                  type="button"
                  role="tab"
                  aria-selected={selectedRank === s.rank}
                  className={`schedule-tab ${selectedRank === s.rank ? 'active' : ''}`}
                  onClick={() => selectSchedule(s)}
                >
                  <span className="schedule-tab-rank">#{s.rank}</span>
                  <span className="schedule-tab-fitness">Fitness {Math.round(s.fitness)}</span>
                </button>
              ))}
            </div>
          )}

          <CalendarView
            schedule={schedule}
            activities={activities}
            preferences={preferences}
            dailyEnergy={dailyEnergy}
            meta={meta}
            fitness={fitness}
            onRegenerate={handleRegenerate}
          />
          <EnergyBoard
            dailyEnergy={dailyEnergy}
            dailyHours={dailyHours}
            maxCap={preferences.max_daily_energy_cap}
            maxHours={preferences.max_daily_productive_hours ?? 8}
          />

          {meta && (
            <div className="meta-stats">
              {fitness !== null && (
                <div className="stat-card">
                  <span className="stat-label">Fitness (jadwal #{selectedRank})</span>
                  <span className="stat-value">{Math.round(fitness)}</span>
                  {fitness <= 0 && (
                    <span className="stat-hint">Kualitas rendah — lihat peringatan</span>
                  )}
                </div>
              )}
              <div className="stat-card">
                <span className="stat-label">Waktu proses</span>
                <span className="stat-value">{meta.elapsed_ms} ms</span>
              </div>
              {meta.candidates_evaluated != null && (
                <div className="stat-card">
                  <span className="stat-label">Kandidat GA</span>
                  <span className="stat-value">{meta.candidates_evaluated}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
