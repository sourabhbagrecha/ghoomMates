import type { CuratedSite } from '../types.ts';
import { artPaths } from './art.ts';

// Sources: Wikipedia (City Palace, Udaipur) and Mewar's own palace guides. Dates differ between sources (work began in
// 1553 or 1559), so the story says "the 1550s". Anything told as tradition is marked "legend says" or "it is said".
export const cityPalace: CuratedSite = {
  siteId: 'city-palace',
  art: artPaths('city-palace'),
  en: {
    title: 'The Palace Four Centuries in the Making',
    panels: [
      {
        heading: 'The hermit’s hill',
        text: 'Khamma ghani! Chittor, Mewar’s old capital, had been attacked again and again. So Maharana Udai Singh II went looking for a safer home among the Aravalli hills. Legend says a hermit on this very hill told him to build beside the lake. In the 1550s the first rooms rose here, and Udaipur grew around them.',
        lookFor: 'Face the water from any lake-side window and spot the two island palaces floating on Lake Pichola.',
      },
      {
        heading: 'Twenty-two builders',
        text: 'No single Maharana finished this palace. Twenty-two rulers of Mewar each added a wing, a courtyard or a balcony over nearly four hundred years. That is why the long facade holds so many styles, yet somehow looks like one grand building.',
        lookFor: 'Look along the facade: balconies, domes and windows from different reigns, all singing in one style.',
      },
      {
        heading: 'The peacock courtyard',
        text: 'In Mor Chowk, three peacocks shimmer in coloured glass mosaic, said to stand for the three seasons: summer, winter and monsoon. About five thousand tiny pieces of glass went into them, laid in the time of Maharana Sajjan Singh. Step back and watch their colours move with the light.',
        lookFor: 'Find the three glass peacocks and see how their colours change as you shift your angle.',
      },
      {
        heading: 'The Sun and the scales',
        text: 'Mewar’s Maharanas traced their line to the Sun, and a great sun emblem keeps watch over the palace. At the Tripolia gate, it is said, a Maharana was weighed against gold and silver, and that wealth was shared with the people. Powerful rulers, but giving ones too.',
        lookFor: 'Spot the sun emblem with its rays, and count the three arches of the Tripolia gate.',
      },
    ],
    quiz: [
      { question: 'Who began the City Palace?', options: ['Maharana Pratap', 'Maharana Udai Singh II', 'Maharana Fateh Singh'], answerIndex: 1, fact: 'Udai Singh II began it in the 1550s, and Udaipur grew around it.' },
      { question: 'How many rulers of Mewar added to it over nearly 400 years?', options: ['Seven', 'Twelve', 'Twenty-two'], answerIndex: 2, fact: 'Twenty-two generations kept building, wing after wing.' },
      { question: 'What are the three glass peacocks of Mor Chowk said to stand for?', options: ['Three royal queens', 'The three seasons', 'Three great battles'], answerIndex: 1, fact: 'Summer, winter and monsoon, in about 5,000 pieces of glass.' },
    ],
    careNote: 'Book tickets online, carry a refillable bottle and keep to the marked route in the zenana wing.',
  },
  hi: {
    title: 'चार सदियों में बना महल',
    panels: [
      {
        heading: 'साधु की पहाड़ी',
        text: 'खम्मा घणी! मेवाड़ की पुरानी राजधानी चित्तौड़ पर बार-बार हमले हुए। इसलिए महाराणा उदय सिंह द्वितीय अरावली की पहाड़ियों में सुरक्षित ठिकाना ढूँढने निकले। कहा जाता है कि इसी पहाड़ी पर एक साधु ने उनसे कहा, झील के किनारे बसो। सन् 1550 के आसपास यहाँ पहले कमरे उठे, और उनके चारों ओर उदयपुर बसता गया।',
        lookFor: 'झील की ओर किसी खिड़की से देखिए। पिछोला में तैरते दो द्वीप-महल दिखेंगे।',
      },
      {
        heading: 'बाईस राजाओं की मेहनत',
        text: 'यह महल किसी एक महाराणा ने पूरा नहीं किया। लगभग चार सौ साल में मेवाड़ के बाईस शासकों ने कोई महल, कोई चौक, कोई झरोखा जोड़ा। इसीलिए सामने की लंबी दीवार में कई शैलियाँ हैं, फिर भी पूरा महल एक ही विशाल इमारत जैसा लगता है।',
        lookFor: 'सामने की लंबी दीवार देखिए। अलग-अलग राजाओं के बनवाए झरोखे और गुंबद, फिर भी एक ही सुर में।',
      },
      {
        heading: 'मोर चौक के मोर',
        text: 'मोर चौक में रंगीन काँच की मोज़ेक से बने तीन मोर चमकते हैं। कहते हैं, ये तीन ऋतुओं के प्रतीक हैं: गर्मी, सर्दी और बरसात। इनमें लगभग पाँच हज़ार काँच के टुकड़े लगे हैं, महाराणा सज्जन सिंह के समय के। थोड़ा पीछे हटकर देखिए, रोशनी के साथ रंग बदलते हैं।',
        lookFor: 'तीनों काँच के मोर ढूँढिए, और देखिए कि कोण बदलने पर उनके रंग कैसे बदलते हैं।',
      },
      {
        heading: 'सूरज और तराज़ू',
        text: 'मेवाड़ के महाराणा अपना वंश सूर्य से जोड़ते थे, और महल पर बड़ा-सा सूर्य चिह्न पहरा देता है। कहा जाता है कि त्रिपोलिया द्वार पर महाराणा को सोने-चाँदी से तौला जाता था, और वह धन जनता में बाँट दिया जाता था। ताकतवर भी, और दानी भी।',
        lookFor: 'किरणों वाला सूर्य चिह्न ढूँढिए, और त्रिपोलिया द्वार की तीन मेहराबें गिनिए।',
      },
    ],
    quiz: [
      { question: 'सिटी पैलेस बनाना किसने शुरू किया?', options: ['महाराणा प्रताप', 'महाराणा उदय सिंह द्वितीय', 'महाराणा फतह सिंह'], answerIndex: 1, fact: 'उदय सिंह द्वितीय ने सन् 1550 के आसपास शुरू किया, और उसके चारों ओर उदयपुर बसा।' },
      { question: 'लगभग चार सौ साल में मेवाड़ के कितने शासकों ने इसमें कुछ जोड़ा?', options: ['सात', 'बारह', 'बाईस'], answerIndex: 2, fact: 'बाईस पीढ़ियाँ महल को सँवारती रहीं।' },
      { question: 'मोर चौक के तीन काँच के मोर किसके प्रतीक माने जाते हैं?', options: ['तीन रानियों के', 'तीन ऋतुओं के', 'तीन बड़ी लड़ाइयों के'], answerIndex: 1, fact: 'गर्मी, सर्दी और बरसात, लगभग पाँच हज़ार काँच के टुकड़ों में।' },
    ],
    careNote: 'टिकट ऑनलाइन बुक करें, अपनी पानी की बोतल साथ रखें, और ज़नाना महल में तय रास्ते पर ही चलें।',
  },
};
