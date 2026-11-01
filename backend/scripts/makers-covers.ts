// Generates the craft cover art for Makers of Udaipur with Gemini image generation (Vertex AI, see src/gemini.ts).
// The JPEGs committed in frontend/public/makers/ came from these prompts. It only writes PNGs to a folder you choose;
// crop out any stray face at the frame edge, then compress each one to 900 px wide and under 150 KB, e.g.
//   sips -s format jpeg -s formatOptions 70 --resampleWidth 900 miniature.png --out frontend/public/makers/miniature.jpg
// Usage: node scripts/makers-covers.ts <outDir> [craftId ...]
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnv } from '../src/env.ts';
loadEnv();
import { createGemini } from '../src/gemini.ts';
import { CRAFT_BY_ID } from '../src/makers/crafts.ts';

const STYLE =
  'Warm documentary photograph, natural window light, shallow depth of field, rich but natural colours, Udaipur Rajasthan. ' +
  'Only hands and tools are shown; any person is cropped or turned away so no face is visible. No text, no letters, no numbers, no logos, no watermark.';

const SCENES: Record<string, string> = {
  miniature: 'Close-up of an artisan’s hands painting a Mewar miniature of a royal elephant procession with a very fine single-hair brush on handmade paper, small shells of mineral pigments, a tiny square of gold leaf, saffron, turquoise and vermilion tones.',
  pichwai: 'An artisan’s hands painting a large Pichwai cloth in Nathdwara: lotus flowers and white cows in deep indigo, green and gold on stretched cotton, brushes and bowls of stone pigment, sunlight from a courtyard door.',
  molela: 'A village potter in Molela, Rajasthan, pressing and carving a flat-relief terracotta plaque of a folk deity on horseback, clay-covered hands, a row of finished reddish plaques drying on a mud wall, earthy tones.',
  kavad: 'A hand-painted Kavad, a portable wooden shrine with hinged painted doors, bright red base with small painted gods and epic scenes, half open, a carpenter’s hands adjusting a hinged panel in a Rajasthan workshop.',
  koftgari: 'Close-up of a Koftgari artisan’s hands tapping fine gold wire into a cross-hatched steel surface with a tiny hammer and needle tool, a dark steel blank with a gold floral inlay pattern, tools on a cloth.',
  bandhej: 'Women’s hands tying tiny knots of thread into bright cloth for Bandhej tie-dye, finished leheriya diagonal wave stripes in magenta, orange and yellow draped nearby, soft daylight in an Udaipur bazaar lane.',
  kathputli: 'A puppeteer’s hands holding the strings of a traditional Rajasthani kathputli string puppet with a painted wooden face, mirror-work costume and turban, several other colourful puppets hanging behind, warm evening light.',
  meenakari: 'Close-up of a jeweller’s hands brushing vivid enamel (deep blue, green, red) into an engraved silver pendant with a fine tool, tiny pots of enamel powder, a small flame glowing in the background.',
  thewa: 'Close-up of a Thewa artisan’s hands placing an intricately cut sheet of gold lace onto a piece of green glass, a magnifier lamp and tiny tools, finished Thewa jewellery with gold patterns over red and green glass beside.',
  dabu: 'In Akola, Rajasthan, hands pressing a carved wooden block coated in mud paste onto cotton cloth on a long table, indigo-dyed Dabu cloth with cream patterns drying on a line in the sun behind.',
  silver: 'A silversmith’s hands hammering a heavy tribal Mewari silver anklet on a small anvil, tiny hammers, pieces of oxidised silver jewellery laid on a cloth, warm workshop light.',
  stone: 'A stone carver’s hands with a chisel and mallet carving a white marble elephant, fine marble dust in the air, a half-finished jali panel and carved deities in the soft background.',
  toys: 'A woodworker’s hands shaping a small wooden toy on a hand lathe, a stick of coloured lac pressed against the spinning wood, brightly painted wooden camels, horses and elephants arranged nearby.',
  leather: 'Warm still life of a leatherworker’s bench in an old-city Udaipur workshop: a pair of hands holding a brown hand-stitched leather journal cover, spools of waxed thread, cut pieces of tan leather and embroidered mojari slippers stacked nearby.',
};

const [outArg, ...requested] = process.argv.slice(2);
if (!outArg) {
  console.error('Usage: node scripts/makers-covers.ts <outDir> [craftId ...]');
  process.exit(1);
}
const out = resolve(outArg);
mkdirSync(out, { recursive: true });

const gemini = createGemini();
if (!gemini.imageEnabled) throw new Error('Set VERTEX_PROJECT (and run gcloud auth application-default login) or GEMINI_API_KEY to generate images');

for (const id of requested.length ? requested : [...CRAFT_BY_ID.keys()]) {
  const scene = SCENES[id];
  if (!scene) {
    console.log(`skip ${id}: no scene`);
    continue;
  }
  // The image quota is shared, so back off and try again when it says 429
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      const image = await gemini.image({ prompt: `${scene} ${STYLE}`, aspectRatio: '4:3', label: `Cover ${id}` });
      writeFileSync(resolve(out, `${id}.${image.mimeType.includes('jpeg') ? 'jpg' : 'png'}`), image.data);
      console.log(`ok   ${id}`);
      break;
    } catch (err) {
      console.log(`fail ${id} (attempt ${attempt}): ${(err as Error).message.slice(0, 120)}`);
      await new Promise((done) => setTimeout(done, 8_000 * attempt));
    }
  }
}
