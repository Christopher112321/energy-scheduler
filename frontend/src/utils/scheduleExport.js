import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { DAY_NAMES, DAY_SHORT } from './constants';

const TYPE_LABELS = {
  fixed: 'Tetap',
  flexible: 'Fleksibel',
  sleep: 'Jam Tidur',
  rest: 'Istirahat',
};

function isSleepHour(hour, sleepStart, sleepEnd) {
  if (sleepStart > sleepEnd) {
    return hour >= sleepStart || hour < sleepEnd;
  }
  return hour >= sleepStart && hour < sleepEnd;
}

function getSlotType(slot, hour, sleepStart, sleepEnd) {
  if (slot?.activity_id) {
    return slot.is_locked ? 'fixed' : 'flexible';
  }
  if (isSleepHour(hour, sleepStart, sleepEnd)) return 'sleep';
  return 'rest';
}

function formatHour(hour) {
  return `${String(hour).padStart(2, '0')}:00`;
}

function escapeCsv(value) {
  const str = String(value ?? '');
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function dateStamp() {
  return new Date().toISOString().slice(0, 10);
}

function formatExportedAt(iso) {
  return new Date(iso).toLocaleString('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function getSleepPrefs(preferences) {
  return {
    sleepStart: preferences?.default_sleep_start ?? 23,
    sleepEnd: preferences?.default_sleep_end ?? 5,
  };
}

/** Cell text + type for grid exports */
function resolveSlotCell(slot, hour, sleepStart, sleepEnd) {
  const type = getSlotType(slot, hour, sleepStart, sleepEnd);
  if (slot?.activity_id) {
    const name = slot.activity_name ?? 'Aktivitas';
    const typeLabel = TYPE_LABELS[type];
    return { text: name, type, typeLabel, sublabel: typeLabel };
  }
  return { text: TYPE_LABELS[type], type, typeLabel: TYPE_LABELS[type], sublabel: '' };
}

/** Weekly grid: rows = hours, cols = days (matches UI calendar) */
export function buildWeeklyGrid(schedule, preferences) {
  const { sleepStart, sleepEnd } = getSleepPrefs(preferences);
  const slots = schedule?.slots ?? [];
  const header = ['Jam', ...DAY_SHORT];
  const rows = [];

  for (let hour = 0; hour < 24; hour += 1) {
    const row = [formatHour(hour)];
    const cells = [];

    for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
      const slot = slots[dayIndex * 24 + hour];
      cells.push(resolveSlotCell(slot, hour, sleepStart, sleepEnd));
    }

    row.push(...cells.map((c) => c.text));
    rows.push({ row, cells });
  }

  return { header, rows };
}

export function buildDetailRows(schedule, preferences) {
  const { sleepStart, sleepEnd } = getSleepPrefs(preferences);
  const slots = schedule?.slots ?? [];

  return slots.map((slot) => {
    const dayIndex = slot.day ?? Math.floor(slot.index / 24);
    const hour = slot.hour ?? slot.index % 24;
    const cell = resolveSlotCell(slot, hour, sleepStart, sleepEnd);
    return {
      hari: DAY_SHORT[dayIndex] ?? '',
      hari_panjang: DAY_NAMES[dayIndex] ?? '',
      jam: formatHour(hour),
      aktivitas: slot.activity_id ? (slot.activity_name ?? '') : cell.text,
      tipe: cell.typeLabel,
      energi: slot.activity_id ? (slot.energy_cost ?? 0) : 0,
    };
  });
}

export function buildEnergyRows(dailyEnergy, preferences) {
  const cap = preferences?.max_daily_energy_cap ?? '-';
  return (dailyEnergy ?? []).map((day) => {
    const dayIdx = DAY_NAMES.indexOf(day.day);
    const label = dayIdx >= 0 ? DAY_SHORT[dayIdx] : day.day;
    return {
      hari: label,
      total_energi: day.total_energy,
      status: day.status ?? '',
      batas: cap,
    };
  });
}

export function buildExportPayload(exportData) {
  const { schedule, activities, preferences, dailyEnergy, meta, fitness } = exportData;
  const grid = buildWeeklyGrid(schedule, preferences);

  return {
    exported_at: new Date().toISOString(),
    title: 'Energy-Aware Weekly Scheduler',
    preferences,
    activities,
    schedule: schedule ? { slots: schedule.slots, chromosome: schedule.chromosome } : null,
    grid,
    detail_rows: buildDetailRows(schedule, preferences),
    energy_rows: buildEnergyRows(dailyEnergy, preferences),
    daily_energy: dailyEnergy ?? [],
    meta: meta ?? null,
    fitness: fitness ?? null,
  };
}

/** Single-table CSV: calendar grid only (Excel-friendly) */
export function scheduleToGridCsv(payload) {
  const { header, rows } = payload.grid;
  const lines = [
    [`Diekspor: ${formatExportedAt(payload.exported_at)}`].map(escapeCsv).join(','),
    '',
    header.map(escapeCsv).join(','),
    ...rows.map(({ row }) => row.map(escapeCsv).join(',')),
  ];
  return `\uFEFF${lines.join('\r\n')}`;
}

export function scheduleToDetailCsv(payload) {
  const header = ['Hari', 'Jam', 'Aktivitas', 'Tipe', 'Energi'];
  const lines = [
    header.map(escapeCsv).join(','),
    ...payload.detail_rows.map((r) =>
      [r.hari, r.jam, r.aktivitas, r.tipe, r.energi].map(escapeCsv).join(',')
    ),
  ];
  return `\uFEFF${lines.join('\r\n')}`;
}

export function scheduleToJson(payload) {
  return JSON.stringify(payload, null, 2);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export function downloadTextFile(content, filename, mimeType = 'text/plain;charset=utf-8') {
  downloadBlob(new Blob([content], { type: mimeType }), filename);
}

export function downloadScheduleCsv(exportData) {
  const payload = buildExportPayload(exportData);
  downloadTextFile(
    scheduleToGridCsv(payload),
    `jadwal-mingguan-${dateStamp()}.csv`,
    'text/csv;charset=utf-8'
  );
}

export function downloadScheduleExcel(exportData) {
  const payload = buildExportPayload(exportData);
  const wb = XLSX.utils.book_new();

  const gridAoa = [
    [payload.title],
    [`Diekspor: ${formatExportedAt(payload.exported_at)}`],
    [],
    ['Legenda: Biru = Tetap | Hijau = Fleksibel | Abu = Istirahat | Ungu muda = Jam Tidur'],
    [],
    payload.grid.header,
    ...payload.grid.rows.map(({ row }) => row),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(gridAoa), 'Kalender');

  const detailAoa = [
    ['Hari', 'Jam', 'Aktivitas', 'Tipe', 'Energi'],
    ...payload.detail_rows.map((r) => [r.hari, r.jam, r.aktivitas, r.tipe, r.energi]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(detailAoa), 'Detail per Jam');

  if (payload.energy_rows.length > 0) {
    const energyAoa = [
      ['Hari', 'Total Energi', 'Status', 'Batas'],
      ...payload.energy_rows.map((r) => [r.hari, r.total_energi, r.status, r.batas]),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(energyAoa), 'Energi Harian');
  }

  const infoRows = [['Field', 'Nilai']];
  if (payload.fitness != null) infoRows.push(['Fitness', payload.fitness]);
  if (payload.meta?.elapsed_ms != null) infoRows.push(['Waktu proses (ms)', payload.meta.elapsed_ms]);
  if (payload.meta?.seed != null) infoRows.push(['Seed', payload.meta.seed]);
  infoRows.push(['Batas energi harian', payload.preferences?.max_daily_energy_cap ?? '-']);
  infoRows.push(['Jam tidur', `${payload.preferences?.default_sleep_start ?? 23}:00 – ${payload.preferences?.default_sleep_end ?? 5}:00`]);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(infoRows), 'Info');

  XLSX.writeFile(wb, `jadwal-mingguan-${dateStamp()}.xlsx`);
}

const PDF_COLORS = {
  fixed: [37, 99, 235],
  flexible: [52, 211, 153],
  sleep: [99, 102, 241],
  rest: [55, 65, 81],
  header: [20, 27, 36],
  headerText: [255, 255, 255],
};

function pdfCellStyle(type) {
  switch (type) {
    case 'fixed':
      return { fillColor: PDF_COLORS.fixed, textColor: [255, 255, 255] };
    case 'flexible':
      return { fillColor: PDF_COLORS.flexible, textColor: [10, 14, 20] };
    case 'sleep':
      return { fillColor: PDF_COLORS.sleep, textColor: [220, 220, 255] };
    default:
      return { fillColor: PDF_COLORS.rest, textColor: [200, 210, 220] };
  }
}

export function downloadSchedulePdf(exportData) {
  const payload = buildExportPayload(exportData);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  doc.setFontSize(18);
  doc.setTextColor(30, 40, 55);
  doc.text('Jadwal Mingguan', 14, 16);

  doc.setFontSize(9);
  doc.setTextColor(100, 110, 130);
  doc.text(`Energy-Aware Weekly Scheduler · ${formatExportedAt(payload.exported_at)}`, 14, 22);

  doc.setFontSize(8);
  doc.text('Biru = Tetap (Terkunci)  ·  Hijau = Fleksibel (GA)  ·  Abu = Istirahat  ·  Ungu = Jam Tidur', 14, 27);

  const gridBody = payload.grid.rows.map(({ row }) => row);
  const gridTypes = payload.grid.rows.map(({ cells }) => cells.map((c) => c.type));

  autoTable(doc, {
    head: [payload.grid.header],
    body: gridBody,
    startY: 32,
    theme: 'grid',
    styles: {
      fontSize: 6.5,
      cellPadding: 1.2,
      overflow: 'linebreak',
      valign: 'middle',
    },
    headStyles: {
      fillColor: PDF_COLORS.header,
      textColor: PDF_COLORS.headerText,
      fontStyle: 'bold',
      fontSize: 7,
    },
    columnStyles: {
      0: { cellWidth: 14, fontStyle: 'bold', fillColor: [240, 242, 245], textColor: [50, 60, 75] },
    },
    didParseCell(data) {
      if (data.section === 'head') return;
      const col = data.column.index;
      if (col === 0) return;
      const type = gridTypes[data.row.index]?.[col - 1] ?? 'rest';
      const style = pdfCellStyle(type);
      data.cell.styles.fillColor = style.fillColor;
      data.cell.styles.textColor = style.textColor;
    },
  });

  let nextY = doc.lastAutoTable.finalY + 10;

  if (payload.energy_rows.length > 0) {
    if (nextY > 170) {
      doc.addPage();
      nextY = 16;
    }
    doc.setFontSize(11);
    doc.setTextColor(30, 40, 55);
    doc.text('Ringkasan Energi Harian', 14, nextY);
    nextY += 4;

    autoTable(doc, {
      head: [['Hari', 'Total Energi', 'Status', 'Batas']],
      body: payload.energy_rows.map((r) => [r.hari, r.total_energi, r.status, r.batas]),
      startY: nextY,
      theme: 'striped',
      styles: { fontSize: 9, cellPadding: 2 },
      headStyles: { fillColor: PDF_COLORS.header, textColor: PDF_COLORS.headerText },
    });
    nextY = doc.lastAutoTable.finalY + 8;
  }

  const metaParts = [];
  if (payload.fitness != null) metaParts.push(`Fitness: ${Math.round(payload.fitness)}`);
  if (payload.meta?.elapsed_ms != null) metaParts.push(`Waktu: ${payload.meta.elapsed_ms} ms`);
  if (payload.meta?.seed != null) metaParts.push(`Seed: ${payload.meta.seed}`);

  if (metaParts.length > 0) {
    doc.setFontSize(8);
    doc.setTextColor(100, 110, 130);
    doc.text(metaParts.join('  ·  '), 14, nextY);
  }

  doc.save(`jadwal-mingguan-${dateStamp()}.pdf`);
}

export function downloadScheduleJson(exportData) {
  const payload = buildExportPayload(exportData);
  downloadTextFile(
    scheduleToJson(payload),
    `jadwal-mingguan-${dateStamp()}.json`,
    'application/json;charset=utf-8'
  );
}
