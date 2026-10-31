// Sample makers for the Makers of Udaipur trail. The people are fictional (names, families and stories are invented
// for the demo) but the places and crafts are real, so a squad can see how the booking and the itinerary stop work.
// Coordinates are approximate, to the lane. Workshop prices are estimates.

export type WeeklySlots = {
  /** 0 = Sunday … 6 = Saturday */
  days: number[];
  /** 12-hour clock as in the itinerary, e.g. "10:30 AM" */
  times: string[];
};

export type Workshop = {
  title: string;
  blurb: string;
  durationMin: number;
  /** ₹ per person */
  pricePerPerson: number;
  minPeople: number;
  maxPeople: number;
  minAge: number;
  /** What each guest takes away */
  makes: string;
  weekly: WeeklySlots[];
};

export type Maker = {
  id: string;
  /** Fictional */
  name: string;
  /** The first one is the main craft */
  craftIds: string[];
  studio: string;
  /** The real neighbourhood, shown to visitors */
  area: string;
  /** Place text for the itinerary stop. Keeps heritage-site names out so the stop gets no crowd meter of its own. */
  stopPlace: string;
  lat: number;
  lng: number;
  tagline: string;
  story: string;
  generation: number;
  yearsWorking: number;
  languages: string[];
  womenLed: boolean;
  workshop: Workshop;
  faq: { q: string; a: string }[];
};

const MON_SAT = [1, 2, 3, 4, 5, 6];
const TUE_SUN = [2, 3, 4, 5, 6, 0];

/** Days every maker is closed (families are off) */
export const CLOSED_DATES: { date: string; reason: string }[] = [
  { date: '2026-11-08', reason: 'Diwali: studios close for Lakshmi Puja' },
];

