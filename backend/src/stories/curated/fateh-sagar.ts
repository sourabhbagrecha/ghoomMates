import type { CuratedSite } from '../types.ts';
import { artPaths } from './art.ts';

// Sources: Wikipedia (Fateh Sagar Lake, Udaipur Solar Observatory) and the Heritage module's own site notes for Moti
// Magri and Neemach Mata. Original build dates differ (1678 or "the 1680s"), so the story says "the late 1600s".
export const fatehSagar: CuratedSite = {
  siteId: 'fateh-sagar',
  art: artPaths('fateh-sagar'),
  en: {
    title: 'The Lake That Was Rebuilt',
    panels: [
      {
        heading: 'A flood and a fresh start',
        text: 'Khamma ghani! Maharana Jai Singh built this lake in the late 1600s. About two hundred years later, floods washed away its earthen dam. In 1889 Maharana Fateh Singh raised a stronger one, named Connaught Bund for the visit of the Duke of Connaught, and the lake took the Maharana’s own name: Fateh Sagar.',
        lookFor: 'Walk along the Pal, the long embankment, and spot the wall that holds the lake back.',
      },
      {
        heading: 'Three islands',
        text: 'Three small islands dot the water. On the biggest, Nehru Park, a boat-shaped café floats among gardens. Another has a fountain that leaps into the air. And on the third, scientists of the Udaipur Solar Observatory have studied the Sun since 1976.',
        lookFor: 'Find the three islands. Which one has the boat-shaped café?',
      },
      {
        heading: 'Hills that watch over it',
        text: 'Hills ring the lake. On Moti Magri, the Pearl Hill, a memorial honours Maharana Pratap and his loyal horse Chetak. Above the water, the little shrine of Neemach Mata waits at the end of a twenty-minute stone path. Climb either one and the lake lies spread below you.',
        lookFor: 'Look for Moti Magri on the shore, with the Maharana Pratap memorial on top.',
      },
      {
        heading: 'Evening on the Pal',
        text: 'As the sun sinks, the Pal fills with families, roasted corn and laughter, and the hills turn violet. Sit on the wall, let the breeze cool your face and watch the lights come on across the water. Quiet tip: for the same sunset without the crowd, climb the stone path to Neemach Mata.',
        lookFor: 'Face the hills at sunset and watch them turn from gold to violet.',
      },
    ],
    quiz: [
      { question: 'What happened about 200 years after the lake was first built?', options: ['Floods washed away its earthen dam', 'A fire dried it up', 'It was moved to a new valley'], answerIndex: 0, fact: 'Floods broke the old dam, and Maharana Fateh Singh rebuilt it.' },
      { question: 'Whose name does the lake carry?', options: ['Maharana Jai Singh', 'Maharana Pratap', 'Maharana Fateh Singh'], answerIndex: 2, fact: 'It was named for Maharana Fateh Singh, who rebuilt the dam.' },
      { question: 'What do scientists study from an island in the lake?', options: ['Fish', 'The Sun', 'Birds'], answerIndex: 1, fact: 'The Udaipur Solar Observatory has studied the Sun since 1976.' },
    ],
    careNote: 'Hire a cycle at the pal instead of driving the lake road.',
  },
  hi: {
    title: 'वह झील जो दोबारा बनी',
    panels: [
      {
        heading: 'बाढ़ और नई शुरुआत',
        text: 'खम्मा घणी! महाराणा जय सिंह ने यह झील सत्रहवीं सदी के आख़िर में बनवाई। लगभग दो सौ साल बाद बाढ़ ने इसका कच्चा बाँध बहा दिया। सन् 1889 में महाराणा फतह सिंह ने मज़बूत बाँध बनवाया, जिसे ड्यूक ऑफ़ कनॉट की यात्रा की याद में कनॉट बाँध कहा गया, और झील ने महाराणा का ही नाम पाया: फतह सागर।',
        lookFor: 'पाल पर चलिए, उस लंबे तटबंध पर, और वह दीवार देखिए जो झील को थामे है।',
      },
      {
        heading: 'तीन द्वीप',
        text: 'पानी में तीन छोटे द्वीप हैं। सबसे बड़े नेहरू पार्क में बागों के बीच नाव जैसा कैफ़े है। दूसरे पर एक फ़व्वारा हवा में उछलता है। और तीसरे पर उदयपुर सौर वेधशाला के वैज्ञानिक सन् 1976 से सूरज का अध्ययन कर रहे हैं।',
        lookFor: 'तीनों द्वीप ढूँढिए। नाव जैसा कैफ़े किस पर है?',
      },
      {
        heading: 'निगरानी करती पहाड़ियाँ',
        text: 'झील को पहाड़ियों ने घेर रखा है। मोती मगरी पर, जिसे मोतियों की पहाड़ी कहते हैं, महाराणा प्रताप और उनके वफ़ादार घोड़े चेतक का स्मारक है। पानी के ऊपर नीमच माता का छोटा मंदिर बीस मिनट की पत्थर की पगडंडी के आख़िर में है। इनमें से कहीं भी चढ़िए, तो नीचे झील बिछी दिखती है।',
        lookFor: 'किनारे पर मोती मगरी देखिए, जिसके ऊपर महाराणा प्रताप का स्मारक है।',
      },
      {
        heading: 'पाल की शाम',
        text: 'सूरज ढलते ही पाल पर परिवार, भुने भुट्टे और हँसी उमड़ आती है, और पहाड़ियाँ बैंगनी हो जाती हैं। मुंडेर पर बैठिए, हवा को चेहरा छूने दीजिए और पानी के पार बत्तियाँ जलते देखिए। राज़ की बात: भीड़ के बिना वही सूर्यास्त चाहिए, तो नीमच माता की पगडंडी चढ़ जाइए।',
        lookFor: 'सूर्यास्त के समय पहाड़ियों की ओर देखिए, वे सुनहरी से बैंगनी कैसे होती हैं।',
      },
    ],
    quiz: [
      { question: 'झील बनने के लगभग दो सौ साल बाद क्या हुआ?', options: ['बाढ़ ने कच्चा बाँध बहा दिया', 'आग से झील सूख गई', 'झील दूसरी घाटी में चली गई'], answerIndex: 0, fact: 'बाढ़ में पुराना बाँध टूटा और महाराणा फतह सिंह ने उसे दोबारा बनवाया।' },
      { question: 'झील पर किसका नाम है?', options: ['महाराणा जय सिंह', 'महाराणा प्रताप', 'महाराणा फतह सिंह'], answerIndex: 2, fact: 'बाँध दोबारा बनवाने वाले महाराणा फतह सिंह के नाम पर।' },
      { question: 'झील के द्वीप से वैज्ञानिक क्या देखते हैं?', options: ['मछलियाँ', 'सूरज', 'पंछी'], answerIndex: 1, fact: 'उदयपुर सौर वेधशाला सन् 1976 से सूरज का अध्ययन कर रही है।' },
    ],
    careNote: 'झील की सड़क पर गाड़ी चलाने के बजाय पाल पर साइकिल किराये पर लीजिए।',
  },
};
