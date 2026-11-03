import http from 'node:http';
import assert from 'node:assert/strict';

// Set VERCEL=1 to simulate Vercel serverless environment
process.env.VERCEL = '1';

async function main() {
  console.log('--- STARTING ADVERSARIAL STRESS TEST FOR M2 ---');

  const startTime = Date.now();
  const { default: app } = await import('../../api/index.js');
  console.log('✓ api/index.js imported successfully without blocking or listening.');

  assert.equal(typeof app, 'function', 'app should be an express function');

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`✓ Test HTTP server listening on ${baseUrl}`);

  const results = {
    passed: 0,
    failed: 0,
    tests: [],
  };

  async function testCase(name, fn) {
    try {
      const t0 = Date.now();
      await fn();
      const dur = Date.now() - t0;
      console.log(`PASS [${dur}ms]: ${name}`);
      results.passed++;
      results.tests.push({ name, status: 'PASS', durationMs: dur });
    } catch (err) {
      console.error(`FAIL: ${name}`);
      console.error(`  Error: ${err.message}`);
      results.failed++;
      results.tests.push({ name, status: 'FAIL', error: err.message });
    }
  }

  // Fetch sample payload first
  const sampleRes = await fetch(`${baseUrl}/api/schedule/sample`);
  assert.equal(sampleRes.status, 200);
  const sampleData = await sampleRes.json();
  console.log(`✓ Retrieved sample input with ${sampleData.activities.length} activities`);

  // --- SECTION 1: CONCURRENT REQUESTS (STRESS) ---
  console.log('\n--- SECTION 1: CONCURRENT REQUEST STRESS TEST ---');

  await testCase('Concurrent 20 requests mixed across all API endpoints', async () => {
    const promises = [];
    const tStart = Date.now();

    for (let i = 0; i < 20; i++) {
      if (i % 4 === 0) {
        promises.push(fetch(`${baseUrl}/api/health`).then(async (r) => {
          assert.equal(r.status, 200);
          const body = await r.json();
          assert.equal(body.status, 'ok');
          return 'health';
        }));
      } else if (i % 4 === 1) {
        promises.push(fetch(`${baseUrl}/api/schedule/sample`).then(async (r) => {
          assert.equal(r.status, 200);
          const body = await r.json();
          assert.ok(body.activities && body.activities.length > 0);
          return 'sample';
        }));
      } else if (i % 4 === 2) {
        promises.push(fetch(`${baseUrl}/api/schedule/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...sampleData, seed: 1000 + i }),
        }).then(async (r) => {
          assert.equal(r.status, 200);
          const body = await r.json();
          assert.equal(body.success, true);
          assert.ok(body.fitness > 0);
          return 'generate';
        }));
      } else {
        promises.push(fetch(`${baseUrl}/api/index.js/health`).then(async (r) => {
          assert.equal(r.status, 200);
          const body = await r.json();
          assert.equal(body.status, 'ok');
          return 'index-health';
        }));
      }
    }

    const responses = await Promise.all(promises);
    assert.equal(responses.length, 20);
    const totalDuration = Date.now() - tStart;
    console.log(`    20 concurrent requests completed in ${totalDuration}ms`);
  });

  // --- SECTION 2: ROUTE REWRITE EDGE CASES ---
  console.log('\n--- SECTION 2: ROUTE REWRITE EDGE CASES ---');

  // 2.1 Stripped paths
  await testCase('Stripped path: GET /health', async () => {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, 'ok');
  });

  await testCase('Stripped path: GET /schedule/sample', async () => {
    const res = await fetch(`${baseUrl}/schedule/sample`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.activities.length > 0);
  });

  await testCase('Stripped path: POST /schedule/generate', async () => {
    const res = await fetch(`${baseUrl}/schedule/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sampleData),
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
  });

  // 2.2 Trailing slashes
  await testCase('Trailing slash: GET /api/health/', async () => {
    const res = await fetch(`${baseUrl}/api/health/`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, 'ok');
  });

  await testCase('Trailing slash: GET /health/', async () => {
    const res = await fetch(`${baseUrl}/health/`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, 'ok');
  });

  await testCase('Trailing slash: GET /api/schedule/sample/', async () => {
    const res = await fetch(`${baseUrl}/api/schedule/sample/`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.activities.length > 0);
  });

  await testCase('Trailing slash: GET /schedule/sample/', async () => {
    const res = await fetch(`${baseUrl}/schedule/sample/`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.activities.length > 0);
  });

  await testCase('Trailing slash: POST /api/schedule/generate/', async () => {
    const res = await fetch(`${baseUrl}/api/schedule/generate/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sampleData),
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
  });

  await testCase('Trailing slash: POST /schedule/generate/', async () => {
    const res = await fetch(`${baseUrl}/schedule/generate/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sampleData),
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
  });

  // 2.3 Direct function entry paths (/api/index.js/*)
  await testCase('Function path: GET /api/index.js/health', async () => {
    const res = await fetch(`${baseUrl}/api/index.js/health`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, 'ok');
  });

  await testCase('Function path: GET /api/index.js/schedule/sample', async () => {
    const res = await fetch(`${baseUrl}/api/index.js/schedule/sample`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.activities.length > 0);
  });

  await testCase('Function path: POST /api/index.js/schedule/generate', async () => {
    const res = await fetch(`${baseUrl}/api/index.js/schedule/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sampleData),
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
  });

  // --- SECTION 3: 404 / ROUTE INTEGRITY CHECKS ---
  console.log('\n--- SECTION 3: 404 / ROUTE INTEGRITY CHECKS ---');

  await testCase('404 Non-existent route: GET /api/nonexistent', async () => {
    const res = await fetch(`${baseUrl}/api/nonexistent`);
    const contentType = res.headers.get('content-type') || '';
    const text = await res.text();
    console.log(`    Status: ${res.status}, Content-Type: ${contentType}`);
    assert.equal(res.status, 404, `Expected status 404, got ${res.status}`);
    assert.ok(!text.includes('<!DOCTYPE html>'), 'API 404 should return JSON or plain text, not HTML');
  });

  await testCase('404 Non-existent route: GET /api/nonexistent/', async () => {
    const res = await fetch(`${baseUrl}/api/nonexistent/`);
    const contentType = res.headers.get('content-type') || '';
    const text = await res.text();
    console.log(`    Status: ${res.status}, Content-Type: ${contentType}`);
    assert.equal(res.status, 404, `Expected status 404, got ${res.status}`);
    assert.ok(!text.includes('<!DOCTYPE html>'), 'API 404 should return JSON or plain text, not HTML');
  });

  await testCase('404 Non-existent route: GET /schedule/nonexistent', async () => {
    const res = await fetch(`${baseUrl}/schedule/nonexistent`);
    const contentType = res.headers.get('content-type') || '';
    const text = await res.text();
    console.log(`    Status: ${res.status}, Content-Type: ${contentType}`);
    assert.equal(res.status, 404, `Expected status 404, got ${res.status}`);
    assert.ok(!text.includes('<!DOCTYPE html>'), 'API 404 should return JSON or plain text, not HTML');
  });

  await testCase('404 Non-existent route: POST /api/schedule/nonexistent', async () => {
    const res = await fetch(`${baseUrl}/api/schedule/nonexistent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 404, `Expected status 404 but got ${res.status}`);
  });

  await testCase('404 Non-existent route: GET /api/index.js/nonexistent', async () => {
    const res = await fetch(`${baseUrl}/api/index.js/nonexistent`);
    const contentType = res.headers.get('content-type') || '';
    const text = await res.text();
    console.log(`    Status: ${res.status}, Content-Type: ${contentType}`);
    assert.equal(res.status, 404, `Expected status 404 but got ${res.status}`);
    assert.ok(!text.includes('<!DOCTYPE html>'), 'API 404 must not serve HTML index.html');
  });

  await testCase('404 Non-existent stripped route: GET /nonexistent_route', async () => {
    const res = await fetch(`${baseUrl}/nonexistent_route`);
    const contentType = res.headers.get('content-type') || '';
    const text = await res.text();
    console.log(`    Status: ${res.status}, Content-Type: ${contentType}`);
    assert.equal(res.status, 404, `Expected status 404 for unmatched API route in serverless mode, got ${res.status}`);
    assert.ok(!text.includes('<!DOCTYPE html>'), 'Must not serve HTML');
  });

  // --- SECTION 4: GA PERFORMANCE & STRESS UNDER 30S BUDGET ---
  console.log('\n--- SECTION 4: GA PERFORMANCE & STRESS UNDER 30S BUDGET ---');

  await testCase('GA Execution: Standard sample input latency', async () => {
    const t0 = Date.now();
    const res = await fetch(`${baseUrl}/api/schedule/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sampleData),
    });
    const dur = Date.now() - t0;
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    console.log(`    GA completed in ${dur}ms (Budget: 30000ms, Used: ${(dur / 300).toFixed(2)}%)`);
    assert.ok(dur < 10000, `Standard GA should finish well under 10s, took ${dur}ms`);
  });

  await testCase('GA Execution: Heavy stress test with 8 activities & 100 generations', async () => {
    const heavyActivities = [
      ...sampleData.activities,
      {
        id: 'ACT_FLEX_04',
        name: 'Ironing and Laundry',
        is_fixed: false,
        energy_cost: 3,
        hours_per_day: 1,
        times_per_week: 2,
      },
      {
        id: 'ACT_FLEX_05',
        name: 'Reading Research Papers',
        is_fixed: false,
        energy_cost: 2,
        hours_per_day: 1,
        times_per_week: 3,
      },
      {
        id: 'ACT_FLEX_06',
        name: 'Technical Writing',
        is_fixed: false,
        energy_cost: 4,
        hours_per_day: 2,
        times_per_week: 2,
      },
    ];

    const heavyInput = {
      activities: heavyActivities,
      user_preferences: {
        ...sampleData.user_preferences,
        max_daily_productive_hours: 12,
        target_productive_hours_per_day: 10,
        max_daily_energy_cap: 35,
      },
      ga_config: {
        generations: 100,
        population_size: 50,
      },
    };

    const t0 = Date.now();
    const res = await fetch(`${baseUrl}/api/schedule/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(heavyInput),
    });
    const dur = Date.now() - t0;
    const data = await res.json();
    if (res.status !== 200) {
      console.log('Heavy GA Errors:', data.errors);
    }
    assert.equal(res.status, 200);
    assert.equal(data.success, true);
    console.log(`    Heavy GA (8 activities, 100 gens, 50 pop) completed in ${dur}ms (Budget: 30000ms, Used: ${(dur / 300).toFixed(2)}%)`);
    assert.ok(dur < 15000, `Heavy GA should complete well within 30s budget, took ${dur}ms`);
  });

  // --- SECTION 5: INPUT VALIDATION & ERROR HANDLING ---
  console.log('\n--- SECTION 5: INPUT VALIDATION & ERROR HANDLING ---');

  await testCase('Validation failure: Missing activities array returns JSON 400', async () => {
    const res = await fetch(`${baseUrl}/api/schedule/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_preferences: {} }),
    });
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.success, false);
    assert.ok(Array.isArray(data.errors));
    assert.ok(data.errors.length > 0);
  });

  await testCase('Validation failure: Invalid activity duration returns JSON 400', async () => {
    const res = await fetch(`${baseUrl}/api/schedule/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        activities: [{ id: '1', name: 'Bad', hours_per_day: -1, times_per_week: 1, is_fixed: false, energy_cost: 3 }],
        user_preferences: sampleData.user_preferences,
      }),
    });
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.success, false);
  });

  await testCase('Malformed JSON body returns 400 Bad Request', async () => {
    const res = await fetch(`${baseUrl}/api/schedule/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{ not valid json',
    });
    assert.equal(res.status, 400);
  });

  await new Promise((resolve) => server.close(resolve));
  console.log(`\n--- ALL TESTS COMPLETED in ${Date.now() - startTime}ms ---`);
  console.log(`Summary: Passed: ${results.passed}, Failed: ${results.failed}`);

  if (results.failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('FATAL TEST ERROR:', err);
  process.exit(1);
});
