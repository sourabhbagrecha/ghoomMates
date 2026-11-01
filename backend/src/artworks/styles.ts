import type { Cast } from './cast.ts';

// The four painting traditions a squad photo can be restyled into. The prompts are the heart of the feature, so
// each one is assembled from the same parts: the people (likeness and count come first), their clothes, the scene,
// how it is painted, and a short list of hard rules. They are deliberately short: the image model follows a few
// clear instructions far better than a long list. The one-line explanations of each tradition that the app shows
// live next to the thumbnails in frontend/src/pages/Miniature/miniatureData.ts.

export const ARTWORK_STYLE_IDS = ['mewar-miniature', 'royal-procession', 'jharokha-portrait', 'phad-scroll'] as const;
export type ArtworkStyleId = (typeof ARTWORK_STYLE_IDS)[number];

export type ArtworkStyle = {
  id: ArtworkStyleId;
  name: string;
  // Shape of the finished painting; the image model follows it closely.
  aspectRatio: string;
  // What the painting shows around and behind the people.
  scene: string;
  // The surface, line, colour and space of the tradition.
  technique: string;
  // The frame painted around the picture.
  border: string;
  // The squad are the only large figures, so the painting's head count can be checked against the photo's.
  checkCount: boolean;
};

const FLORAL_BORDER = 'Frame the whole painting with a broad ornate border of gold and white flowers and curling vines on a deep red band, between thin yellow and black lines. The border is part of the painting and fills all four edges.';

const MEWAR_TECHNIQUE = 'An 18th-century Mewar miniature from Udaipur: opaque watercolour on aged paper in flat fields of saturated mineral colour (vermilion, saffron yellow, malachite green, lapis blue, ivory) with gold leaf on jewellery and domes. The space is flat and stacked in layers: no vanishing-point perspective, no reflections, no cast shadows and no photographic shading. Fine dark outlines around everything, the people included, and crisp patterns on every textile.';

export const ARTWORK_STYLES: readonly ArtworkStyle[] = [
  {
    id: 'mewar-miniature',
    name: 'Mewar miniature',
    aspectRatio: '4:3',
    scene: 'A lakeside darbar: the squad gathered on a white marble terrace above the steps of Lake Pichola in Udaipur, on a patterned carpet with bolsters and potted flowers, under a striped cloth canopy. Behind them: the still lake with lotuses and swans, the domes of Jag Mandir, the City Palace with its balconies and chhatris on the shore, blue hills, and a flat golden sky with swirling clouds.',
    technique: MEWAR_TECHNIQUE,
    border: FLORAL_BORDER,
    checkCount: true,
  },
  {
    id: 'royal-procession',
    name: 'Royal procession',
    aspectRatio: '4:3',
    scene: 'A festive royal procession (sawari) before the City Palace of Udaipur. The squad stands together at the front, facing the viewer, as the guests of honour. The procession fills the space around and behind them, small and secondary: a decorated elephant with a gold-fringed canopy, attendants with large parasols and peacock-feather fans, drummers and a shehnai player, children scattering marigold petals. Behind them the long City Palace facade with balconies, chhatris and an arched gateway, under a golden sky of swirling clouds.',
    technique: `${MEWAR_TECHNIQUE} Composed like a frieze: the squad large in the front row, the procession in smaller layers behind.`,
    border: FLORAL_BORDER,
    checkCount: false,
  },
  {
    id: 'jharokha-portrait',
    name: 'Jharokha portrait',
    aspectRatio: '4:3',
    scene: 'A formal group portrait at a jharokha, an ornate carved window balcony of the City Palace in Udaipur: a wide opening of scalloped arches in white marble and honey-coloured sandstone with slender pillars, carved brackets, a small domed chhatri above and a patterned balustrade below, with red drapes at the sides. The whole squad fills the window together, shown from the chest up, faces large and clear; the pillars never hide a face. Beyond the window: Lake Pichola in late golden light and distant blue hills.',
    technique: `${MEWAR_TECHNIQUE} In the manner of Rajput court portraiture, with intricate ornament and gold leaf on the window rims.`,
    border: FLORAL_BORDER,
    checkCount: true,
  },
  {
    id: 'phad-scroll',
    name: 'Phad scroll',
    aspectRatio: '4:3',
    scene: 'A Rajasthani phad: a hand-painted narrative cloth scroll telling the squad\'s trip. The squad stands side by side, full length and in the same order as in the photograph, in the large central panel. Around it the journey is told in small scenes separated by painted lines and trees: a boat on a lake with a white palace, a bazaar with stalls of bright fabric, a shared meal on the floor with brass plates, musicians at sunset, camels. The small scenes only show tiny background villagers and never repeat the squad.',
    technique: 'Phad painting of Shahpura and Bhilwara, Rajasthan: coarse cream cotton cloth, natural colours dominated by orange, red, yellow, green and indigo, bold black outlines and flat colour fills everywhere. The people are drawn the phad way too, as simplified outlined figures with large expressive eyes and flat colour, never as a photograph, while their faces stay recognisable. Every inch is filled with story and small decorative flowers, dots and trees.',
    border: 'A simple painted border of red and black stripes and triangles along the edges, with the soft worn texture of old cloth.',
    checkCount: false,
  },
];

