import { Fragment, useMemo } from 'react';
import { DAY_SHORT } from '../utils/constants';
import DownloadMenu from './DownloadMenu';
import { IconRefresh } from './icons';
import './CalendarView.css';

function isSleepHour(hour, sleepStart, sleepEnd) {
  if (sleepStart > sleepEnd) {
    return hour >= sleepStart || hour < sleepEnd;
  }
  return hour >= sleepStart && hour < sleepEnd;
}

export default function CalendarView({
  schedule,
  activities,
  preferences,
  dailyEnergy,
  meta,
  fitness,
  onRegenerate,
}) {
  const exportData = useMemo(
    () => ({
      schedule,
      activities,
      preferences,
      dailyEnergy,
      meta,
      fitness,
    }),
    [schedule, activities, preferences, dailyEnergy, meta, fitness]
  );

  if (!schedule?.slots?.length) {
    return (
      <div className="calendar-view panel empty-state">
        <div className="empty-state-visual" aria-hidden="true">
          <div className="empty-grid-preview">
            {Array.from({ length: 12 }).map((_, i) => (
              <span key={i} className={i % 4 === 0 ? 'preview-fixed' : i % 3 === 0 ? 'preview-flex' : ''} />
            ))}
          </div>
        </div>
        <h2 className="panel-title">Kalender Mingguan</h2>
        <p className="empty-state-desc">
          Generate jadwal untuk melihat pratinjau kalender 7 hari × 24 jam, lalu unduh hasilnya
          sebagai CSV atau JSON.
        </p>
      </div>
    );
  }

  const { slots } = schedule;
  const sleepStart = preferences?.default_sleep_start ?? 23;
  const sleepEnd = preferences?.default_sleep_end ?? 5;

  const hours = Array.from({ length: 24 }, (_, i) => i);
  const activityCount = slots.filter((s) => s.activity_id).length;

  return (
    <div className="calendar-view panel">
      <div className="calendar-header">
        <div className="calendar-header-text">
          <h2 className="panel-title">Kalender Mingguan</h2>
          <p className="calendar-subtitle">
            {activityCount} slot terisi · biru = tetap · hijau = fleksibel
          </p>
        </div>
        <div className="calendar-actions">
          <DownloadMenu exportData={exportData} />
          <button type="button" className="btn btn-secondary" onClick={onRegenerate}>
            <IconRefresh />
            <span>Regenerate</span>
          </button>
        </div>
      </div>

      <div className="calendar-legend">
        <span className="legend-item fixed">
          <span className="legend-dot" /> Tetap (Terkunci)
        </span>
        <span className="legend-item flexible">
          <span className="legend-dot" /> Fleksibel (GA)
        </span>
        <span className="legend-item rest">
          <span className="legend-dot" /> Istirahat
        </span>
        <span className="legend-item sleep">
          <span className="legend-dot" /> Jam Tidur (tanpa aktivitas)
        </span>
      </div>

      <div className="calendar-scroll">
        <div className="calendar-grid">
          <div className="calendar-corner" />
          {DAY_SHORT.map((day) => (
            <div key={day} className="day-header">
              {day}
            </div>
          ))}

          {hours.map((hour) => (
            <Fragment key={hour}>
              <div className="hour-label">{String(hour).padStart(2, '0')}:00</div>
              {DAY_SHORT.map((_, dayIndex) => {
                const slot = slots[dayIndex * 24 + hour];
                if (!slot) {
                  return (
                    <div
                      key={`${dayIndex}-${hour}`}
                      className="calendar-cell rest"
                      title="Istirahat"
                    />
                  );
                }
                const isSleep = isSleepHour(hour, sleepStart, sleepEnd);
                const hasActivity = slot.activity_id != null;
                const isLocked = slot.is_locked;

                let cellClass = 'calendar-cell';
                if (isSleep && !hasActivity) cellClass += ' sleep';
                if (hasActivity) {
                  cellClass += isLocked ? ' locked' : ' flexible';
                } else if (!isSleep) {
                  cellClass += ' rest';
                }

                return (
                  <div
                    key={`${dayIndex}-${hour}`}
                    className={cellClass}
                    title={
                      hasActivity
                        ? `${slot.activity_name}${isLocked ? ' (Terkunci)' : ''}`
                        : isSleep
                          ? 'Waktu tidur'
                          : 'Istirahat'
                    }
                  >
                    {isLocked && hasActivity && (
                      <span className="lock-icon" title="Terkunci" aria-label="Terkunci" />
                    )}
                    {hasActivity && (
                      <span className="cell-label">{slot.activity_name?.slice(0, 8)}</span>
                    )}
                  </div>
                );
              })}
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}
