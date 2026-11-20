// One real cover photo per destination guide (backend/src/places), hotlinked from Wikimedia Commons with its credit.
// Shown on the create-trip destination cards, trip covers and profile places, and listed on the credits screen.
import { EXPERIENCE_PHOTOS, photo, thumb, type ExperiencePhoto } from '../pages/Explore/experiencePhotos'

export const DESTINATION_PHOTOS: Record<string, ExperiencePhoto> = {
  chettinad: photo(thumb('d/d0/The_Chettinad_palace_karaikudi_2013-09-07_00-11.jpg'), 'Chettinad Palace, a white merchant mansion in Kanadukathan', 'Karthick jack', 'CC BY-SA 3.0', 28105500),
  orchha: photo(thumb('4/48/Chaturbhuj_Temple%2C_Orchha.jpg'), 'The spires of Chaturbhuj Temple rising over Orchha', 'Yann', 'CC BY-SA 4.0', 16333561),
  majuli: photo(thumb('c/cb/Doriya_River_of_Majuli.jpg'), 'A boat on a quiet river channel on Majuli island', 'Dhrubazaan Photography', 'CC BY-SA 4.0', 49289670),
  hampi: photo(thumb('d/dd/Wide_angle_of_Galigopuram_of_Virupaksha_Temple%2C_Hampi_%2804%29_%28cropped%29.jpg'), 'Virupaksha Temple tower among the Hampi ruins', 'iMahesh', 'CC BY-SA 4.0', 164320563),
  udaipur: EXPERIENCE_PHOTOS.pichola[0],
  varanasi: photo(thumb('7/76/DASHASHWAMEDH_GHAT%2C_VARANASI.jpg'), 'Boats moored at Dashashwamedh Ghat, Varanasi', 'Sulagna Halder', 'CC BY-SA 4.0', 94025705),
  agra: photo(thumb('1/1d/Taj_Mahal_%28Edited%29.jpeg'), 'The Taj Mahal from its gardens', 'Yann, edited by Jim Carter', 'CC BY-SA 4.0', 36310839),
  tawang: photo(thumb('b/b3/Tawang_Monastery%2C_Arunachal_Pradesh.jpg'), 'Painted hall of Tawang Monastery', 'J P Dutt', 'CC BY-SA 4.0', 123452027),
  gurez: photo(thumb('7/76/Habba_Khatoon.jpg'), 'Habba Khatoon peak above the Kishanganga in Gurez', 'Zahid samoon', 'CC BY 3.0', 8561766),
  'chopta-tungnath': photo(thumb('f/fc/Tungnath_temple.jpg'), 'The stone Tungnath temple below rocky peaks', 'Varun Shiv Kapur', 'CC BY 2.0', 6853724),
  'spiti-valley': photo(thumb('4/49/1000_Year_loop.jpg'), 'Key Monastery on its hill above the Spiti river', 'Pranav perspective', 'CC BY-SA 4.0', 72700213),
  'kullu-manali': photo(thumb('f/f1/Solang_Valley_%2CManali%2C_Himachal_Pardes%2C_India.JPG'), 'Snow peaks over the meadows of Solang Valley, Manali', 'Harvinder Chandigarh', 'CC BY-SA 4.0', 42114457),
  'leh-ladakh': photo(thumb('8/81/Pangong_Tso_Lake_1.jpg'), 'Blue Pangong Tso under bare Ladakh mountains', 'Neek-Theri', 'CC BY-SA 4.0', 138684871),
  rishikesh: photo(thumb('7/74/Trayambakeshwar_Temple_VK.jpg'), 'The tiered Trayambakeshwar temple by Lakshman Jhula, Rishikesh', 'VK1983', 'CC BY-SA 4.0', 123554764),
  'dzukou-valley': photo(thumb('4/44/Breathtaking_beauty_of_Dzukou_Valley_in_Manipur-Nagaland_border_%28edit%29.jpg'), 'Rolling green hills of Dzükou Valley', 'Samudra Bikash Hazarika, edited by UnpetitproleX', 'CC BY-SA 4.0', 167262514),
  'ziro-valley': photo(thumb('1/1e/A_cross_section_of_luch_green_valley_of_Ziro.jpg'), 'Green paddies and a village below forested hills in Ziro', 'Arunachal2007', 'CC BY-SA 4.0', 94462528),
  gandikota: photo(thumb('a/a7/Indian_Grand_Canyon_Sudhakar_Bichali.jpg'), 'The Penna river winding through the Gandikota gorge', 'Sudhakarbichali', 'CC BY-SA 4.0', 49809035),
  meghalaya: photo(thumb('5/51/Living_root_bridges%2C_Nongriat_village%2C_Meghalaya2.jpg'), 'Living root bridges over a stream at Nongriat', 'Arshiya Urveeja Bose', 'CC BY 2.0', 17238490),
  'rann-of-kutch': photo(thumb('0/01/White_salt_desert_at_Rann_of_Kutch.jpg'), 'The white salt desert of the Great Rann of Kutch', 'Prof Ranga Sai', 'CC BY-SA 4.0', 127686727),
  jaisalmer: photo(thumb('4/47/Jaisalmer_forteresse.jpg'), 'Jaisalmer Fort’s golden walls above the old city', 'Gérard Janot', 'CC BY-SA 3.0', 474831),
  lakshadweep: photo(thumb('5/58/Lakshadweep_-_Agatti_Islands.jpg'), 'Palms over the turquoise lagoon at Agatti, Lakshadweep', 'Asssagar', 'CC BY-SA 4.0', 59924868),
  gokarna: photo(thumb('8/8c/Kudle_beach_gokarna.jpg'), 'The curve of Kudle Beach, Gokarna, from the cliff path', 'Happyshopper', 'CC BY 2.5', 6449540),
  goa: photo(thumb('9/9c/Palolem_Beach%2C_South_Goa.jpg'), 'Palms and shacks along Palolem Beach, South Goa', 'iMahesh', 'CC BY-SA 4.0', 151673985),
  satpura: photo(thumb('4/4e/Amazing_Landscape_%40Satpura_Tiger_Reserve.jpg'), 'Hills and backwaters in Satpura Tiger Reserve', 'BSSKrishnaS', 'CC BY-SA 4.0', 49304692),
  kaziranga: photo(thumb('f/fe/Beauty_of_Kaziranga_National_Park.jpg'), 'A one-horned rhino in the grassland at Kaziranga', 'Diganta Talukdar', 'CC BY-SA 4.0', 60799652),
}
