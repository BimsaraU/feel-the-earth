// Spoken answers built from templates and the mapping table. No LLM.

import { levelWord, norm, type VoiceMapping } from '../audio/mapping';
import type { LayerInfo } from '../data/types';
import { compassWord, KM_PER_DEG, type GeoGrid } from '../geo/grid';

export function spokenNumber(v: number): string {
  const a = Math.abs(v);
  const s = (a >= 10 ? Math.round(a) : Math.round(a * 10) / 10).toLocaleString('en-GB');
  return v < 0 && s !== '0' ? `minus ${s}` : s;
}

/** Two significant figures, e.g. 1,102 -> "1,100". */
export function roughKm(km: number): string {
  if (km < 30) return 'less than 30 kilometres';
  const p = 10 ** (Math.floor(Math.log10(km)) - 1);
  return `${(Math.round(km / p) * p).toLocaleString('en-GB')} kilometres`;
}

export function spokenDate(iso: string): string {
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

const coord = (v: number, pos: string, neg: string) => `${Math.abs(v).toFixed(1)} ${v >= 0 ? pos : neg}`;

export function placeName(geo: GeoGrid, lat: number, lon: number): string {
  const id = geo.countryId(lat, lon);
  return id ? geo.countryName(id) : `the ${geo.seaName(lat, lon)}`;
}

export function whereAmI(geo: GeoGrid, lat: number, lon: number, size: number, date: string): string {
  const onLand = geo.countryId(lat, lon) > 0;
  const widthKm = size * KM_PER_DEG * Math.cos((lat * Math.PI) / 180);
  const coast = geo.nearestCoast(lat, lon);
  const coastText = coast
    ? `Nearest ${onLand ? 'coast' : 'land'} is ${roughKm(coast.km)} ${compassWord(coast.bearingDeg)}.`
    : `No ${onLand ? 'coast' : 'land'} within 3,000 kilometres.`;
  return [
    `Window centre ${coord(lat, 'north', 'south')}, ${coord(lon, 'east', 'west')}, over ${placeName(geo, lat, lon)}.`,
    `The window is ${size} degrees wide, about ${roughKm(widthKm)}.`,
    coastText,
    `Date: ${spokenDate(date)}.`,
  ].join(' ');
}

export interface Heard { layer: LayerInfo; voice: VoiceMapping; mean: number }

export function whatAmIHearing(items: Heard[]): string {
  if (!items.length) return 'No layers are on. You hear a quiet piano pulse. Press 1 to 8 to turn a layer on.';
  const parts = items.map(({ layer, voice, mean }) => {
    if (Number.isNaN(mean)) return `${layer.name}: no data in this window. You hear a soft felt piano pulse instead of ${voice.instrumentSpoken}.`;
    return `${layer.name}, ${spokenNumber(mean)} ${layer.unitSpoken}, ${levelWord(norm(mean, layer))}. You hear it as ${voice.instrumentSpoken}. ${voice.hear}`;
  });
  const demo = items.some((i) => i.layer.demo) ? 'Demo data, not NASA data. ' : '';
  return demo + parts.join(' ');
}
