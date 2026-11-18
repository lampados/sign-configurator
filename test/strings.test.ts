import { describe, expect, it } from 'vitest';
import { customerMessage, customerMessages, S } from '../src/ui/strings';

describe('customer page texts', () => {
  it('generator warnings become short English sentences', () => {
    expect(customerMessage('Segment 6: curve too tight, radius 6.3 mm (angle 105.3°, minimum 14.6 mm), at (250.6, 33.1) mm.')).toMatch(/too tight/);
    expect(customerMessage('Segment 4: lit length 2.2 mm, under the cut pitch 10.0 mm, at (44.6, 55.0) mm.')).toMatch(/too short/);
    expect(customerMessage('Outlines merging: distance 8.4 mm, minimum 10.8 mm, at (245.7, 31.8).')).toMatch(/very close and share a channel/);
    // Il rimedio giusto per ogni blocco: più stretta per curve e tratti vicini, più LED al metro per i tratti corti.
    expect(customerMessage('Segment 6: curve too tight, radius 6.3 mm.')).toMatch(/more LEDs per metre\.$/);
    expect(customerMessage('Outlines merging: distance 8.4 mm.')).toMatch(/bridged with a jumper.*thinner strip avoids it\.$/);
    expect(S.summary.assemblyValue(3, 50, 2)).toBe('3 strip cuts · 2 jumpers · 50 min');
    expect(S.summary.assemblyValue(1, 10)).toBe('1 strip cut · 10 min');
    expect(customerMessage('Segment 4: lit length 2.2 mm, under the cut pitch 10.0 mm.')).toMatch(/more LEDs per metre\.$/);
    expect(customerMessage('18 A power supply at 5 V: over the 10 A of the GLEDOPTO controller.')).toMatch(/10 A/);
    expect(customerMessage('24 V strip: the Seeed Studio XIAO LED Driver Board (LED Driver Board for XIAO + XIAO ESP32) controller takes 5–12 V. Another controller is needed.')).toBe('This controller takes 5–12 V strips: pick another one under Tech.');
    expect(customerMessage('Segment 1: 1 anchor holes out of 2 required, at (36.0, 6.3).')).toBeNull();
    expect(customerMessage('Channel 6 mm wide: the 10 mm strip does not fit.')).toMatch(/narrower than the LED strip/);
    expect(customerMessage('Channel 3 mm deep: the strip is 6 mm thick.')).toMatch(/shallower than the LED strip/);
    expect(customerMessage('Character "П" (U+041F) missing from Sacramento: ignored.')).toMatch(/lacks some of these letters.*under Font\.$/);
  });

  it('no duplicates and no Italian: what does not concern the customer disappears', () => {
    const out = customerMessages([
      'Segment 6: curve too tight, radius 6.3 mm',
      'Segment 4: curve too tight, radius 11.0 mm',
      'Inner wall under 1.2 mm: sagitta 1.15 mm',
    ]);
    expect(out).toHaveLength(1);
    for (const message of out) expect(message).not.toMatch(/[àèìòù]|curve too tight|segment \d/i);
  });

  it('the tools have short English labels', () => {
    expect(Object.values(S.tools)).toEqual(['Text', 'Font', 'Size', 'Color', 'Image', 'Backdrop', 'Tech', 'More']);
  });
});
