// Panel art for Kaavad Tales: four Mewar-miniature paintings per curated site, made with Gemini image generation and shipped
// as small JPEGs under frontend/public/stories/<siteId>/<n>.jpg.
//
// Usage:
//   node scripts/stories/art.ts generate [siteId[:panel] ...]   paints missing panels into $ART_DIR (default backend/.story-art) as PNG
//   node scripts/stories/art.ts convert                         crops the painted border, resizes and writes the JPEGs (macOS sips)
// Images go through Vertex AI (gcloud application-default credentials). ENV_FILE=/path/to/backend/.env points at the env file.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { loadEnv } from '../../src/env.ts';
import { createGemini } from '../../src/gemini.ts';

loadEnv(process.env.ENV_FILE);

const STYLE = [
  'A Mewar school miniature painting from Udaipur in the 18th-century court style:',
  'opaque mineral pigments and gold on aged cream paper, flat decorative perspective with layered architecture and a high horizon,',
  'a rich palette of vermilion, turmeric yellow, emerald green, lapis blue and gold, delicate fine-line detail,',
  'stylised figures in profile with large almond eyes and turbans, ornamental stylised trees, lotus-filled water and rolling blue Aravalli hills.',
  'Landscape composition (4:3), painted edge to edge as one scene.',
  'Absolutely no border, no frame, no inscription, no text, no letters, no signature, no watermark, nothing modern.',
].join(' ');

/** One scene per panel, in the order the story tells them */
const SCENES: Record<string, string[]> = {
  'city-palace': [
    'Dusk on a rocky hill beside a calm lake: Maharana Udai Singh II in royal Rajput dress on a white horse meets a bearded hermit in saffron seated on a rock; behind them the first courtyard walls and small domes of a palace rise on the ridge, blue Aravalli hills beyond.',
    'The long cream and sandstone facade of the City Palace rising straight out of Lake Pichola: rows of jharokha balconies, domes and chhatris along the whole shoreline, boats and ghats below, golden afternoon light, hills behind.',
    'A sunlit palace courtyard whose walls hold three large peacocks made of glittering coloured glass mosaic in blues, greens and gold, set in arched niches; court ladies in bright ghagras walk through the arches.',
    'Under the three great arches of a palace gate, a Maharana sits on one pan of a huge brass balance weighing him against heaps of gold and silver coins on the other pan, while courtiers hand coins to villagers; a large golden sun emblem with rays glows on the wall above.',
  ],
  'jagdish-temple': [
    'A steep flight of white marble steps climbing to a tall carved sandstone temple, a pair of stone elephants flanking the stairs, pilgrims in colourful clothes climbing with offerings, old city rooftops and a busy chowk below, blue morning sky.',
    'The inner sanctum of a temple: a glossy black stone image of Lord Vishnu as Jagannath with four arms and heaped flower garlands, a small brass Garuda kneeling with folded hands in a pavilion before him, priests holding oil lamps, warm lamplight.',
    'A tall carved temple spire rising into a deep blue sky with golden clouds, every surface covered in tiny sculpted dancers, musicians, horse riders and elephants in tiers, birds circling the top.',
    'Evening aarti at a temple: priests swaying brass lamps before the doorway, devotees with folded hands, hanging brass bells, marigold garlands, glowing lamps, deep indigo dusk sky.',
  ],
  'pichola-boat': [
    'At dawn a Banjara grain trader in a red turban with a string of bullocks carrying sacks of grain, standing beside a small new lake and a freshly built earth dam, a few thatched huts and green Aravalli hills behind.',
    'A white domed pavilion on a lake island with stone elephants at its landing; at the water edge a Rajput Maharana welcomes a young Mughal prince in a jewelled turban who has arrived by boat; golden afternoon, lotus water.',
    'A white marble palace floating in the middle of a still lake at sunset, a great cream palace on the far shore reflected in the water, small boats, blue hills.',
    'A wooden boat with four friends and lanterns gliding across a lake at golden hour toward a glowing palace on the far shore, water birds, the sun low behind the hills.',
  ],
  'saheliyon-ki-bari': [
    'A Rajput queen in a decorated palanquin arrives at a garden gate, followed by a procession of forty-eight young women companions in bright ghagras walking in rows; the Maharana greets them; flowering trees.',
    'A formal garden full of fountains arching water into the air, straight water channels, flowering trees, lawn lanes, ladies strolling; no machinery anywhere; gentle blue hills behind.',
    'A lotus pool with four white marble elephants at its four corners, a rain-like fountain pattering onto broad green leaves, ladies seated on the edge, a swing hanging from a tree, pink lotuses.',
    'Two women companions sitting on a stone bench in the shade of old trees in a garden, peacocks nearby, calm lawns and distant fountains, soft afternoon light.',
  ],
  'bagore-ki-haveli': [
    'A grand haveli on the water edge at a ghat, tiers of jharokha balconies facing a lake, a prime minister in a white turban receiving petitions on the ghat steps, boats and bathing women at the ghat, soft morning light.',
    'Inside a royal ladies chamber: walls covered in mirror work, coloured glass windows throwing red, blue and green light across the floor, two glass mosaic peacocks in alcoves, a lady seated on a bolster.',
    'Craftsmen restoring an old haveli: masons mixing lime mortar, painters on bamboo scaffolds repainting wall frescoes, balconies being repaired, a courtyard with tools; in a side room a case with a hookah and dice game.',
    'An evening folk dance in a lamplit courtyard: women in swirling ghagras dancing Ghoomar, a woman seated with many small cymbals tied to her body and pots balanced on her head, musicians with dholak and harmonium, audience on mats.',
  ],
  sajjangarh: [
    'A white marble palace crowning a high hilltop above a green valley, dark monsoon clouds rolling in with lightning, peacocks dancing on the slopes, lakes shimmering far below.',
    'A young Maharana in royal dress on a palace terrace looking out over a valley of lakes, an architect holding plans beside him, the palace half-built with bamboo scaffolding.',
    'A Maharana on a hilltop marble terrace gazing far into a misty distance where a faint fort stands on a distant plateau, attendants waiting respectfully behind him, soft evening mist.',
    'Sunset at a white marble hilltop palace: wooded hillsides with deer and a leopard below, golden lakes in the far distance, the sky glowing orange and rose.',
  ],
  'fateh-sagar': [
    'A great lake whose old earth dam has burst in a flood on one side, and on the other a new strong stone embankment being built by masons; a Maharana and a European duke in a carriage watching; hills behind.',
    'A lake with three small islands: one with a garden and a boat-shaped pavilion, one with a tall fountain jet, one with a white domed observatory building; boats on the water, hills all around.',
    'Rounded green hills around a lake, a white memorial of a horse and rider on the top of one hill, a small shrine on another hilltop with a stone path winding up to it, lake below.',
    'Evening on a lake embankment: families strolling, a vendor roasting corn on coals, children running, violet hills, lamps coming on, boats on the water.',
  ],
};

