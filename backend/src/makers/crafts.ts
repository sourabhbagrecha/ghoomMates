// Udaipur's living crafts: what each one is, how it is made, how to tell a handmade piece from a machine-made one, and
// what a fair price looks like. Curated by hand (sources in backend/docs/makers.md); a craft only carries a GI tag when
// the Geographical Indications Registry (or a source that cites it) confirms it. Prices are labelled estimates.

export const ITEM_SIZES = ['small', 'medium', 'large'] as const;
export type ItemSize = (typeof ITEM_SIZES)[number];

export type PriceBand = {
  size: ItemSize;
  /** What the size means for this craft, e.g. "Postcard-size painting (about 5×7 in)" */
  item: string;
  /** Fair range in rupees for a handmade piece bought straight from the maker. An estimate, not a price list. */
  min: number;
  max: number;
};

export type GeographicalIndication = {
  /** The name it is registered under */
  name: string;
  /** Year of registration, left out where sources disagree */
  year: number | null;
  /** A page that confirms the registration */
  source: string;
};

export type Craft = {
  id: string;
  name: string;
  hindi: string;
  origin: string;
  tagline: string;
  /** One or two lines of history */
  history: string;
  /** How it is made, in order */
  steps: string[];
  gi: GeographicalIndication | null;
  /** What genuine handmade work looks like */
  authentic: string[];
  /** What machine-made or fake work looks like */
  machineMade: string[];
  prices: PriceBand[];
  /** What drives the price, and what to ask the seller */
  priceNote: string;
  care: string;
  /** Generated cover art, served by the frontend */
  cover: string;
};

const band = (size: ItemSize, item: string, min: number, max: number): PriceBand => ({ size, item, min, max });

