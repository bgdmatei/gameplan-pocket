import { describe, expect, it } from 'vitest';
import { MAX_STREAMS_PER_ACCOUNT, createPokeHub } from './hub';

describe('poke hub', () => {
  it("caps an account's streams by closing the oldest, and keeps one per device", () => {
    const hub = createPokeHub();
    const closed: string[] = [];
    const poked: string[] = [];
    const open = (deviceId: string) =>
      hub.register('user', {
        deviceId,
        poke: () => poked.push(deviceId),
        close: () => closed.push(deviceId),
      });

    for (let n = 1; n <= MAX_STREAMS_PER_ACCOUNT + 1; n += 1) open(`d${n}`);
    open('d5');
    hub.deliver('user', 1);

    expect(closed).toEqual(['d1', 'd5']);
    expect(poked.sort()).toEqual(['d10', 'd11', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7', 'd8', 'd9']);
  });
});
