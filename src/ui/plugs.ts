// Plug of the power supply (SPEC §6 `customer.plug`, §12.2). The power supplies are universal,
// 100–240 V input: only the shape of the plug changes, not the mains voltage.

import type { PlugType } from '../order/schema';

export interface PlugOption {
  value: PlugType;
  /** Code on the pill. */
  short: string;
  /** Countries and IEC type, for the summary and the title. */
  label: string;
  /** 24×24 icon: the face of the plug seen from the front. */
  icon: string;
}

const svg = (body: string): string =>
  `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${body}</svg>`;

export const PLUGS: readonly PlugOption[] = [
  {
    value: 'EU',
    short: 'EU',
    label: 'Europe (type C/F, Schuko)',
    icon: svg('<circle cx="12" cy="12" r="9" class="plug-face"/><circle cx="8.3" cy="12" r="1.7" class="plug-pin"/><circle cx="15.7" cy="12" r="1.7" class="plug-pin"/>'),
  },
  {
    value: 'UK',
    short: 'UK',
    label: 'UK & Ireland (type G)',
    icon: svg('<rect x="3" y="3" width="18" height="18" rx="3" class="plug-face"/><rect x="11" y="5.5" width="2" height="5" class="plug-pin"/><rect x="5.5" y="14" width="5" height="2" class="plug-pin"/><rect x="13.5" y="14" width="5" height="2" class="plug-pin"/>'),
  },
  {
    value: 'CH',
    short: 'CH',
    label: 'Switzerland (type J)',
    icon: svg('<path d="M7 3h10l4 7-4 11H7L3 10z" class="plug-face"/><circle cx="8.3" cy="10.5" r="1.6" class="plug-pin"/><circle cx="15.7" cy="10.5" r="1.6" class="plug-pin"/><circle cx="12" cy="15.5" r="1.6" class="plug-pin"/>'),
  },
  {
    value: 'US',
    short: 'US',
    label: 'USA & Canada (type A/B)',
    icon: svg('<rect x="3" y="3" width="18" height="18" rx="5" class="plug-face"/><rect x="7.8" y="7" width="1.9" height="6.5" class="plug-pin"/><rect x="14.3" y="7" width="1.9" height="6.5" class="plug-pin"/><circle cx="12" cy="16.8" r="1.4" class="plug-pin"/>'),
  },
];

export function plugOf(value: string | null | undefined): PlugOption {
  return PLUGS.find((plug) => plug.value === value) ?? PLUGS[0]!;
}
