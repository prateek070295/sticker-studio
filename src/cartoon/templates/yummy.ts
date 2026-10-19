import { CartoonTemplateManifest } from '../types';

/**
 * YUMMY! — Cartoon Reactions Template
 * Holding a steaming bowl of delicious noodles with chopsticks and playful sparkling food accents.
 */
export const YUMMY_BACK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>
    <linearGradient id="yumBannerGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FFBA08"/>
      <stop offset="100%" stop-color="#E85D04"/>
    </linearGradient>
    <linearGradient id="yumApronGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#F72585"/>
      <stop offset="100%" stop-color="#B5179E"/>
    </linearGradient>
    <linearGradient id="yumPantsGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#3A0CA3"/>
      <stop offset="100%" stop-color="#1E0059"/>
    </linearGradient>
    <linearGradient id="yumShoeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FFFFFF"/>
      <stop offset="100%" stop-color="#E2E8F0"/>
    </linearGradient>
  </defs>

  <!-- 1. STEAM SPIRALS & SPARKLES -->
  <g id="yum-steam">
    <!-- Steam curls above food bowl -->
    <path d="M 460,420 C 440,360 480,320 460,260" fill="none" stroke="#FFFFFF" stroke-width="8" stroke-linecap="round"/>
    <path d="M 520,400 C 540,340 500,300 530,240" fill="none" stroke="#FFFFFF" stroke-width="8" stroke-linecap="round"/>
    <path d="M 570,430 C 590,370 560,330 580,270" fill="none" stroke="#FFFFFF" stroke-width="7" stroke-linecap="round"/>

    <!-- Food stars & sparkles -->
    <path d="M 230,230 Q 240,230 240,220 Q 240,230 250,230 Q 240,230 240,240 Q 240,230 230,230 Z" fill="#FFE600" stroke="#1E1E24" stroke-width="3"/>
    <path d="M 790,230 Q 800,230 800,220 Q 800,230 810,230 Q 800,230 800,240 Q 800,230 790,230 Z" fill="#FFE600" stroke="#1E1E24" stroke-width="3"/>
    <circle cx="210" cy="310" r="10" fill="#FFBA08" stroke="#1E1E24" stroke-width="3"/>
    <circle cx="810" cy="310" r="10" fill="#FFBA08" stroke="#1E1E24" stroke-width="3"/>
  </g>

  <!-- 2. "YUMMY!" BANNER -->
  <g id="yum-caption">
    <ellipse cx="512" cy="115" rx="240" ry="55" fill="url(#yumBannerGrad)" stroke="#1E1E24" stroke-width="10"/>
    <ellipse cx="512" cy="110" rx="230" ry="50" fill="#FFD000"/>

    <text x="512" y="132"
          font-family="system-ui, -apple-system, sans-serif, 'Impact', 'Arial Black'"
          font-weight="900"
          font-size="64"
          text-anchor="middle"
          letter-spacing="5"
          fill="#D00000"
          stroke="#1E1E24"
          stroke-width="10"
          stroke-linejoin="round"
          paint-order="stroke fill">YUMMY!</text>
    <text x="512" y="132"
          font-family="system-ui, -apple-system, sans-serif, 'Impact', 'Arial Black'"
          font-weight="900"
          font-size="64"
          text-anchor="middle"
          letter-spacing="5"
          fill="#FFFFFF">YUMMY!</text>
  </g>

  <!-- 3. CHIBI LEGS & SNEAKERS -->
  <g id="yum-legs">
    <!-- Ground Shadow -->
    <ellipse cx="512" cy="970" rx="270" ry="24" fill="#000000" opacity="0.18"/>

    <!-- Left Leg -->
    <path d="M 440,750 L 420,875 L 475,875 L 480,750 Z"
          fill="url(#yumPantsGrad)" stroke="#1E1E24" stroke-width="10" stroke-linejoin="round"/>
    <!-- Right Leg -->
    <path d="M 540,750 L 545,875 L 600,875 L 580,750 Z"
          fill="url(#yumPantsGrad)" stroke="#1E1E24" stroke-width="10" stroke-linejoin="round"/>

    <!-- Left Sneaker -->
    <path d="M 405,875 C 380,875 350,895 345,925 C 340,955 375,965 445,965 C 485,965 495,945 490,920 C 485,890 460,875 405,875 Z"
          fill="url(#yumShoeGrad)" stroke="#1E1E24" stroke-width="10" stroke-linejoin="round"/>
    <path d="M 345,940 L 490,940" stroke="#FFBA08" stroke-width="7" stroke-linecap="round"/>

    <!-- Right Sneaker -->
    <path d="M 615,875 C 640,875 670,895 675,925 C 680,955 645,965 575,965 C 535,965 525,945 530,920 C 535,890 560,875 615,875 Z"
          fill="url(#yumShoeGrad)" stroke="#1E1E24" stroke-width="10" stroke-linejoin="round"/>
    <path d="M 675,940 L 530,940" stroke="#FFBA08" stroke-width="7" stroke-linecap="round"/>
  </g>

  <!-- 4. TORSO BACK -->
  <g id="yum-torso-back">
    <path d="M 390,510 C 365,560 370,670 375,750 C 420,765 600,765 645,750 C 650,670 655,560 630,510 Z"
          fill="url(#yumApronGrad)" stroke="#1E1E24" stroke-width="11" stroke-linejoin="round"/>

    <!-- Neck socket -->
    <ellipse cx="512" cy="515" rx="85" ry="25" fill="#1A1B26"/>
  </g>
