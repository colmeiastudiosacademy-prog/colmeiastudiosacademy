import Dexie, { type Table } from "dexie";
import { type Lead, type Interaction, type Settings } from "./domain";
class CRMDatabase extends Dexie {
  leads!: Table<Lead, string>;
  interactions!: Table<Interaction, string>;
  settings!: Table<{ id: string; value: Settings }, string>;
  constructor() {
    super("colmeia-crm");
    this.version(1).stores({
      leads: "id,stage,nextAt",
      interactions: "id,leadId,at",
      settings: "id",
    });
  }
}
export const db = new CRMDatabase();
