import { useState } from 'react';
import { DAY_NAMES, createEmptyActivity } from '../utils/constants';
import './ActivityForm.css';

export default function ActivityForm({ activities, setActivities, preferences, setPreferences }) {
  const [mode, setMode] = useState('fixed');

  function addActivity() {
    const isFixed = mode === 'fixed';
    setActivities([...activities, createEmptyActivity(isFixed)]);
  }

  function updateActivity(index, field, value) {
    const updated = [...activities];
    updated[index] = { ...updated[index], [field]: value };
    setActivities(updated);
  }

  function removeActivity(index) {
    setActivities(activities.filter((_, i) => i !== index));
  }

  function updateFixedSlot(actIndex, slotIndex, field, value) {
    const updated = [...activities];
    const slots = [...updated[actIndex].fixed_slots];
    slots[slotIndex] = { ...slots[slotIndex], [field]: value };
    updated[actIndex] = { ...updated[actIndex], fixed_slots: slots };
    setActivities(updated);
  }

  function addFixedSlot(actIndex) {
    const updated = [...activities];
    updated[actIndex] = {
      ...updated[actIndex],
      fixed_slots: [
        ...(updated[actIndex].fixed_slots || []),
        { day: 'Monday', start_hour: 9, end_hour: 10 },
      ],
    };
    setActivities(updated);
  }

  function removeFixedSlot(actIndex, slotIndex) {
    const updated = [...activities];
    updated[actIndex] = {
      ...updated[actIndex],
      fixed_slots: updated[actIndex].fixed_slots.filter((_, i) => i !== slotIndex),
    };
    setActivities(updated);
  }

  return (
    <div className="activity-form panel">
      <h2 className="panel-title">Input Aktivitas</h2>
      <p className="sleep-rule-hint">
        Jam tidur ({String(preferences.default_sleep_start).padStart(2, '0')}:00–
        {String(preferences.default_sleep_end).padStart(2, '0')}:00) tidak boleh diisi aktivitas apa pun.
      </p>

      <details className="energy-guide">
        <summary>Panduan: batas energi &amp; pemakaian</summary>
        <div className="energy-guide-body">
          <p>
            <strong>Batas energi maksimal (per hari)</strong> adalah total poin yang boleh Anda habiskan
            dalam satu hari kalender. Setiap <em>jenis kegiatan</em> yang muncul di hari itu dihitung{' '}
            <strong>sekali penuh</strong> sesuai biaya energinya (1–5), <em>bukan</em> dikalikan durasi jam.
          </p>
          <p>
            <strong>Contoh:</strong> Senin ada Kuliah (4), Gym (4), dan Coding (5) → pemakaian = 4 + 4 + 5 ={' '}
            <strong>13 poin</strong>, meskipun masing-masing berlangsung beberapa jam.
          </p>
          <p>
            <strong>Menetapkan batas:</strong> perkirakan berapa kegiatan berat yang realistis per hari, lalu
            jumlahkan biaya energinya. Misalnya maksimal 3 kegiatan sedang (masing-masing 4) ≈ batas{' '}
            <strong>12–15</strong>.
          </p>
          <p>
            <strong>Batas jam produktif:</strong> total jam kegiatan (semua aktivitas) per hari tidak boleh melebihi
            nilai yang Anda set (misalnya 8 jam).
          </p>
          <p>
            <strong>Prioritas penjadwalan:</strong> algoritma mengisi hari yang energinya masih rendah dan jam
            kegiatannya belum mendekati target ({preferences.target_productive_hours_per_day ?? 8} jam/hari).
          </p>
        </div>
      </details>

      <div className="pref-row pref-row--limits">
        <label>
          <span>Batas Energi Maks / Hari</span>
          <input
            type="number"
            min={5}
            max={50}
            value={preferences.max_daily_energy_cap}
            onChange={(e) =>
              setPreferences({ ...preferences, max_daily_energy_cap: Number(e.target.value) })
            }
          />
        </label>
        <label>
          <span>Batas Jam Produktif / Hari</span>
          <input
            type="number"
            min={1}
            max={24}
            value={preferences.max_daily_productive_hours ?? 8}
            onChange={(e) =>
              setPreferences({
                ...preferences,
                max_daily_productive_hours: Number(e.target.value),
              })
            }
          />
        </label>
        <label>
          <span>Target Jam / Hari (prioritas isi)</span>
          <input
            type="number"
            min={1}
            max={24}
            value={preferences.target_productive_hours_per_day ?? 8}
            onChange={(e) =>
              setPreferences({
                ...preferences,
                target_productive_hours_per_day: Number(e.target.value),
              })
            }
          />
        </label>
      </div>

      <div className="pref-row">
        <label>
          <span>Mulai Tidur</span>
          <select
            value={preferences.default_sleep_start}
            onChange={(e) =>
              setPreferences({ ...preferences, default_sleep_start: Number(e.target.value) })
            }
          >
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>
                {String(h).padStart(2, '0')}:00
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Selesai Tidur</span>
          <select
            value={preferences.default_sleep_end}
            onChange={(e) =>
              setPreferences({ ...preferences, default_sleep_end: Number(e.target.value) })
            }
          >
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>
                {String(h).padStart(2, '0')}:00
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mode-toggle">
        <button
          type="button"
          className={`mode-btn ${mode === 'fixed' ? 'active fixed' : ''}`}
          onClick={() => setMode('fixed')}
        >
          Jadwal Tetap
        </button>
        <button
          type="button"
          className={`mode-btn ${mode === 'flexible' ? 'active flexible' : ''}`}
          onClick={() => setMode('flexible')}
        >
          Jadwal Fleksibel
        </button>
      </div>

      <div className="activity-list">
        {activities.map((activity, index) => (
          <div key={activity.id} className={`activity-card ${activity.is_fixed ? 'fixed' : 'flex'}`}>
            <div className="activity-card-header">
              <span className="activity-badge">
                {activity.is_fixed ? 'Tetap' : 'Fleksibel'}
              </span>
              <button type="button" className="btn-ghost" onClick={() => removeActivity(index)}>
                Hapus
              </button>
            </div>

            <label>
              <span>Nama Aktivitas</span>
              <input
                type="text"
                value={activity.name}
                placeholder="Contoh: Kuliah, Gym, Coding..."
                onChange={(e) => updateActivity(index, 'name', e.target.value)}
              />
            </label>

            <label>
              <span>Biaya Energi per Kegiatan (1-5)</span>
              <input
                type="range"
                min={1}
                max={5}
                value={activity.energy_cost}
                onChange={(e) => updateActivity(index, 'energy_cost', Number(e.target.value))}
              />
              <span className="energy-value">{activity.energy_cost} poin / kegiatan / hari</span>
            </label>

            {activity.is_fixed ? (
              <div className="fixed-slots">
                <span className="field-label">Slot Waktu Terkunci</span>
                {(activity.fixed_slots || []).map((slot, si) => (
                  <div key={si} className="slot-row">
                    <select
                      value={slot.day}
                      onChange={(e) => updateFixedSlot(index, si, 'day', e.target.value)}
                    >
                      {DAY_NAMES.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={0}
                      max={23}
                      value={slot.start_hour}
                      onChange={(e) =>
                        updateFixedSlot(index, si, 'start_hour', Number(e.target.value))
                      }
                    />
                    <span>s/d</span>
                    <input
                      type="number"
                      min={1}
                      max={24}
                      value={slot.end_hour}
                      onChange={(e) =>
                        updateFixedSlot(index, si, 'end_hour', Number(e.target.value))
                      }
                    />
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => removeFixedSlot(index, si)}
                    >
                      x
                    </button>
                  </div>
                ))}
                <button type="button" className="btn-secondary btn-sm" onClick={() => addFixedSlot(index)}>
                  + Tambah Slot
                </button>
              </div>
            ) : (
              <div className="flex-duration-row">
                <label>
                  <span>Jam per Hari (durasi sekali jalan)</span>
                  <input
                    type="number"
                    min={1}
                    max={24}
                    value={activity.hours_per_day ?? 1}
                    onChange={(e) => {
                      const hours = Number(e.target.value);
                      const times = activity.times_per_week ?? 1;
                      const updated = [...activities];
                      updated[index] = {
                        ...updated[index],
                        hours_per_day: hours,
                        total_duration_hours: hours * times,
                      };
                      setActivities(updated);
                    }}
                  />
                </label>
                <label>
                  <span>Kali per Minggu</span>
                  <input
                    type="number"
                    min={1}
                    max={7}
                    value={activity.times_per_week ?? 1}
                    onChange={(e) => {
                      const times = Number(e.target.value);
                      const hours = activity.hours_per_day ?? 1;
                      const updated = [...activities];
                      updated[index] = {
                        ...updated[index],
                        times_per_week: times,
                        total_duration_hours: hours * times,
                      };
                      setActivities(updated);
                    }}
                  />
                </label>
                <p className="flex-total-hint">
                  Total: {(activity.hours_per_day ?? 1) * (activity.times_per_week ?? 1)} jam/minggu
                </p>
              </div>
            )}
          </div>
        ))}
      </div>

      <button type="button" className="btn btn-secondary add-btn" onClick={addActivity}>
        + Tambah Aktivitas ({mode === 'fixed' ? 'Tetap' : 'Fleksibel'})
      </button>
    </div>
  );
}
