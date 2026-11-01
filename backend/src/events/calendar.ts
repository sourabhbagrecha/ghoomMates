// Mewar Utsav: the festivals, fairs and nightly shows of Udaipur and its neighbours, from November 2026 to December 2027.
// Everything here is curated by hand. A date is only listed for a year when a panchang (Drik Panchang) or an official
// listing (Incredible India / Rajasthan Tourism, the City Palace, the Udaipur Municipal Corporation) gives it; an event
// whose dates aren't out yet has no occurrence and says so. Sources and how each date was checked: docs/events.md.
//
// `impacts` is how the event moves the heritage crowd model (heritage/crowd.ts): a multiplier on a site's usual level for
// some hours, on top of the weekend / season / festival day factor. Times are minutes after midnight.

const h = (hour: number, minute = 0) => hour * 60 + minute;

export type EventKind = 'festival' | 'procession' | 'fair' | 'ritual' | 'performance' | 'season';
export type Intensity = 'quiet' | 'moderate' | 'busy' | 'packed';

/** A run of days the event is on, both ends included. Dates are YYYY-MM-DD in India. */
export type Occurrence = {
  from: string;
  to: string;
  /** The main days. Impacts marked `peakOnly` apply only on these; without any, every day of the run is a peak day. */
  peak?: string[];
  /** Where the date comes from (shown in the docs and on the card) */
  basis: string;
};

export type Place = {
  name: string;
  /** A heritage site in heritage/sites.ts */
  siteId?: string;
  lat?: number;
  lng?: number;
};

export type Impact = {
  siteId: string;
  from: number;
  to: number;
  /** Multiplies the site's usual level in the window */
  factor: number;
  /** The window never reads below this level (0–100), so a site that is usually empty then still shows the crush */
  floor?: number;
  /** The site is open for the event even outside its usual hours */
  opens?: boolean;
  /** Applies only on the occurrence's peak days */
  peakOnly?: boolean;
  /** One line for travellers */
  note: string;
};

export type EventStop = {
  title: string;
  place: string;
  /** "07:00 PM" */
  time: string;
  tag: 'Culture' | 'Chill' | 'Adventure' | 'Shops';
  /** The time is set by the event, so the crowd meter never suggests going earlier or later */
  fixedTime: boolean;
  notes: string;
  /** What the stop screen says instead of the site's own "visit lightly" line */
  care: string;
};

export type MewarEvent = {
  id: string;
  name: string;
  nameHi: string;
  /** Finishes "it’s …": "Busier than usual: it’s Rath Yatra" */
  phrase: string;
  kind: EventKind;
  /** Verified runs of days. Empty with `recurring` for nightly shows, or for an event whose dates aren't announced. */
  occurrences: Occurrence[];
  recurring?: 'daily';
  /** Shown instead of a date when the dates aren't known yet */
  datesNote?: string;
  time: { label: string; from: number; to: number };
  places: Place[];
  significance: string;
  join: { etiquette: string[]; dress: string; photography: string };
  tips: string[];
  /** Cost, when the event has a ticket */
  price?: string;
  /** For the itinerary tip when a trip overlaps the event; {day} becomes "Day 2" */
  tripTip?: string;
  /** How crowded it feels when no heritage site carries the number (Nathdwara, Eklingji, village shows) */
  intensity: Intensity;
  /** One line about the crowd, written for travellers */
  crowdNote: string;
  impacts: Impact[];
  stop: EventStop | null;
  sources: { title: string; url: string }[];
};

const NATHDWARA_JOIN = {
  dress: 'Modest clothes with shoulders and knees covered; traditional wear is welcome. Shoes, socks and phones go in the free lockers by the gate.',
  photography: 'No phones or cameras inside the temple, so leave them in the lockers. Darshan is for the eyes.',
};

