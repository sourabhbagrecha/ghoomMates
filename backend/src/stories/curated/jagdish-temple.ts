import type { CuratedSite } from '../types.ts';
import { artPaths } from './art.ts';

// Sources: Wikipedia (Jagdish Temple, Udaipur). Sources differ on the year (1651 or 1652); the story follows 1651.
export const jagdishTemple: CuratedSite = {
  siteId: 'jagdish-temple',
  art: artPaths('jagdish-temple'),
  en: {
    title: 'Thirty-Two Steps to Jagannath',
    panels: [
      {
        heading: 'Thirty-two steps up',
        text: 'Khamma ghani! Maharana Jagat Singh I finished this temple in 1651. To reach it you climb thirty-two marble steps, with stone elephants standing guard on either side. Pause halfway and look back at the bustle of Jagdish Chowk: this is how pilgrims have seen the city for centuries.',
        lookFor: 'Count the marble steps as you climb. Do you reach thirty-two?',
      },
      {
        heading: 'A god carved from one stone',
        text: 'Inside the sanctum stands Lord Jagannath, a form of Vishnu, carved from a single block of black stone, with four arms and fresh flower garlands. At the top of the steps, a brass Garuda, Vishnu’s own mount, waits patiently.',
        lookFor: 'Find the brass Garuda near the top of the steps.',
      },
      {
        heading: 'A spire full of life',
        text: 'Look up. The spire rises nearly seventy-nine feet, and every inch is carved: dancers, musicians, horse riders and elephants, storey after storey of stone. Four small shrines, to Ganesha, Surya, Shakti and Shiva, stand around the main one.',
        lookFor: 'Find a carved musician or dancer on the walls. Can you spot one playing an instrument?',
      },
      {
        heading: 'Listen for the aarti',
        text: 'This is no museum: the temple is alive. At aarti time bells ring, lamps sway and voices rise in bhajans. Leave your shoes at the steps, cover your shoulders, and let the sound wash over you. In the hush that follows, the old city seems to hold its breath.',
        lookFor: 'At aarti time, notice the lamps, the bells, and the quiet that follows.',
      },
    ],
    quiz: [
      { question: 'How many marble steps lead up to the temple?', options: ['Twelve', 'Thirty-two', 'One hundred and eight'], answerIndex: 1, fact: 'Thirty-two steps, with stone elephants on either side.' },
      { question: 'Who is worshipped in the main shrine?', options: ['Lord Jagannath, a form of Vishnu', 'Lord Hanuman', 'Goddess Saraswati'], answerIndex: 0, fact: 'The image is carved from a single block of black stone.' },
      { question: 'What waits at the top of the steps?', options: ['A silver lion', 'A golden peacock', 'A brass Garuda'], answerIndex: 2, fact: 'Garuda is Vishnu’s own mount.' },
    ],
    careNote: 'Dress modestly, leave shoes at the steps and skip photos of the main shrine.',
  },
  hi: {
    title: 'जगन्नाथ तक बत्तीस सीढ़ियाँ',
    panels: [
      {
        heading: 'बत्तीस सीढ़ियाँ',
        text: 'खम्मा घणी! महाराणा जगत सिंह प्रथम ने यह मंदिर सन् 1651 में पूरा करवाया। इस तक पहुँचने के लिए बत्तीस संगमरमर की सीढ़ियाँ चढ़नी होती हैं, जिनके दोनों ओर पत्थर के हाथी पहरा देते हैं। बीच में रुककर जगदीश चौक की चहल-पहल पर पीछे नज़र डालिए।',
        lookFor: 'चढ़ते हुए सीढ़ियाँ गिनिए। क्या बत्तीस पूरी होती हैं?',
      },
      {
        heading: 'एक ही पत्थर से गढ़े भगवान',
        text: 'गर्भगृह में भगवान जगन्नाथ विराजते हैं, विष्णु का ही एक रूप। उन्हें काले पत्थर की एक ही शिला से गढ़ा गया है, चार भुजाएँ और ताज़े फूलों की मालाएँ। सीढ़ियों के ऊपर पीतल के गरुड़, विष्णु के वाहन, धैर्य से प्रतीक्षा करते हैं।',
        lookFor: 'सीढ़ियों के ऊपर पीतल के गरुड़ को ढूँढिए।',
      },
      {
        heading: 'जीवन से भरा शिखर',
        text: 'ऊपर देखिए। शिखर लगभग उनासी फ़ुट ऊँचा है, और हर इंच पर नक्काशी है: नर्तक, वादक, घुड़सवार और हाथी, मंज़िल दर मंज़िल पत्थर में। मुख्य मंदिर के चारों ओर गणेश, सूर्य, शक्ति और शिव के चार छोटे मंदिर भी हैं।',
        lookFor: 'दीवारों पर कोई नक्काशीदार वादक या नर्तक ढूँढिए। क्या कोई वाद्य बजाता दिख रहा है?',
      },
      {
        heading: 'आरती की गूँज',
        text: 'यह कोई संग्रहालय नहीं, जीता-जागता मंदिर है। आरती के समय घंटियाँ बजती हैं, दीप झूमते हैं और भजन गूँजते हैं। जूते सीढ़ियों पर उतारिए, कंधे ढकिए, और इस आवाज़ में खो जाइए। बाद की शांति में पूरा पुराना शहर जैसे साँस रोक लेता है।',
        lookFor: 'आरती के समय दीपों, घंटियों और उसके बाद की शांति को महसूस कीजिए।',
      },
    ],
    quiz: [
      { question: 'मंदिर तक कितनी संगमरमर की सीढ़ियाँ जाती हैं?', options: ['बारह', 'बत्तीस', 'एक सौ आठ'], answerIndex: 1, fact: 'बत्तीस सीढ़ियाँ, दोनों ओर पत्थर के हाथी।' },
      { question: 'मुख्य गर्भगृह में किसकी पूजा होती है?', options: ['भगवान जगन्नाथ, विष्णु का रूप', 'भगवान हनुमान', 'देवी सरस्वती'], answerIndex: 0, fact: 'काले पत्थर की एक ही शिला से गढ़ी मूर्ति।' },
      { question: 'सीढ़ियों के ऊपर क्या प्रतीक्षा करता है?', options: ['चाँदी का शेर', 'सोने का मोर', 'पीतल का गरुड़'], answerIndex: 2, fact: 'गरुड़ विष्णु के अपने वाहन हैं।' },
    ],
    careNote: 'शालीन कपड़े पहनें, जूते सीढ़ियों पर उतारें और मुख्य गर्भगृह की तस्वीरें न लें।',
  },
};
