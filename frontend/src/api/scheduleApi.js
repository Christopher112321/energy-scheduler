const API_BASE = '/api';

const BACKEND_HINT =
  'Pastikan backend berjalan: buka terminal di folder backend, lalu jalankan npm start (port 3001).';

export async function generateSchedule(payload) {
  let response;
  try {
    response = await fetch(`${API_BASE}/schedule/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error(`Tidak dapat terhubung ke server. ${BACKEND_HINT}`);
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(`Respons server tidak valid. ${BACKEND_HINT}`);
  }

  if (!response.ok) {
    const message = data.errors?.join(', ') || data.message || 'Generation failed';
    throw new Error(message);
  }

  return data;
}

export async function fetchSampleInput() {
  let response;
  try {
    response = await fetch(`${API_BASE}/schedule/sample`);
  } catch {
    throw new Error(`Tidak dapat terhubung ke server. ${BACKEND_HINT}`);
  }

  if (!response.ok) throw new Error('Gagal memuat contoh data dari server');
  return response.json();
}
