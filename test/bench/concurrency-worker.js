/*!
  Copyright 2013 Lovell Fuller and others.
  SPDX-License-Identifier: Apache-2.0
*/

const assert = require('node:assert');
const async = require('async');

const sharp = require('../../');
const fixtures = require('../fixtures');

const width = 720;
const height = 480;

const concurrency = parseInt(process.env.SHARP_CONCURRENCY, 10) || 1;
const format = process.env.BENCH_FORMAT || 'jpeg';
sharp.concurrency(concurrency);

const parallelismLevels = [1, 4, 8, 16, 32, 64];
const means = {};

const getInputFile = () => {
  return fixtures.inputJpg;
  // switch (format) {
  //   case 'avif':
  //     return fixtures.inputAvif;
  //   case 'png':
  //     return fixtures.inputPng;
  //   case 'webp':
  //     return fixtures.inputWebP;
  //   case 'jpeg':
  //   default:
  //     return fixtures.inputJpg;
  // }
};

const applyFormat = (pipeline) => {
  switch (format) {
    case 'avif':
      return pipeline.avif({ quality: 55, effort: 3 });
    case 'png':
      return pipeline.png({ quality: 75 });
    case 'webp':
      return pipeline.webp({ quality: 75 });
    case 'jpeg':
    default:
      return pipeline.jpeg({ quality: 75, mozjpeg: true });
  }
};

async.mapSeries(parallelismLevels, (parallelism, next) => {
  const start = Date.now();
  const inputFile = getInputFile();
  async.times(parallelism,
    (_id, callback) => {
      const pipeline = sharp(inputFile, { limitInputPixels: 67_108_864, sequentialRead: true })
        .rotate()
        .resize(width, height);
      applyFormat(pipeline)
        .toBuffer((err, buffer) => {
          buffer = null;
          callback(err, Date.now() - start);
        });
    },
    (err, times) => {
      assert(!err);
      const mean = times.reduce((a, b) => a + b) / times.length;
      means[parallelism] = mean;
      next();
    }
  );
}, () => {
  console.log(JSON.stringify({ means }));
});
