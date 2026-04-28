import type { Schichtplan } from './app';

export type EnrichedSchichtplan = Schichtplan & {
  schichttypName: string;
  zugewiesene_mitarbeiterName: string;
};
