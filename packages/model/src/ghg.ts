/**
 * Greenhouse gases, IPCC 2019 Refinement Tier 1 (SPEC §9.3). Results per hectare.
 *   CH4 = EF_c × SF_w × SF_p × SF_o × t        (Eq. 5.1/5.2, t = cultivation days)
 *   N2O = N × EF1 × 44/28                       (direct only, Eq. 11.1)
 *   CO2 = urea × 0.20 × 44/12                   (Eq. 11.13)
 *   + straw burning CH4 / N2O (IPCC 2006 Vol.4 Eq. 2.27)
 *   CO2e = CH4·27 + N2O·273 + CO2   (AR6 GWP100)
 */
import type { Practices } from '@rice/contracts';
import {
  C_TO_CO2,
  CFOA,
  EF1_FLOODED_RICE,
  EF_C_KG_CH4_HA_DAY,
  GWP100_AR6,
  N2O_N_TO_N2O,
  RICE_RESIDUE,
  SF_O_EXPONENT,
  SF_P_DEFAULT,
  SF_W,
  STRAW_BURN_EF_G_PER_KG_DM,
  STRAW_COMBUSTION_FACTOR,
  STRAW_RETAINED_FRACTION,
  UREA_EF_C,
  UREA_N_FRACTION,
} from './constants';
import { perRaiToPerHa } from './yield';

type Regime = Practices['waterRegime'];

/** Table 5.12 mapping. Rainfed: drought-prone when the simulation shows drought. */
export function sfWater(regime: Regime, droughtProne: boolean): number {
  if (regime === 'continuous') return SF_W.continuouslyFlooded;
  if (regime === 'awd') return SF_W.multipleDrainage;
  return droughtProne ? SF_W.rainfedDroughtProne : SF_W.rainfedRegular;
}

/** Above-ground straw dry matter (t/ha) from grain yield (kg/ha), IPCC 2006 Table 11.2. */
export function strawDryMatterTHa(yieldKgHa: number): number {
  const cropDm = (Math.max(0, yieldKgHa) / 1000) * RICE_RESIDUE.dryMatterFraction;
  return RICE_RESIDUE.slope * cropDm + RICE_RESIDUE.interceptTHa;
}

/** Eq. 5.3: SF_o = (1 + Σ ROA_i·CFOA_i)^0.59 */
export function sfOrganic(strawIncorporatedTHa: number, fymFreshTHa: number): number {
  return Math.pow(
    1 + strawIncorporatedTHa * CFOA.strawLongBefore + fymFreshTHa * CFOA.farmyardManure,
    SF_O_EXPONENT,
  );
}

export interface GhgInput {
  seasonDays: number;
  regime: Regime;
  droughtProne: boolean;
  nKgPerRai: number;
  organicTPerRai: number;
  strawBurn: boolean;
  /** simulated grain yield (kg/ha) — proxy for previous-crop straw */
  yieldKgHa: number;
}

export interface GhgResult {
  ch4KgHa: number;
  n2oKgHa: number;
  co2KgHa: number;
  co2eTHa: number;
  awdSavingCo2eTHa: number;
  sfW: number;
  sfO: number;
}

function riceCh4(days: number, sfW: number, sfO: number): number {
  return EF_C_KG_CH4_HA_DAY * sfW * SF_P_DEFAULT * sfO * days;
}

/** CO2e (t/ha) saved by switching continuous flooding → AWD (multiple drainage). 0 otherwise. */
export function awdSavingCo2eTHa(regime: Regime, seasonDays: number, sfO: number): number {
  if (regime !== 'continuous') return 0;
  const d =
    riceCh4(seasonDays, SF_W.continuouslyFlooded, sfO) -
    riceCh4(seasonDays, SF_W.multipleDrainage, sfO);
  return (d * GWP100_AR6.ch4) / 1000;
}

export function computeGhg(x: GhgInput): GhgResult {
  const straw = strawDryMatterTHa(x.yieldKgHa);
  const strawIncorporated = x.strawBurn ? 0 : straw * STRAW_RETAINED_FRACTION;
  const fym = perRaiToPerHa(x.organicTPerRai);
  const sfO = sfOrganic(strawIncorporated, fym);
  const sfW = sfWater(x.regime, x.droughtProne);
  const days = Math.max(0, x.seasonDays);

  const burntKgDm = x.strawBurn ? straw * 1000 * STRAW_COMBUSTION_FACTOR : 0;
  const ch4Burn = (burntKgDm * STRAW_BURN_EF_G_PER_KG_DM.ch4) / 1000;
  const n2oBurn = (burntKgDm * STRAW_BURN_EF_G_PER_KG_DM.n2o) / 1000;

  const nHa = perRaiToPerHa(x.nKgPerRai);
  const ch4KgHa = riceCh4(days, sfW, sfO) + ch4Burn;
  const n2oKgHa = nHa * EF1_FLOODED_RICE * N2O_N_TO_N2O + n2oBurn;
  const co2KgHa = (nHa / UREA_N_FRACTION) * UREA_EF_C * C_TO_CO2;
  const co2eTHa =
    (ch4KgHa * GWP100_AR6.ch4 + n2oKgHa * GWP100_AR6.n2o + co2KgHa * GWP100_AR6.co2) / 1000;
  return {
    ch4KgHa,
    n2oKgHa,
    co2KgHa,
    co2eTHa,
    awdSavingCo2eTHa: awdSavingCo2eTHa(x.regime, days, sfO),
    sfW,
    sfO,
  };
}
