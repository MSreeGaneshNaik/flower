// Gift links carry every setting. A renamed key or a changed range breaks links already sent, so this fails first.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_STATE, decodeState, encodeState, type StudioState } from './share';

test('every setting survives a gift link', () => {
  const s: StudioState = {
    flower: 'lotus', palette: 'ice', glyphs: 'kana', ground: 'plum', ending: 'burst',
    phrase: 'hana 🌸 & <you>', to: 'Priya', from: 'Boss', stem: false, spin: 0, brightness: 1.5, glow: 0.4, detail: 1.79, words: 0.2,
  };
  const { state, viewer } = decodeState(encodeState(s, true));
  assert.deepEqual(state, s);
  assert.equal(viewer, true);
});

test('the default flower makes an empty link and reads back unchanged', () => {
  assert.equal(encodeState(DEFAULT_STATE, false), '');
  assert.deepEqual(decodeState('').state, DEFAULT_STATE);
});

test('unknown and out-of-range values fall back or clamp', () => {
  // w=: links sent while there were other worlds still open, and the old key is ignored
  // b=paper: links made while Paper existed still open, on the default ground
  const { state } = decodeState('?f=orchid&w=almanac&b=paper&br=99&sp=fast&gl=-3');
  assert.equal(state.flower, DEFAULT_STATE.flower);
  assert.equal(state.ground, DEFAULT_STATE.ground);
  assert.equal('world' in state, false);
  assert.equal(state.brightness, 2);
  assert.equal(state.spin, DEFAULT_STATE.spin);
  assert.equal(state.glow, 0);
});

test('long phrases are cut on whole characters, never through an emoji', () => {
  const { state } = decodeState('?m=' + encodeURIComponent('🌸'.repeat(50)));
  assert.equal(Array.from(state.phrase).length, 40);
  assert.equal(state.phrase, '🌸'.repeat(40));
});
