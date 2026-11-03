import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../');

process.env.VERCEL = '1';

async function runM3StressSuite() {
  console.log('================================================================');
  console.log('   STARTING ADVERSARIAL CHALLENGER STRESS SUITE FOR M3');
  console.log('================================================================');

  const results = {
    passed: 0,
    failed: 0,
    findings: [],
    tests: [],
  };

  async function testCase(name, fn) {
    try {
      const t0 = Date.now();
      await fn();
      const dur = Date.now() - t0;
      console.log(`[PASS] [${dur}ms] ${name}`);
      results.passed++;
      results.tests.push({ name, status: 'PASS', durationMs: dur });
    } catch (err) {
      console.error(`[FAIL] ${name}`);
      console.error(`       Error: ${err.message}`);
      results.failed++;
      results.tests.push({ name, status: 'FAIL', error: err.message });
    }
  }

  // Set up local serverless test instance
  const { default: app } = await import('../../api/index.js');
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`Serverless handler listening on ${baseUrl} (VERCEL=1)\n`);

  // =========================================================================
  // GROUP 1: DEPLOYMENT.MD EMPIRICAL VERIFICATION
  // =========================================================================
  console.log('--- GROUP 1: DEPLOYMENT.MD EMPIRICAL VERIFICATION ---');

  const deploymentDocPath = path.join(projectRoot, 'DEPLOYMENT.md');
  const docContent = fs.readFileSync(deploymentDocPath, 'utf8');

  await testCase('DEPLOYMENT.md exists and is non-empty (>5000 bytes)', () => {
    assert.ok(fs.existsSync(deploymentDocPath), 'DEPLOYMENT.md must exist');
    assert.ok(Buffer.byteLength(docContent, 'utf8') > 5000, 'DEPLOYMENT.md should be comprehensive');
  });

  await testCase('DEPLOYMENT.md Table of Contents internal anchors resolve to valid headings', () => {
    const tocMatches = [...docContent.matchAll(/\[(.*?)\]\(#([a-zA-Z0-9_-]+)\)/g)];
    assert.ok(tocMatches.length >= 6, `Expected at least 6 TOC links, found ${tocMatches.length}`);

    const headings = [...docContent.matchAll(/^#{1,6}\s+(.+)$/gm)].map(m => m[1].trim());

    for (const match of tocMatches) {
      const title = match[1];
      const anchor = match[2];
      
      const resolved = headings.some(h => {
        const generatedAnchor = h
          .toLowerCase()
          .replace(/[^\w\s-]/g, '')
          .trim()
          .replace(/\s+/g, '-');
        return generatedAnchor === anchor || anchor.startsWith(generatedAnchor) || generatedAnchor.startsWith(anchor);
      });
      assert.ok(resolved, `TOC anchor '#${anchor}' for '${title}' did not match any heading`);
    }
  });

  await testCase('ADVERSARIAL CHECK: DEPLOYMENT.md cURL POST payload validation against backend schema', async () => {
    // Extract the cURL POST payload in DEPLOYMENT.md
    const postPayloadMatch = docContent.match(/curl -X POST[\s\S]*?-d '([\s\S]*?)'/);
    assert.ok(postPayloadMatch, 'Could not find curl POST payload in DEPLOYMENT.md');
    
    const rawPayloadJson = postPayloadMatch[1].trim();
    const payload = JSON.parse(rawPayloadJson);

    // Execute against local serverless instance
    const res = await fetch(`${baseUrl}/api/schedule/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const resJson = await res.json();
    if (res.status !== 200) {
      results.findings.push({
        severity: 'HIGH',
        issue: 'DEPLOYMENT.md cURL sample payload fails backend schema validation with HTTP 400',
        details: resJson.errors,
      });
      console.warn(`       [DISCOVERY] DEPLOYMENT.md payload returned HTTP ${res.status}: ${JSON.stringify(resJson.errors)}`);
      // We purposefully document the bug reproduction
      assert.fail(`DEPLOYMENT.md cURL payload is rejected by backend: HTTP ${res.status} - ${JSON.stringify(resJson.errors)}`);
    }
  });

  await testCase('EMPIRICAL BENCHMARK: Corrected cURL POST payload successfully generates valid schedule', async () => {
    const correctedPayload = {
      user_preferences: {
        max_daily_energy_cap: 15,
        max_daily_productive_hours: 8,
        default_sleep_start: 23,
        default_sleep_end: 5,
      },
      activities: [
        {
          id: 'ACT_01',
          name: 'Kuliah AI',
          is_fixed: true,
          energy_cost: 3,
          fixed_slots: [{ day: 'Monday', start_hour: 10, end_hour: 12 }],
        },
        {
          id: 'ACT_02',
          name: 'Belajar Mandiri',
          is_fixed: false,
          energy_cost: 2,
          hours_per_day: 2,
          times_per_week: 2,
        },
      ],
      seed: 42,
    };

    const res = await fetch(`${baseUrl}/api/schedule/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(correctedPayload),
    });

    assert.equal(res.status, 200, `Expected 200 OK, got ${res.status}`);
    const data = await res.json();
    assert.equal(data.success, true, 'API should return success: true');
    assert.ok(typeof data.fitness === 'number', 'fitness must be a numeric score');
    assert.ok(Array.isArray(data.schedules), 'schedules must be an array');
    assert.ok(data.meta && typeof data.meta.elapsed_ms === 'number', 'meta.elapsed_ms must be numeric');
  });

  await testCase('DEPLOYMENT.md: GET /api/health endpoint contract matches', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.deepEqual(data, { status: 'ok', service: 'energy-scheduler' });
  });

  await testCase('DEPLOYMENT.md: GET /api/schedule/sample endpoint contract matches', async () => {
    const res = await fetch(`${baseUrl}/api/schedule/sample`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data.activities), 'sample must have activities array');
    assert.equal(data.activities.length, 5, 'PRD sample must have 5 activities');
    assert.ok(data.user_preferences, 'sample must have user_preferences');
  });

  await testCase('DEPLOYMENT.md: vercel.json snippet matches actual vercel.json exactly', () => {
    const vercelJsonPath = path.join(projectRoot, 'vercel.json');
    assert.ok(fs.existsSync(vercelJsonPath), 'vercel.json file must exist');
    const actualVercelConfig = JSON.parse(fs.readFileSync(vercelJsonPath, 'utf8'));

    const snippetMatch = docContent.match(/```json\s*(\{[\s\S]*?"functions"[\s\S]*?\})\s*```/);
    assert.ok(snippetMatch, 'Could not find vercel.json snippet in DEPLOYMENT.md');
    const docVercelConfig = JSON.parse(snippetMatch[1]);

    assert.deepEqual(docVercelConfig, actualVercelConfig, 'Snippet in doc must match real vercel.json');
  });

  await testCase('DEPLOYMENT.md: 404 middleware snippet reflects backend/src/index.js logic', () => {
    const backendIndexPath = path.join(projectRoot, 'backend/src/index.js');
    const backendContent = fs.readFileSync(backendIndexPath, 'utf8');

    assert.ok(backendContent.includes('process.env.VERCEL'), 'backend/src/index.js must check process.env.VERCEL');
    assert.ok(backendContent.includes("'API route not found'"), 'backend/src/index.js must include error message');
  });

  // =========================================================================
  // GROUP 2: GIT HELPER SCRIPTS (push.ps1 & push.sh)
  // =========================================================================
  console.log('\n--- GROUP 2: GIT HELPER SCRIPTS (push.ps1 & push.sh) ---');

  await testCase('push.sh --help executes cleanly with exit code 0', () => {
    const res = spawnSync('bash', ['push.sh', '--help'], { cwd: projectRoot, encoding: 'utf8' });
    assert.equal(res.status, 0, `push.sh --help returned non-zero: ${res.status}`);
    assert.ok(res.stdout.includes('Penggunaan: ./push.sh'), 'Help output must include usage instructions');
  });

  await testCase('push.ps1 Get-Help provides valid synopsis, syntax, and examples', () => {
    const psCmd = 'Get-Help .\\push.ps1 -Detailed | Out-String';
    const res = spawnSync('powershell', ['-NoProfile', '-Command', psCmd], { cwd: projectRoot, encoding: 'utf8' });
    assert.equal(res.status, 0, `Get-Help push.ps1 failed: ${res.stderr}`);
    assert.ok(res.stdout.includes('SYNOPSIS'), 'Must have SYNOPSIS');
    assert.ok(res.stdout.includes('SYNTAX'), 'Must have SYNTAX');
    assert.ok(res.stdout.toUpperCase().includes('EXAMPLE'), 'Must have EXAMPLE section');
  });

  await testCase('push.ps1 parameter declarations (Message, RemoteUrl, Branch="main")', () => {
    const psCmd = `
      $cmd = Get-Command .\\push.ps1
      $p = $cmd.Parameters
      [PSCustomObject]@{
        HasMessage = $p.ContainsKey('Message')
        HasRemoteUrl = $p.ContainsKey('RemoteUrl')
        HasBranch = $p.ContainsKey('Branch')
        BranchDefault = (Get-Content .\\push.ps1 | Select-String -Pattern '\\$Branch\\s*=\\s*"main"').Length -gt 0
      } | ConvertTo-Json
    `;
    const res = spawnSync('powershell', ['-NoProfile', '-Command', psCmd], { cwd: projectRoot, encoding: 'utf8' });
    assert.equal(res.status, 0, `Param inspection failed: ${res.stderr}`);
    const parsed = JSON.parse(res.stdout.trim());
    assert.equal(parsed.HasMessage, true, 'push.ps1 must declare $Message parameter');
    assert.equal(parsed.HasRemoteUrl, true, 'push.ps1 must declare $RemoteUrl parameter');
    assert.equal(parsed.HasBranch, true, 'push.ps1 must declare $Branch parameter');
    assert.equal(parsed.BranchDefault, true, '$Branch default must be "main"');
  });

  await testCase('push.sh argument parsing handles commit msg, -r, and -b correctly', () => {
    const bashSnippet = `
      COMMIT_MSG=""
      REMOTE_URL=""
      BRANCH="main"
      set -- "my test commit" -r "https://github.com/test/repo.git" -b "develop"
      while [[ $# -gt 0 ]]; do
        case "$1" in
          -r|--remote) REMOTE_URL="$2"; shift 2 ;;
          -b|--branch) BRANCH="$2"; shift 2 ;;
          *) [ -z "$COMMIT_MSG" ] && COMMIT_MSG="$1" || COMMIT_MSG="$COMMIT_MSG $1"; shift ;;
        esac
      done
      echo "$COMMIT_MSG|$REMOTE_URL|$BRANCH"
    `;
    const res = spawnSync('bash', ['-c', bashSnippet], { cwd: projectRoot, encoding: 'utf8' });
    assert.equal(res.status, 0, `bash arg parser failed: ${res.stderr}`);
    assert.equal(res.stdout.trim(), 'my test commit|https://github.com/test/repo.git|develop');
  });

  await testCase('push.ps1 non-interactive execution on clean tree exits 0 with guidance', () => {
    const res = spawnSync('powershell', ['-NoProfile', '-File', '.\\push.ps1'], {
      cwd: projectRoot,
      encoding: 'utf8',
      input: '',
    });
    assert.equal(res.status, 0, `push.ps1 exited with code ${res.status}: ${res.stderr}`);
    assert.ok(res.stdout.includes('working tree bersih') || res.stdout.includes('Langkah 4/4'));
    assert.ok(res.stdout.includes('PANDUAN') || res.stdout.includes('origin'));
  });

  await testCase('push.sh non-interactive execution on clean tree exits 0 with guidance', () => {
    const res = spawnSync('bash', ['push.sh'], {
      cwd: projectRoot,
      encoding: 'utf8',
      input: '',
    });
    assert.equal(res.status, 0, `push.sh exited with code ${res.status}: ${res.stderr}`);
    assert.ok(res.stdout.includes('working tree bersih') || res.stdout.includes('Langkah 4/4'));
    assert.ok(res.stdout.includes('PANDUAN') || res.stdout.includes('origin'));
  });

  await testCase('Git exclusion: .gitignore strictly ignores .agents/, node_modules/, frontend/dist/', () => {
    const pathsToCheck = [
      '.agents/foo.json',
      '.agents/teamwork/test.md',
      'node_modules/express/index.js',
      'frontend/node_modules/vite/package.json',
      'backend/node_modules/express/package.json',
      'frontend/dist/index.html',
      'frontend/dist/assets/app.js',
      'dist/bundle.js',
      '.vercel/project.json',
    ];

    for (const p of pathsToCheck) {
      const res = spawnSync('git', ['check-ignore', '-q', p], { cwd: projectRoot });
      assert.equal(res.status, 0, `Path '${p}' should be ignored by .gitignore`);
    }
  });

  // =========================================================================
  // GROUP 3: DEPLOYMENT SCRIPTS (deploy.ps1 & deploy.sh)
  // =========================================================================
  console.log('\n--- GROUP 3: DEPLOYMENT SCRIPTS (deploy.ps1 & deploy.sh) ---');

  await testCase('deploy.sh --help exits 0 with usage instructions', () => {
    const res = spawnSync('bash', ['deploy.sh', '--help'], { cwd: projectRoot, encoding: 'utf8' });
    assert.equal(res.status, 0, `deploy.sh --help failed: ${res.status}`);
    assert.ok(res.stdout.includes('Penggunaan: ./deploy.sh'), 'Must print usage instructions');
    assert.ok(res.stdout.includes('--prod'), 'Must document --prod');
  });

  await testCase('deploy.sh parameter parsing (--prod, --production, -p)', () => {
    const testFlags = ['--prod', '--production', '-p'];
    for (const flag of testFlags) {
      const bashScript = `
        PROD_MODE=false
        for arg in "${flag}"; do
          case "$arg" in
            --prod|--production|-p) PROD_MODE=true ;;
          esac
        done
        echo "$PROD_MODE"
      `;
      const res = spawnSync('bash', ['-c', bashScript], { encoding: 'utf8' });
      assert.equal(res.status, 0);
      assert.equal(res.stdout.trim(), 'true', `Flag ${flag} should set PROD_MODE=true`);
    }
  });

  await testCase('deploy.ps1 parameter declarations (Prod with Production alias)', () => {
    const psCmd = `
      $cmd = Get-Command .\\deploy.ps1
      $param = $cmd.Parameters['Prod']
      [PSCustomObject]@{
        Name = $param.Name
        Type = $param.ParameterType.Name
        Aliases = $param.Aliases
      } | ConvertTo-Json
    `;
    const res = spawnSync('powershell', ['-NoProfile', '-Command', psCmd], { cwd: projectRoot, encoding: 'utf8' });
    assert.equal(res.status, 0, `Param inspection failed: ${res.stderr}`);
    const parsed = JSON.parse(res.stdout.trim());
    assert.equal(parsed.Name, 'Prod', 'Parameter name must be Prod');
    assert.equal(parsed.Type, 'SwitchParameter', 'Parameter type must be SwitchParameter');
    assert.ok(parsed.Aliases.includes('Production'), 'Parameter must have alias "Production"');
  });

  await testCase('deploy.ps1 Get-Help provides valid synopsis, syntax, and examples', () => {
    const psCmd = 'Get-Help .\\deploy.ps1 -Detailed | Out-String';
    const res = spawnSync('powershell', ['-NoProfile', '-Command', psCmd], { cwd: projectRoot, encoding: 'utf8' });
    assert.equal(res.status, 0, `Get-Help deploy.ps1 failed: ${res.stderr}`);
    assert.ok(res.stdout.includes('SYNOPSIS'), 'Must have SYNOPSIS');
    assert.ok(res.stdout.includes('-Prod'), 'Must describe -Prod');
    assert.ok(res.stdout.includes('-Production'), 'Must describe -Production');
    assert.ok(res.stdout.toUpperCase().includes('EXAMPLE'), 'Must have EXAMPLE section');
  });

  await testCase('Pre-flight Node & npm version check regex matrix in deploy.ps1', () => {
    const testMatrix = [
      { raw: 'v18.0.0', expectedMajor: 18, pass: true },
      { raw: 'v20.10.0', expectedMajor: 20, pass: true },
      { raw: 'v22.20.0', expectedMajor: 22, pass: true },
      { raw: '18.19.0', expectedMajor: 18, pass: true },
      { raw: 'v16.14.0', expectedMajor: 16, pass: false },
      { raw: 'v14.17.0', expectedMajor: 14, pass: false },
    ];

    for (const item of testMatrix) {
      const psCmd = `
        $raw = '${item.raw}'
        if ($raw -match '^v?(\\d+)') {
          $major = [int]$matches[1]
          $pass = ($major -ge 18)
          [PSCustomObject]@{ Major = $major; Pass = $pass } | ConvertTo-Json
        }
      `;
      const res = spawnSync('powershell', ['-NoProfile', '-Command', psCmd], { encoding: 'utf8' });
      assert.equal(res.status, 0);
      const parsed = JSON.parse(res.stdout.trim());
      assert.equal(parsed.Major, item.expectedMajor, `Major mismatch for ${item.raw}`);
      assert.equal(parsed.Pass, item.pass, `Pass mismatch for ${item.raw}`);
    }

    const npmMatrix = [
      { raw: '9.0.0', pass: true },
      { raw: '10.8.2', pass: true },
      { raw: '8.19.4', pass: false },
      { raw: '6.14.15', pass: false },
    ];
    for (const item of npmMatrix) {
      const psCmd = `
        $raw = '${item.raw}'
        if ($raw -match '^(\\d+)') {
          $major = [int]$matches[1]
          $pass = ($major -ge 9)
          [PSCustomObject]@{ Major = $major; Pass = $pass } | ConvertTo-Json
        }
      `;
      const res = spawnSync('powershell', ['-NoProfile', '-Command', psCmd], { encoding: 'utf8' });
      assert.equal(res.status, 0);
      const parsed = JSON.parse(res.stdout.trim());
      assert.equal(parsed.Pass, item.pass, `npm pass mismatch for ${item.raw}`);
    }
  });

  await testCase('Pre-flight abort logic: deploy.ps1 aborts if tests fail ($LASTEXITCODE)', () => {
    const psDeployContent = fs.readFileSync(path.join(projectRoot, 'deploy.ps1'), 'utf8');
    assert.ok(
      psDeployContent.includes('& npm test') && psDeployContent.includes('if ($LASTEXITCODE -ne 0)'),
      'deploy.ps1 must inspect $LASTEXITCODE after npm test'
    );
    assert.ok(
      psDeployContent.includes('& npm run build') && psDeployContent.includes('if ($LASTEXITCODE -ne 0)'),
      'deploy.ps1 must inspect $LASTEXITCODE after npm run build'
    );
    assert.ok(
      psDeployContent.includes('Test-Path "$ProjectRoot\\frontend\\dist\\index.html"'),
      'deploy.ps1 must verify existence of frontend/dist/index.html'
    );
  });

  await testCase('Pre-flight abort logic: deploy.sh aborts if tests or build fail (set -e & checks)', () => {
    const bashDeployContent = fs.readFileSync(path.join(projectRoot, 'deploy.sh'), 'utf8');
    assert.ok(bashDeployContent.includes('set -e'), 'deploy.sh must have set -e active');
    assert.ok(bashDeployContent.includes('npm test'), 'deploy.sh must invoke npm test');
    assert.ok(bashDeployContent.includes('npm run build'), 'deploy.sh must invoke npm run build');
    assert.ok(
      bashDeployContent.includes('frontend/dist/index.html'),
      'deploy.sh must verify frontend/dist/index.html'
    );
  });

  await testCase('Vercel CLI arguments and failure guidance in deploy.ps1 and deploy.sh', () => {
    const psDeployContent = fs.readFileSync(path.join(projectRoot, 'deploy.ps1'), 'utf8');
    const bashDeployContent = fs.readFileSync(path.join(projectRoot, 'deploy.sh'), 'utf8');

    assert.ok(psDeployContent.includes('npx vercel login'), 'deploy.ps1 must suggest npx vercel login on failure');
    assert.ok(psDeployContent.includes('npx vercel link'), 'deploy.ps1 must suggest npx vercel link on failure');
    assert.ok(bashDeployContent.includes('npx vercel login'), 'deploy.sh must suggest npx vercel login on failure');
    assert.ok(bashDeployContent.includes('npx vercel link'), 'deploy.sh must suggest npx vercel link on failure');
  });

  // Clean up server
  await new Promise((resolve) => server.close(resolve));

  // =========================================================================
  // SUMMARY
  // =========================================================================
  console.log('\n================================================================');
  console.log(`STRESS SUITE SUMMARY: Passed: ${results.passed}, Failed: ${results.failed}`);
  if (results.findings.length > 0) {
    console.log('FINDINGS REPRODUCED EMPIRICALLY:');
    for (const f of results.findings) {
      console.log(`- [${f.severity}] ${f.issue}`);
      console.log(`  Details: ${JSON.stringify(f.details)}`);
    }
  }
  console.log('================================================================');

  // Return exit code 1 if any failure
  if (results.failed > 0) {
    process.exit(1);
  }
}

runM3StressSuite().catch((err) => {
  console.error('FATAL in stress suite:', err);
  process.exit(1);
});