const artDir = resolve(process.env.ART_DIR ?? join(import.meta.dirname, '../../.story-art'));
const publicDir = resolve(import.meta.dirname, '../../../frontend/public/stories');
const [mode, ...picked] = process.argv.slice(2);
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function generate() {
  const gemini = createGemini({ ...process.env, GEMINI_API_KEY: '' });
  if (!gemini.imageEnabled) throw new Error('Set VERTEX_PROJECT (and run `gcloud auth application-default login`)');
  for (const [siteId, scenes] of Object.entries(SCENES)) {
    for (const [i, scene] of scenes.entries()) {
      const wanted = !picked.length || picked.includes(siteId) || picked.includes(`${siteId}:${i + 1}`);
      const file = join(artDir, siteId, `${i + 1}.png`);
      if (!wanted || (existsSync(file) && !picked.includes(`${siteId}:${i + 1}`))) continue;
      // Image quota is shared and bursty: retry patiently
      for (let attempt = 1; attempt <= 10; attempt++) {
        try {
          const image = await gemini.image({ prompt: `${scene}\n\n${STYLE}`, aspectRatio: '4:3', label: `Art ${siteId}/${i + 1}`, timeoutMs: 120_000 });
          mkdirSync(join(artDir, siteId), { recursive: true });
          writeFileSync(file, image.data);
          console.log(`${siteId}/${i + 1}: painted (${(image.data.length / 1024).toFixed(0)} KB)`);
          break;
        } catch (err) {
          console.log(`${siteId}/${i + 1}: attempt ${attempt} failed (${(err as Error).message.replace(/\s+/g, ' ').slice(0, 100)})`);
          await wait(Math.min(45_000, 8_000 * attempt));
        }
      }
    }
  }
}

const sips = (...args: string[]) => execFileSync('sips', args, { encoding: 'utf8' });
const dimension = (file: string, key: 'pixelWidth' | 'pixelHeight') => Number(new RegExp(`${key}: (\\d+)`).exec(sips('-g', key, file))?.[1]);
const MAX_BYTES = 150 * 1024;

/** The model paints a thin frame and paper margin despite the prompt: crop 5% off every side, then shrink */
function convert() {
  let total = 0;
  for (const siteId of readdirSync(artDir).sort()) {
    for (const name of readdirSync(join(artDir, siteId)).filter(n => n.endsWith('.png')).sort()) {
      const source = join(artDir, siteId, name);
      const out = join(publicDir, siteId, name.replace('.png', '.jpg'));
      const cropped = join(artDir, siteId, `.${name}`);
      const width = dimension(source, 'pixelWidth');
      const height = dimension(source, 'pixelHeight');
      mkdirSync(join(publicDir, siteId), { recursive: true });
      sips('-c', String(Math.round(height * 0.9)), String(Math.round(width * 0.9)), source, '--out', cropped);
      sips('-s', 'format', 'jpeg', '-s', 'formatOptions', '46', '--resampleWidth', '640', cropped, '--out', out);
      rmSync(cropped);
      const bytes = statSync(out).size;
      total += bytes;
      console.log(`${siteId}/${name.replace('.png', '.jpg')}: ${(bytes / 1024).toFixed(0)} KB${bytes > MAX_BYTES ? '  (over 150 KB!)' : ''}`);
    }
  }
  console.log(`total ${(total / 1024 / 1024).toFixed(2)} MB`);
}

if (mode === 'generate') await generate();
else if (mode === 'convert') convert();
else throw new Error('Usage: node scripts/stories/art.ts generate|convert');
