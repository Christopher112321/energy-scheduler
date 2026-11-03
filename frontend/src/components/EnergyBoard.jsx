import { DAY_SHORT } from '../utils/constants';
import './EnergyBoard.css';

export default function EnergyBoard({ dailyEnergy, dailyHours, maxCap, maxHours }) {
  if (!dailyEnergy?.length) {
    return (
      <div className="energy-board panel empty-state">
        <h2 className="panel-title">Pemantau Harian</h2>
        <p>Grafik energi & jam akan muncul setelah jadwal di-generate.</p>
      </div>
    );
  }

  const maxEnergyValue = Math.max(maxCap, ...dailyEnergy.map((d) => d.total_energy), 1);
  const maxHoursValue = Math.max(maxHours ?? 8, ...((dailyHours ?? []).map((d) => d.total_hours)), 1);

  return (
    <div className="energy-board panel">
      <h2 className="panel-title">Pemantau Harian</h2>

      <h3 className="energy-subtitle">Energi (poin / kegiatan)</h3>
      <div className="energy-chart">
        {dailyEnergy.map((day, i) => {
          const heightPct = (day.total_energy / maxEnergyValue) * 100;
          const statusClass = day.status ?? 'ok';

          return (
            <div key={`e-${day.day}`} className="energy-bar-col">
              <div className="energy-bar-track">
                <div
                  className={`energy-bar-fill ${statusClass}`}
                  style={{ height: `${heightPct}%` }}
                  title={`${day.total_energy} / ${maxCap} poin`}
                />
                {maxCap <= maxEnergyValue && (
                  <div
                    className="cap-line"
                    style={{ bottom: `${(maxCap / maxEnergyValue) * 100}%` }}
                  />
                )}
              </div>
              <span className="energy-bar-value">{day.total_energy}</span>
              <span className="energy-bar-day">{DAY_SHORT[i]}</span>
            </div>
          );
        })}
      </div>

      {dailyHours?.length > 0 && (
        <>
          <h3 className="energy-subtitle">Jam produktif</h3>
          <div className="energy-chart energy-chart--hours">
            {dailyHours.map((day, i) => {
              const heightPct = (day.total_hours / maxHoursValue) * 100;
              const statusClass = day.status ?? 'ok';

              return (
                <div key={`h-${day.day}`} className="energy-bar-col">
                  <div className="energy-bar-track">
                    <div
                      className={`energy-bar-fill hours-fill ${statusClass}`}
                      style={{ height: `${heightPct}%` }}
                      title={`${day.total_hours} / ${maxHours} jam`}
                    />
                    {(maxHours ?? 8) <= maxHoursValue && (
                      <div
                        className="cap-line cap-line--hours"
                        style={{ bottom: `${((maxHours ?? 8) / maxHoursValue) * 100}%` }}
                      />
                    )}
                  </div>
                  <span className="energy-bar-value">{day.total_hours}j</span>
                  <span className="energy-bar-day">{DAY_SHORT[i]}</span>
                </div>
              );
            })}
          </div>
        </>
      )}

      <div className="energy-legend">
        <span className="status-ok">OK</span>
        <span className="status-warning">Peringatan</span>
        <span className="status-over">Melebihi batas</span>
        <span className="cap-info">
          Batas: {maxCap} energi · {maxHours ?? 8} jam/hari
        </span>
      </div>
    </div>
  );
}
