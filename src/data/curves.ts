/** The default discount curve every lesson starts from: bootstrapped from the sample SOFR quotes. */
import { bootstrap } from '../models/curve';
import { sofrInstruments } from './market';

export const baseCurve = bootstrap(sofrInstruments);
