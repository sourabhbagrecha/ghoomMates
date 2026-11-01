import type { CuratedSite } from '../types.ts';
import { artPaths } from './art.ts';

// Sources: Wikipedia (Monsoon Palace) and Rajasthan tourism guides. Work began in 1883 or 1884 depending on the source,
// so the story says "the 1880s". The Chittorgarh wish is legend.
export const sajjangarh: CuratedSite = {
  siteId: 'sajjangarh',
  art: artPaths('sajjangarh'),
  en: {
    title: 'The Palace That Waits for Rain',
    panels: [
      {
        heading: 'Built for clouds',
        text: 'Khamma ghani! High on Bansdara peak, nearly a kilometre above sea level, Maharana Sajjan Singh began a palace in the 1880s, chiefly to watch the monsoon clouds roll in over the Aravallis. That is why it is called the Monsoon Palace. It is built of white marble, and at sunset it glows gold.',
        lookFor: 'Look at the white marble pillars carved with leaves and flowers.',
      },
      {
        heading: 'A Maharana who died too soon',
        text: 'Sajjan Singh died young, in 1884, and his dream was still unfinished. His successor, Maharana Fateh Singh, carried the work on. Later, the royal family used the hilltop as a hunting lodge, and its terraces became a place to watch clouds, hills and the glittering lakes below.',
        lookFor: 'From the terrace, trace the lakes below: Pichola, and beyond it Fateh Sagar.',
      },
      {
        heading: 'The view of Chittor',
        text: 'Legend says the Maharana climbed here to look for his ancestors’ great fort at Chittorgarh. Even from this height, it is far too distant to see. But a king’s heart can see farther than his eyes, and from this terrace the whole city of lakes lies spread out like a painted map.',
        lookFor: 'Find the City Palace far below, small as a toy beside Lake Pichola.',
      },
      {
        heading: 'Sunset and Bond',
        text: 'Around the palace lies Sajjangarh Wildlife Sanctuary, set up in 1987, so keep voices low and eyes open. In 1983 the palace played the villain Kamal Khan’s home in the James Bond film Octopussy. Come for the golden hour, and share one cab: the hill road is narrow.',
        lookFor: 'Face the sunset and watch the lakes below turn from silver to gold.',
      },
    ],
    quiz: [
      { question: 'Why was the Monsoon Palace built?', options: ['To store grain', 'To guard the lakes', 'To watch the monsoon clouds'], answerIndex: 2, fact: 'Chiefly to watch the monsoon clouds roll in over the Aravallis.' },
      { question: 'Which 1983 James Bond film used it as a villain’s home?', options: ['Goldfinger', 'Octopussy', 'Skyfall'], answerIndex: 1, fact: 'Octopussy, filmed in 1983.' },
      { question: 'What does legend say Maharana Sajjan Singh hoped to see from here?', options: ['The sea', 'The Taj Mahal', 'His ancestors’ fort at Chittorgarh'], answerIndex: 2, fact: 'Legend says he longed to see Chittorgarh.' },
    ],
    careNote: 'Share one cab for the squad: the single hill road jams with cars at sunset.',
  },
  hi: {
    title: 'बरसात की राह देखता महल',
    panels: [
      {
        heading: 'बादलों के लिए बना',
        text: 'खम्मा घणी! बांसदरा की चोटी पर, समुद्र तल से लगभग एक किलोमीटर ऊपर, महाराणा सज्जन सिंह ने सन् 1880 के दशक में यह महल बनवाना शुरू किया, मुख्य रूप से अरावली पर उमड़ते मानसूनी बादल देखने के लिए। इसी से इसका नाम मानसून पैलेस पड़ा। सफ़ेद संगमरमर का यह महल सूरज ढलते समय सुनहरा हो उठता है।',
        lookFor: 'पत्तों और फूलों की नक़्क़ाशी वाले सफ़ेद संगमरमर के खंभे देखिए।',
      },
      {
        heading: 'जो महाराणा जल्दी चले गए',
        text: 'सज्जन सिंह कम उम्र में, सन् 1884 में, चल बसे, और उनका सपना अधूरा रह गया। उनके उत्तराधिकारी महाराणा फतह सिंह ने काम आगे बढ़ाया। बाद में राजपरिवार इस पहाड़ी को शिकार-गृह की तरह भी इस्तेमाल करता रहा, और इसकी छतें बादल, पहाड़ियाँ और नीचे की चमकती झीलें देखने की जगह बन गईं।',
        lookFor: 'छत से नीचे की झीलें पहचानिए: पिछोला, और उसके पार फतह सागर।',
      },
      {
        heading: 'चित्तौड़ की ओर नज़र',
        text: 'कहा जाता है कि महाराणा यहाँ अपने पुरखों के विशाल चित्तौड़गढ़ क़िले को देखने चढ़े थे। इस ऊँचाई से भी वह बहुत दूर है, दिखता नहीं। पर राजा का मन आँखों से ज़्यादा दूर देख लेता है, और इस छत से झीलों का पूरा शहर किसी चित्रित नक़्शे-सा बिछा दिखता है।',
        lookFor: 'नीचे दूर, झील पिछोला के किनारे खिलौने जैसा छोटा सिटी पैलेस ढूँढिए।',
      },
      {
        heading: 'सूर्यास्त और बॉन्ड',
        text: 'महल के चारों ओर सज्जनगढ़ वन्यजीव अभयारण्य है, जो सन् 1987 में बना, इसलिए आवाज़ धीमी रखिए और आँखें खुली। सन् 1983 की जेम्स बॉन्ड फ़िल्म ऑक्टोपसी में यही महल खलनायक कमाल ख़ान का घर बना था। सुनहरे पहर में आइए, और पूरी टोली एक ही टैक्सी में आइए: पहाड़ी की सड़क सँकरी है।',
        lookFor: 'सूरज की ओर मुँह कीजिए और देखिए कि नीचे झीलें चाँदी से सोना कैसे बनती हैं।',
      },
    ],
    quiz: [
      { question: 'मानसून पैलेस क्यों बनवाया गया?', options: ['अनाज रखने के लिए', 'झीलों की रखवाली के लिए', 'मानसूनी बादल देखने के लिए'], answerIndex: 2, fact: 'मुख्य रूप से अरावली पर उमड़ते बादल देखने के लिए।' },
      { question: 'सन् 1983 की किस जेम्स बॉन्ड फ़िल्म में यह खलनायक का घर बना?', options: ['गोल्डफ़िंगर', 'ऑक्टोपसी', 'स्काईफ़ॉल'], answerIndex: 1, fact: 'ऑक्टोपसी, सन् 1983 की फ़िल्म।' },
      { question: 'किंवदंती के अनुसार महाराणा यहाँ से क्या देखना चाहते थे?', options: ['समुद्र', 'ताजमहल', 'पुरखों का चित्तौड़गढ़ क़िला'], answerIndex: 2, fact: 'कहा जाता है, उन्हें चित्तौड़गढ़ देखने की चाह थी।' },
    ],
    careNote: 'पूरी टोली एक टैक्सी में आइए: पहाड़ी की इकलौती सड़क सूर्यास्त पर गाड़ियों से जाम हो जाती है।',
  },
};
