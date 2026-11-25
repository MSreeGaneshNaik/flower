/** The interface's words, in Herbarium's voice: the flower is a specimen, mounted and labelled. */
export const COPY = {
  sections: { flower: 'Specimen', words: 'Label', look: 'Mounting', ending: 'Fate', share: 'Accession' },
  fields: { to: 'Collected for', from: 'Collected by', phrase: 'Note, written on the petals', palette: 'Colour', glyphs: 'Characters', ground: 'Board', stem: 'Mount the stem and leaves', spin: 'Turn the specimen' },
  actions: { copy: 'Copy gift link', copied: 'Accessioned, link copied', record: 'Record clip', recording: 'Recording', export: 'Export image', replay: 'Replay', play: 'Play', pause: 'Pause' },
  frame: 'Clip frame',
} as const;

export type AspectId = '9:16' | '1:1' | '4:5' | '16:9';
export const ASPECTS: Record<AspectId, { w: number; h: number; name: string }> = {
  '9:16': { w: 1080, h: 1920, name: 'Reel' },
  '1:1': { w: 1080, h: 1080, name: 'Square' },
  '4:5': { w: 1080, h: 1350, name: 'Portrait' },
  '16:9': { w: 1920, h: 1080, name: 'Wide' },
};
export const ASPECT_ORDER: AspectId[] = ['9:16', '1:1', '4:5', '16:9'];
