// JODI's tools: what the language model may do in the app. OpenAI / Groq function-calling format (the same JSON Schema
// shape MCP tools use). Pure data, shared by the server (api/_groq.ts sends them to the model) and the browser
// (run.ts executes the calls), so the two can never disagree.

import type { LayerId } from '../data/types';

export const LAYER_IDS: LayerId[] = ['sst', 'lightning', 'lights', 'lightschange', 'co2', 'airtemp', 'precip', 'ndvi', 'aerosol'];

type Schema = { type: 'object'; properties: Record<string, unknown>; required?: string[] };
const fn = (name: string, description: string, properties: Record<string, unknown> = {}, required: string[] = []) =>
  ({ type: 'function' as const, function: { name, description, parameters: { type: 'object', properties, required } as Schema } });

const bool = (description: string) => ({ type: 'boolean', description });

export const TOOLS = [
  fn('set_playing', 'Start or pause the music.', { playing: bool('true = play, false = pause') }, ['playing']),
  fn('layer', 'Turn a data layer on (it is also drawn on the map) or off. At most four layers play at once.', {
    layer: { type: 'string', enum: LAYER_IDS, description: 'sst ocean temperature, lightning, lights night lights, lightschange night light change, co2 carbon dioxide, airtemp air temperature, precip rain, ndvi vegetation, aerosol smoke and dust' },
    on: bool('true = on, false = off'),
  }, ['layer', 'on']),
  fn('go_to_place', 'Move the listening window to a country or sea by name. If it is not found, use set_location with coordinates.', { place: { type: 'string' } }, ['place']),
  fn('set_location', 'Move the listening window centre to coordinates. Use for cities, regions, reefs, mountains, forests and anything else you know the position of.', {
    lat: { type: 'number', minimum: -85, maximum: 85 }, lon: { type: 'number', minimum: -180, maximum: 180 },
  }, ['lat', 'lon']),
  fn('move', 'Move the window by whole window widths.', {
    direction: { type: 'string', enum: ['north', 'south', 'east', 'west'] }, steps: { type: 'integer', minimum: 1, maximum: 20 },
  }, ['direction']),
  fn('set_window_size', 'Set the listening window width in degrees (2 = a point, 30 = the widest).', { degrees: { type: 'number', minimum: 2, maximum: 30 } }, ['degrees']),
  fn('set_date', 'Jump to a date (YYYY-MM-DD) inside the data record.', { date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' } }, ['date']),
  fn('step_date', 'Step the date forward (positive) or back (negative).', {
    unit: { type: 'string', enum: ['day', 'month', 'year'] }, steps: { type: 'integer', minimum: -50, maximum: 50 },
  }, ['unit', 'steps']),
  fn('time_travel', 'Time travel on or off: the date advances every bar while the music plays.', { on: bool('on or off') }, ['on']),
  fn('zoom', 'Zoom the map view.', { action: { type: 'string', enum: ['in', 'out', 'reset'] } }, ['action']),
  fn('set_volume', 'Set the master volume.', { percent: { type: 'integer', minimum: 0, maximum: 100 } }, ['percent']),
  fn('set_tempo', 'Set the music tempo in beats a minute (72 is normal).', { bpm: { type: 'integer', minimum: 40, maximum: 120 } }, ['bpm']),
  fn('where_am_i', 'Read the exact position, window width, nearest coast and date.'),
  fn('what_am_i_hearing', 'Read each playing layer\'s value here, its instrument and what the music means.'),
  fn('find_extremes', 'Find the highest and/or lowest value of the mapped layer near the window, and ping its sound beacon.', {
    which: { type: 'string', enum: ['peak', 'valley', 'both'] },
  }),
  fn('start_tour', 'Start a spoken tour after your reply: listening (how to hear the data) or assistant (what to say to you).', {
    which: { type: 'string', enum: ['listening', 'assistant'] },
  }, ['which']),
];

export type ToolName = (typeof TOOLS)[number]['function']['name'];
