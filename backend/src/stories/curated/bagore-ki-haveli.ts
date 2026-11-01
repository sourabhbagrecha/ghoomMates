import type { CuratedSite } from '../types.ts';
import { artPaths } from './art.ts';

// Sources: Wikipedia (Bagore Ki Haveli) and visitor guides for the Dharohar evening show. Room counts differ between
// sources (about 130 to 138), so the story says "more than a hundred".
export const bagoreKiHaveli: CuratedSite = {
  siteId: 'bagore-ki-haveli',
  art: artPaths('bagore-ki-haveli'),
  en: {
    title: 'The Prime Minister’s House by the Ghat',
    panels: [
      {
        heading: 'A minister’s home',
        text: 'Khamma ghani! Between about 1751 and 1778, Amar Chand Badwa, Mewar’s prime minister, built this haveli right at Gangaur Ghat. He served four Maharanas in a row, and his house grew to more than a hundred rooms, with courtyards, balconies and terraces looking out over Lake Pichola.',
        lookFor: 'Stand on Gangaur Ghat and look up at the haveli’s balconies facing the lake.',
      },
      {
        heading: 'Glass, mirrors and peacocks',
        text: 'Walk inside and the walls sparkle. The royal ladies’ chambers glow with mirror work and old Mewari wall paintings, and coloured-glass windows throw jewel-bright light across the floor. Two peacocks, made of tiny pieces of coloured glass, preen in a quiet corner.',
        lookFor: 'Find the glass-mosaic peacocks, and watch the coloured light move on the floor.',
      },
      {
        heading: 'Saved from silence',
        text: 'After 1947 the state government used the haveli for its staff, and then it stood neglected for almost forty years. In 1986 it was handed to the West Zone Cultural Centre, whose craftspeople restored it with lime mortar and local skills. Today it is a museum of Mewar’s royal life.',
        lookFor: 'In the museum rooms, hunt for small treasures: dice games, hookahs and rosewater sprinklers.',
      },
      {
        heading: 'Dharohar at dusk',
        text: 'Every evening the courtyard fills with folk dance and music. Ghoomar dancers spin in swirling skirts, and Terah Taali performers play thirteen cymbals tied to their bodies. Dharohar means heritage, and tonight it is alive. Queue by quarter past six, because the best seats go early.',
        lookFor: 'Watch a Ghoomar skirt swirl, and count the cymbals in the Terah Taali dance.',
      },
    ],
    quiz: [
      { question: 'Who built Bagore ki Haveli?', options: ['Amar Chand Badwa, Mewar’s prime minister', 'A British officer', 'A Mughal governor'], answerIndex: 0, fact: 'He served four Maharanas, and the haveli was built between about 1751 and 1778.' },
      { question: 'How was the haveli saved from neglect?', options: ['It was moved stone by stone', 'It was turned into a fort', 'It was restored as a museum'], answerIndex: 2, fact: 'The West Zone Cultural Centre restored it in the 1980s.' },
      { question: 'What does “Dharohar” mean?', options: ['Moonlight', 'Heritage', 'Courtyard'], answerIndex: 1, fact: 'Dharohar means heritage, and it is the name of the evening show.' },
    ],
    careNote: 'The evening show sells out: queue by 6:15 PM or see the haveli’s rooms by day instead.',
  },
  hi: {
    title: 'घाट किनारे प्रधानमंत्री की हवेली',
    panels: [
      {
        heading: 'मंत्री का घर',
        text: 'खम्मा घणी! सन् 1751 से 1778 के बीच मेवाड़ के प्रधानमंत्री अमर चंद बड़वा ने गणगौर घाट पर यह हवेली बनवाई। वे लगातार चार महाराणाओं की सेवा में रहे। उनका घर सौ से भी ज़्यादा कमरों वाला हुआ, जिसके आँगन, झरोखे और छतें पिछोला झील की ओर खुलती हैं।',
        lookFor: 'गणगौर घाट पर खड़े होकर झील की ओर खुलते हवेली के झरोखे देखिए।',
      },
      {
        heading: 'काँच, शीशे और मोर',
        text: 'भीतर जाइए तो दीवारें जगमगाती हैं। शाही स्त्रियों के कक्ष शीशे के काम और पुराने मेवाड़ी भित्ति-चित्रों से दमकते हैं, और रंगीन काँच की खिड़कियाँ फ़र्श पर रत्न जैसी रोशनी बिखेरती हैं। एक शांत कोने में रंगीन काँच के छोटे टुकड़ों से बने दो मोर इठलाते हैं।',
        lookFor: 'काँच की मोज़ेक वाले मोर ढूँढिए, और फ़र्श पर रंगीन रोशनी की चाल देखिए।',
      },
      {
        heading: 'ख़ामोशी से बचाई गई',
        text: 'सन् 1947 के बाद राज्य सरकार ने हवेली अपने कर्मचारियों के काम में ली, फिर लगभग चालीस साल यह उपेक्षित पड़ी रही। सन् 1986 में इसे पश्चिम क्षेत्र सांस्कृतिक केंद्र को सौंपा गया, जिसके कारीगरों ने चूने के गारे और स्थानीय हुनर से इसे सँवारा। आज यह मेवाड़ के शाही जीवन का संग्रहालय है।',
        lookFor: 'संग्रहालय के कमरों में छोटी-छोटी निधियाँ ढूँढिए: चौसर, हुक़्क़े और गुलाबदान।',
      },
      {
        heading: 'शाम की धरोहर',
        text: 'हर शाम आँगन लोक नृत्य और संगीत से भर जाता है। घूमर करती नर्तकियाँ घेरदार घाघरों में घूमती हैं, और तेरहताली में कलाकार शरीर पर बँधे तेरह मंजीरों से ताल देते हैं। धरोहर का मतलब है विरासत, और आज शाम वह जीती-जागती है। सवा छह बजे तक कतार में लगिए, अच्छी जगहें जल्दी भर जाती हैं।',
        lookFor: 'घूमर का घेरदार घाघरा घूमते देखिए, और तेरहताली में मंजीरों की गिनती कीजिए।',
      },
    ],
    quiz: [
      { question: 'बागोर की हवेली किसने बनवाई?', options: ['अमर चंद बड़वा, मेवाड़ के प्रधानमंत्री', 'एक अंग्रेज़ अफ़सर', 'एक मुग़ल सूबेदार'], answerIndex: 0, fact: 'वे चार महाराणाओं की सेवा में रहे; हवेली सन् 1751 से 1778 के बीच बनी।' },
      { question: 'हवेली को उपेक्षा से कैसे बचाया गया?', options: ['उसे पत्थर-पत्थर करके दूसरी जगह ले जाया गया', 'उसे क़िले में बदल दिया गया', 'संग्रहालय के रूप में सँवारा गया'], answerIndex: 2, fact: '1980 के दशक में पश्चिम क्षेत्र सांस्कृतिक केंद्र ने उसे सँवारा।' },
      { question: '“धरोहर” का क्या मतलब है?', options: ['चाँदनी', 'विरासत', 'आँगन'], answerIndex: 1, fact: 'धरोहर का मतलब विरासत, और यही शाम के शो का नाम है।' },
    ],
    careNote: 'शाम का शो भर जाता है: 6:15 बजे तक कतार में लगें, या हवेली के कमरे दिन में देख लें।',
  },
};
