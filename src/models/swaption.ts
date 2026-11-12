/**
 * Swaptions: options to enter a swap.
 *
 * A T_e × n swaption ("1Y into 5Y") gives the right at expiry T_e to enter an
 * n-year swap at fixed rate K.
 *   Payer swaption    = right to PAY fixed     → profits if rates rise  (a call on the swap rate)
 *   Receiver swaption = right to RECEIVE fixed → profits if rates fall  (a put on the swap rate)
 *
 * The key trick (the "annuity measure"): the swap's value at expiry is
 *   A(T_e) · (S(T_e) − K)
 * where S is the forward swap rate and A the annuity. Measuring prices in units
 * of the annuity makes S a martingale, so Black/Bachelier apply directly:
 *
 *   Payer = A(0) · Black(S0, K, T_e, σ)
 *
 * Parity: Payer − Receiver = A(0)·(S0 − K) = a forward-starting payer swap.
 */
import { forwardOption, type VolModel } from './black76';
import { annuity, parSwapRate, type Curve } from './curve';

export type SwaptionType = 'payer' | 'receiver';

export function forwardSwap(curve: Curve, expiry: number, tenor: number, freq = 1) {
  return {
    rate: parSwapRate(curve, expiry, expiry + tenor, freq),
    annuity: annuity(curve, expiry, expiry + tenor, freq),
  };
}

export function swaptionPrice(
  curve: Curve,
  expiry: number,
  tenor: number,
  strike: number,
  vol: number,
  model: VolModel,
  type: SwaptionType,
  freq = 1,
  notional = 1,
): number {
  const { rate, annuity: A } = forwardSwap(curve, expiry, tenor, freq);
  return forwardOption(model, type === 'payer' ? 'call' : 'put', rate, strike, expiry, vol, notional * A);
}
