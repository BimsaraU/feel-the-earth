export type LayerId = 'sst' | 'lightning' | 'lights' | 'lightschange' | 'co2' | 'airtemp' | 'precip' | 'ndvi' | 'aerosol';

export interface LayerInfo {
  id: LayerId;
  name: string;
  unit: string;
  /** Unit as it should be spoken, e.g. "metres per second". */
  unitSpoken: string;
  min: number;
  max: number;
  scale: 'linear' | 'log';
  timeRange: [string, string];
  resolutionDeg: number;
  cadence: 'daily' | '10-day' | 'monthly' | 'annual' | 'static';
  sourceText: string;
  /** True for invented data. Must be labelled DEMO DATA on screen and in speech. */
  demo: boolean;
}

/** Degrees. east = west + width and may exceed 180 when the box crosses the antimeridian. */
export interface BBox {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface WindowStats {
  mean: number;
  min: number;
  max: number;
  variance: number;
  /** Direction values increase towards, degrees clockwise from north. NaN if flat or no data. */
  gradientDeg: number;
  /** Fraction of cells that have data, 0..1. */
  validFraction: number;
}

export interface WindowData {
  /** n x n, row 0 = north, column 0 = west. NaN = no data. */
  grid: Float32Array;
  n: number;
  stats: WindowStats;
}

export interface DataSource {
  listLayers(): Promise<LayerInfo[]>;
  getWindow(layerId: LayerId, bbox: BBox, dateISO: string, gridN: number): Promise<WindowData>;
}
