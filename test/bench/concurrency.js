/*!
  Copyright 2013 Lovell Fuller and others.
  SPDX-License-Identifier: Apache-2.0
*/

const { fork } = require('node:child_process');
const path = require('node:path');

// Configurations to test: [UV_THREADPOOL_SIZE, sharp.concurrency]
const configs = [
  [1, 1],
  [1, 2],
  [1, 4],
  [1, 8],
  [1, 16],
  [1, 32],
  [1, 64],
  [2, 1],
  [2, 2],
  [2, 4],
  [2, 8],
  [2, 16],
  [2, 32],
  [2, 64],
  [4, 1],
  [4, 2],
  [4, 4],
  [4, 8],
  [4, 16],
  [4, 32],
  [4, 64],
  [8, 1],
  [8, 2],
  [8, 4],
  [8, 8],
  [16, 1],
  [16, 2],
  [16, 4],
  [16, 8],
  [16, 16],
  [16, 32],
  [16, 64],
  [64, 1],
  [64, 2],
  [64, 4],
  [64, 8],
  [64, 16],
  [64, 32],
  [64, 64],
  [9, 1],
  [9, 2],
  [9, 4],
  [9, 8],
  [9, 16],
  [9, 32],
  [9, 64],
  [10, 1],
  [10, 2],
  [10, 4],
  [10, 8],
  [10, 16],
  [10, 32],
  [10, 64]
];

// Formats to test
const formats = ['jpeg', 'png', 'webp', 'avif'];

// Parallelism levels to test
const parallelismLevels = [1, 4, 8, 16, 32, 64];

// Results stored by format
const resultsByFormat = {};

const runConfig = (format, configIndex, callback) => {
  if (configIndex >= configs.length) {
    callback();
    return;
  }

  const [uvSize, concurrency] = configs[configIndex];
  console.log(`  Testing UV_THREADPOOL_SIZE=${uvSize}, concurrency=${concurrency}...`);

  const child = fork(path.join(__dirname, 'concurrency-worker.js'), [], {
    env: {
      ...process.env,
      UV_THREADPOOL_SIZE: String(uvSize),
      SHARP_CONCURRENCY: String(concurrency),
      BENCH_FORMAT: format
    },
    stdio: ['pipe', 'pipe', 'pipe', 'ipc']
  });

  let output = '';
  child.stdout.on('data', (data) => {
    output += data.toString();
  });

  child.stderr.on('data', (data) => {
    process.stderr.write(data);
  });

  child.on('close', (code) => {
    if (code === 0) {
      try {
        const data = JSON.parse(output.trim());
        resultsByFormat[format].push({
          uvSize,
          concurrency,
          ...data
        });
      } catch (e) {
        console.error(`Failed to parse output for UV=${uvSize}, c=${concurrency}`);
      }
    }
    runConfig(format, configIndex + 1, callback);
  });
};

const runFormat = (formatIndex) => {
  if (formatIndex >= formats.length) {
    printAllResults();
    return;
  }

  const format = formats[formatIndex];
  console.log(`\n${'='.repeat(100)}`);
  console.log(`BENCHMARKING FORMAT: ${format.toUpperCase()}`);
  console.log('='.repeat(100));

  resultsByFormat[format] = [];
  runConfig(format, 0, () => {
    runFormat(formatIndex + 1);
  });
};

const printResults = (format, results) => {
  console.log(`\n${'='.repeat(100)}`);
  console.log(`RESULTS [${format.toUpperCase()}]: Mean completion time (ms) for N parallel operations`);
  console.log('='.repeat(100));

  // Header
  const header = ['UV', 'Conc', 'Threads', ...parallelismLevels.map(p => `${p} ops`)];
  console.log(header.map(h => String(h).padStart(8)).join(' | '));
  console.log('-'.repeat(100));

  // Sort by total threads
  results.sort((a, b) => (a.uvSize * a.concurrency) - (b.uvSize * b.concurrency));

  for (const r of results) {
    const row = [
      r.uvSize,
      r.concurrency,
      r.uvSize * r.concurrency,
      ...parallelismLevels.map(p => r.means[p] ? r.means[p].toFixed(1) : '-')
    ];
    console.log(row.map(v => String(v).padStart(8)).join(' | '));
  }

  console.log(`\n${'='.repeat(100)}`);
  console.log(`BEST CONFIGURATION [${format.toUpperCase()}] PER PARALLELISM LEVEL`);
  console.log('='.repeat(100));

  for (const p of parallelismLevels) {
    const best = results
      .filter(r => r.means[p])
      .sort((a, b) => a.means[p] - b.means[p])[0];
    if (best) {
      console.log(`${p} parallel ops: UV=${best.uvSize}, concurrency=${best.concurrency} (${best.means[p].toFixed(1)}ms)`);
    }
  }
};

const printAllResults = () => {
  for (const format of formats) {
    printResults(format, resultsByFormat[format]);
  }

  // Print comparison
  console.log(`\n${'='.repeat(100)}`);
  console.log('COMPARISON: Best configs across formats');
  console.log('='.repeat(100));

  for (const p of parallelismLevels) {
    console.log(`\n${p} parallel operations:`);
    for (const format of formats) {
      const best = resultsByFormat[format]
        .filter(r => r.means[p])
        .sort((a, b) => a.means[p] - b.means[p])[0];
      if (best) {
        console.log(`  ${format.padEnd(6)}: UV=${best.uvSize}, c=${best.concurrency} (${best.means[p].toFixed(1)}ms)`);
      }
    }
  }
};

console.log('Sharp Concurrency Benchmark');
console.log('Testing various UV_THREADPOOL_SIZE and sharp.concurrency combinations');
console.log(`Formats: ${formats.join(', ')}`);
console.log(`Parallelism levels: ${parallelismLevels.join(', ')}`);

runFormat(0);
