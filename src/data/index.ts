import { EicSource } from './eic';
import { FixtureSource } from './fixture';
import type { DataSource, LayerId } from './types';

// NASA EIC layers built by pipeline/build_eic.py. If they cannot load, fall back to labelled DEMO DATA.
const eic = new EicSource();
const fixture = new FixtureSource();
let active: DataSource = eic;

export const source: DataSource = {
  async listLayers() {
    try {
      return await eic.listLayers();
    } catch {
      active = fixture;
      return fixture.listLayers();
    }
  },
  getWindow: (...a) => active.getWindow(...a),
};

/** Date of the record actually heard for a layer (the nearest frame when the date is outside its record). */
export const frameDate = (id: LayerId, dateISO: string) => (active === eic ? eic.frameDate(id, dateISO) : Promise.resolve(dateISO));
