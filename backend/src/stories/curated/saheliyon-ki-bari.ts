import type { CuratedSite } from '../types.ts';
import { artPaths } from './art.ts';

// Sources: Wikipedia (Saheliyon-ki-Bari) and visitor guides. The 48 companions are legend, and "no pumps" is what locals
// say about the fountains, so both are told that way.
export const saheliyonKiBari: CuratedSite = {
  siteId: 'saheliyon-ki-bari',
  art: artPaths('saheliyon-ki-bari'),
  en: {
    title: 'The Garden of the Companions',
    panels: [
      {
        heading: 'Forty-eight friends',
        text: 'Khamma ghani! Legend says a queen of Mewar arrived for her wedding with forty-eight young companions. Maharana Sangram Singh II, who ruled from 1710 to 1734, had this garden laid out for the royal ladies, a green pause from the politics of court. Saheliyon ki Bari means the garden of the friends.',
        lookFor: 'Walk the straight lanes between the lawns and imagine forty-eight friends racing down them.',
      },
      {
        heading: 'No pumps, just pressure',
        text: 'Locals will tell you the fountains need no electric pumps: they run on natural water pressure from Fateh Sagar lake next door. So when the spray leaps into the air, nothing is plugged in. It is a quiet piece of old engineering, hidden in plain sight.',
        lookFor: 'Listen for a motor near the fountains. All you will hear is water.',
      },
      {
        heading: 'Rain on demand',
        text: 'One fountain, the Sawan-Bhadon, copies the monsoon: water patters down like soft rain onto broad leaves. Nearby, four white marble elephants stand at the four directions around the lotus pool. On a hot afternoon this corner feels wonderfully cool.',
        lookFor: 'Find the four marble elephants around the lotus pool, one at each direction.',
      },
      {
        heading: 'Walk softly',
        text: 'Sit on a bench under the old trees and listen to the water. Mewar’s queens came here for exactly this: a pause from palace life. Keep coins and wrappers out of the pools, so the next visitor finds the garden as calm and clean as you did.',
        lookFor: 'Find a shady bench and stay quiet for one whole minute. What can you hear?',
      },
    ],
    quiz: [
      { question: 'How many companions does the legend say the queen brought?', options: ['Twelve', 'Forty-eight', 'One hundred'], answerIndex: 1, fact: 'Forty-eight young companions: the saheliyon of the garden’s name.' },
      { question: 'What do locals say powers the fountains?', options: ['Electric pumps', 'Steam engines', 'Natural water pressure'], answerIndex: 2, fact: 'Natural pressure from Fateh Sagar, with no pumps.' },
      { question: 'Which animals stand guard around the lotus pool?', options: ['Marble elephants', 'Stone lions', 'Brass peacocks'], answerIndex: 0, fact: 'Four white marble elephants, one at each direction.' },
    ],
    careNote: 'The fountains run on gravity from Fateh Sagar; no coins in the pools.',
  },
  hi: {
    title: 'सहेलियों की बाड़ी का किस्सा',
    panels: [
      {
        heading: 'अड़तालीस सखियाँ',
        text: 'खम्मा घणी! कहा जाता है कि मेवाड़ की एक रानी ब्याह कर आईं, तो साथ अड़तालीस सखियाँ भी आईं। सन् 1710 से 1734 तक राज करने वाले महाराणा संग्राम सिंह द्वितीय ने शाही स्त्रियों के लिए यह बाग़ बनवाया, दरबार की उलझनों से दूर एक हरा-भरा ठहराव। सहेलियों की बाड़ी का मतलब ही है, सखियों का बाग़।',
        lookFor: 'लॉन के बीच की सीधी राहों पर चलिए और सोचिए कि अड़तालीस सखियाँ यहाँ दौड़ती होंगी।',
      },
      {
        heading: 'बिना पंप, बस दबाव',
        text: 'यहाँ के लोग बताते हैं कि फ़व्वारे बिजली के पंप से नहीं चलते। पास की फतेह सागर झील के पानी का प्राकृतिक दबाव ही उन्हें चलाता है। तो जब फुहार हवा में उछलती है, कुछ भी बिजली से नहीं जुड़ा होता। पुरानी इंजीनियरी का यह हुनर आँखों के सामने छिपा है।',
        lookFor: 'फ़व्वारों के पास कोई मोटर ढूँढिए। सुनाई देगी तो बस पानी की आवाज़।',
      },
      {
        heading: 'फ़रमाइश पर बारिश',
        text: 'सावन-भादो फ़व्वारा मानसून की नक़ल करता है: चौड़े पत्तों पर पानी हल्की बारिश की तरह टपकता है। पास ही कमल के हौज़ के चारों दिशाओं में चार सफ़ेद संगमरमर के हाथी खड़े हैं। गर्मी की दोपहर में यह कोना बड़ा ठंडा लगता है।',
        lookFor: 'कमल के हौज़ के चारों ओर चार संगमरमर के हाथी ढूँढिए, हर दिशा में एक।',
      },
      {
        heading: 'धीरे क़दम',
        text: 'पुराने पेड़ों के नीचे किसी बेंच पर बैठिए और पानी की आवाज़ सुनिए। मेवाड़ की रानियाँ यहाँ ठीक इसी के लिए आती थीं: महल की भागदौड़ से एक विराम। सिक्के और रैपर हौज़ में न डालिए, ताकि अगले मेहमान को भी बाग़ उतना ही शांत और साफ़ मिले।',
        lookFor: 'किसी छाँव वाली बेंच पर पूरे एक मिनट चुप बैठिए। क्या-क्या सुनाई देता है?',
      },
    ],
    quiz: [
      { question: 'किंवदंती के अनुसार रानी अपने साथ कितनी सखियाँ लाईं?', options: ['बारह', 'अड़तालीस', 'सौ'], answerIndex: 1, fact: 'अड़तालीस सखियाँ, जिनके नाम पर बाड़ी का नाम है।' },
      { question: 'लोग कहते हैं फ़व्वारे किससे चलते हैं?', options: ['बिजली के पंप से', 'भाप के इंजन से', 'पानी के प्राकृतिक दबाव से'], answerIndex: 2, fact: 'फतेह सागर के पानी के दबाव से, बिना पंप।' },
      { question: 'कमल के हौज़ के चारों ओर कौन पहरा देते हैं?', options: ['संगमरमर के हाथी', 'पत्थर के शेर', 'पीतल के मोर'], answerIndex: 0, fact: 'चार सफ़ेद संगमरमर के हाथी, हर दिशा में एक।' },
    ],
    careNote: 'फ़व्वारे फतेह सागर के पानी के दबाव से चलते हैं; हौज़ में सिक्के न डालें।',
  },
};