export const CRAFTS: Craft[] = [
  {
    id: 'miniature',
    name: 'Mewar miniature painting',
    hindi: 'मेवाड़ लघु चित्रकला',
    origin: 'Udaipur',
    tagline: 'Court painting with a single-hair brush',
    history:
      'Mewar’s court painters have worked for the Maharanas since the early 1600s, painting epics, festivals, lakes and royal processions in bold, flat colour. A few family studios around the City Palace still keep the school alive.',
    steps: [
      'Sketch the scene lightly in charcoal on handmade paper',
      'Grind mineral and plant colours with gum and water',
      'Lay flat base colours, then build the detail with a squirrel-hair brush',
      'Add gold or silver leaf for jewels and halos',
      'Burnish with a smooth agate stone for the soft sheen',
    ],
    gi: null,
    authentic: [
      'Tiny brush wobbles and colour pools: no two lines are identical',
      'Matte, chalky colours with depth; real gold leaf glints and shifts as you tilt it',
      'Paper fibres show through the paint, and the back is plain and a little rough',
      'The painter can show a pencil sketch and name the pigments',
    ],
    machineMade: [
      'A regular dot or grid pattern when you zoom in with your phone camera',
      'Glossy, flat colour with yellow ink where gold should be',
      'Burnt edges or tea-stained paper sold as “antique” at a tourist price',
    ],
    prices: [
      band('small', 'Postcard-size painting (about 5×7 in)', 300, 800),
      band('medium', 'A4-size painting (about 8×11 in)', 800, 1800),
      band('large', 'Large, fine-detail piece with gold (12×16 in and up)', 2500, 9000),
    ],
    priceNote:
      'Detail, size and gold leaf set the price. Anything sold as 100+ years old needs ASI papers to leave India, so a “100-year-old” painting at a few thousand rupees is new paper aged with tea.',
    care: 'Keep it out of sun and damp, frame it behind glass, and carry it flat or in a tube, never folded.',
    cover: '/makers/miniature.jpg',
  },
  {
    id: 'pichwai',
    name: 'Pichwai painting',
    hindi: 'पिछवाई',
    origin: 'Nathdwara, Rajsamand',
    tagline: 'Temple backdrops painted for Shrinathji',
    history:
      'Pichwais are hand-painted cloth hangings that go behind the deity Shrinathji, whose image reached Nathdwara in 1672 under Mewar’s protection. Painters change the scene with the season and festival: lotus ponds, cows, moonlit nights.',
    steps: [
      'Stretch and starch cotton cloth, then draw the outline in charcoal',
      'Fill the big areas with stone and plant colours, layer by layer',
      'Paint petals, cows and jewellery with the thinnest brushes',
      'Lay gold and silver leaf on the ornaments',
      'Dry slowly in the shade; large pieces take weeks',
    ],
    gi: {
      name: 'Nathdwara Pichhwai Painting',
      year: 2023,
      source: 'https://search.ipindia.gov.in/GIRPublicSearch/Application/Details/748',
    },
    authentic: [
      'Painted on cloth, with brush ridges you can feel where colour layers meet',
      'Every lotus petal and cow is a little different from its neighbour',
      'Hand-laid gold shifts with the light; printed gold looks flat',
      'Shading comes from layered fine lines, not smooth digital gradients',
    ],
    machineMade: [
      'A digital print on canvas or satin: even, slightly glossy surface',
      'Identical repeated lotuses and cows across the cloth',
      'Shiny “gold” ink that smudges when you rub it',
    ],
    prices: [
      band('small', 'Small painting on cloth (about 8×10 in)', 800, 2500),
      band('medium', 'Medium cloth (about 18×24 in)', 3500, 12000),
      band('large', 'Large hanging (3×4 ft and up), weeks of work', 20000, 100000),
    ],
    priceNote: 'Size and the amount of gold leaf drive the price. Ask how many days the piece took.',
    care: 'Roll it face-out around a tube instead of folding it, and keep it away from incense smoke and damp.',
    cover: '/makers/pichwai.jpg',
  },
  {
    id: 'molela',
    name: 'Molela terracotta',
    hindi: 'मोलेला टेराकोटा',
    origin: 'Molela village, Rajsamand',
    tagline: 'Clay gods from the Banas riverbank',
    history:
      'For generations Molela’s Kumhar potters have pressed flat clay plaques of folk deities like Devnarayan and Dharaji, which villagers across Mewar keep as votive offerings. The relief-plaque craft is made only in Molela.',
    steps: [
      'Dig clay from the Banas riverbank and temper it the traditional way',
      'Press the clay by hand into a flat slab: no wheel, no mould',
      'Carve the deity, horse and ornaments in low relief',
      'Dry in the shade for days, then fire in the village kiln',
      'Finish with natural colours so the red clay still shows',
    ],
    gi: { name: 'Molela Clay Work', year: 2008, source: 'https://www.outlooktraveller.com/explore/culture/the-gi-tagged-molela-clay-art-of-rajasthan' },
    authentic: [
      'Hand-pressed relief with fingerprints and tool marks on the back',
      'Warm, uneven terracotta colour with natural kiln marks',
      'Neighbouring plaques in a row are each a little different',
      'Heavier than it looks, with slightly rough edges',
    ],
    machineMade: [
      'Cast in a mould: sharp identical faces and a perfectly smooth back',
      'Glossy enamel paint or glitter on top',
      'A light, thin plaster or resin body',
    ],
    prices: [
      band('small', 'Palm-size tile or diya set', 150, 500),
      band('medium', 'Wall plaque (about 12 in)', 600, 1800),
      band('large', 'Large temple-style plaque (2 to 3 ft)', 2500, 9000),
    ],
    priceNote: 'Larger plaques cost more because they need bigger kiln space and more carving days.',
    care: 'Hang on a firm hook, wipe with a dry cloth and keep it out of the rain. Wrap it in newspaper to travel: terracotta chips if dropped.',
    cover: '/makers/molela.jpg',
  },
  {
    id: 'kavad',
    name: 'Kavad',
    hindi: 'कावड़',
    origin: 'Bassi, Chittorgarh',
    tagline: 'A shrine that opens into a story',
    history:
      'The kavad is a portable wooden shrine built by the Jangid carpenters of Bassi. Its painted doors open one after another while a Kavadiya Bhat storyteller recites tales of gods and heroes, as they have carried it from village to village for centuries.',
    steps: [
      'The carpenter cuts and joins light wood into hinged doors and panels',
      'Paint a red base, then fine white and black outlines',
      'Fill each panel with gods, heroes and village scenes',
      'Seal it with a protective coat and fit the hinges so the doors fold flat',
      'The storyteller learns the verses that go with each door',
    ],
    gi: null,
    authentic: [
      'Several hinged doors that really open and fold, a new scene behind each',
      'Hand-painted figures on a red base with fine black outlines',
      'Carpenter-built joints, not glued veneer',
      'The maker can tell you the story behind every panel',
    ],
    machineMade: [
      'One flat painted board or a printed sticker sold as “kavad”',
      'Doors that are painted shut or glued on',
      'Perfectly identical, too-neat figures',
    ],
    prices: [
      band('small', 'Mini kavad (about 6 in)', 400, 1500),
      band('medium', 'Medium kavad with several doors (12 to 18 in)', 2500, 8000),
      band('large', 'Full-story kavad (2 to 3 ft, many doors)', 10000, 45000),
    ],
    priceNote: 'The number of doors and how fine the painting is set the price.',
    care: 'Keep it dry and out of direct sun, open the doors gently and wax the hinges once in a while.',
    cover: '/makers/kavad.jpg',
  },
  {
    id: 'koftgari',
    name: 'Koftgari',
    hindi: 'कोफ्तगारी',
    origin: 'Udaipur and Rajsamand',
    tagline: 'Gold and silver wire hammered into steel',
    history:
      'Koftgari reached India from Persia centuries ago. In Mewar the Sikligar and Gadi Lohar families inlaid swords, shields and daggers for Rajput courts; the same hands now make pendants, boxes and cufflinks.',
    steps: [
      'Cut the steel and cross-hatch its surface so the metal can grip',
      'Draw the pattern and score its lines with a fine needle',
      'Hammer gold or silver wire into the lines with a tiny hammer',
      'Burnish with a hard stone until the wire sits flush',
      'Blacken the steel and polish the inlay until it shines',
    ],
    gi: { name: 'Udaipur Koftgari Metal Craft', year: 2023, source: 'https://www.nabard.org/GI/GIProductDetails.aspx?Id=68' },
    authentic: [
      'Inlay sits slightly raised and burnished, with crisp edges under a loupe',
      'A faint cross-hatch shows at the edge of the pattern',
      'Heavy, cold steel with an even dark blue-black finish',
      'The artisan can show you the wire and the needle',
    ],
    machineMade: [
      'A pattern that is painted, printed or laser-etched',
      'Gold-coloured foil or plating that wears off at the edges',
      'A light brassy body instead of cold, heavy steel',
    ],
    prices: [
      band('small', 'Cufflinks or a pendant', 800, 2500),
      band('medium', 'Letter opener or small box', 3000, 9000),
      band('large', 'Decorative dagger or wall plaque', 12000, 60000),
    ],
    priceNote: 'Wire used (gold costs more than silver) and the hours of inlay drive the price. Ask what the wire is.',
    care: 'Wipe with a dry cloth and add a drop of oil on steel parts. Keep it away from damp so the steel does not rust.',
    cover: '/makers/koftgari.jpg',
  },
  {
    id: 'bandhej',
    name: 'Bandhej and Leheriya',
    hindi: 'बंधेज और लहरिया',
    origin: 'Udaipur’s old-city dye lanes',
    tagline: 'Tiny knots, bright waves',
    history:
      'Bandhej means “to tie”: thousands of tiny knots resist the dye, and each opened dot becomes the pattern. Leheriya (“waves”) is rolled and tied on the diagonal, the classic Mewar turban and monsoon dupatta worn for Teej and Raksha Bandhan.',
    steps: [
      'Wash and starch the cloth, then mark the design',
      'Pinch each dot and tie it tight with thread; leheriya is rolled corner to corner, then tied',
      'Dip in the lightest colour first, then re-tie and dip in darker ones',
      'Dry in the sun, then untie to reveal the pattern',
      'Press the cloth so the dots stay puckered',
    ],
    gi: null,
    authentic: [
      'Every dot is a tiny raised pucker with a pin-point centre you can feel on both sides',
      'Dots vary a little in size and spacing',
      'Colour is deeper around the knots and bleeds slightly into the cloth',
      'Leheriya waves meander a little instead of running dead straight',
    ],
    machineMade: [
      'Flat printed dots that are all identical and feel smooth',
      'Perfectly even mechanical stripes',
      'Evenly dyed cloth with no darker knots',
    ],
    prices: [
      band('small', 'Cotton scarf or stole', 300, 900),
      band('medium', 'Dupatta in cotton, silk or georgette', 900, 3500),
      band('large', 'Saree with fine hand-tied dots', 4000, 25000),
    ],
    priceNote: 'Fabric and the number of dots set the price: a finer tie takes days longer.',
    care: 'Wash alone in cold water with mild soap for the first few washes and dry in the shade, as hand-dyed colours can bleed.',
    cover: '/makers/bandhej.jpg',
  },
  {
    id: 'kathputli',
    name: 'Kathputli puppetry',
    hindi: 'कठपुतली',
    origin: 'Rajasthan, Udaipur’s puppet houses',
    tagline: 'String puppets that tell kings’ tales',
    history:
      'Kathputli means “wooden doll”. Rajasthan’s Bhat community has performed with string puppets for centuries, telling stories of kings like Amar Singh Rathore. A traditional puppet has a carved head, a painted face and a long skirt instead of legs.',
    steps: [
      'Carve the head and hands from soft wood',
      'Paint the face with fine moustache, eyes and bindi',
      'Stitch the costume and its mirror-work by hand',
      'Tie cotton strings to the head and hands',
      'Rehearse until the puppet dances to the dholak',
    ],
    gi: { name: 'Kathputlis of Rajasthan', year: null, source: 'https://www.nabard.org/GI/kathputlis-of-rajasthan.aspx' },
    authentic: [
      'A carved wooden head with hand-painted features, not moulded plastic',
      'A hand-stitched costume with real mirror-work and gota edging',
      'Cotton strings, knotted by hand',
      'The maker can make it dance and tell you whose story it is',
    ],
    machineMade: [
      'A shiny plastic or fibre face, identical across the whole shop',
      'Glue-on sequins and nylon hair',
      'Strings that are only decoration and tangle at once',
    ],
    prices: [
      band('small', 'Small puppet (about 8 in)', 150, 450),
      band('medium', 'Medium puppet (about 15 in)', 450, 1500),
      band('large', 'Large show puppet (2 ft)', 1800, 5000),
    ],
    priceNote: 'Hand-carved heads cost more than moulded ones; the size and costume work set the rest.',
    care: 'Hang it by the head loop, keep the strings untangled and store it away from damp and moths.',
    cover: '/makers/kathputli.jpg',
  },
  {
    id: 'meenakari',
    name: 'Meenakari',
    hindi: 'मीनाकारी',
    origin: 'Rajasthan, Udaipur’s old-city jewellers',
    tagline: 'Colour fused onto metal',
    history:
      'Meenakari fuses glassy enamel onto engraved metal. It came to the Rajput courts from Persia and Lahore, and Rajasthan’s jewellers still fire it by hand, one colour at a time.',
    steps: [
      'Engrave the pattern into a gold or silver base',
      'Grind enamel colours into a fine paste',
      'Fill each hollow with one colour, then fire it',
      'Repeat for each colour; the ones that need the hottest fire go first',
      'Polish and set the stones',
    ],
    gi: null,
    authentic: [
      'Enamel sits in engraved hollows with crisp borders',
      'Deep, glassy colours with small natural variations',
      'The back is finished too, often with enamel',
      'The jeweller can tell you the metal and its weight',
    ],
    machineMade: [
      'Nail-polish-like colour that chips off',
      'Stamped brass that is plated and sprayed',
      'Perfectly uniform fill with no brush marks',
    ],
    prices: [
      band('small', 'Silver pendant or earrings', 700, 2500),
      band('medium', 'Silver bangles or a necklace', 3000, 10000),
      band('large', 'Full silver set with stones', 12000, 45000),
    ],
    priceNote: 'The metal and its weight are the biggest part of the price. Ask for the weight and the purity.',
    care: 'Keep it away from perfume and water, and store in a soft pouch: enamel can chip if knocked.',
    cover: '/makers/meenakari.jpg',
  },
  {
    id: 'thewa',
    name: 'Thewa',
    hindi: 'थेवा',
    origin: 'Pratapgarh',
    tagline: 'Gold lace fused onto coloured glass',
    history:
      'Thewa began in Pratapgarh in the 1700s, when one family learned to fuse hair-thin sheets of 23-carat gold onto coloured glass. The technique stays within a few families, so a genuine piece is rare.',
    steps: [
      'Prepare a slab of coloured glass and set it in a silver frame',
      'Beat gold into an extremely thin sheet',
      'Cut a lace-like pattern in the sheet with fine tools',
      'Fuse the gold pattern onto the glass with heat',
      'Polish the piece and set it in silver',
    ],
    gi: {
      name: 'Thewa Art Work',
      year: 2014,
      source: 'https://www.business-standard.com/article/pti-stories/rajasthan-s-thawa-art-gets-gi-tag-114061601200_1.html',
    },
    authentic: [
      'The gold is a fine sunk-in lace, flush with the glass',
      'Deep green, red or blue glass with fine detail like court scenes',
      'The pattern is cut by hand, with no printed lines',
      'The seller gives you the maker’s name and the gold weight',
    ],
    machineMade: [
      'Gold-coloured foil or paint on glass',
      'A plastic bead with a sticker pattern',
      'A pattern that is stamped, not cut',
    ],
    prices: [
      band('small', 'Pendant or earrings', 3000, 9000),
      band('medium', 'Necklace or a pair of bangles', 10000, 35000),
      band('large', 'Full bridal set', 40000, 150000),
    ],
    priceNote: 'The price follows the gold weight plus the making. Ask for the weight in grams and today’s gold rate.',
    care: 'Wipe with a soft dry cloth and keep it away from knocks and perfume. The glass can crack if dropped.',
    cover: '/makers/thewa.jpg',
  },
  {
    id: 'dabu',
    name: 'Dabu mud-resist print',
    hindi: 'दाबू छपाई',
    origin: 'Akola, Chittorgarh',
    tagline: 'Mud-resist printing, blue by blue',
    history:
      'Dabu comes from “dabana”, to press: a paste of mud, lime and gum is stamped on cloth with carved wooden blocks to hold back the dye. The Chhipa families of Akola have printed this way for generations, known for deep indigo and earthy red.',
    steps: [
      'Wash and prepare the cotton cloth',
      'Stamp the mud, lime and gum paste on with hand-carved blocks and dust it with sawdust',
      'Dry in the sun, dip in the indigo vat and air it to turn blue',
      'Wash out the dried mud: where it sat, the cloth stays pale',
      'Repeat with more colours for a double or triple dabu',
    ],
    gi: null,
    authentic: [
      'A soft, veined crackle where the mud paste cracked, with slight bleeding at the edges',
      'Indigo that varies in tone, with small block misalignments',
      'Earthy, natural dye smell and slightly stiff cotton',
      'The print is visible on both sides of the cloth',
    ],
    machineMade: [
      'Crisp, flat, identical lines like a screen print, with no crackle',
      'Sharp edges that never bleed, printed on one face only',
      'Glossy synthetic fabric',
    ],
    prices: [
      band('small', 'Cushion cover or scarf', 250, 700),
      band('medium', 'Stole or dupatta (about 2.25 m)', 700, 2000),
      band('large', 'Saree or bedcover', 2500, 8000),
    ],
    priceNote: 'Natural indigo and the number of colour passes add days of work. Ask how many times the cloth was dipped.',
    care: 'Wash it separately in cold water for the first few times and dry in the shade. Indigo fades softly, which is part of its charm.',
    cover: '/makers/dabu.jpg',
  },
  {
    id: 'silver',
    name: 'Silver jewellery',
    hindi: 'चाँदी के गहने',
    origin: 'Udaipur and Mewar',
    tagline: 'Heavy tribal silver and fine filigree',
    history:
      'Mewar’s tribal and royal families have always saved wealth as silver: heavy anklets and necklaces worn by Bhil and Garasia women, and finer filigree for the courts. Udaipur’s old-city silversmiths still beat and engrave it by hand.',
    steps: [
      'Melt and draw silver into wire, or beat it into sheet',
      'Cut, shape and solder the parts',
      'Engrave the pattern and oxidise it to make it stand out',
      'File, polish and set the stones',
      'Stamp the purity mark (925 for sterling silver)',
    ],
    gi: null,
    authentic: [
      'A purity stamp (925), and the seller weighs it in front of you',
      'Priced by weight plus making charges, never a flat “tourist” figure',
      'Feels heavy and cool, and tarnishes to grey over time',
      'Neat solder joints and hand-engraved patterns',
    ],
    machineMade: [
      '“German silver”: a nickel-copper alloy with no silver, light and unstamped',
      'Plating that wears yellow at the edges',
      'Hollow or stamped pieces with visible seams',
    ],
    prices: [
      band('small', 'Ring or earrings (5 to 8 g)', 700, 2200),
      band('medium', 'Anklet pair or pendant set (35 to 60 g)', 3500, 10000),
      band('large', 'Heavy tribal kada or necklace (100 g and up)', 12000, 35000),
    ],
    priceNote: 'Silver moves daily. Ask for the weight in grams, today’s rate and the making charge, and check they add up.',
    care: 'Store in a soft pouch away from damp, wipe with a dry cloth and polish now and then with a silver cloth.',
    cover: '/makers/silver.jpg',
  },
  {
    id: 'stone',
    name: 'Stone and marble carving',
    hindi: 'पत्थर की नक्काशी',
    origin: 'Udaipur and Rajsamand',
    tagline: 'White marble, chiselled by hand',
    history:
      'Mewar’s palaces and temples were carved by generations of stone-carving families, and the white marble quarried nearby is still shaped by hand into deities, elephants and lattice screens.',
    steps: [
      'Choose a block and mark the shape on it',
      'Rough out the form with a heavy hammer and point chisel',
      'Refine the details with finer chisels and files',
      'Polish with water and abrasive stones',
      'Finish with wax for a soft shine',
    ],
    gi: null,
    authentic: [
      'Cold to the touch and heavy for its size',
      'Natural veining runs through the stone, and thin edges glow a little in strong light',
      'Chisel marks stay in the recesses, with small asymmetries',
      'The carver can tell you which quarry the stone came from',
    ],
    machineMade: [
      'Resin or marble-dust casts: lighter, warmer, with mould seam lines',
      'An even, plastic-like gloss and a dull thud when tapped',
      'Paint or glitter that hides the material',
    ],
    prices: [
      band('small', 'Palm-size figure (about 4 in)', 400, 1800),
      band('medium', 'Figure or jali panel (about 10 in)', 2500, 10000),
      band('large', 'Large carving (2 ft and up), days of work', 15000, 90000),
    ],
    priceNote: 'Stone quality and the days of carving set the price. Ask how long the piece took.',
    care: 'Wipe with a damp cloth and avoid lemon or vinegar cleaners, which etch marble. Pack it in cloth inside a sturdy box.',
    cover: '/makers/stone.jpg',
  },
  {
    id: 'toys',
    name: 'Wooden toys',
    hindi: 'लकड़ी के खिलौने',
    origin: 'Udaipur old city',
    tagline: 'Lac-turned toys, painted camel by camel',
    history:
      'Udaipur’s toymakers turn soft doodhia wood on hand lathes and finish it with coloured lac: a stick pressed to the spinning wood melts by friction into a smooth shell. Camels, elephants and horses are the classics.',
    steps: [
      'Cut soft wood into rough blanks',
      'Turn them on a hand lathe into bodies and legs',
      'Press a coloured lac stick against the spinning wood so friction melts it into a smooth shell',
      'Paint the fine details by hand',
      'Assemble and polish',
    ],
    gi: null,
    authentic: [
      'A smooth lac shell with faint ridges where the lathe cut',
      'Hand-painted eyes and patterns, a little different on each toy',
      'Light, solid wood with no plastic parts and soft edges',
      'The maker can tell you which wood it is',
    ],
    machineMade: [
      'Spray paint or thick glossy varnish',
      'Identical stencilled patterns',
      'Pressed board or plastic parts',
    ],
    prices: [
      band('small', 'Rattle, top or small animal', 80, 300),
      band('medium', 'Camel or elephant (about 7 in)', 300, 900),
      band('large', 'Hand-painted horse or large elephant (about 14 in)', 1000, 3500),
    ],
    priceNote: 'Lac-turned toys cost a little more than painted ones because the finish takes longer.',
    care: 'Wipe with a dry cloth and keep it dry. Ask the maker about child-safe colours before giving it to a toddler.',
    cover: '/makers/toys.jpg',
  },
  {
    id: 'leather',
    name: 'Hand-stitched leather',
    hindi: 'चमड़े की कारीगरी',
    origin: 'Udaipur old city, near Jagdish Temple',
    tagline: 'Journals, bags and mojaris, stitched by hand',
    history:
      'Leatherwork in Udaipur goes back to the Rajput courts, where saddles, shields and manuscript covers were made for the Maharanas. Families in the lanes around Jagdish Temple still hand-stitch journals, bags and mojari slippers.',
    steps: [
      'Choose vegetable-tanned leather, tanned with bark, and cut it by hand',
      'Punch the stitching holes with an awl',
      'Stitch with waxed thread, one stitch at a time',
      'Burnish the edges and colour with natural dyes',
      'Finish with oil or wax',
    ],
    gi: null,
    authentic: [
      'Hand stitches with slightly uneven spacing and a small slant',
      'A natural leather smell and visible grain variations',
      'Burnished edges instead of folded plastic',
      'The maker can say what the leather is and how it was tanned',
    ],
    machineMade: [
      'Perfect machine stitching and a peeling plastic “PU leather” skin',
      'A strong chemical smell and a printed grain pattern',
      'Glued soles and cardboard stiffeners in mojaris',
    ],
    prices: [
      band('small', 'Card wallet, keyring or coin pouch', 300, 900),
      band('medium', 'Journal or a pair of mojaris', 1200, 3500),
      band('large', 'Satchel or travel bag', 4000, 12000),
    ],
    priceNote: 'Leather type and hand-stitching hours decide the price. Cheap “leather” at a tourist stall is often plastic.',
    care: 'Keep it dry, rub in a little oil or wax every few months, and stuff mojaris with paper to hold their shape.',
    cover: '/makers/leather.jpg',
  },
];

export const CRAFT_BY_ID = new Map(CRAFTS.map(c => [c.id, c]));
