import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateSchedule } from './scheduler.js';
import { validateScheduleInput, getSampleInput } from './validation.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// URL normalization for serverless environments
app.use((req, _res, next) => {
  if (req.url.startsWith('/api/index.js')) {
    req.url = req.url.replace('/api/index.js', '') || '/';
  }
  next();
});

const apiRouter = express.Router();

apiRouter.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'energy-scheduler' });
});

apiRouter.get('/schedule/sample', (_req, res) => {
  res.json(getSampleInput());
});

apiRouter.post('/schedule/generate', (req, res) => {
  const validation = validateScheduleInput(req.body);

  if (!validation.valid) {
    return res.status(400).json({
      success: false,
      errors: validation.errors,
    });
  }

  try {
    const seed = req.body.seed ?? req.query.seed;
    const parsedSeed = seed !== undefined && seed !== '' ? parseInt(String(seed), 10) : undefined;
    const warnings = [];

    if (seed !== undefined && seed !== '' && Number.isNaN(parsedSeed)) {
      warnings.push('Seed tidak valid; generate menggunakan seed acak.');
    }

    const result = generateSchedule(validation.normalized, {
      seed: Number.isNaN(parsedSeed) ? undefined : parsedSeed,
      generations: validation.normalized.ga_config?.generations,
      populationSize: validation.normalized.ga_config?.population_size,
    });

    if (warnings.length > 0) {
      result.warnings = [...warnings, ...(result.warnings ?? [])];
    }

    res.json(result);
  } catch (error) {
    console.error('Schedule generation failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate schedule',
      message: error.message,
    });
  }
});

// Mount router on both '/api' and '/' for seamless prefix normalization
app.use('/api', apiRouter);
app.use('/', apiRouter);

if (process.env.VERCEL) {
  app.use((_req, res) => {
    res.status(404).json({
      success: false,
      error: 'Not Found',
      message: 'API route not found',
    });
  });
}

if (!process.env.VERCEL) {
  const distPath = path.join(__dirname, '../../frontend/dist');
  app.use(express.static(distPath));

  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/schedule') || req.path.startsWith('/health')) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'API route not found',
      });
    }
    res.sendFile(path.join(distPath, 'index.html'), (err) => {
      if (err) next(err);
    });
  });

  app.use((_req, res) => {
    res.status(404).json({
      success: false,
      error: 'Not Found',
      message: 'Route not found',
    });
  });

  app.listen(PORT, () => {
    console.log(`Energy Scheduler running on http://localhost:${PORT}`);
    console.log(`  API:  http://localhost:${PORT}/api/health`);
    console.log(`  UI:   http://localhost:${PORT}/ (frontend/dist)`);
  });
}

export default app;
