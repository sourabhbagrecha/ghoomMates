import type { CuratedSite } from '../types.ts';
import { artPaths } from './art.ts';

// Sources: Wikipedia (Lake Pichola, Jag Mandir). The Banjara builder and the Taj Mahal link are told as tradition.
export const picholaBoat: CuratedSite = {
  siteId: 'pichola-boat',
  art: artPaths('pichola-boat'),
  en: {
    title: 'The Lake That Grew a City',
    panels: [
      {
        heading: 'A trader’s lake',
        text: 'Khamma ghani! Before palaces, there was only a small lake. A Banjara grain trader is said to have built it around 1362, and it took its name from nearby Picholi village. Two centuries later, Maharana Udai Singh II widened it with a stone dam and founded Udaipur on its banks.',
        lookFor: 'Look across the water and count the islands you can see.',
      },
      {
        heading: 'The prince who hid here',
        text: 'On Jag Mandir island, a domed pavilion called Gul Mahal sheltered Prince Khurram in 1623, when he rebelled against his father, the Mughal emperor Jahangir. Khurram later became Emperor Shah Jahan. Legend says the beauty of this island palace stayed in his mind when he built the Taj Mahal.',
        lookFor: 'If you land on Jag Mandir, find the domed Gul Mahal and the stone elephants at the landing.',
      },
      {
        heading: 'A palace that floats',
        text: 'The Lake Palace on Jag Niwas island was finished in white marble in 1746 by Maharana Jagat Singh II, and it still seems to float. Jag Mandir gave shelter again in 1857, when Maharana Swaroop Singh protected European families, mostly women and children, during the revolt.',
        lookFor: 'From the boat, find the white Lake Palace and watch its reflection tremble.',
      },
      {
        heading: 'Row, don’t rush',
        text: 'Go when the light turns gold. Pick an electric boat from the jetty: it is quiet, it keeps diesel out of the water, and you can hear the ripples. Out here the City Palace glows across the lake, and the whole squad falls silent without being asked.',
        lookFor: 'Look back at the City Palace from the water and notice how it glows in the evening light.',
      },
    ],
    quiz: [
      { question: 'Who is said to have built the first lake here, around 1362?', options: ['A Mughal prince', 'A Banjara grain trader', 'A temple priest'], answerIndex: 1, fact: 'A Banjara grain trader, and the lake is named for Picholi village.' },
      { question: 'Which prince took refuge on Jag Mandir in 1623?', options: ['Prince Khurram, later Shah Jahan', 'Prince Salim', 'Prince Aurangzeb'], answerIndex: 0, fact: 'He stayed in the Gul Mahal and later became Emperor Shah Jahan.' },
      { question: 'Which monument does legend link to Jag Mandir’s beauty?', options: ['The Red Fort', 'The Qutb Minar', 'The Taj Mahal'], answerIndex: 2, fact: 'Legend says Shah Jahan remembered this palace when he built the Taj Mahal.' },
    ],
    careNote: 'Pick the electric boats from Rameshwar Ghat; they’re quiet and don’t leak diesel into the lake.',
  },
  hi: {
    title: 'वह झील जिसने शहर बसाया',
    panels: [
      {
        heading: 'बंजारे की झील',
        text: 'खम्मा घणी! महलों से पहले यहाँ बस एक छोटी-सी झील थी। कहा जाता है कि एक बंजारे अनाज-व्यापारी ने इसे सन् 1362 के आसपास बनवाया, और पास के पिछोली गाँव के नाम पर यह पिछोला कहलाई। दो सदी बाद महाराणा उदय सिंह द्वितीय ने पत्थर का बाँध बनाकर इसे बड़ा किया और इसके किनारे उदयपुर बसाया।',
        lookFor: 'पानी के पार देखिए और गिनिए कि आपको कितने द्वीप दिखते हैं।',
      },
      {
        heading: 'छिपने आया शहज़ादा',
        text: 'जग मंदिर द्वीप पर गुल महल नाम का गुंबद वाला मंडप है। सन् 1623 में जब शहज़ादा खुर्रम अपने पिता, मुग़ल बादशाह जहाँगीर, से बग़ावत करके आया, तो उसे यहीं पनाह मिली। वही खुर्रम आगे चलकर शाहजहाँ बना। कहा जाता है कि ताजमहल बनाते समय उसे इस द्वीप-महल की सुंदरता याद रही।',
        lookFor: 'जग मंदिर पर उतरें तो गुंबद वाला गुल महल और घाट पर खड़े पत्थर के हाथी ढूँढिए।',
      },
      {
        heading: 'पानी पर तैरता महल',
        text: 'जग निवास द्वीप का लेक पैलेस सफ़ेद संगमरमर में सन् 1746 में महाराणा जगत सिंह द्वितीय ने पूरा करवाया, और वह आज भी पानी पर तैरता लगता है। सन् 1857 में जग मंदिर ने फिर शरण दी, जब महाराणा स्वरूप सिंह ने विद्रोह के दौरान यूरोपीय परिवारों, ज़्यादातर औरतों और बच्चों, की रक्षा की।',
        lookFor: 'नाव से सफ़ेद लेक पैलेस को देखिए और उसकी काँपती परछाईं पर ध्यान दीजिए।',
      },
      {
        heading: 'धीरे चलिए, नाव में',
        text: 'जब रोशनी सुनहरी हो जाए, तब जाइए। घाट से बिजली वाली नाव लीजिए: वह शांत चलती है, पानी में डीज़ल नहीं छोड़ती, और आप लहरों की आवाज़ सुन पाते हैं। यहाँ से झील के पार सिटी पैलेस दमकता है, और पूरी टोली बिना कहे चुप हो जाती है।',
        lookFor: 'पानी से पीछे मुड़कर सिटी पैलेस देखिए, शाम की रोशनी में कैसा दमकता है।',
      },
    ],
    quiz: [
      { question: 'सन् 1362 के आसपास यहाँ पहली झील किसने बनवाई मानी जाती है?', options: ['एक मुग़ल शहज़ादे ने', 'एक बंजारे अनाज-व्यापारी ने', 'एक मंदिर के पुजारी ने'], answerIndex: 1, fact: 'एक बंजारे व्यापारी ने, और झील का नाम पिछोली गाँव से पड़ा।' },
      { question: 'सन् 1623 में जग मंदिर में किस शहज़ादे ने पनाह ली?', options: ['शहज़ादा खुर्रम, आगे चलकर शाहजहाँ', 'शहज़ादा सलीम', 'शहज़ादा औरंगज़ेब'], answerIndex: 0, fact: 'वह गुल महल में रहा और बाद में बादशाह शाहजहाँ बना।' },
      { question: 'किंवदंती के अनुसार जग मंदिर की सुंदरता किस इमारत से जुड़ी है?', options: ['लाल क़िला', 'कुतुब मीनार', 'ताजमहल'], answerIndex: 2, fact: 'कहा जाता है, ताजमहल बनाते समय शाहजहाँ को यह महल याद रहा।' },
    ],
    careNote: 'रामेश्वर घाट से बिजली वाली नावें लीजिए। वे शांत हैं और झील में डीज़ल नहीं छोड़तीं।',
  },
};