export const MAKERS: Maker[] = [
  {
    id: 'mahendra-chitera',
    name: 'Mahendra Chitera',
    craftIds: ['miniature'],
    studio: 'Chitera Kala Niwas',
    area: 'Jagdish Chowk, old city',
    stopPlace: 'Chitera Kala Niwas, Jagdish Chowk lane',
    lat: 24.5794, lng: 73.6841,
    tagline: 'Fourth-generation Mewar miniature painter',
    story:
      'Mahendra learned to grind pigments on his grandfather’s stone slab when he was nine. His family has painted for Udaipur’s courts and temples for four generations, and his upstairs studio near Jagdish Chowk still works the old way: stone-ground colour, a single-hair brush, no shortcuts. Every guest leaves with their own finished elephant.',
    generation: 4,
    yearsWorking: 31,
    languages: ['Hindi', 'Mewari', 'English'],
    womenLed: false,
    workshop: {
      title: 'Paint your own Mewar miniature',
      blurb: 'Grind a colour, sketch an elephant and paint it with a squirrel-hair brush, with Mahendra at your elbow.',
      durationMin: 90,
      pricePerPerson: 750,
      minPeople: 2,
      maxPeople: 8,
      minAge: 8,
      makes: 'Your own hand-painted miniature on handmade paper, ready to frame',
      weekly: [{ days: MON_SAT, times: ['10:30 AM', '12:30 PM', '04:00 PM'] }],
    },
    faq: [
      { q: 'Do we need to know how to draw?', a: 'Not at all. Mahendra traces the outline with you, then you choose the colours and do the brushwork yourself.' },
      { q: 'Can we buy finished paintings?', a: 'Yes. The price is written on the back of each one, and Mahendra will tell you how many days it took.' },
    ],
  },
  {
    id: 'lalit-vyas',
    name: 'Lalit Vyas',
    craftIds: ['miniature'],
    studio: 'Hathi Pol Chitrashala',
    area: 'Hathi Pol bazaar',
    stopPlace: 'Chitrashala studio, elephant-gate bazaar',
    lat: 24.5871, lng: 73.6877,
    tagline: 'Tiny court scenes from an upstairs studio',
    story:
      'Lalit paints the Mewar court the way his grandfather did, in a tiny studio above the Hathi Pol bazaar. He keeps a drawer of old sketches that visitors are welcome to leaf through, and he will happily tell you which of the shops downstairs sell prints instead of paintings.',
    generation: 3,
    yearsWorking: 22,
    languages: ['Hindi', 'English', 'French'],
    womenLed: false,
    workshop: {
      title: 'Paint a Mewar court scene',
      blurb: 'Paint a palm-size court scene with mineral colours and a touch of real gold leaf.',
      durationMin: 120,
      pricePerPerson: 900,
      minPeople: 2,
      maxPeople: 6,
      minAge: 10,
      makes: 'A palm-size court scene with gold-leaf detail, ready to frame',
      weekly: [{ days: TUE_SUN, times: ['11:00 AM', '03:00 PM'] }],
    },
    faq: [
      { q: 'How can I tell a painting from a print in the bazaar?', a: 'Zoom in with your phone: a print shows a regular dot pattern, a painting shows tiny brush wobbles and layered colour. Real gold leaf glints as you tilt the paper.' },
      { q: 'Is the studio hard to find?', a: 'It is up a narrow staircase in the lane right by the elephant gate. Lalit meets groups at the gate if you message him.' },
    ],
  },
  {
    id: 'dwarkesh-bhatt',
    name: 'Dwarkesh Bhatt',
    craftIds: ['pichwai', 'miniature'],
    studio: 'Kamal Pichwai Studio',
    area: 'Nathdwara, about 48 km north of Udaipur',
    stopPlace: 'Kamal Pichwai Studio, Nathdwara',
    lat: 24.9390, lng: 73.8230,
    tagline: 'Five generations painting for Shrinathji’s temple',
    story:
      'Dwarkesh’s family has painted pichwais for Shrinathji’s temple for five generations. His studio is a short walk from the temple lanes, where season-by-season backdrops take shape on cotton stretched across wooden frames. He teaches guests how to lay a lotus petal outline, one petal at a time.',
    generation: 5,
    yearsWorking: 28,
    languages: ['Hindi', 'Gujarati', 'English'],
    womenLed: false,
    workshop: {
      title: 'Paint a pichwai lotus',
      blurb: 'Learn the petal-by-petal method and paint a lotus-and-cow panel on cotton cloth.',
      durationMin: 150,
      pricePerPerson: 950,
      minPeople: 4,
      maxPeople: 10,
      minAge: 10,
      makes: 'A hand-painted lotus-and-cow panel on cotton (about 8×10 in)',
      weekly: [{ days: TUE_SUN, times: ['10:00 AM', '02:00 PM'] }],
    },
    faq: [
      { q: 'How far is Nathdwara from Udaipur?', a: 'About 48 km, roughly an hour and a quarter by road. Many squads pair it with Molela village, 10 km away.' },
      { q: 'Is a pichwai only a religious painting?', a: 'It began as a temple backdrop for Shrinathji, but Dwarkesh also paints lotus, cow and moonlit scenes for homes. Both are made the same way, by hand on cloth.' },
    ],
  },
  {
    id: 'geeta-prajapat',
    name: 'Geeta Prajapat',
    craftIds: ['molela'],
    studio: 'Prajapat Terracotta Aangan',
    area: 'Molela village, Rajsamand',
    stopPlace: 'Prajapat Terracotta Aangan, Molela village',
    lat: 24.9419, lng: 73.7268,
    tagline: 'Women-led terracotta studio in Molela village',
    story:
      'Geeta grew up pressing clay deities beside her father in Molela’s lanes, and now she leads a studio where her sisters and daughters shape the plaques too. Their courtyard fills with drying red plaques in the sun, and every guest presses one of their own.',
    generation: 4,
    yearsWorking: 24,
    languages: ['Hindi', 'Mewari'],
    womenLed: true,
    workshop: {
      title: 'Press your own Molela plaque',
      blurb: 'Press, carve and decorate a terracotta plaque with a Molela potter, then see the kiln where it is fired.',
      durationMin: 120,
      pricePerPerson: 650,
      minPeople: 4,
      maxPeople: 12,
      minAge: 6,
      makes: 'A hand-pressed terracotta plaque, fired by the family and couriered to you in about two weeks',
      weekly: [{ days: MON_SAT, times: ['10:00 AM', '02:30 PM'] }],
    },
    faq: [
      { q: 'Will our plaques get home safely?', a: 'Geeta wraps each plaque in straw and cloth and couriers it after firing. It usually takes about two weeks.' },
      { q: 'Is it messy?', a: 'A little. Wear clothes you do not mind getting clay on; aprons and a wash-up bucket are in the courtyard.' },
    ],
  },
  {
    id: 'ramprasad-jangid',
    name: 'Ramprasad Jangid',
    craftIds: ['kavad'],
    studio: 'Bassi Kavad Ghar',
    area: 'Shilpgram crafts village, Havala',
    stopPlace: 'Bassi Kavad Ghar, artisans’ huts, Havala village',
    lat: 24.6168, lng: 73.6446,
    tagline: 'A kavad storyteller from a Bassi carpenter family',
    story:
      'Ramprasad’s family comes from Bassi, where carpenters and storytellers have made kavads for generations. Six days a week he brings his tools to the artisans’ huts at Shilpgram, opens the painted doors one by one, and tells the story that lives behind each of them.',
    generation: 6,
    yearsWorking: 35,
    languages: ['Hindi', 'Mewari', 'English'],
    womenLed: false,
    workshop: {
      title: 'Kavad story and a mini panel',
      blurb: 'Hear a kavad story told door by door, then paint a mini panel with its own little god.',
      durationMin: 75,
      pricePerPerson: 550,
      minPeople: 4,
      maxPeople: 12,
      minAge: 6,
      makes: 'A small painted kavad panel you can hang at home',
      weekly: [{ days: TUE_SUN, times: ['11:30 AM', '02:30 PM', '04:00 PM'] }],
    },
    faq: [
      { q: 'Does he tell the story in Hindi?', a: 'In Hindi and Mewari, and he happily switches to English so the whole squad follows.' },
      { q: 'Can we see the real thing in Bassi?', a: 'Bassi is a full day trip. Most visitors meet Ramprasad at Shilpgram first and decide from there.' },
    ],
  },
  {
    id: 'aslam-sikligar',
    name: 'Aslam Sikligar',
    craftIds: ['koftgari'],
    studio: 'Sikligar Koftgari Karkhana',
    area: 'Bada Bazaar, old city',
    stopPlace: 'Sikligar Koftgari Karkhana, Bada Bazaar',
    lat: 24.5817, lng: 73.6893,
    tagline: 'Koftgari from a family of armourers',
    story:
      'Aslam’s great-grandfather inlaid gold into swords for the Mewar court. Today Aslam tap-taps hair-thin wire into steel pendants and cufflinks, in the same lane his family has worked in for generations. He will show you the cross-hatching that makes the metal grip, and the needle he sharpens every morning.',
    generation: 5,
    yearsWorking: 29,
    languages: ['Hindi', 'Urdu', 'English'],
    womenLed: false,
    workshop: {
      title: 'Inlay a koftgari pendant',
      blurb: 'Hammer a silver-wire pattern into steel with Aslam, and polish it until it glows.',
      durationMin: 90,
      pricePerPerson: 1100,
      minPeople: 2,
      maxPeople: 6,
      minAge: 14,
      makes: 'A small steel pendant with your own silver-wire inlay, polished and ready to wear',
      weekly: [{ days: MON_SAT, times: ['11:00 AM', '03:00 PM'] }],
    },
    faq: [
      { q: 'Is the pendant real koftgari?', a: 'Yes. The wire is silver hammered into cross-hatched steel; nothing is painted or glued. Aslam will show you the difference under a loupe.' },
      { q: 'Is it safe for kids?', a: 'The workshop uses a small hammer and sharp needles, so Aslam asks guests to be 14 or older.' },
    ],
  },
  {
    id: 'rukmani-rangrez',
    name: 'Rukmani Rangrez',
    craftIds: ['bandhej'],
    studio: 'Rangrez Women’s Collective',
    area: 'Bada Bazaar dye lanes',
    stopPlace: 'Rangrez Women’s Collective, Bada Bazaar dye lanes',
    lat: 24.5822, lng: 73.6890,
    tagline: 'A twelve-woman bandhej and leheriya collective',
    story:
      'Rukmani leads a collective of twelve women who tie bandhej at home in the lanes of Bada Bazaar. Their dots are counted in thousands; in the workshop guests tie a few, dip the cloth in the vat and watch the leheriya waves appear as it opens.',
    generation: 3,
    yearsWorking: 26,
    languages: ['Hindi', 'Mewari'],
    womenLed: true,
    workshop: {
      title: 'Tie and dye your own leheriya',
      blurb: 'Roll, tie and dip a cotton scarf in two colours, then open it to reveal the waves.',
      durationMin: 120,
      pricePerPerson: 800,
      minPeople: 3,
      maxPeople: 10,
      minAge: 8,
      makes: 'A leheriya scarf you tie, dye and open yourself',
      weekly: [{ days: MON_SAT, times: ['11:00 AM', '03:30 PM'] }],
    },
    faq: [
      { q: 'Will the colours run when we wash it?', a: 'Hand-dyed colours bleed a little the first few washes. Wash it alone in cold water and dry it in the shade.' },
      { q: 'Can we buy the collective’s own scarves?', a: 'Yes. Each piece is labelled with the woman who tied it, and the money goes straight to the collective.' },
    ],
  },
  {
    id: 'puran-bhat',
    name: 'Puran Bhat',
    craftIds: ['kathputli'],
    studio: 'Bhat Puppet House',
    area: 'Near Bhartiya Lok Kala Mandal',
    stopPlace: 'Bhat Puppet House, Chetak Circle road',
    lat: 24.5879, lng: 73.6969,
    tagline: 'A kathputli puppeteer’s family house',
    story:
      'Puran grew up behind the curtain: his father and grandfather played village fairs before the family settled in Udaipur. He carves heads in the morning and, by afternoon, teaches guests how to make a puppet dance to the dholak.',
    generation: 3,
    yearsWorking: 25,
    languages: ['Hindi', 'Rajasthani', 'English'],
    womenLed: false,
    workshop: {
      title: 'Make a string puppet dance',
      blurb: 'Dress, string and rehearse a small kathputli, then perform for the rest of the squad.',
      durationMin: 75,
      pricePerPerson: 500,
      minPeople: 4,
      maxPeople: 12,
      minAge: 6,
      makes: 'A small kathputli you dress and string yourself',
      weekly: [{ days: MON_SAT, times: ['11:00 AM', '04:30 PM'] }],
    },
    faq: [
      { q: 'Can kids join?', a: 'Yes, from age six. Little ones love the performance at the end.' },
      { q: 'Why does the puppet have no legs?', a: 'A traditional Rajasthani kathputli wears a long skirt instead of legs, which makes it easier to make it dance on strings.' },
    ],
  },
  {
    id: 'sarita-soni',
    name: 'Sarita Soni',
    craftIds: ['meenakari', 'silver'],
    studio: 'Soni Meena Studio',
    area: 'Lal Ghat, old city',
    stopPlace: 'Soni Meena Studio, Lal Ghat',
    lat: 24.5790, lng: 73.6812,
    tagline: 'Women-led meenakari studio on the lake',
    story:
      'Sarita took over her father’s meenakari bench at twenty-three and now runs the studio with her sister. They fire enamel on silver the old way, one colour at a time, in a little room above Lal Ghat with a view of the lake.',
    generation: 3,
    yearsWorking: 18,
    languages: ['Hindi', 'English'],
    womenLed: true,
    workshop: {
      title: 'Enamel a silver pendant',
      blurb: 'Brush colour into an engraved silver pendant, and watch Sarita fire it in the little kiln.',
      durationMin: 120,
      pricePerPerson: 1200,
      minPeople: 2,
      maxPeople: 6,
      minAge: 14,
      makes: 'A silver pendant with colours you applied, fired and polished the same afternoon',
      weekly: [{ days: TUE_SUN, times: ['11:00 AM', '03:00 PM'] }],
    },
    faq: [
      { q: 'Is the pendant real silver?', a: 'Yes, it is stamped 925 silver. Sarita will weigh it with you before you start.' },
      { q: 'Is the kiln dangerous?', a: 'Sarita does the firing herself, so guests only brush on colour. She asks guests to be 14 or older.' },
    ],
  },
  {
    id: 'vinod-sarraf',
    name: 'Vinod Sarraf',
    craftIds: ['thewa'],
    studio: 'Pratapgarh Thewa Kala Ghar',
    area: 'Chandpol, old city',
    stopPlace: 'Pratapgarh Thewa Kala Ghar, Chandpol',
    lat: 24.5813, lng: 73.6776,
    tagline: 'A Thewa artisan from a Pratapgarh family',
    story:
      'Vinod’s family brought thewa to Udaipur from Pratapgarh two generations ago. The technique stays inside the family, so his session is a close-up demonstration: you watch a sheet of gold turn into lace and fuse onto glass, then handle the finished pieces.',
    generation: 3,
    yearsWorking: 30,
    languages: ['Hindi', 'English'],
    womenLed: false,
    workshop: {
      title: 'Thewa up close',
      blurb: 'Watch gold lace fuse onto coloured glass, then handle finished pieces and plan a custom one.',
      durationMin: 60,
      pricePerPerson: 600,
      minPeople: 2,
      maxPeople: 8,
      minAge: 10,
      makes: 'A close look at every step, and the option to order a custom pendant (about two weeks)',
      weekly: [{ days: MON_SAT, times: ['11:30 AM', '04:00 PM'] }],
    },
    faq: [
      { q: 'Do we make a piece ourselves?', a: 'No. The thewa technique stays in the family, so this session is a demonstration and you can order a custom pendant afterwards.' },
      { q: 'Is thewa always gold?', a: 'Genuine thewa uses 23-carat gold lace on coloured glass. Gold-coloured foil on glass is a look-alike.' },
    ],
  },
  {
    id: 'pushpa-chhipa',
    name: 'Pushpa Chhipa',
    craftIds: ['dabu'],
    studio: 'Chhipa Dabu Karkhana',
    area: 'Akola, Chittorgarh district',
    stopPlace: 'Chhipa Dabu Karkhana, Akola village',
    lat: 24.7510, lng: 74.2009,
    tagline: 'Women-led dabu printing in the village of Akola',
    story:
      'Pushpa grew up between block-printing tables and indigo vats in Akola, where the Chhipa families have printed with mud for generations. She leads a unit of women who carve blocks, stamp the mud paste and dip the cloth; guests do the stamping and the dipping with them.',
    generation: 5,
    yearsWorking: 27,
    languages: ['Hindi', 'Mewari'],
    womenLed: true,
    workshop: {
      title: 'Print and dip a dabu stole',
      blurb: 'Stamp a mud-resist pattern with carved blocks, then dip your stole in the indigo vat.',
      durationMin: 150,
      pricePerPerson: 850,
      minPeople: 4,
      maxPeople: 12,
      minAge: 8,
      makes: 'A cotton stole you print with mud-resist blocks and dip in indigo',
      weekly: [{ days: MON_SAT, times: ['10:00 AM', '02:00 PM'] }],
    },
    faq: [
      { q: 'How long is the drive?', a: 'About an hour and three-quarters from Udaipur by road. Squads usually book a cab for the day and stop for lunch on the way.' },
      { q: 'Will we get a dry stole the same day?', a: 'The stole dries in the sun while you have lunch, then it is rinsed and dried again before you leave. Pushpa packs it in a cloth bag.' },
    ],
  },
  {
    id: 'naresh-sonigara',
    name: 'Naresh Sonigara',
    craftIds: ['silver'],
    studio: 'Naresh Chandi Ghar',
    area: 'Bada Bazaar, silver lane',
    stopPlace: 'Naresh Chandi Ghar, Bada Bazaar silver lane',
    lat: 24.5812, lng: 73.6879,
    tagline: 'Hand-beaten silver from the old silver lane',
    story:
      'Naresh beats silver the way his father and grandfather did, weighing every piece on a brass scale in front of the customer. He is one of the old-city silversmiths who still engrave tribal patterns by hand, and he will happily show how to tell sterling silver from German silver.',
    generation: 4,
    yearsWorking: 30,
    languages: ['Hindi', 'Mewari', 'English'],
    womenLed: false,
    workshop: {
      title: 'Make your own silver ring',
      blurb: 'Cut, hammer and solder a 925 silver ring, then stamp it with your own mark.',
      durationMin: 120,
      pricePerPerson: 1500,
      minPeople: 2,
      maxPeople: 6,
      minAge: 12,
      makes: 'A hand-formed 925 silver ring (about 6 g) with your own hammer marks',
      weekly: [{ days: MON_SAT, times: ['11:00 AM', '03:00 PM'] }],
    },
    faq: [
      { q: 'How do I tell sterling from German silver?', a: 'Sterling is stamped 925 and priced by weight. German silver has no silver in it, feels light and is sold at a flat cheap price.' },
      { q: 'Is the ring’s silver weighed in front of us?', a: 'Yes. Naresh weighs the silver on a brass scale before and after, so you know exactly what you are paying for.' },
    ],
  },
  {
    id: 'prem-silawat',
    name: 'Prem Silawat',
    craftIds: ['stone'],
    studio: 'Silawat Pathar Kala',
    area: 'Havala village, next to Shilpgram',
    stopPlace: 'Silawat Pathar Kala, Havala village',
    lat: 24.6178, lng: 73.6432,
    tagline: 'A stone-carving family beside the crafts village',
    story:
      'Prem’s family has carved marble for Udaipur’s temples and havelis for four generations, and his yard beside Shilpgram is full of half-finished elephants and lattice screens. He lets guests chisel their own small elephant, and his team polishes it before you leave.',
    generation: 4,
    yearsWorking: 33,
    languages: ['Hindi', 'Mewari'],
    womenLed: false,
    workshop: {
      title: 'Carve a marble elephant',
      blurb: 'Chisel a palm-size elephant from white marble with Prem, then watch it get polished.',
      durationMin: 120,
      pricePerPerson: 900,
      minPeople: 2,
      maxPeople: 8,
      minAge: 12,
      makes: 'A palm-size marble elephant you carved, polished before you leave',
      weekly: [{ days: TUE_SUN, times: ['11:30 AM', '02:30 PM'] }],
    },
    faq: [
      { q: 'Is it hard work?', a: 'It is a little tiring, but Prem does the heavy cutting for you. Guests do the fine chiselling and the polishing.' },
      { q: 'Can we take the elephant on a flight?', a: 'Yes. Prem wraps it in cloth and a small box; keep it in your cabin bag.' },
    ],
  },
  {
    id: 'sohan-suthar',
    name: 'Sohan Suthar',
    craftIds: ['toys'],
    studio: 'Suthar Khilona Ghar',
    area: 'Ghantaghar lanes, near Hathi Pol',
    stopPlace: 'Suthar Khilona Ghar, Ghantaghar lanes',
    lat: 24.5862, lng: 73.6873,
    tagline: 'Lac-turned wooden toys, made by hand',
    story:
      'Sohan turns wooden camels and elephants on a hand lathe the way his father taught him, and finishes them with coloured lac that melts onto the spinning wood. His little workshop smells of sawdust and warm lac, and the toys on the shelf are painted by his daughters.',
    generation: 3,
    yearsWorking: 27,
    languages: ['Hindi', 'English'],
    womenLed: false,
    workshop: {
      title: 'Turn and lacquer a wooden toy',
      blurb: 'Shape a small camel on the lathe and press coloured lac onto it as it spins.',
      durationMin: 90,
      pricePerPerson: 600,
      minPeople: 3,
      maxPeople: 10,
      minAge: 6,
      makes: 'A small lac-turned wooden camel you shape and finish yourself',
      weekly: [{ days: MON_SAT, times: ['10:30 AM', '04:00 PM'] }],
    },
    faq: [
      { q: 'Are the colours safe for toddlers?', a: 'The lac and colours are natural, but Sohan suggests keeping toys for children over three and not for mouthing.' },
      { q: 'Can kids use the lathe?', a: 'Sohan works the lathe with children, hands over theirs, so they feel the shape without any risk.' },
    ],
  },
  {
    id: 'rafiq-ahmed',
    name: 'Rafiq Ahmed',
    craftIds: ['leather'],
    studio: 'Old City Leather Works',
    area: 'Jagdish Chowk lanes',
    stopPlace: 'Old City Leather Works, Jagdish Chowk lanes',
    lat: 24.5800, lng: 73.6848,
    tagline: 'Hand-stitched journals and mojaris',
    story:
      'Rafiq stitches journals, bags and mojaris with waxed thread and an awl, using vegetable-tanned leather he buys from local tanneries. His workshop sits in the lanes by Jagdish Chowk, and he is happy to show how to spot plastic “leather” by its smell and its edges.',
    generation: 3,
    yearsWorking: 25,
    languages: ['Hindi', 'Urdu', 'English'],
    womenLed: false,
    workshop: {
      title: 'Stitch a leather journal',
      blurb: 'Punch, stitch and burnish a leather journal cover with Rafiq’s awl and waxed thread.',
      durationMin: 120,
      pricePerPerson: 900,
      minPeople: 2,
      maxPeople: 8,
      minAge: 12,
      makes: 'A hand-stitched leather journal cover with a notebook inside',
      weekly: [{ days: MON_SAT, times: ['11:00 AM', '03:30 PM'] }],
    },
    faq: [
      { q: 'Is the leather vegetable-tanned?', a: 'Yes. Rafiq uses vegetable-tanned leather, tanned with bark, and natural dyes. Ask him to show you a piece of the raw hide.' },
      { q: 'Can I get a mojari fitted?', a: 'Mojaris are made to measure and take a few days. Rafiq measures at the workshop, and you can collect or have them posted.' },
    ],
  },
  {
    id: 'kavita-sharma',
    name: 'Kavita Sharma',
    craftIds: ['miniature'],
    studio: 'Ghat-side Kala Studio',
    area: 'Gangaur Ghat lanes',
    stopPlace: 'Ghat-side Kala Studio, lake-front lanes',
    lat: 24.5805, lng: 73.6826,
    tagline: 'Women-led miniature studio by the lake',
    story:
      'Kavita is the first woman in her family to take up the brush, and she paints the lake, the palaces and the festival lamps of Udaipur from a first-floor studio beside the ghat. Her golden-hour class sits in the window with the lake light on the paper.',
    generation: 2,
    yearsWorking: 15,
    languages: ['Hindi', 'English', 'Marwari'],
    womenLed: true,
    workshop: {
      title: 'Paint the lake palace',
      blurb: 'Paint Udaipur’s lake and palace in the old Mewar style. The 4:30 PM class catches the golden light.',
      durationMin: 90,
      pricePerPerson: 800,
      minPeople: 2,
      maxPeople: 6,
      minAge: 8,
      makes: 'A small miniature of the lake palace on handmade paper',
      weekly: [{ days: MON_SAT, times: ['10:30 AM', '04:30 PM'] }],
    },
    faq: [
      { q: 'Is it suitable for beginners?', a: 'Yes. Kavita pencils a light outline for you and teaches one brush stroke at a time.' },
      { q: 'Can we book the golden-hour slot?', a: 'The 4:30 PM slot catches the best light and fills first, so book it a few days ahead.' },
    ],
  },
];

export const MAKER_BY_ID = new Map(MAKERS.map(m => [m.id, m]));
