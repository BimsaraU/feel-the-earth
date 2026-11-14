// Test helper: load the committed raster from disk.
import { readFileSync } from 'node:fs';
import { GeoGrid } from './grid';

export const loadGeoFromDisk = () =>
  new GeoGrid(new Uint8Array(readFileSync('public/data/geo/grid.bin')), JSON.parse(readFileSync('public/data/geo/meta.json', 'utf8')),
    new Uint8Array(readFileSync('public/data/geo/elevation.bin')));