export function artworkStyle(id: unknown): ArtworkStyle | undefined {
  return typeof id === 'string' ? ARTWORK_STYLES.find((style) => style.id === id) : undefined;
}

// Who is in the picture comes first: the point of the keepsake is that the squad recognises itself.
function peopleSection(cast: Cast | null): string {
  const who = cast
    ? `The photograph shows exactly ${cast.people} ${cast.people === 1 ? 'person' : 'people'}. From left to right:\n${cast.members.map((m, i) => `${i + 1}. ${m.place ? `${m.place}: ` : ''}${m.look}`).join('\n')}\nPaint exactly those ${cast.people}: none missing, none added, none merged, nobody cropped out.`
    : 'Paint every person in the photograph, and only them: exactly the same number of people, none missing, none added, none merged, nobody cropped out.';
  return `${who} Keep them in the same order and arrangement as the photograph. Each face is a faithful, instantly recognisable portrait of that person, as a court portrait painter would paint a patron: the same face shape, features, expression, skin tone, age and hair (a bald man stays bald, curls stay curly, beards and glasses stay), never a generic or idealised face. Never lighten, darken or "beautify" anyone, and children stay children. Faces are large and clear, in front or three-quarter view.`;
}

// Left alone, the image model copies the holiday clothes from the photo, so the costume change gets its own section.
const CLOTHES = 'Everyone is dressed modestly and festively in Rajasthani court clothes in rich colours with simple gold jewellery: men in a long coat (angarkha) or kurta with a stole, women in a long skirt (ghagra) with a blouse and an odhni veil draped over one shoulder, never hiding their hair. Nobody keeps the T-shirts, jeans, jackets or dresses from the photograph. Only someone who wears a head covering in the photograph keeps one; nobody else gets a turban over their own hair. No phones, cameras, sunglasses or backpacks: hands are empty or hold a flower.';

const RULES = [
  'No text of any kind: no letters, words, numbers, captions, signatures, seals or watermarks.',
  'No gods, goddesses, idols, halos, saints, priests or other religious figures or symbols.',
  'No weapons of any kind.',
  'The mood is joyful, warm and respectful. It must look like a genuine hand-painted artwork, not a photo filter, a 3D render or a modern digital illustration.',
];

/** The full instruction for the image model. `cast` (from the photo) pins down the head count and each person's look. */
export function artworkPrompt(style: ArtworkStyle, cast: Cast | null = null): string {
  return [
    `Repaint the attached photograph as a hand-painted "${style.name}" artwork from Udaipur, Rajasthan, keeping the very same people.`,
    `THE PEOPLE (most important)\n${peopleSection(cast)}`,
    `THE CLOTHES\n${CLOTHES}`,
    `THE SCENE\n${style.scene}`,
    `THE PAINTING\n${style.technique} ${style.border}`,
    `STRICT RULES\n${RULES.map((rule) => `- ${rule}`).join('\n')}`,
    'Reply with the finished painting only: no questions and no commentary.',
  ].join('\n\n');
}
