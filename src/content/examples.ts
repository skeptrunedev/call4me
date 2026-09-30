export interface CallExample {
  slug: string;
  title: string;
  business: string;
  date: string;
  request: string;
  outcome: string;
  audio: string;
  duration: string;
  transcript: TranscriptLine[];
}

/**
 * One line of a published excerpt: a turn heard in the audio, or a marker standing in for a
 * stretch cut from the recording (menus, holds, and the identity checks that carry personal
 * details). Cut notes describe what really happened there, from the full call transcript.
 */
export type TranscriptLine =
  | { speaker: 'ai agent' | 'representative'; text: string }
  | { cut: string };

/** Curated public excerpts only. Original recordings and account data stay private. */
export const EXAMPLES: CallExample[] = [
  {
    slug: 'dinner-reservation',
    title: 'book a table for two',
    business: 'TAO Los Angeles',
    date: 'September 27, 2026',
    request: 'get a table for two tonight, around 8, under my name.',
    outcome: 'the restaurant confirmed a reservation for two at 8 pm.',
    audio: '/static/examples/dinner-reservation.mp3',
    duration: '22 seconds',
    transcript: [
      { cut: 'the restaurant\'s recorded greeting and a short hold. the host picks up and asks how she can help.' },
      { speaker: 'ai agent', text: 'Hi! I was hoping to get a table for two tonight, around eight?' },
      { speaker: 'representative', text: 'Let me see what we have available.' },
      { speaker: 'ai agent', text: 'Sure.' },
      { cut: 'the host finds a table and asks if the number calling is the best one for the reservation. the agent says yes and gives the name. she pulls up the OpenTable account and asks about dietary restrictions or a special occasion (none).' },
      { speaker: 'representative', text: 'Alrighty. Well, I was able to make a reservation tonight at eight p.m. for two guests. We\'ll be seeing you soon.' },
      { speaker: 'ai agent', text: 'Awesome. Thanks so much. Bye!' },
      { speaker: 'representative', text: 'Bye.' },
    ],
  },
  {
    slug: 'cancel-reservation',
    title: 'cancel a dinner reservation',
    business: 'TAO Los Angeles',
    date: 'September 27, 2026',
    request: 'cancel tonight\'s reservation for two at 8 pm under my name. don\'t rebook.',
    outcome: 'the restaurant found two duplicate reservations and confirmed both were canceled. no new reservation was made.',
    audio: '/static/examples/cancel-reservation.mp3',
    duration: '26 seconds',
    transcript: [
      { cut: 'the restaurant\'s recorded greeting and a short hold. the host picks up and asks how she can help, and the agent says hi.' },
      { speaker: 'ai agent', text: 'I\'m calling \'cause I need to cancel a reservation for two tonight at eight.' },
      { cut: 'the agent gives the name the reservation is under, and the host looks it up.' },
      { speaker: 'representative', text: 'Okay, it looks like I have two reservations for two people at eight o\'clock. Did you need to cancel both?' },
      { speaker: 'ai agent', text: 'Oh. Hmm. Yeah, I think that must\'ve been a double booking. Yeah, please go ahead and cancel both.' },
      { speaker: 'representative', text: 'Yeah, no problem. They\'re, uh, you\'re all set. Um, I went ahead and canceled both of those.' },
      { speaker: 'ai agent', text: 'Perfect. Thanks so much. Have a good one. Bye.' },
      { speaker: 'representative', text: 'You too, bye.' },
    ],
  },
  {
    slug: 'internet-availability',
    title: 'check home internet options',
    business: 'Monkeybrains',
    date: 'September 28, 2026',
    request: 'check if they can serve my apartment (address and unit given), the plan, and the soonest installation. don\'t sign up.',
    outcome: 'the representative confirmed service was available and explained the plan and installation openings. no installation was booked.',
    audio: '/static/examples/internet-availability.mp3',
    duration: '63 seconds',
    transcript: [
      { cut: 'the phone menu (the agent picks new residential service). a representative answers, and the agent asks if they can do residential internet at the address. she looks it up, confirms the unit and the name on file, then puts the call on hold to check line of sight from the building to their towers.' },
      { speaker: 'representative', text: 'Okay, so we are able to service that building. So it\'s going to be one fifty for installation, and that does cover your first month of service. After that, it\'s going to be thirty five dollars a month.' },
      { cut: 'she adds that it\'s month to month with no contract, and you bring your own router.' },
      { speaker: 'ai agent', text: 'Oh, that\'s great. And what kind of speeds are you usually seeing, and how soon could an install happen?' },
      { speaker: 'representative', text: 'Yeah, so for our standard residential plan, we offer a capacity of a hundred megabits per second for download and upload.' },
      { cut: 'she mentions a 30 day refund on the install fee if you cancel.' },
      { speaker: 'ai agent', text: 'Okay, and what would be the soonest you could do an install?' },
      { speaker: 'representative', text: 'Let me take a look.' },
      { cut: 'a few seconds while she checks the schedule.' },
      { speaker: 'representative', text: 'Okay, so I did have some openings for tomorrow. I have a nine a.m., so we would arrive between nine and eleven a.m., as well as eleven a.m., so then they would arrive between eleven and one.' },
      { speaker: 'ai agent', text: 'Awesome, that\'s really helpful. I\'ll check with the property manager and get back to you. Thanks so much for your help!' },
      { speaker: 'representative', text: 'Sounds good.' },
    ],
  },
  {
    slug: 'expedite-review',
    title: 'get a stalled review moving',
    business: 'Amazon Pharmacy',
    date: 'September 28, 2026',
    request: 'three of my prescriptions have been stuck in pharmacist review for over a day. find out what is holding them up and ask support to move them along.',
    outcome: 'the representative agreed to mark the pending items as important. she estimated about an hour for review and said an email would follow when they were ready. this call does not confirm the review finished.',
    audio: '/static/examples/expedite-review.mp3',
    duration: '26 seconds',
    transcript: [
      { cut: 'the automated line verifies the account: the agent gives the mobile number on the account and reads back the six digit code texted to it. the agent asks for an expedited review, and the automated assistant transfers the call to a person.' },
      { speaker: 'representative', text: 'Clinical customer care.' },
      { speaker: 'representative', text: 'How can I help you?' },
      { cut: 'the agent says hi and gives the account holder\'s name.' },
      { speaker: 'ai agent', text: '…three prescriptions still under pharmacist review for over a day.' },
      { speaker: 'ai agent', text: 'Can you see what\'s blocking them and help move them along today?' },
      { speaker: 'representative', text: 'Yeah, absolutely.' },
      { cut: 'she asks which medications, the agent lists them, and she puts the call on hold to look.' },
      { speaker: 'representative', text: 'Oh, it does say in progress.' },
      { speaker: 'representative', text: 'Okay, I\'ll go ahead and mark them as important.' },
      { speaker: 'representative', text: 'Usually once that happens, they\'re done within like an hour.' },
      { speaker: 'ai agent', text: 'Oh, nice! Okay.' },
      { cut: 'the agent asks what the prices will be. she says that isn\'t available until after review.' },
      { speaker: 'representative', text: 'But the customer will get an email as soon as they are ready to order.' },
      { speaker: 'ai agent', text: 'Perfect, thanks so much!' },
      { speaker: 'representative', text: 'Okay, you\'re welcome. Have a great day. Bye.' },
    ],
  },
];
