/*!
  Copyright 2013 Lovell Fuller and others.
  SPDX-License-Identifier: Apache-2.0
*/

const assert = require('node:assert');
const async = require('async');

const sharp = require('../../');
const fixtures = require('../fixtures');

const concurrency = parseInt(process.env.SHARP_CONCURRENCY, 10);
const maxConcurrent = parseInt(process.env.MAX_CONCURRENT, 10) || 4;

// Set concurrency (0 = auto-detect cores)
if (!isNaN(concurrency)) {
  sharp.concurrency(concurrency);
}

// Disable cache for accurate benchmarking
sharp.cache(false);

// Simulated image sizes - weighted toward smaller images (realistic distribution)
// Most requests are small, with occasional medium/large
const imageSizes = {
  small: { input: fixtures.inputJpg, width: 400, height: 300, weight: 70 },    // 70% of requests
  medium: { input: fixtures.inputJpg, width: 1200, height: 900, weight: 25 },  // 25% of requests
  large: { input: fixtures.inputJpg, width: 2400, height: 1800, weight: 5 }    // 5% of requests
};

const formats = ['jpeg', 'webp', 'avif'];

// Simulated customer quality settings
const qualitySettings = {
  jpeg: { quality: 80, mozjpeg: true },
  webp: { quality: 80 },
  avif: { quality: 60, effort: 4 },
  png: { compressionLevel: 6 }
};

const applyFormat = (pipeline, format) => {
  switch (format) {
    case 'avif':
      return pipeline.avif(qualitySettings.avif);
    case 'png':
      return pipeline.png(qualitySettings.png);
    case 'webp':
      return pipeline.webp(qualitySettings.webp);
    case 'jpeg':
    default:
      return pipeline.jpeg(qualitySettings.jpeg);
  }
};

const processImage = (size, format) => {
  return new Promise((resolve, reject) => {
    const config = imageSizes[size];
    const start = Date.now();

    const pipeline = sharp(config.input, {
      limitInputPixels: 300_000_000, // 300MP limit for large images
      sequentialRead: true
    })
      .rotate()
      .resize(config.width, config.height, {
        fit: 'inside',
        withoutEnlargement: true
      });

    applyFormat(pipeline, format)
      .toBuffer((err, buffer) => {
        if (err) {
          reject(err);
        } else {
          const elapsed = Date.now() - start;
          buffer = null; // Allow GC
          resolve(elapsed);
        }
      });
  });
};

const runBenchmark = async () => {
  const times = {};
  const totalStart = Date.now();

  // Run each size/format combination multiple times with controlled concurrency
  const tasks = [];
  for (const size of Object.keys(imageSizes)) {
    for (const format of formats) {
      // Run 4 iterations of each combination
      for (let i = 0; i < 4; i++) {
        tasks.push({ size, format });
      }
    }
  }

  // Process with limited concurrency (simulating real-world request handling)
  await new Promise((resolve, reject) => {
    async.eachLimit(tasks, maxConcurrent, async (task) => {
      const key = `${task.size}_${task.format}`;
      const elapsed = await processImage(task.size, task.format);

      if (!times[key]) {
        times[key] = [];
      }
      times[key].push(elapsed);
    }, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });

  // Calculate mean times
  const meanTimes = {};
  for (const [key, values] of Object.entries(times)) {
    meanTimes[key] = values.reduce((a, b) => a + b, 0) / values.length;
  }

  const totalTime = Date.now() - totalStart;

  console.log(JSON.stringify({
    times: meanTimes,
    totalTime,
    maxConcurrent
  }));
};

runBenchmark().catch((err) => {
  console.error(err);
  process.exit(1);
});
