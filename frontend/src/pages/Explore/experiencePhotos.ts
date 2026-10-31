// Real Goa and Udaipur photos for the seeded guide experiences, hotlinked from Wikimedia Commons.
// Every photo is CC0, public domain or CC BY / BY-SA, so the credit and license travel with it
// and are shown on the experience screen.

export type ExperiencePhoto = {
  src: string
  alt: string
  credit: string
  license: string
  /** Commons file page, for attribution */
  source: string
}

const THUMB = 'https://thumb.wikimedia.org/wikipedia/commons/thumb/'
const ORIGINAL = 'https://upload.wikimedia.org/wikipedia/commons/'

/** `path` is the Commons hash path + file name, e.g. "d/db/Dudhsagar_falls.jpg" */
const thumb = (path: string) => `${THUMB}${path}/960px-${path.split('/').pop()}`
const original = (path: string) => `${ORIGINAL}${path}`

const photo = (src: string, alt: string, credit: string, license: string, curid: number): ExperiencePhoto => ({
  src,
  alt,
  credit,
  license,
  source: `https://commons.wikimedia.org/w/index.php?curid=${curid}`,
})

export const EXPERIENCE_PHOTOS = {
  dudhsagar: [
    photo(thumb('d/db/Dudhsagar_falls_%284266264965%29.jpg'), 'Dudhsagar falls pouring down a green cliff', 'Soumyajit Pramanick', 'CC BY-SA 2.0', 40016715),
    photo(original('a/a2/Dudhsagar_falls_from_train.jpg'), 'Dudhsagar falls seen across the valley', 'Shrijesh Kurup', 'CC BY 3.0', 13887174),
    photo(thumb('7/7f/Dudhsagar_Falls_walk%2C_Goa_vrvbgoa2k24_%2824%29.jpg'), 'Forest trail on the walk to Dudhsagar', 'Vinayaraj', 'CC BY-SA 4.0', 146763627),
    photo(thumb('7/71/Sahakari_Spice_Farm_%2817311576579%29.jpg'), 'Elephant at Sahakari spice farm', 'Ashwin Kumar', 'CC BY-SA 2.0', 52538727),
    photo(thumb('d/dc/Goan_Thali.jpg'), 'Goan thali with rice, curries and sides', 'MayWrite', 'CC0', 183276526),
  ],
  fontainhas: [
    photo(thumb('d/d8/Streets_of_Fontainhas%2C_Panaji_%2803%29.jpg'), 'Colourful Portuguese houses lining a Fontainhas street', 'iMahesh', 'CC BY-SA 4.0', 152121625),
    photo(thumb('7/7e/A_house_on_the_streets_of_Fontainhas%2C_Panaji_%2805%29.jpg'), 'Blue and white heritage house in Fontainhas', 'iMahesh', 'CC BY-SA 4.0', 152121675),
    photo(thumb('4/45/Pedestrian_paths_inbetween_houses_in_Fontainhas%2C_Panaji_%2801%29.jpg'), 'Narrow lane between houses in Fontainhas', 'iMahesh', 'CC BY-SA 4.0', 152121432),
    photo(thumb('b/be/Panjim%2C_Goa_and_its_Latin_Quarter._December_2022._06.jpg'), 'Street in Panjim’s Latin Quarter', 'FrancesGoa', 'CC BY-SA 4.0', 126865932),
  ],
  fishCurry: [
    photo(thumb('4/44/Goan_Mackerel_Fish_Curry_Plate.jpg'), 'Mackerel fish curry with rice', 'goanfishcurryrice2', 'CC BY-SA 2.0', 81578993),
    photo(thumb('b/bb/Goan_typical_meal_--_fish%2C_curry_and_rice.jpg'), 'Goan fish, curry and rice meal', 'Frederick Noronha', 'CC BY-SA 4.0', 104829522),
    photo(thumb('b/b4/Goan_Fish_Thali_-_Goa_-_20221204_134740.jpg'), 'Goan fish thali', 'Chiring Chandan', 'CC BY-SA 4.0', 126391617),
    photo(thumb('f/f2/Spice_garden%2C_Goa.jpg'), 'Spice garden in Goa', 'Haydn Blackey', 'CC BY-SA 2.0', 9590195),
  ],
  mapusa: [
    photo(thumb('b/bb/Mapusa_Market.jpg'), 'Crowded stalls at Mapusa market', 'Aaron C', 'CC BY-SA 2.0', 7743617),
    photo(thumb('0/0f/Mapusa_market_bread_vendors_2022_03.jpg'), 'Bread vendors at Mapusa market', 'Frederick Noronha', 'CC BY-SA 4.0', 116846562),
    photo(thumb('f/f5/Mapusa_market_sweets_and_confectionary_vendors_2022_05.jpg'), 'Sweets stall at Mapusa market', 'Frederick Noronha', 'CC BY-SA 4.0', 116846570),
    photo(thumb('b/bd/Mapusa_market_bread_2022_11_The_traditional_Goan_pao.jpg'), 'Traditional Goan pao', 'Frederick Noronha', 'CC BY-SA 4.0', 116846582),
  ],
  birding: [
    photo(thumb('2/2c/Salim_Ali_Bird_Sanctuary%2C_Goa.jpg'), 'Mangroves at Salim Ali Bird Sanctuary', 'Gannu03', 'CC BY-SA 4.0', 150006101),
    photo(thumb('e/ee/Black_headed_ibis_and_little_egret%2C_Salim_Ali_Bird_Sanctuary%2C_Goa.jpg'), 'Black-headed ibis and little egret in the mangroves', 'Gannu03', 'CC BY-SA 4.0', 156347775),
    photo(thumb('3/3d/Salim_ali_sanctuary_walkway.jpg'), 'Walkway through the sanctuary', 'Shyamal', 'CC0', 36425171),
    photo(thumb('c/c5/Kayaking_%2871892228%29.jpg'), 'Kayakers on a Goan river', 'Frederick Noronha', 'CC BY-SA 2.0', 75503126),
    photo(thumb('d/da/Mangrove_mudskipper.JPG'), 'Mudskipper on the mangrove mud', 'Forestowlet', 'CC0', 36640537),
  ],
  anjuna: [
    photo(thumb('1/1b/Anjuna%2C_Goa%2C_India%2C_Anjuna_Flea_Market_2.jpg'), 'Shoppers browsing at Anjuna flea market', 'Vyacheslav Argenberg', 'CC BY 4.0', 96748250),
    photo(thumb('6/64/Anjuna%2C_Goa%2C_India%2C_Anjuna_Flea_Market.jpg'), 'Stalls at Anjuna flea market', 'Vyacheslav Argenberg', 'CC BY 4.0', 96748249),
    photo(thumb('1/17/Anjuna_Flea_Market%2C_January%2C_2018-1.jpg'), 'Covered lanes of the flea market', 'Alexey Komarov', 'CC BY-SA 4.0', 75495275),
    photo(thumb('c/c6/Indian_spices_for_sale_at_the_Anjuna_flea-market%2C_Anjuna_Beach%2C_Goa.jpg'), 'Mounds of spices for sale', 'Sara Marlowe', 'CC BY 2.0', 40834274),
    photo(thumb('6/66/Anjuna_Flea_Market%2C_January%2C_2018-3.jpg'), 'Market lane near Anjuna beach', 'Alexey Komarov', 'CC BY-SA 4.0', 75495277),
  ],
  oldGoa: [
    photo(thumb('9/9e/Front_Elevation_of_Basilica_of_Bom_Jesus.jpg'), 'Basilica of Bom Jesus facade', 'iMahesh', 'CC BY-SA 4.0', 152249538),
    photo(thumb('0/0e/Old_Goa%2C_Se_Cathedral_2.jpg'), 'Se Cathedral in Old Goa', 'Vyacheslav Argenberg', 'CC BY 4.0', 101265562),
    photo(thumb('6/69/Old_Goa%2C_Interiors_of_Se_Cathedral.jpg'), 'Inside Se Cathedral', 'Vyacheslav Argenberg', 'CC BY 4.0', 101265561),
    photo(thumb('b/b7/Pathway_to_Basilica_of_Bom_Jesus.jpg'), 'Pathway to the Basilica of Bom Jesus', 'iMahesh', 'CC BY-SA 4.0', 152249540),
    photo(thumb('4/4a/Basilica_of_Bom_Jesus%2C_Old_Goa_%28ca._1870%29.jpg'), 'Basilica of Bom Jesus around 1870', 'D’Souza and Paul Studio', 'Public domain', 181379391),
  ],
  arambol: [
    photo(thumb('e/e3/Arambol%2C_Goa%2C_Arambol_live_art_gathering_at_sunset.jpg'), 'Crowd gathered on Arambol beach at sunset', 'Vyacheslav Argenberg', 'CC BY 4.0', 95252838),
    photo(thumb('f/f0/Arambol%2C_Goa%2C_Live_performance_on_the_beach.jpg'), 'Live performance on Arambol beach', 'Vyacheslav Argenberg', 'CC BY 4.0', 95252831),
    photo(thumb('f/fd/Arambol%2C_Goa%2C_Arambol_Beach_late_at_night%2C_music_and_dance%2C_deep_twilight.jpg'), 'Music and dance on the beach at twilight', 'Vyacheslav Argenberg', 'CC BY 4.0', 95252832),
    photo(thumb('8/8f/Arambol%2C_Goa%2C_Art_performer_at_sunset.jpg'), 'Performer silhouetted against the sunset', 'Vyacheslav Argenberg', 'CC BY 4.0', 95252843),
    photo(thumb('b/b5/Vagator%2C_Sunset_in_Goa%2C_India.jpg'), 'Golden sunset over the Arabian Sea', 'Vyacheslav Argenberg', 'CC BY 4.0', 122728845),
  ],
  dolphins: [
    photo(thumb('4/44/Dolphin_boating_near_goa.jpg'), 'Dolphin surfacing beside a tour boat', '4-RAZOR 01', 'CC BY-SA 4.0', 163909384),
    photo(thumb('4/4c/Aguada_Fort%2C_with_a_view_of_light_house_and_Arabian_Sea.jpg'), 'Fort Aguada lighthouse above the sea', '0kumr', 'CC0', 149812942),
    photo(thumb('9/91/Sinquerim_Beach_from_the_fort_during_Sunset.jpg'), 'Sinquerim beach from the fort at sunset', 'iMahesh', 'CC BY-SA 4.0', 151669180),
    photo(thumb('1/10/Aguada_Fort_Sea_view.jpg'), 'Sea view from Aguada fort', 'Danger54', 'CC BY-SA 4.0', 122858978),
    photo(thumb('d/d2/Goa_boat_beached.jpg'), 'Tour boats on the water', '4-RAZOR 01', 'CC BY-SA 4.0', 163909382),
  ],
  chapora: [
    photo(thumb('6/6a/Panorama_from_Chapora_Fort.jpg'), 'Panorama from the walls of Chapora fort', 'Slyronit', 'CC BY-SA 4.0', 148671473),
    photo(thumb('5/5c/Chapora_fort_25012016.jpg'), 'Chapora fort on the hill above the river', 'Nikhilb239', 'CC BY 3.0', 53462965),
    photo(thumb('2/2b/Romantic_Vagator-Chapora_Bay_after_sunset%2C_Goa%2C_India.jpg'), 'Vagator–Chapora bay after sunset', 'Vyacheslav Argenberg', 'CC BY 4.0', 95250893),
    photo(thumb('9/97/Sunset_on_Vagator_beach%2CGoa.jpg'), 'Sunset on Vagator beach', 'Saad Abdullah', 'CC BY-SA 3.0', 32272826),
    photo(thumb('a/a9/Walls_of_Fort_Chapora_26012016.jpg'), 'Laterite walls of Chapora fort', 'Nikhilb239', 'CC BY 3.0', 53611581),
  ],
  divar: [
    photo(thumb('1/1c/Temple_Tank_%28Divar_Island%29.jpg'), 'Old temple tank on Divar island', 'Nicole Cuncolim', 'CC0', 196231240),
    photo(thumb('b/bf/The_Church_of_Our_Lady_of_Compassion_is_located_in_the_village_of_Piedade%3B_in_Divar_island.jpg'), 'Church of Our Lady of Compassion, Piedade', 'Nehanaik1606', 'CC BY-SA 4.0', 62321153),
    photo(original('2/2b/Divar_caves.jpg'), 'Rock-cut caves on Divar island', 'Nagaraj Chari', 'CC BY-SA 4.0', 47003261),
    photo(thumb('a/a0/Viva_Divar_Bonderam_2013.jpg'), 'Bonderam festival parade on Divar', 'Joegoauk Goa', 'CC BY-SA 2.0', 167454392),
    photo(thumb('4/47/Baby_coconuts_laid_out_to_dry_by_the_riverside_at_Panjim_Ribandar_pier_%2852572413639%29.jpg'), 'Coconuts drying by the Ribandar ferry pier', 'Shankar S.', 'CC BY 2.0', 128253173),
  ],
  palolem: [
    photo(original('e/ed/Palolem_beach.jpg'), 'Palolem’s curved palm-lined beach', 'Satyajit Nayak', 'CC BY-SA 4.0', 45680716),
    photo(thumb('4/47/Palolem_Beach_Butterfly_Island.jpg'), 'Butterfly island off Palolem', 'Moshikiran', 'CC BY-SA 4.0', 39425174),
    photo(thumb('c/cb/Rocks_on_Palolem_Beach_South_Goa.jpg'), 'Rocks at the end of Palolem beach', 'Vachary', 'CC BY-SA 4.0', 79405119),
    photo(thumb('9/9d/Sunloungers_at_Palolem_beach.jpg'), 'Sun loungers on Palolem beach', 'Ravi Dwivedi', 'CC BY-SA 4.0', 161815085),
    photo(thumb('9/97/Palolem_beach_-_panoramio_%282%29.jpg'), 'Fishing boat on Palolem beach', 'Alexey Komarov', 'CC BY 3.0', 60391363),
  ],
  baga: [
    photo(thumb('4/4c/Glow_sticks_on_Baga_beach_at_night.jpg'), 'Glow sticks spinning on Baga beach at night', 'Slyronit', 'CC BY-SA 4.0', 148671472),
    photo(thumb('c/ca/Sunburn_Festival%2C_Goa%2C_Live_performers_in_red_light.jpg'), 'Live performers on a festival stage', 'Vyacheslav Argenberg', 'CC BY 4.0', 84809517),
    photo(thumb('7/78/Arambol%2C_Goa%2C_Live_performance_late_at_night_2.jpg'), 'Late-night live music on the beach', 'Vyacheslav Argenberg', 'CC BY 4.0', 95252834),
  ],
  feni: [
    photo(thumb('7/76/Cashew_apples_being_squashed_in_Chorao%2C_Goa%2C_India._03.JPG'), 'Cashew apples being crushed for feni', 'Frederick Noronha', 'CC BY-SA 3.0', 23808330),
    photo(thumb('7/73/Step_1_-_Cashew_fruit_being_loaded_in_the_motor_crusher_for_crushing.jpg'), 'Cashew fruit loaded into the crusher', 'Draftcraft', 'CC BY-SA 4.0', 46574287),
    photo(original('7/71/Step_2_-_Cashew_fruit_pulp_being_collected_for_juicing.jpg'), 'Cashew pulp collected for juicing', 'Draftcraft', 'CC BY-SA 4.0', 46574519),
    photo(original('b/b7/Step_4_-_Juice_from_cashew_pulp_being_collected.jpg'), 'Cashew juice running off the pulp', 'Draftcraft', 'CC BY-SA 4.0', 46574629),
    photo(original('e/ed/Step_10_-_The_first_distillate_is_called_Urrack_which_is_then_added_to_fermented_cashew_juice_in_the_subsequent_rounds_to_form_Feni.jpg'), 'Urrack, the first distillate, being collected', 'Draftcraft', 'CC BY-SA 4.0', 46574740),
  ],
  // Udaipur
  pichola: [
    photo(thumb('d/dd/Lake_Pichola_at_sunset%2C_Udaipur%2C_Rajasthan%2C_India.jpg'), 'Lake Pichola glowing at sunset', 'UnpetitproleX', 'CC BY-SA 4.0', 164134466),
    photo(thumb('4/43/Udaipur%2C_India%2C_Jag_Mandir_Palace.jpg'), 'Jag Mandir palace on its island', 'Vyacheslav Argenberg', 'CC BY 4.0', 106020407),
    photo(thumb('0/07/Taj_Lake_Palace_Udaipur_from_City_Palace.jpg'), 'Lake Palace floating on Pichola', 'Navneet Sharma', 'CC BY-SA 4.0', 99424813),
    photo(thumb('e/ec/20191207_%C5%81%C3%B3d%C5%BA_turystyczna_na_Jeziorze_Pichola_1406_7139.jpg'), 'Boat on Lake Pichola', 'Jakub Hałun', 'CC BY-SA 4.0', 89079668),
    photo(thumb('7/74/20191207_Lake_Pichola%2C_City_Palace%2C_Udaipur%2C_1516_7254.jpg'), 'City Palace rising above the lake', 'Jakub Hałun', 'CC BY-SA 4.0', 94106575),
  ],
  udaipurFood: [
    photo(thumb('d/dc/Rajasthani_Pyaz_ki_Kachori.JPG'), 'Pyaz kachori', 'Mdsmds0', 'CC BY-SA 4.0', 40921175),
    photo(thumb('b/b3/20191207_Jagdish_Temple%2C_Udaipur%2C_0608_7004.jpg'), 'Carvings at Jagdish temple', 'Jakub Hałun', 'CC BY-SA 4.0', 87781073),
    photo(original('8/8f/Rajasthani_Raj_Kachori.jpg'), 'Raj kachori chaat', 'Jaipuriamanasi', 'CC BY-SA 4.0', 103142002),
    photo(thumb('0/00/India_%28Udaipur%29_Indian_women_with_traditional_dress_in_the_bazaar_%2832122738353%29.jpg'), 'Shoppers in an Udaipur bazaar', 'Güldem Üstün', 'CC BY 2.0', 106765286),
    photo(thumb('9/92/20191206_Uliczny_grajek_w_Udajpurze_1215_6822_DxO.jpg'), 'Street musician in the old city', 'Jakub Hałun', 'CC BY-SA 4.0', 85705501),
  ],
  rajasthaniCooking: [
    photo(thumb('2/24/Rajasthani_Dal-baati-churma.jpg'), 'Dal baati churma', 'Chetana Lohar', 'CC BY-SA 4.0', 103227394),
    photo(thumb('b/b7/Rajasthani_Thali_%2826444240868%29.jpg'), 'Rajasthani thali', 'Ashwin Kumar', 'CC BY-SA 2.0', 66536557),
    photo(thumb('5/59/Rajasthani_dal-bati-churma_thali_01.jpg'), 'Dal-bati-churma thali', 'Meghana78', 'CC BY-SA 4.0', 40987945),
    photo(thumb('2/28/Rajasthani_Cuisine-_Jadi_Roti.jpg'), 'Thick Rajasthani roti', 'Kunalbafna', 'CC BY-SA 4.0', 40876427),
  ],
  miniature: [
    photo(thumb('5/53/The_Wedding_Procession_of_Rama%2C_From_the_Mewar_Ramayana.jpg'), 'Mewar Ramayana miniature of Rama’s wedding procession', 'Manohar of Mewar', 'Public domain', 125297964),
    photo(thumb('2/21/Fresco%2C_Bagore_Ki_Haveli%2C_Udaipur%2C_20191207_0650_7064.jpg'), 'Fresco at Bagore ki Haveli', 'Jakub Hałun', 'CC BY-SA 4.0', 93914048),
    photo(thumb('5/5a/Maharana_Sarup_Singh_Inspects_a_Prize_Stallion_MET_DT4984.jpg'), 'Udaipur court painting of a prize stallion', 'Tara', 'CC0', 57382304),
    photo(thumb('a/a8/Meeting_of_Rama_and_Parashurama%2C_from_the_Mewar_Ramayana.jpg'), 'Mewar Ramayana miniature', 'Manohar of Mewar', 'Public domain', 125275819),
    photo(thumb('8/87/Fresco%2C_Bagore_Ki_Haveli%2C_Udaipur%2C_20191207_0651_7067.jpg'), 'Painted wall at Bagore ki Haveli', 'Jakub Hałun', 'CC BY-SA 4.0', 93914050),
  ],
  sajjangarh: [
    photo(thumb('e/e1/Sajjangarh_Monsoon_Palace_at_dusk%2C_Udaipur%2C_Rajasthan%2C_India.jpg'), 'Sajjangarh Monsoon Palace at dusk', 'UnpetitproleX', 'CC BY-SA 4.0', 175561666),
    photo(thumb('a/a7/Fateh_Sagar_Lake%2C_Udaipur1.jpg'), 'Fateh Sagar lake and the Aravalli hills', 'WikiAnchor10', 'CC BY-SA 4.0', 137195574),
    photo(thumb('a/af/Fateh_sagar_lake_night_view.jpg'), 'Fateh Sagar lake at night', 'VikramSingh Valera', 'CC BY-SA 4.0', 113618985),
    photo(thumb('7/79/Ambrai_ghat_at_evening.jpg'), 'Ambrai ghat in the evening', 'Professor108', 'CC BY-SA 4.0', 110543770),
  ],
  dharohar: [
    photo(thumb('f/f1/Udaipur_Bagore_ki_Haveli_Front_View.jpg'), 'Bagore ki Haveli on the lakefront', 'Pallav.journo', 'CC BY-SA 4.0', 98954333),
    photo(thumb('6/66/Rajasthani_folk_dancers.jpg'), 'Rajasthani folk dancers on stage', 'Wander-earth', 'CC BY-SA 4.0', 140873715),
    photo(original('4/42/Evening_Gavari_performance_at_Udaipur%27s_Gangaur_Ghat.jpg'), 'Evening Gavari performance at Gangaur Ghat', 'W. David Kubiak', 'CC BY-SA 4.0', 61153317),
    photo(thumb('b/b5/Rajasthani_folk_dance_-04.jpg'), 'Folk dancer in a swirling ghagra', 'Rishikachauhan1', 'CC BY-SA 4.0', 162798128),
    photo(thumb('1/17/20191207_Gangaur_Ghat_and_Bagore_Ki_Haveli%2C_Udaipur_1524_7266.jpg'), 'Gangaur Ghat and Bagore ki Haveli from the lake', 'Jakub Hałun', 'CC BY-SA 4.0', 94106195),
  ],
} satisfies Record<string, ExperiencePhoto[]>
