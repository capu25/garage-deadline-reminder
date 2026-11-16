import Dexie, { type Table } from 'dexie';
import type { Deadline, Settings, Vehicle } from './models';

class GarageDb extends Dexie {
  vehicles!: Table<Vehicle, number>;
  deadlines!: Table<Deadline, number>;
  settings!: Table<{ key: string; value: Settings }, string>;

  constructor() {
    super('garage');
    this.version(1).stores({
      vehicles: '++id',
      deadlines: '++id, vehicleId, status',
      settings: 'key',
    });
  }
}

export const db = new GarageDb();
