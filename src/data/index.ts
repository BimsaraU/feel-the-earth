import { FixtureSource } from './fixture';
import type { DataSource } from './types';

// Stage 2 swaps this one line for the real EIC source.
export const source: DataSource = new FixtureSource();