export const EVENTS: MewarEvent[] = [
  {
    id: 'diwali',
    name: 'Diwali',
    nameHi: 'दीपावली',
    phrase: 'Diwali',
    kind: 'festival',
    occurrences: [
      { from: '2026-11-06', to: '2026-11-08', peak: ['2026-11-08'], basis: 'Drik Panchang: Dhanteras Fri 6 Nov, Lakshmi Puja Sun 8 Nov 2026' },
      { from: '2027-10-27', to: '2027-10-29', peak: ['2027-10-29'], basis: 'Drik Panchang: Dhanteras Wed 27 Oct, Lakshmi Puja Fri 29 Oct 2027' },
    ],
    time: { label: 'Lamps from sunset, about 6 PM', from: h(17), to: h(22) },
    places: [
      { name: 'Old-city lanes and Jagdish Temple', siteId: 'jagdish-temple' },
      { name: 'Gangaur Ghat', siteId: 'gangaur-ghat' },
      { name: 'Ambrai Ghat, across from the City Palace', siteId: 'ambrai-ghat' },
      { name: 'Hathi Pol Bazaar', siteId: 'hathi-pol' },
    ],
    significance:
      'Diwali is the festival of lights, where light wins over darkness, and in Udaipur it is a family festival first: homes glow with rows of diyas, doorsteps get rangoli and Lakshmi Puja is done at dusk. Dhanteras opens the five days with a rush to the bazaars. On Diwali night the old city’s lanes, temples and ghats shine, and the City Palace is lit up across the water.',
    join: {
      etiquette: [
        'Lakshmi Puja is a family ritual at home: watch from the doorway unless you are invited in, and take off your shoes if you are.',
        'Fireworks echo in the narrow lanes. Keep clear of them and of stray animals, and keep crackers away from temples and the lake edge.',
        'Buy diyas, sweets and gifts from the makers and shopkeepers of the old bazaars, so the festival money stays with them.',
      ],
      dress: 'Festive and modest. Cover shoulders and knees for the temples, and wear shoes that slip off easily.',
      photography: 'Ask before photographing people at puja. Skip photos of the main shrine at Jagdish Temple.',
    },
    tips: [
      'See the lit-up City Palace from Ambrai Ghat, best just after dark.',
      'Old-city lanes jam from about 6 PM. Walk in rather than driving, and park outside the old city.',
      'Many shops close for puja on Diwali evening, so do the Dhanteras shopping earlier.',
    ],
    tripTip: 'Your {day} is Diwali. The City Palace lights up after dark, but the old-city lanes are packed from about 6 PM. Be at the ghat before sunset, or watch from across the lake.',
    intensity: 'packed',
    crowdNote: 'Old-city lanes, ghats and Jagdish Temple are packed from about 6 PM; the bazaars are heaving all three days.',
    impacts: [
      { siteId: 'hathi-pol', from: h(11), to: h(21, 30), factor: 1.5, note: 'Dhanteras and Diwali shopping fills the bazaar' },
      { siteId: 'jagdish-temple', from: h(16, 30), to: h(22), factor: 1.3, peakOnly: true, note: 'Lamp-lighting and puja crowd the steps' },
      { siteId: 'gangaur-ghat', from: h(17), to: h(22), factor: 1.35, peakOnly: true, note: 'Diyas on the steps; the old-city lanes fill from about 6 PM' },
      { siteId: 'ambrai-ghat', from: h(17), to: h(22), factor: 1.25, peakOnly: true, note: 'Everyone wants the lit-up City Palace across the water' },
      { siteId: 'bagore-ki-haveli', from: h(17, 30), to: h(20, 15), factor: 1.15, peakOnly: true, note: 'Lanes around the haveli are packed before the show' },
    ],
    stop: {
      title: 'Diwali evening in the old city',
      place: 'Gangaur Ghat, Udaipur',
      time: '05:30 PM',
      tag: 'Culture',
      fixedTime: true,
      notes: 'Lamps on the ghat steps, rangoli at every door and the City Palace lit up across the water. Old-city lanes are packed from about 6 PM, so walk in and keep the squad together. Take off shoes at temples and ask before photographing anyone at puja.',
      care: 'Be on the steps before sunset, agree a meeting point and walk in: the old-city lanes are packed from about 6 PM.',
    },
    sources: [
      { title: 'Drik Panchang: Diwali Lakshmi Puja 2026', url: 'https://www.drikpanchang.com/festivals/lakshmipuja/festivals-lakshmipuja-timings.html?year=2026' },
      { title: 'Drik Panchang: Diwali calendar 2027', url: 'https://www.drikpanchang.com/diwali/diwali-puja-calendar.html?year=2027' },
      { title: 'Udaipur Municipal Corporation: festivals', url: 'https://udaipurmc.org/pages/festivals' },
    ],
  },
  {
    id: 'annakut-nathdwara',
    name: 'Annakut at Nathdwara',
    nameHi: 'अन्नकूट · गोवर्धन पूजा',
    phrase: 'Annakut',
    kind: 'festival',
    occurrences: [
      { from: '2026-11-10', to: '2026-11-10', basis: 'Drik Panchang: Kartik Shukla Pratipada, Govardhan Puja Tue 10 Nov 2026' },
      { from: '2027-10-30', to: '2027-10-30', basis: 'Drik Panchang: Govardhan Puja Sat 30 Oct 2027' },
    ],
    time: { label: 'Darshan through the day', from: h(6), to: h(20) },
    places: [{ name: 'Shrinathji Temple, Nathdwara (48 km from Udaipur)', lat: 24.9376, lng: 73.8236 }],
    significance:
      'Annakut means “mountain of food”. On the first day of Kartik’s bright fortnight, just after Diwali, the Shrinathji Temple offers its deity a towering mound of rice and dozens of dishes, remembering Krishna lifting Govardhan hill to shelter his village. It is one of Nathdwara’s biggest days of the year, and families from the temple town and the villages around come for darshan.',
    join: {
      etiquette: [
        'Darshan comes in short windows with long lines. Join early, stay patient and let families with small children and elders go ahead.',
        'At the end of the day Bhil families from the surrounding villages are traditionally allowed to take the rice mound home as prasad, a custom the temple describes as a special favour. Watch from the side and let it be their moment.',
        'Prasad is for sharing: take what you are offered and waste none of it.',
      ],
      ...NATHDWARA_JOIN,
    },
    tips: [
      'Nathdwara is about 1.5 hours from Udaipur. Leave before dawn and keep the whole day for it.',
      'One taxi for the squad of 4–10 beats five scooters on a road full of devotees.',
      'Phones stay in the lockers, so agree a meeting point outside before you go in.',
    ],
    tripTip: 'Your {day} is Annakut, one of Shrinathji’s biggest days at Nathdwara, 48 km out. Leave Udaipur before 6 AM and give it the whole day.',
    intensity: 'packed',
    crowdNote: 'Thousands queue at Nathdwara from early morning; expect lines of an hour or more.',
    impacts: [],
    stop: {
      title: 'Annakut darshan at Shrinathji Temple, Nathdwara',
      place: 'Shrinathji Temple, Nathdwara',
      time: '07:00 AM',
      tag: 'Culture',
      fixedTime: true,
      notes: 'Shrinathji’s Annakut: a mountain of rice and dishes offered just after Diwali. Nathdwara is 48 km from Udaipur (about 1.5 hours), so leave before dawn. Shoes, socks and phones go in the lockers by the gate; no photos inside. The temple board confirms darshan times a few days ahead.',
      care: 'Leave Udaipur before dawn, store phones and shoes in the free lockers, and expect a long, slow queue.',
    },
    sources: [
      { title: 'Drik Panchang: Govardhan Puja 2026', url: 'https://www.drikpanchang.com/festivals/govardhan-puja/govardhan-puja-date-time.html?geoname-id=1277333' },
      { title: 'Drik Panchang: Govardhan Puja 2027', url: 'https://www.drikpanchang.com/festivals/govardhan-puja/govardhan-puja-date-time.html?year=2027' },
      { title: 'Nathdwara temple site: Annakuta', url: 'https://nathdwara.in/annakuta.php' },
      { title: 'Udaipur Times: Goverdhan Pooja at Nathdwara', url: 'https://udaipurtimes.com/celebrations/thousands-flock-to-witness-goverdhan-pooja-at-nathdwara/c74416-w2859-cid101614-s10699.htm' },
    ],
  },
  {
    id: 'kartik-purnima',
    name: 'Kartik Purnima',
    nameHi: 'कार्तिक पूर्णिमा',
    phrase: 'Kartik Purnima',
    kind: 'ritual',
    occurrences: [
      { from: '2026-11-24', to: '2026-11-24', basis: 'Drik Panchang: Purnima from 11:42 PM on 23 Nov to 8:23 PM on 24 Nov 2026' },
      { from: '2027-11-13', to: '2027-11-14', peak: ['2027-11-14'], basis: 'Drik Panchang: Purnima from 9:55 AM on 13 Nov to 8:55 AM on 14 Nov 2027; the dawn dip is on the 14th' },
    ],
    time: { label: 'Dawn dip, lamps at dusk', from: h(5, 30), to: h(20) },
    places: [
      { name: 'Gangaur Ghat on Lake Pichola', siteId: 'gangaur-ghat' },
      { name: 'Jagdish Temple', siteId: 'jagdish-temple' },
    ],
    significance:
      'Kartik Purnima, the full moon after Diwali, is a day for a holy dip, lamp offerings and prayers to Vishnu. In Udaipur devotees bathe at Gangaur Ghat before sunrise, share prasad of fruit and kheer, and light diyas along the banks of Lake Pichola after dark. It is a gentle, devotional close to the Diwali season.',
    join: {
      etiquette: [
        'Early bathers are praying. Keep a respectful distance, keep your voice low and do not step into the water for a photo.',
        'Light a clay diya if you like, and take your wrappers and flowers’ plastic away with you: the lake is the city’s drinking water.',
        'If prasad is offered, accept it with your right hand.',
      ],
      dress: 'Modest and comfortable, with shoulders and knees covered near the ghat steps.',
      photography: 'Ask before photographing anyone bathing or at prayer. Evening lamps look best from a little distance.',
    },
    tips: [
      'The ghats are calmest before 7 AM, and the lamps are prettiest just after sunset.',
      'Gangaur Ghat has its usual sunset crush too: be on the steps by 5 PM for a place.',
    ],
    tripTip: 'Your {day} is Kartik Purnima. Devotees bathe at Gangaur Ghat at dawn and light lamps there at dusk. Go early for the quiet, or settle on the steps for the lamps.',
    intensity: 'busy',
    crowdNote: 'Quiet at dawn but devout; the evening lamps add to the usual sunset crush at Gangaur Ghat.',
    impacts: [
      { siteId: 'gangaur-ghat', from: h(5, 30), to: h(8, 30), factor: 1.5, floor: 42, opens: true, note: 'Devotees bathe and pray at the ghat at dawn' },
      { siteId: 'gangaur-ghat', from: h(17), to: h(21), factor: 1.3, note: 'Lamps along the steps add to the sunset crowd' },
      { siteId: 'jagdish-temple', from: h(5), to: h(9), factor: 1.3, note: 'Morning puja queues at the temple' },
      { siteId: 'jagdish-temple', from: h(17), to: h(21), factor: 1.2, note: 'Evening aarti is busier than usual' },
    ],
    stop: {
      title: 'Kartik Purnima lamps at Gangaur Ghat',
      place: 'Gangaur Ghat, Udaipur',
      time: '05:30 PM',
      tag: 'Culture',
      fixedTime: true,
      notes: 'Full-moon lamps along Lake Pichola’s banks after a day of dawn dips and prayers. Be on the steps by 5:30 PM, keep voices low, and ask before photographing anyone at prayer.',
      care: 'Be on the steps by 5:30 PM for a place, and keep clear of devotees at prayer.',
    },
    sources: [
      { title: 'Drik Panchang: Kartik Purnima 2026', url: 'https://www.drikpanchang.com/purnima/kartik/kartik-purnima-date-time.html?year=2026' },
      { title: 'Drik Panchang: Kartik Purnima 2027', url: 'https://www.drikpanchang.com/purnima/kartik/kartik-purnima-date-time.html?year=2027' },
      { title: 'Udaipur Times: devotees celebrate Kartik Poornima', url: 'https://udaipurtimes.com/events/devotees-celebrate-kartik-poornima/c74416-w2859-cid119629-s10700.htm' },
    ],
  },
  {
    id: 'shilpgram-utsav',
    name: 'Shilpgram Utsav',
    nameHi: 'शिल्पग्राम उत्सव',
    phrase: 'the Shilpgram Utsav',
    kind: 'fair',
    occurrences: [],
    datesNote: 'Dates announced closer to the time. The ten-day fair has opened on 21 December in recent years (2025 included).',
    time: { label: 'Fair by day, folk shows in the evening', from: h(11), to: h(22) },
    places: [{ name: 'Shilpgram crafts village, Hawala', siteId: 'shilpgram' }],
    significance:
      'Each winter the West Zone Cultural Centre fills Shilpgram with artisans and folk artists from across India for ten days. Weavers, potters, painters and musicians set up in the village’s huts and on the open-air stage, so you can meet the makers, watch them work and buy straight from them.',
    join: {
      etiquette: [
        'Ask a maker before photographing their work or their hands. Many are glad to demonstrate.',
        'Bargain gently: the price is their day’s wage. The fair-price guides in Makers of Udaipur show what a handmade piece costs.',
        'Evening stage shows start after dusk, so arrive half an hour early for a seat and keep phones silent.',
      ],
      dress: 'Comfortable walking shoes and a warm layer: December evenings turn cold.',
      photography: 'Photos around the huts are welcome. Ask first for portraits and close-ups of artisans.',
    },
    tips: [
      'Entry on the opening day has been free in recent years, which makes it the busiest. A weekday afternoon is calmer.',
      'Pair it with the Makers of Udaipur list to meet artisans in the old city too.',
    ],
    intensity: 'busy',
    crowdNote: 'Opening day and weekend evenings are the crush; weekday afternoons are easy.',
    impacts: [
      { siteId: 'shilpgram', from: h(11), to: h(22), factor: 2.2, floor: 60, opens: true, note: 'Fair crowds fill the village and the open-air stage' },
    ],
    stop: {
      title: 'Shilpgram Utsav crafts fair',
      place: 'Shilpgram crafts village, Hawala',
      time: '04:00 PM',
      tag: 'Shops',
      fixedTime: false,
      notes: 'The ten-day crafts and folk-arts fair: artisans from across India in the village’s huts, folk music and dance in the evening. Buy straight from the makers and ask before photographing them.',
      care: 'Go on a weekday afternoon and stay for the evening stage show.',
    },
    sources: [
      { title: 'Udaipur Times: Shilpgram Festival from Dec 21 (2025)', url: 'https://udaipurtimes.com/events/shilpgram-festival-from-dec-21/cid17922246.htm' },
      { title: 'Udaipur festivals guide (Shilpgram Utsav, usually 21–30 December)', url: 'https://hidmc.com/blog-posts/a-guide-to-udaipurs-festivals-from-mewar-to-shilpgram' },
    ],
  },
  {
    id: 'year-end-peak',
    name: 'Christmas–New Year peak',
    nameHi: 'क्रिसमस–नव वर्ष की भीड़',
    phrase: 'the Christmas–New Year peak',
    kind: 'season',
    occurrences: [
      { from: '2026-12-24', to: '2027-01-01', peak: ['2026-12-31', '2027-01-01'], basis: 'Calendar dates; hotels book out from Christmas to the first week of January' },
      { from: '2027-12-24', to: '2028-01-01', peak: ['2027-12-31', '2028-01-01'], basis: 'Calendar dates; hotels book out from Christmas to the first week of January' },
    ],
    time: { label: 'All week, busiest on the evening of 31 Dec', from: h(10), to: h(23) },
    places: [
      { name: 'Fateh Sagar and the lakeside', siteId: 'fateh-sagar' },
      { name: 'Ambrai Ghat', siteId: 'ambrai-ghat' },
      { name: 'Gangaur Ghat', siteId: 'gangaur-ghat' },
    ],
    significance:
      'Between Christmas and New Year Udaipur is at its fullest: families and wedding guests fill the hotels, trains out of the city sell out, and the lakeside, ghats and palaces run at capacity. It is the season that shows the city’s hospitality at its best, and the week its lanes, lakes and the people who live there feel the strain most.',
    join: {
      etiquette: [
        'Book boats, dinners and tickets days ahead, and walk or share a cab between sights.',
        'Take your bottles and wrappers away from the lake’s edge. Pichola and Fateh Sagar are the city’s drinking water.',
        'The old city is full of homes. Keep music low late at night and ask before photographing residents and shopkeepers.',
      ],
      dress: 'Layers: the lakeside is cold after sunset in December.',
      photography: 'Ask before photographing residents and shopkeepers; sunset at the ghats is the shot everyone is taking.',
    },
    tips: [
      'The big sights are quietest before 10 AM, so start early and rest in the afternoon.',
      'Badi Lake, Gulab Bagh and the hilltops stay calm even in the peak week.',
      'Hotels fill and trains sell out early, so book your way home first.',
    ],
    tripTip: 'Your {day} falls in the Christmas–New Year peak. The ghats, lake and hotels are at their fullest: do the big sights before 10 AM and book dinner ahead.',
    intensity: 'busy',
    crowdNote: 'The lakeside and ghats run full on the evenings of the 24th–25th and 31st; the sights are calmer before 10 AM.',
    impacts: [
      { siteId: 'fateh-sagar', from: h(17), to: h(23), factor: 1.2, peakOnly: true, note: 'New Year crowds fill the lakeside promenade' },
      { siteId: 'ambrai-ghat', from: h(17), to: h(23), factor: 1.2, peakOnly: true, note: 'Lake-view terraces and the ghat fill after sunset' },
      { siteId: 'gangaur-ghat', from: h(17), to: h(22), factor: 1.15, peakOnly: true, note: 'Sunset crowds stay late' },
      { siteId: 'pichola-boat', from: h(10), to: h(18), factor: 1.15, note: 'Boat queues are longer all week' },
      { siteId: 'city-palace', from: h(10), to: h(17, 30), factor: 1.1, note: 'Ticket queues are longer all week' },
    ],
    stop: null,
    sources: [
      { title: 'ETV Bharat: Udaipur ready to ring in New Year and Christmas', url: 'https://etvbharat.com/en/!state/udaipur-ready-to-ring-in-new-year-christmas-hoteliers-eye-record-tourist-inflow-enn24120802513' },
      { title: 'Udaipur Times: hotel bookings full for New Year and Christmas', url: 'https://udaipurtimes.com/travel-and-tourism/udaipur-hotels-booking-full-for-new-year-and-christmas/cid12832335.htm' },
    ],
  },
  {
    id: 'makar-sankranti',
    name: 'Makar Sankranti kites',
    nameHi: 'मकर संक्रांति · पतंग',
    phrase: 'Makar Sankranti',
    kind: 'festival',
    occurrences: [
      {
        from: '2027-01-14',
        to: '2027-01-15',
        peak: ['2027-01-14'],
        basis: 'Rajasthan Tourism lists the kite festival on 14 Jan 2027; the Sankranti moment is 9:14 PM IST on the 14th, so some panchangs keep the 15th',
      },
    ],
    time: { label: 'Kites from morning to sunset', from: h(9), to: h(18) },
    places: [
      { name: 'Fateh Sagar embankment', siteId: 'fateh-sagar' },
      { name: 'Gangaur Ghat', siteId: 'gangaur-ghat' },
      { name: 'Moti Magri', siteId: 'moti-magri' },
      { name: 'Sajjangarh Monsoon Palace', siteId: 'sajjangarh' },
    ],
    significance:
      'Makar Sankranti marks the sun’s turn northward, and across Rajasthan it is kept with kites, til-gur sweets and giving. In Udaipur the old city’s rooftops fill with families calling “wo kata!” as strings cross, and in 2026 the tourism department hosted kite sessions at the lakeside and the hill viewpoints.',
    join: {
      etiquette: [
        'Use plain cotton thread, never glass-coated or nylon manjha: it cuts birds and people on scooters.',
        'Fly away from roads, power lines and roof edges, and keep children back from the parapet.',
        'Stop when the light fades. Birds are roosting, and a thread left hanging can injure them overnight.',
        'Til-gur laddoos are shared: accept one and offer one.',
      ],
      dress: 'Sun hat and sunscreen. The winter sun is strong at 4 PM, and the wind on the hills is cool.',
      photography: 'Rooftops are private. Ask the family before photographing from or towards their roof.',
    },
    tips: [
      'The hilltops catch the best wind but fill up in the afternoon. Go before 3 PM.',
      'Ask your hotel host to invite the squad onto an old-city rooftop.',
      'Share one cab to Sajjangarh: its single hill road jams.',
    ],
    tripTip: 'Your {day} is Makar Sankranti, kite day. Fateh Sagar, Gangaur Ghat, Moti Magri and Sajjangarh fill up from about 3 PM, so fly before then or from a rooftop.',
    intensity: 'busy',
    crowdNote: 'Lakeside and hill viewpoints fill from about 3 PM; rooftops are calmer.',
    impacts: [
      { siteId: 'moti-magri', from: h(15), to: h(17, 30), factor: 1.7, floor: 66, peakOnly: true, note: 'A favourite kite spot above the lake' },
      { siteId: 'fateh-sagar', from: h(15), to: h(18, 30), factor: 1.35, peakOnly: true, note: 'Kite flyers fill the embankment' },
      { siteId: 'gangaur-ghat', from: h(15, 30), to: h(18, 30), factor: 1.3, peakOnly: true, note: 'Kite flyers on the ghat steps' },
      { siteId: 'sajjangarh', from: h(15), to: h(18), factor: 1.3, peakOnly: true, note: 'The single hill road jams' },
    ],
    stop: {
      title: 'Makar Sankranti kite flying',
      place: 'Fateh Sagar embankment, Udaipur',
      time: '03:30 PM',
      tag: 'Chill',
      fixedTime: false,
      notes: 'Kite day. Last year the tourism department ran sessions at Fateh Sagar, Gangaur Ghat, Moti Magri and Sajjangarh; rooftops across the old city fill too. Use cotton thread, stay away from roads and power lines, and share til-gur.',
      care: 'Use cotton thread, keep away from roads and power lines, and go before 3 PM for space.',
    },
    sources: [
      { title: 'Incredible India: Kite Festival and Patang Atish Utsav, 14 January 2027', url: 'https://www.incredibleindia.gov.in/en/festivals-and-events/rajasthan/kite-festival' },
      { title: 'Drik Panchang: Makar Sankranti 2027', url: 'https://www.drikpanchang.com/sankranti/makar-sankranti-date-time.html?geoname-id=1273294' },
      { title: 'Udaipur Times: kite festival at four tourist spots (2026)', url: 'https://udaipurtimes.com/around-town/kite-festival-at-4-tourist-spots/cid18113215.htm' },
    ],
  },
  {
    id: 'maha-shivratri',
    name: 'Maha Shivratri at Eklingji',
    nameHi: 'महाशिवरात्रि · एकलिंगजी',
    phrase: 'Maha Shivratri',
    kind: 'ritual',
    occurrences: [
      { from: '2027-03-06', to: '2027-03-06', basis: 'Drik Panchang: Maha Shivaratri Sat 6 Mar 2027; Chaturdashi from noon on the 6th, night puja just after midnight' },
    ],
    time: { label: 'All day and through the night', from: h(4), to: h(23, 59) },
    places: [{ name: 'Eklingji Temple, Kailashpuri (22 km from Udaipur)', lat: 24.746, lng: 73.7222 }],
    significance:
      'Maha Shivratri, the great night of Shiva, is kept with a day-long fast and a night vigil. Eklingji, 22 km north of Udaipur, is the family deity of the Mewar rulers: tradition says the Maharanas rule only as his Diwan. On Shivratri the temple stays open through the night while thousands queue, many of them walking out from the city.',
    join: {
      etiquette: [
        'Eklingji asks you to leave phones at the counter and to take off footwear and leather belts and wallets at the entrance.',
        'Keep to the line, do not push, and give elders and families with small children room. Offer milk, bel leaves and water only as the priests direct.',
        'Speak softly. Many people here are fasting and praying through the night.',
      ],
      dress: 'Simple and modest: shoulders and knees covered. No shorts, short skirts or sleeveless tops.',
      photography: 'No phones or cameras inside the temple. Outside, ask before photographing devotees.',
    },
    tips: [
      'Devotees queue through the night and the day, so go with water, patience and a plan to stay together.',
      'Arrange a driver for the late return: it is 22 km and buses thin out at night.',
      'If you cannot be there on the night, pick a weekday that is not a Monday: Mondays draw crowds to Eklingji too.',
    ],
    tripTip: 'Your {day} is Maha Shivratri. Eklingji, 22 km out, stays open through the night with thousands in line. Go after sunset and plan a late ride back.',
    intensity: 'packed',
    crowdNote: 'Thousands queue at Eklingji through the night and the day.',
    impacts: [],
    stop: {
      title: 'Maha Shivratri at Eklingji Temple',
      place: 'Eklingji Temple, Kailashpuri',
      time: '08:00 PM',
      tag: 'Culture',
      fixedTime: true,
      notes: 'Shivratri at the Mewar rulers’ family deity, 22 km north of Udaipur. The temple stays open through the night. Leave phones at the counter, footwear and leather at the entrance, cover shoulders and knees, and arrange a late ride back.',
      care: 'Leave phones at the counter, dress modestly and book a driver for the late return.',
    },
    sources: [
      { title: 'Drik Panchang: Maha Shivaratri 2027', url: 'https://www.drikpanchang.com/festivals/maha-shivaratri/maha-shivaratri-date-time.html' },
      { title: 'Udaipur Times: thousands flock to Eklingji on Maha Shivratri', url: 'https://udaipurtimes.com/celebrations/photos-thousands-flock-ekling-nathji-temple-on-maha-shiv/c74416-w2859-cid101123-s10699.htm' },
      { title: 'Wikipedia: Eklingji', url: 'https://en.wikipedia.org/wiki/Eklingji' },
      { title: 'The Mooknayak: Eklingji bans mobile phones and short clothes', url: 'https://en.themooknayak.com/society/udaipur-temple-bans-mobile-phones-short-clothes' },
    ],
  },
  {
    id: 'holika-dahan',
    name: 'Holika Dahan at the City Palace',
    nameHi: 'होलिका दहन · सिटी पैलेस',
    phrase: 'Holika Dahan',
    kind: 'ritual',
    occurrences: [
      { from: '2027-03-21', to: '2027-03-21', basis: 'Drik Panchang: Holika Dahan Sun 21 Mar 2027 (Purnima evening), Holi on Mon 22 Mar' },
    ],
    time: { label: 'Procession about 6 PM, fire at twilight', from: h(17, 30), to: h(20, 30) },
    places: [{ name: 'Manek Chowk, City Palace', siteId: 'city-palace' }],
    significance:
      'On the eve of Holi the Mewar royal family lights the Holika fire in Manek Chowk, inside the City Palace. A parade of decorated horses, liveried palace staff and a band walks from the royal residence to the chowk; at twilight the fire is lit and local people dance the Gair. It celebrates devotion winning over arrogance.',
    join: {
      etiquette: [
        'Entry is by pass from the City Palace office. Book early and arrive well before six to be seated.',
        'Stand where the ushers place you: the procession passes close and the horses are spirited.',
        'Keep clear of the fire and the horses, and leave sparklers at home.',
      ],
      dress: 'Smart casual or traditional. March evenings are mild; wear closed shoes for the courtyard.',
      photography: 'The procession is the photo to take. Keep flash away from the horses and stay behind the ushers’ line.',
    },
    tips: [
      'Passes sell out: confirm and buy at the City Palace gates or online as early as you can.',
      'Jagdish Chowk and the lanes to the palace are busy from about 5 PM. Walk in.',
      'The next morning is Dhulandi, the colour day: save your whites for then.',
    ],
    tripTip: 'Your {day} is Holika Dahan: the City Palace lights the Holi fire in Manek Chowk at twilight. Passes sell out, and the lanes to the palace are busy from about 5 PM, so walk in early.',
    intensity: 'packed',
    crowdNote: 'Ticketed seating inside Manek Chowk; the lanes and the palace gate are packed from about 5 PM.',
    impacts: [
      { siteId: 'city-palace', from: h(17, 30), to: h(21), factor: 1, floor: 85, opens: true, note: 'Pass holders fill Manek Chowk after the museum closes' },
      { siteId: 'jagdish-temple', from: h(17), to: h(20, 30), factor: 1.25, note: 'Crowds walking to the palace pass Jagdish Chowk' },
      { siteId: 'gangaur-ghat', from: h(17), to: h(20, 30), factor: 1.25, note: 'The ghat fills with people waiting for the fire' },
      { siteId: 'bagore-ki-haveli', from: h(17, 30), to: h(20, 15), factor: 1.2, note: 'Lanes near the haveli are busier before the show' },
    ],
    stop: {
      title: 'Holika Dahan at the City Palace',
      place: 'Manek Chowk, City Palace',
      time: '05:45 PM',
      tag: 'Culture',
      fixedTime: true,
      notes: 'The royal Holika fire in Manek Chowk: a procession of decorated horses and a band from about 6 PM, the fire lit at twilight, Gair dancers. Entry is by pass from the City Palace office. Walk in: the lanes jam from about 5 PM.',
      care: 'Buy passes ahead, arrive before 6 PM and walk in: the lanes jam from about 5 PM.',
    },
    sources: [
      { title: 'Eternal Mewar: Holika Dahan at the City Palace', url: 'https://eternalmewar.in/microwebsites/holika-dahan' },
      { title: 'Outlook: Royal Holi Udaipur, Holika Dahan and Ashwa Poojan', url: 'https://www.outlookindia.com/brand-studio/royal-holi-udaipur-2026-holika-dahan-ashwa-poojan-at-city-palace' },
      { title: 'Drik Panchang: Holika Dahan 2027', url: 'https://www.drikpanchang.com/festivals/holi/festivals-holika-dahan-timings.html?year=2027' },
    ],
  },
  {
    id: 'holi',
    name: 'Holi, the colour day',
    nameHi: 'होली · धुलंडी',
    phrase: 'Holi',
    kind: 'festival',
    occurrences: [
      { from: '2027-03-22', to: '2027-03-22', basis: 'Drik Panchang: Holi (Dhulandi) Mon 22 Mar 2027, the day after Holika Dahan' },
    ],
    time: { label: 'Morning to mid-afternoon', from: h(9), to: h(15) },
    places: [{ name: 'Old-city lanes and Gangaur Ghat', siteId: 'gangaur-ghat' }],
    significance:
      'The morning after the bonfire, Holi turns the city into a spring colour party: friends and families smear gulal on each other, share gujiya and dance in the lanes. In Udaipur the old city, the ghats and many lakeside hotels host open-air colour play by late morning.',
    join: {
      etiquette: [
        'Ask before applying colour, and respect a no. Never throw colour at people who are not playing, elders at prayer or animals.',
        'Choose dry, herbal gulal and use little water: the lakes are the city’s drinking water.',
        'Bhang sweets and thandai are common. Ask what is in a drink before you take it, and stay with your squad in crowded lanes.',
      ],
      dress: 'Old white or light clothes you do not mind staining, sunglasses, hair tied back and coconut oil on skin and hair first.',
      photography: 'Keep your phone in a zip bag. Ask before photographing people mid-play.',
    },
    tips: [
      'Many old-city shops open late or stay shut until the afternoon.',
      'A hotel Holi party gives colour without the crush in the lanes.',
      'Book your ride home before noon: lanes are closed to cars once the colour starts.',
    ],
    tripTip: 'Your {day} is Holi. Old-city shops open late and colour is everywhere by 10 AM, so wear clothes you will give away and bag your phone.',
    intensity: 'moderate',
    crowdNote: 'The ghat and old-city lanes fill with colour parties from about 10 AM; hotels are the calmer option.',
    impacts: [
      { siteId: 'gangaur-ghat', from: h(10), to: h(15), factor: 1.4, note: 'Colour parties on the ghat and in the lanes' },
    ],
    stop: {
      title: 'Holi colour play',
      place: 'Gangaur Ghat, Udaipur',
      time: '10:30 AM',
      tag: 'Chill',
      fixedTime: false,
      notes: 'Dhulandi, the colour day. Ask before applying colour, use dry herbal gulal, wear clothes you will give away and bag your phone. Many shops open late.',
      care: 'Ask before colouring anyone, use dry gulal and bag your phone.',
    },
    sources: [
      { title: 'Drik Panchang: Holika Dahan and Holi 2027', url: 'https://www.drikpanchang.com/festivals/holi/festivals-holika-dahan-timings.html?year=2027' },
      { title: 'Udaipur festivals guide (Holi)', url: 'https://hidmc.com/blog-posts/a-guide-to-udaipurs-festivals-from-mewar-to-shilpgram' },
    ],
  },
  {
    id: 'gangaur-mewar-festival',
    name: 'Gangaur and the Mewar Festival',
    nameHi: 'गणगौर · मेवाड़ उत्सव',
    phrase: 'the Mewar Festival',
    kind: 'procession',
    occurrences: [
      { from: '2027-04-09', to: '2027-04-11', basis: 'Incredible India (Rajasthan Tourism) lists the Mewar Festival on 9–11 Apr 2027; Drik Panchang puts Gangaur on Fri 9 Apr' },
    ],
    time: { label: 'Afternoon processions, evening boats and folk shows', from: h(15), to: h(22) },
    places: [
      { name: 'Gangaur Ghat on Lake Pichola', siteId: 'gangaur-ghat' },
      { name: 'Jagdish Chowk', siteId: 'jagdish-temple' },
      { name: 'Gogunda village mela (40 km)' },
    ],
    significance:
      'Gangaur honours Gauri (Parvati) and her union with Shiva. Women and girls who have kept the 18-day festival since Holi carry decorated Gauri images in procession through the old city down to Lake Pichola. The three-day Mewar Festival, run by the district administration and the tourism office, adds folk dances, decorated boats on the lake and fireworks over Gangaur Ghat.',
    join: {
      etiquette: [
        'Gangaur is led by women and girls. Stand back, let them lead, and ask before photographing women or the idols.',
        'Do not touch the idols or block the procession’s path. Follow the marshals’ directions at the ghat.',
        'Join the dancing only when invited, and keep plastic and flowers’ wrappers out of the lake.',
      ],
      dress: 'Festive and modest. Closed shoes help on the crowded, wet ghat steps. Women often wear bright Rajasthani dress and visitors are welcome to do the same.',
      photography: 'Photos are welcome, but ask women and girls first, and keep flash off near the lamps and boats.',
    },
    tips: [
      'Take a place on the ghat steps by about 4 PM; processions reach the ghat in the late afternoon.',
      'Walk out through Jagdish Chowk after the fireworks. Cabs cannot enter the old city lanes.',
      'The village Gangaur mela at Gogunda is a calmer, more local version, 40 km away.',
    ],
    tripTip: 'Your {day} is part of the Mewar Festival: Gauri processions reach Gangaur Ghat in the late afternoon and the old city fills until the fireworks. Be on the steps by 4 PM.',
    intensity: 'packed',
    crowdNote: 'Gangaur Ghat and the lanes to it are packed from mid-afternoon until the evening fireworks.',
    impacts: [
      { siteId: 'gangaur-ghat', from: h(15), to: h(22), factor: 1.7, floor: 85, opens: true, note: 'Processions and the royal boats arrive at the ghat' },
      { siteId: 'jagdish-temple', from: h(15), to: h(20), factor: 1.3, note: 'Processions pass through Jagdish Chowk' },
      { siteId: 'bagore-ki-haveli', from: h(16), to: h(21), factor: 1.3, note: 'The haveli stands on the ghat, in the thick of it' },
      { siteId: 'ambrai-ghat', from: h(17), to: h(22), factor: 1.25, note: 'Crowds watch the boats from across the water' },
    ],
    stop: {
      title: 'Gangaur procession at Gangaur Ghat',
      place: 'Gangaur Ghat, Udaipur',
      time: '04:00 PM',
      tag: 'Culture',
      fixedTime: true,
      notes: 'Gauri processions reach Gangaur Ghat in the late afternoon, then decorated boats on Lake Pichola, folk dances and fireworks. Be on the steps by 4 PM, ask before photographing women and the idols, and walk out through Jagdish Chowk.',
      care: 'Be on the steps by 4 PM, let the women lead and walk out through Jagdish Chowk afterwards.',
    },
    sources: [
      { title: 'Incredible India: Mewar Festival 9–11 April 2027', url: 'https://www.incredibleindia.gov.in/en/festivals-and-events/rajasthan/mewar-festival-2026' },
      { title: 'Drik Panchang: Gangaur 2027', url: 'https://www.drikpanchang.com/festivals/gangaur/gangaur-date-time.html?year=2027' },
      { title: 'Udaipur Times: Mewar Festival 2024 in Udaipur started', url: 'https://udaipurtimes.com/celebrations/mewar-festival-celebrations-2024-in-udaipur-started/cid14127942.htm' },
      { title: 'Udaipur Municipal Corporation: festivals', url: 'https://udaipurmc.org/pages/festivals' },
    ],
  },
  {
    id: 'rath-yatra',
    name: 'Jagannath Rath Yatra',
    nameHi: 'जगन्नाथ रथ यात्रा',
    phrase: 'Rath Yatra',
    kind: 'procession',
    occurrences: [
      { from: '2027-07-05', to: '2027-07-05', basis: 'Drik Panchang: Ashadha Shukla Dwitiya, Mon 5 Jul 2027' },
    ],
    time: { label: 'Chariot from mid-afternoon, evening aarti', from: h(14), to: h(19, 30) },
    places: [
      { name: 'Jagdish Temple and Jagdish Chowk', siteId: 'jagdish-temple' },
      { name: 'Bada Bazaar and the old city route' },
    ],
    significance:
      'On Ashadha Shukla Dwitiya Lord Jagannath leaves his temple to visit his devotees, as in Puri. In Udaipur a silver chariot is drawn by hand from Jagannath Dham and Jagdish Chowk through the old city’s Bada Bazaar and back for the evening aarti, with thousands walking alongside. Jagdish Temple, raised in 1651, is the heart of the day.',
    join: {
      etiquette: [
        'Pulling the rope is a blessing. Wait to be invited by the organisers, and do not push into the line.',
        'Women, elders and children are safest at the edge of the road, where the crowd is thinner.',
        'Roads on the route are closed to vehicles. Walk, and keep your squad within sight.',
        'Prasad is offered along the route. Accept it with your right hand.',
      ],
      dress: 'Light cotton you can walk in, a hat or umbrella (it is the monsoon), and modest dress for the temple.',
      photography: 'The road makes a great photograph. Keep clear of the chariot ropes and ask before close-ups of devotees.',
    },
    tips: [
      'Claim a balcony or rooftop café on Jagdish Chowk before 1:30 PM: the road closes before the chariot passes.',
      'Bada Bazaar and the lanes around Ghanta Ghar are slow until about 8 PM.',
      'After the evening aarti, wait half an hour and the crowd thins quickly.',
    ],
    tripTip: 'Your {day} is the Jagannath Rath Yatra: the chariot rolls from Jagdish Chowk in the afternoon and the old city is very heavy from 2 to 7 PM. Watch from a rooftop café, then visit the temple at dusk.',
    intensity: 'packed',
    crowdNote: 'Very heavy crowds around Jagdish Temple and Bada Bazaar from about 2 to 7 PM.',
    impacts: [
      { siteId: 'jagdish-temple', from: h(14), to: h(19, 30), factor: 1.5, floor: 90, opens: true, note: 'Very heavy crowds near Jagdish Temple as the chariot rolls' },
      { siteId: 'hathi-pol', from: h(14), to: h(19), factor: 1.35, note: 'Diversions and slow lanes on the old-city route' },
      { siteId: 'bagore-ki-haveli', from: h(14), to: h(19), factor: 1.25, note: 'The lanes by Gangaur Ghat fill with onlookers' },
      { siteId: 'gangaur-ghat', from: h(15), to: h(19), factor: 1.25, note: 'Spillover from Jagdish Chowk' },
      { siteId: 'city-palace', from: h(14), to: h(17, 30), factor: 1.15, note: 'Gate queues are longer while the road is shut' },
    ],
    stop: {
      title: 'Jagannath Rath Yatra at Jagdish Chowk',
      place: 'Jagdish Temple, Jagdish Chowk',
      time: '02:30 PM',
      tag: 'Culture',
      fixedTime: true,
      notes: 'The silver chariot rolls from Jagdish Chowk through Bada Bazaar in the afternoon, returning for the evening aarti. Roads on the route are closed, so walk in. Claim a balcony before 1:30 PM, keep the squad within sight and take prasad with your right hand.',
      care: 'Claim a balcony or café spot before 1:30 PM, walk in and keep the squad within sight.',
    },
    sources: [
      { title: 'Drik Panchang: Jagannath Rath Yatra 2027', url: 'https://www.drikpanchang.com/festivals/ratha-yatra/jagannatha-rathayatra-date-time.html?year=2027' },
      { title: 'Eternal Mewar newsletter: Rath Yatra from Jagannath Dham to Jagdish Chowk', url: 'https://www.eternalmewar.in/media/newsletter/templates/2024/nl241/vol241_5.html' },
      { title: 'DNA India: Udaipur Rath Yatra to begin at 3 pm (2022)', url: 'https://www.dnaindia.com/india/video-jagannath-rath-yatra-to-begin-at-3-pm-in-udaipur-amid-high-security-arrangement-2965177' },
      { title: 'Udaipur Blog: Jagannath Rath Yatra in Udaipur (route)', url: 'https://udaipurblog.com/?p=21549' },
    ],
  },
  {
    id: 'hariyali-amavasya',
    name: 'Hariyali Amavasya Mela',
    nameHi: 'हरियाली अमावस्या मेला',
    phrase: 'the Hariyali Amavasya fair',
    kind: 'fair',
    occurrences: [
      {
        from: '2027-08-02',
        to: '2027-08-02',
        basis: 'Drik Panchang: Hariyali Amavasya Mon 2 Aug 2027. The Municipal Corporation runs the fair for two days from the new moon (12–13 Aug in 2026), the second day for women and girls',
      },
    ],
    time: { label: 'Afternoon into the evening', from: h(12), to: h(21) },
    places: [
      { name: 'Fateh Sagar lakeside', siteId: 'fateh-sagar' },
      { name: 'Saheliyon ki Bari', siteId: 'saheliyon-ki-bari' },
    ],
    significance:
      'Hariyali Amavasya greets the monsoon, when the Aravallis turn green. The Udaipur Municipal Corporation runs a two-day fair at Fateh Sagar and Saheliyon ki Bari with swings for every age, a haat bazaar of toys and handicrafts, Rajasthani street food and folk performances. Local tradition credits Maharana Fateh Singh with starting it, and families from the villages around come in their brightest clothes.',
    join: {
      etiquette: [
        'The second day is only for women and girls. Men and boys should plan to come on the first day.',
        'Ask before photographing people on the swings, especially women and children.',
        'Carry small cash for the stalls and swings, and keep bags zipped in the crowd.',
        'Keep wrappers out of the lake: Fateh Sagar is part of the city’s water.',
      ],
      dress: 'Sandals or shoes that can get muddy, and a light rain jacket: it is the monsoon.',
      photography: 'It is wonderfully photogenic. Ask for permission before close portraits.',
    },
    tips: [
      'The lakeside road jams. Walk over from Saheliyon ki Bari or take one cab for the squad.',
      'Come in the afternoon: evenings are the heaviest.',
      'Neemach Mata hill, just above the lake, is green and calm in the monsoon.',
    ],
    tripTip: 'Your {day} is the Hariyali Amavasya fair: Fateh Sagar and Saheliyon ki Bari fill with families. Day two is for women and girls only, so plan the squad’s visit for day one.',
    intensity: 'packed',
    crowdNote: 'Fateh Sagar and Saheliyon ki Bari are packed with families through the afternoon and evening.',
    impacts: [
      { siteId: 'fateh-sagar', from: h(12), to: h(21), factor: 1.8, floor: 80, note: 'Swings, stalls and families along the lakeside' },
      { siteId: 'saheliyon-ki-bari', from: h(11), to: h(19), factor: 1.3, floor: 70, note: 'The garden is part of the fair' },
    ],
    stop: {
      title: 'Hariyali Amavasya fair at Fateh Sagar',
      place: 'Fateh Sagar Lake, Udaipur',
      time: '04:30 PM',
      tag: 'Chill',
      fixedTime: false,
      notes: 'The monsoon fair by the lake: swings, a haat bazaar, street food and folk performances. The second day is only for women and girls, so the squad should go on day one. Ask before photographing people and keep wrappers out of the lake.',
      care: 'Come in the afternoon, walk over from Saheliyon ki Bari and keep wrappers out of the lake.',
    },
    sources: [
      { title: 'Drik Panchang: Hariyali Amavasya 2027', url: 'https://www.drikpanchang.com/festivals/sawan/hariyali-amavasya-date-time.html?year=2027' },
      { title: 'Incredible India: Hariyali Amavasya fair, Udaipur', url: 'https://www.incredibleindia.gov.in/en/festivals-and-events/rajasthan/hariyali-amavasya' },
      { title: 'Udaipur Municipal Corporation: festivals', url: 'https://udaipurmc.org/pages/festivals' },
    ],
  },
  {
    id: 'hariyali-teej',
    name: 'Hariyali Teej',
    nameHi: 'हरियाली तीज',
    phrase: 'Hariyali Teej',
    kind: 'festival',
    occurrences: [
      { from: '2027-08-04', to: '2027-08-04', basis: 'Drik Panchang: Shravana Shukla Tritiya, Wed 4 Aug 2027' },
    ],
    time: { label: 'Afternoon and evening', from: h(15), to: h(20) },
    places: [{ name: 'Jagdish Chowk and the old city', siteId: 'jagdish-temple' }],
    significance:
      'Teej celebrates the monsoon and the reunion of Shiva and Parvati. Women dress in green, have mehndi drawn on their hands, sing and swing from decorated branches. In Udaipur you will see it in processions around Jagdish Chowk, at mehndi stalls and on decorated swings.',
    join: {
      etiquette: [
        'Teej is a festival of women. Watch from a polite distance and ask before joining in or photographing.',
        'Mehndi artists make a living from this week. If you have it done, agree the price first and pay fairly.',
        'Join the songs if you are invited. Nobody minds a wrong note.',
      ],
      dress: 'Green is the colour of the day. Wear a touch of it and you will be welcomed in.',
      photography: 'Ask women before photographing them, especially on swings.',
    },
    tips: [
      'Mehndi stalls fill up after lunch. Go first thing in the afternoon.',
      'The monsoon can interrupt: carry a light rain jacket.',
    ],
    intensity: 'moderate',
    crowdNote: 'Jagdish Chowk is busier than usual through the afternoon.',
    impacts: [
      { siteId: 'jagdish-temple', from: h(15), to: h(18), factor: 1.2, note: 'Processions and mehndi stalls around Jagdish Chowk' },
    ],
    stop: {
      title: 'Hariyali Teej at Jagdish Chowk',
      place: 'Jagdish Temple, Jagdish Chowk',
      time: '04:00 PM',
      tag: 'Culture',
      fixedTime: false,
      notes: 'Teej, the monsoon festival of women: green clothes, mehndi, songs and swings. Ask before photographing women, agree the mehndi price first, and carry a rain jacket.',
      care: 'Ask before photographing women, and agree a mehndi price first.',
    },
    sources: [
      { title: 'Drik Panchang: Hariyali Teej 2027', url: 'https://www.drikpanchang.com/festivals/teej/hariyali-teej-date-time.html' },
      { title: 'Udaipur festivals guide (Teej)', url: 'https://hidmc.com/blog-posts/a-guide-to-udaipurs-festivals-from-mewar-to-shilpgram' },
    ],
  },
  {
    id: 'janmashtami-nathdwara',
    name: 'Janmashtami at Nathdwara',
    nameHi: 'जन्माष्टमी · नाथद्वारा',
    phrase: 'Janmashtami',
    kind: 'festival',
    occurrences: [
      { from: '2027-08-25', to: '2027-08-26', peak: ['2027-08-25'], basis: 'Drik Panchang: Krishna Janmashtami Wed 25 Aug 2027, Dahi Handi / Nandotsav Thu 26 Aug' },
    ],
    time: { label: 'Evening jagran darshan, midnight birth', from: h(20), to: h(23, 59) },
    places: [{ name: 'Shrinathji Temple, Nathdwara (48 km from Udaipur)', lat: 24.9376, lng: 73.8236 }],
    significance:
      'Janmashtami celebrates the birth of Krishna at midnight. At the Shrinathji Temple in Nathdwara devotees queue through the evening for the special jagran darshan, wait in near silence as midnight nears, and break into song when conch and gong announce the birth. The next day’s Nand Mahotsav celebrates Nanda’s joy with sweets and playful traditions.',
    join: {
      etiquette: [
        'The hush before midnight is part of the worship. Keep silent when the temple does.',
        'Lines are long and slow. Be patient, stay with your squad and let elders and families go ahead.',
        'Take prasad with your right hand and waste none of it.',
      ],
      ...NATHDWARA_JOIN,
    },
    tips: [
      'It is a late night, 48 km from Udaipur. Arrange the return ride before you leave.',
      'Go by one taxi and agree where to meet outside, because phones stay in the lockers.',
      'Nand Mahotsav the next morning is livelier and a little calmer than the midnight crush.',
    ],
    tripTip: 'Your {day} is Janmashtami: Nathdwara’s Shrinathji Temple fills in the evening for the midnight birth darshan. It is a late night 48 km from Udaipur, so arrange the ride back.',
    intensity: 'packed',
    crowdNote: 'Very large crowds (reports say lakhs of devotees): the temple and its lanes are packed from the evening.',
    impacts: [],
    stop: {
      title: 'Janmashtami at Shrinathji Temple, Nathdwara',
      place: 'Shrinathji Temple, Nathdwara',
      time: '07:00 PM',
      tag: 'Culture',
      fixedTime: true,
      notes: 'Krishna’s birth at midnight at Nathdwara, 48 km from Udaipur: the jagran darshan in the evening, the hush, then conch and gong. Phones, socks and shoes go in the lockers. It is a late night, so book the ride back first.',
      care: 'Book the late ride back first, store phones and shoes in the lockers and keep silent when the temple does.',
    },
    sources: [
      { title: 'Drik Panchang: Krishna Janmashtami 2027', url: 'https://www.drikpanchang.com/dashavatara/lord-krishna/krishna-janmashtami-date-time.html?year=2027' },
      { title: 'Pushtimarg.net: Janmashtami at Shrinathji, Nathdwara', url: 'https://pushti-marg.net/Janmastami.htm' },
      { title: 'Nathdwara temple notice: Janmashtami darshan', url: 'https://www.nathdwaratemple.org/News/Darshan_Time_Shri_Krishna_Janmashthami_Mahotsav_on_25.08.2016/2016-08-25' },
      { title: 'Wikipedia: Nathdwara', url: 'https://en.wikipedia.org/wiki/Nathdwara' },
    ],
  },
  {
    id: 'gavri',
    name: 'Gavri, the Bhil dance-drama season',
    nameHi: 'गवरी',
    phrase: 'Gavri season',
    kind: 'ritual',
    occurrences: [
      {
        from: '2027-08-18',
        to: '2027-09-26',
        basis: 'Rajasthan Tourism: Gavri starts the day after Raksha Bandhan (Tue 17 Aug 2027, Drik Panchang) and runs 40 days; its 2026 listing is 29 Aug–7 Oct',
      },
    ],
    time: { label: 'Afternoon and evening, a different village each day', from: h(15), to: h(19) },
    places: [{ name: 'Bhil villages around Udaipur' }],
    significance:
      'Gavri is a forty-day ritual dance-drama of the Bhil community, performed after the monsoon sowing in honour of Gauri and Shiva. Troupes of men play every role, men and women, and travel from village to village, acting out myths and village stories in the open air to drums and song. A village welcomes the troupe only once in three or four years, so seeing one is a privilege.',
    join: {
      etiquette: [
        'It is a ritual before it is a show. Go only through a local guide or host who knows the village, and ask permission first.',
        'Watch from the edge of the circle. Do not walk into it, and keep your phone and flash down during the trance scenes.',
        'Do not treat the performers as props. A gift to the troupe, given through your host, is welcome.',
        'The performers keep strict rules for forty days, so do not offer food unasked.',
      ],
      dress: 'Modest, muted clothes and shoes you can slip off. Cover your head against the sun.',
      photography: 'Ask the troupe and the village first. Do not photograph the trance and ritual scenes.',
    },
    tips: [
      'Ask your hotel or a local guide which village is hosting a day ahead: the schedule is set village by village.',
      'Plan a half day. Village roads are slow in the monsoon.',
    ],
    tripTip: 'Your {day} falls in Gavri season, when Bhil troupes perform in villages around Udaipur. Ask a local guide to take you to one that is welcoming guests.',
    intensity: 'quiet',
    crowdNote: 'Village settings with small crowds. The care is in how you join, not in queues.',
    impacts: [],
    stop: {
      title: 'Gavri dance-drama in a Bhil village',
      place: 'Village near Udaipur (ask your host)',
      time: '03:00 PM',
      tag: 'Culture',
      fixedTime: false,
      notes: 'Gavri, the Bhil community’s forty-day ritual dance-drama. Go with a local guide who knows the village, ask permission first, watch from the edge, and keep phones down during the trance scenes.',
      care: 'Go with a local guide, ask permission and watch from the edge of the circle.',
    },
    sources: [
      { title: 'Incredible India: Gavri', url: 'https://www.incredibleindia.gov.in/en/festivals-and-events/rajasthan/gavri' },
      { title: 'Drik Panchang: Raksha Bandhan 2027', url: 'https://www.drikpanchang.com/festivals/raksha-bandhan/raksha-bandhan-date-time.html' },
    ],
  },
  {
    id: 'dharohar-show',
    name: 'Dharohar folk dance show',
    nameHi: 'धरोहर लोक नृत्य',
    phrase: 'the Dharohar show',
    kind: 'performance',
    occurrences: [],
    recurring: 'daily',
    time: { label: '7:00–8:00 PM every evening', from: h(19), to: h(20) },
    places: [{ name: 'Bagore ki Haveli, Gangaur Ghat', siteId: 'bagore-ki-haveli' }],
    price: 'Roughly ₹90–125 for an Indian adult (listings differ), more for foreign visitors, plus a camera fee. Pay at the counter.',
    significance:
      'An hour of Rajasthani folk dance and music in the courtyard of Bagore ki Haveli, the 18th-century mansion of Mewar’s prime minister Amar Chand Badwa, now a museum run by the West Zone Cultural Centre. It is the easiest way for a squad to meet living Rajasthani culture in an evening.',
    join: {
      etiquette: [
        'Seats are unreserved and tickets go on sale at the counter from about 6 PM. Send one of you ahead to queue.',
        'Show tickets are separate from the museum ticket.',
        'Keep phones silent and stay seated until the finale. Applaud generously.',
      ],
      dress: 'Comfortable clothes. The courtyard is open to the sky, so carry a light jacket in winter.',
      photography: 'Allowed with a camera ticket. No flash, and no standing up in front of others.',
    },
    tips: [
      'Full houses are normal at 7 PM: be at the counter by 6 PM for the front rows.',
      'The puppet show at Bhartiya Lok Kala Mandal is a calmer alternative the same evening.',
      'Walk over from Gangaur Ghat after sunset; the lanes are lovely lit up.',
    ],
    intensity: 'busy',
    crowdNote: 'Sells out most evenings. Queue from about 6 PM for a good seat.',
    impacts: [],
    stop: {
      title: 'Dharohar folk dance show',
      place: 'Bagore ki Haveli, Gangaur Ghat',
      time: '07:00 PM',
      tag: 'Culture',
      fixedTime: true,
      notes: 'An hour of Rajasthani folk dance and music in the haveli courtyard, 7:00–8:00 PM. Tickets go on sale from about 6 PM and seats are unreserved, so send one of the squad ahead to queue. Show tickets are separate from the museum; camera fee extra.',
      care: 'Tickets go on sale from about 6 PM and seats are unreserved: send one of you ahead to queue.',
    },
    sources: [
      { title: 'Bagore ki Haveli: Dharohar show timings and tickets (Oct 2025)', url: 'https://tejofy.blogspot.com/2025/10/bagore-ki-haveli-udaipur-ticket-price.html' },
      { title: 'Bagore ki Haveli guide (Sept 2026)', url: 'https://www.topindianholidays.com/blog/bagore-ki-haveli-udaipur' },
      { title: 'Bagore ki Haveli: managed by the West Zone Cultural Centre', url: 'https://sites.google.com/view/bagorekihaveli/home' },
    ],
  },
  {
    id: 'puppet-show',
    name: 'Kathputli puppet show',
    nameHi: 'कठपुतली शो',
    phrase: 'the puppet show',
    kind: 'performance',
    occurrences: [],
    recurring: 'daily',
    time: { label: 'Shows at 12 noon, 6 PM and 7:15 PM', from: h(18), to: h(19, 15) },
    places: [{ name: 'Bhartiya Lok Kala Mandal', siteId: 'lok-kala-mandal' }],
    price: 'Roughly ₹120–170 for an Indian adult (listings differ). The museum ticket is separate.',
    significance:
      'Since 1952 the Bhartiya Lok Kala Mandal has kept Rajasthani puppetry and folk art alive. Its daily kathputli show brings string puppets, folk songs and a dance act to the stage. Kathputli is the string-puppet craft of the Nat and Bhat communities.',
    join: {
      etiquette: [
        'Tip the puppeteers directly: it is their living.',
        'Sit near the front: the puppets are small and children love them.',
        'Keep phones silent and the camera flash off.',
      ],
      dress: 'Comfortable clothes. The hall is indoors.',
      photography: 'Allowed in the hall without flash; ask the puppeteers before close-ups.',
    },
    tips: [
      'A calmer evening than the Dharohar show, and it suits younger children.',
      'Visit the museum of folk art, masks and puppets earlier in the day.',
    ],
    intensity: 'moderate',
    crowdNote: 'A calmer evening than the Dharohar show: arrive a few minutes early for a front seat.',
    impacts: [],
    stop: {
      title: 'Kathputli puppet show',
      place: 'Bhartiya Lok Kala Mandal, Udaipur',
      time: '06:00 PM',
      tag: 'Culture',
      fixedTime: true,
      notes: 'The daily string-puppet show at Bhartiya Lok Kala Mandal, which has kept Rajasthani puppetry alive since 1952. Shows run at 12 noon, 6 PM and 7:15 PM. Tip the puppeteers directly and keep flash off.',
      care: 'Tip the puppeteers directly and keep the flash off.',
    },
    sources: [
      { title: 'West Zone Cultural Centre: puppetry at Bhartiya Lok Kala Mandal', url: 'https://wzcc.nvli.in/puppetry-bharatiya-lok-kala-mandal-udaipur' },
      { title: 'Trawell: Bharatiya Lok Kala Mandal timings and fees', url: 'https://trawell.in/rajasthan/udaipur/bharatiya-lok-kala-mandal-museum' },
    ],
  },
];

export const EVENT_BY_ID = new Map(EVENTS.map(e => [e.id, e]));