</svg>`;

/**
 * Layer 3 — Front SVG
 * Steaming delicious ramen/soup bowl held in both hands with chopsticks and cute apron bib.
 */
export const YUMMY_FRONT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>
    <linearGradient id="yumBowlGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#48CAE4"/>
      <stop offset="100%" stop-color="#023E8A"/>
    </linearGradient>
    <linearGradient id="yumNoodleGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FFE600"/>
      <stop offset="100%" stop-color="#FF9E00"/>
    </linearGradient>
  </defs>

  <g id="yum-foreground-bowl-and-hands">
    <!-- Apron bib / collar overlapping neck base Y=495-550 -->
    <path d="M 430,495 C 465,525 559,525 594,495 C 610,530 580,565 512,565 C 444,565 414,530 430,495 Z"
          fill="#FFFFFF" stroke="#1E1E24" stroke-width="10" stroke-linejoin="round"/>

    <!-- Steaming Ceramic Food Bowl (Centered X=512, Y=620) -->
    <!-- Noodles & Broth Surface -->
    <ellipse cx="512" cy="580" rx="145" ry="35" fill="url(#yumNoodleGrad)" stroke="#1E1E24" stroke-width="9"/>
    <!-- Cute boiled egg slice -->
    <ellipse cx="480" cy="578" rx="22" ry="16" fill="#FFFFFF" stroke="#1E1E24" stroke-width="4"/>
    <ellipse cx="480" cy="578" rx="12" ry="9" fill="#FFBA08"/>

    <!-- Main Bowl Body -->
    <path d="M 365,580 C 375,690 430,730 512,730 C 594,730 649,690 659,580 Z"
          fill="url(#yumBowlGrad)" stroke="#1E1E24" stroke-width="11" stroke-linejoin="round"/>
    <!-- Bowl Base Foot -->
    <rect x="462" y="725" width="100" height="18" rx="6" fill="#023E8A" stroke="#1E1E24" stroke-width="7"/>

    <!-- Wooden Chopsticks (Angled across bowl) -->
    <line x1="430" y1="470" x2="560" y2="590" stroke="#7F4F24" stroke-width="10" stroke-linecap="round"/>
    <line x1="430" y1="470" x2="560" y2="590" stroke="#1E1E24" stroke-width="3" stroke-linecap="round"/>
    <line x1="445" y1="465" x2="575" y2="585" stroke="#936639" stroke-width="9" stroke-linecap="round"/>

    <!-- Hands clutching sides of the bowl -->
    <!-- Left Hand -->
    <ellipse cx="370" cy="610" rx="26" ry="22" fill="#FFFFFF" stroke="#1E1E24" stroke-width="9"/>
    <!-- Right Hand -->
    <ellipse cx="654" cy="610" rx="26" ry="22" fill="#FFFFFF" stroke="#1E1E24" stroke-width="9"/>
  </g>
</svg>`;

export const YUMMY_TEMPLATE: CartoonTemplateManifest = {
  id: 'yummy-11',
  name: 'YUMMY!',
  description: 'Holding a steaming bowl of delicious noodles with chopsticks and playful sparkling food accents',
  canvas: {
    width: 1024,
    height: 1024
  },
  layers: {
    backSvg: YUMMY_BACK_SVG,
    frontSvg: YUMMY_FRONT_SVG
  },
  headSlot: {
    centerX: 0.50,
    centerY: 0.38,
    targetWidth: 0.43,
    targetEyeAngleDegrees: 0,
    targetEyeY: 0.38,
    targetEyeDistance: 0.10,
    targetChinY: 0.49,
    targetFaceH: 0.25,
    neckAnchorX: 0.50,
    neckAnchorY: 0.51,
    collarOverlapY: 0.05,
    hairExtentRatio: 0.75,
    hairLayering: 'front',
    defaultScale: 1.0,
    defaultRotation: 0
  },
  category: 'Food',
  tags: ['yummy', 'delicious', 'food', 'noodles', 'snack', 'hungry', 'eating']
};
