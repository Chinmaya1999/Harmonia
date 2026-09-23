// Professional-facing strings (§7.1: every screen readable in the pro's
// language). MVP ships English, Hindi and Kannada; the key-based structure is
// ready for ten to fifteen languages without touching components.
const dict = {
  en: {
    status: 'Your status', available: 'Available', window: 'Time window', offline: 'Offline', busy: 'On a job',
    newJob: 'New job nearby', accept: 'Accept', decline: 'Decline', youEarn: 'You earn', away: 'away', minutes: 'min',
    activeJob: 'Current job', noOffers: 'No offers right now', noOffersHint: 'Stay Available and new jobs near you will appear here with a sound.',
    startTravel: "I'm on my way", enterOtp: 'Enter the 4-digit code from the customer', arrived: 'I have arrived',
    addBefore: 'Add a “before” photo', addAfter: 'Add an “after” photo', sendQuote: 'Send firm price', waitingApproval: 'Waiting for customer approval',
    changeScope: 'Scope changed?', complete: 'Mark work complete', cashReceived: 'Cash received', notFeasible: 'Job not possible',
    todayEarnings: "Today's earnings", jobsToday: 'Jobs today', score: 'Harmonia Score', tipZero: 'Tips: zero commission, paid the same day.',
    declineNote: 'Declining never lowers your score.',
  },
  hi: {
    status: 'आपकी स्थिति', available: 'उपलब्ध', window: 'समय सीमा', offline: 'ऑफ़लाइन', busy: 'काम पर',
    newJob: 'पास में नया काम', accept: 'स्वीकार करें', decline: 'मना करें', youEarn: 'आपकी कमाई', away: 'दूर', minutes: 'मिनट',
    activeJob: 'मौजूदा काम', noOffers: 'अभी कोई काम नहीं', noOffersHint: 'उपलब्ध रहें — पास के नए काम यहाँ आवाज़ के साथ दिखेंगे।',
    startTravel: 'मैं रास्ते में हूँ', enterOtp: 'ग्राहक से 4 अंकों का कोड लें', arrived: 'मैं पहुँच गया',
    addBefore: '“पहले” की फ़ोटो जोड़ें', addAfter: '“बाद” की फ़ोटो जोड़ें', sendQuote: 'पक्की कीमत भेजें', waitingApproval: 'ग्राहक की मंज़ूरी का इंतज़ार',
    changeScope: 'काम बढ़ गया?', complete: 'काम पूरा', cashReceived: 'नकद मिला', notFeasible: 'काम संभव नहीं',
    todayEarnings: 'आज की कमाई', jobsToday: 'आज के काम', score: 'हार्मोनिया स्कोर', tipZero: 'टिप पर कोई कमीशन नहीं, उसी दिन भुगतान।',
    declineNote: 'मना करने से स्कोर कम नहीं होता।',
  },
  kn: {
    status: 'ನಿಮ್ಮ ಸ್ಥಿತಿ', available: 'ಲಭ್ಯ', window: 'ಸಮಯದ ಅವಧಿ', offline: 'ಆಫ್‌ಲೈನ್', busy: 'ಕೆಲಸದಲ್ಲಿ',
    newJob: 'ಹತ್ತಿರದ ಹೊಸ ಕೆಲಸ', accept: 'ಒಪ್ಪಿಕೊಳ್ಳಿ', decline: 'ನಿರಾಕರಿಸಿ', youEarn: 'ನಿಮ್ಮ ಗಳಿಕೆ', away: 'ದೂರ', minutes: 'ನಿಮಿಷ',
    activeJob: 'ಪ್ರಸ್ತುತ ಕೆಲಸ', noOffers: 'ಈಗ ಯಾವುದೇ ಕೆಲಸವಿಲ್ಲ', noOffersHint: 'ಲಭ್ಯವಾಗಿರಿ — ಹತ್ತಿರದ ಹೊಸ ಕೆಲಸಗಳು ಇಲ್ಲಿ ಶಬ್ದದೊಂದಿಗೆ ಕಾಣುತ್ತವೆ.',
    startTravel: 'ನಾನು ಹೊರಟಿದ್ದೇನೆ', enterOtp: 'ಗ್ರಾಹಕರಿಂದ 4 ಅಂಕಿಯ ಕೋಡ್ ಪಡೆಯಿರಿ', arrived: 'ನಾನು ತಲುಪಿದ್ದೇನೆ',
    addBefore: '“ಮೊದಲು” ಫೋಟೋ ಸೇರಿಸಿ', addAfter: '“ನಂತರ” ಫೋಟೋ ಸೇರಿಸಿ', sendQuote: 'ಖಚಿತ ಬೆಲೆ ಕಳುಹಿಸಿ', waitingApproval: 'ಗ್ರಾಹಕರ ಒಪ್ಪಿಗೆಗೆ ಕಾಯುತ್ತಿದೆ',
    changeScope: 'ಕೆಲಸ ಬದಲಾಯಿತೇ?', complete: 'ಕೆಲಸ ಪೂರ್ಣ', cashReceived: 'ನಗದು ಸಿಕ್ಕಿತು', notFeasible: 'ಕೆಲಸ ಸಾಧ್ಯವಿಲ್ಲ',
    todayEarnings: 'ಇಂದಿನ ಗಳಿಕೆ', jobsToday: 'ಇಂದಿನ ಕೆಲಸಗಳು', score: 'ಹಾರ್ಮೋನಿಯಾ ಸ್ಕೋರ್', tipZero: 'ಟಿಪ್ಸ್‌ಗೆ ಶೂನ್ಯ ಕಮಿಷನ್, ಅದೇ ದಿನ ಪಾವತಿ.',
    declineNote: 'ನಿರಾಕರಿಸುವುದರಿಂದ ಸ್ಕೋರ್ ಕಡಿಮೆಯಾಗುವುದಿಲ್ಲ.',
  },
};

export const LANGS = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'हिन्दी' },
  { code: 'kn', label: 'ಕನ್ನಡ' },
];

export function translator(lang = 'en') {
  const d = dict[lang] || dict.en;
  return (key) => d[key] ?? dict.en[key] ?? key;
}
