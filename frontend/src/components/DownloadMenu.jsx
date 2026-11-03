import { useEffect, useRef, useState } from 'react';
import {
  IconChevronDown,
  IconDownload,
  IconFileCsv,
  IconFileExcel,
  IconFileJson,
  IconFilePdf,
} from './icons';
import './DownloadMenu.css';

async function runExportFn(fnName, exportData) {
  const mod = await import('../utils/scheduleExport');
  mod[fnName](exportData);
}

export default function DownloadMenu({ exportData, disabled }) {
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    function handlePointerDown(event) {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setOpen(false);
      }
    }

    function handleEscape(event) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  async function runExport(fnName) {
    setExporting(true);
    try {
      await runExportFn(fnName, exportData);
      setOpen(false);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className={`download-menu ${open ? 'is-open' : ''}`} ref={rootRef}>
      <button
        type="button"
        className="btn btn-download"
        disabled={disabled || exporting}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
      >
        <IconDownload />
        <span>{exporting ? 'Menyiapkan...' : 'Unduh Jadwal'}</span>
        <IconChevronDown />
      </button>

      {open && (
        <div className="download-menu-dropdown" role="menu">
          <button
            type="button"
            role="menuitem"
            className="download-option download-option--featured"
            onClick={() => runExport('downloadScheduleExcel')}
          >
            <span className="download-option-icon excel">
              <IconFileExcel />
            </span>
            <span className="download-option-text">
              <strong>Excel (.xlsx)</strong>
              <small>Tabel kalender + detail + energi (disarankan)</small>
            </span>
          </button>

          <button
            type="button"
            role="menuitem"
            className="download-option download-option--featured"
            onClick={() => runExport('downloadSchedulePdf')}
          >
            <span className="download-option-icon pdf">
              <IconFilePdf />
            </span>
            <span className="download-option-text">
              <strong>PDF</strong>
              <small>Laporan berwarna siap cetak / dibagikan</small>
            </span>
          </button>

          <div className="download-menu-divider" role="separator" />

          <button
            type="button"
            role="menuitem"
            className="download-option"
            onClick={() => runExport('downloadScheduleCsv')}
          >
            <span className="download-option-icon csv">
              <IconFileCsv />
            </span>
            <span className="download-option-text">
              <strong>CSV</strong>
              <small>Tabel kalender 7 hari (satu sheet)</small>
            </span>
          </button>

          <button
            type="button"
            role="menuitem"
            className="download-option"
            onClick={() => runExport('downloadScheduleJson')}
          >
            <span className="download-option-icon json">
              <IconFileJson />
            </span>
            <span className="download-option-text">
              <strong>JSON</strong>
              <small>Data mentah untuk integrasi</small>
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
