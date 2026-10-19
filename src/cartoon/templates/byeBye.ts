import { CartoonTemplateManifest } from '../types';

/**
 * BYE BYE! — Cartoon Reactions Template
 * Walking away with small backpack, looking back over shoulder while waving goodbye.
 */
export const BYE_BYE_BACK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>
    <linearGradient id="byeBannerGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#3A86FF"/>
      <stop offset="100%" stop-color="#8338EC"/>
    </linearGradient>
    <linearGradient id="byeBackpackGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FFBE0B"/>
      <stop offset="100%" stop-color="#FB5607"/>
    </linearGradient>
    <linearGradient id="byeJacketGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#3A86FF"/>
      <stop offset="100%" stop-color="#023E8A"/>
    </linearGradient>
    <linearGradient id="byePantsGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#2B2D42"/>
      <stop offset="100%" stop-color="#1B1C2A"/>
    </linearGradient>
    <linearGradient id="byeShoeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FFFFFF"/>
      <stop offset="100%" stop-color="#E2E8F0"/>
    </linearGradient>
  </defs>

  <!-- 1. FOOTPRINTS & DUST PARTICLES -->
  <g id="bye-trail">
    <!-- Footprints leading away -->
    <ellipse cx="430" cy="940" rx="20" ry="10" fill="#000000" opacity="0.14" transform="rotate(-15 430 940)"/>
    <ellipse cx="490" cy="960" rx="20" ry="10" fill="#000000" opacity="0.16" transform="rotate(-10 490 960)"/>
    <ellipse cx="550" cy="945" rx="20" ry="10" fill="#000000" opacity="0.14" transform="rotate(10 550 945)"/>

    <!-- Waving hand motion arcs (Screen-Right) -->
    <path d="M 780,290 C 810,315 810,355 785,385" fill="none" stroke="#8338EC" stroke-width="7" stroke-linecap="round"/>
    <path d="M 805,305 C 830,325 830,350 810,375" fill="none" stroke="#8338EC" stroke-width="5" stroke-linecap="round"/>
  </g>

  <!-- 2. "BYE BYE!" BANNER -->
  <g id="bye-caption">
    <!-- Pop Oval Banner -->
    <rect x="230" y="65" width="480" height="85" rx="42" fill="url(#byeBannerGrad)" stroke="#1E1E24" stroke-width="10"/>
    <rect x="238" y="72" width="464" height="71" rx="35" fill="#FFFFFF"/>

    <text x="470" y="128"
          font-family="system-ui, -apple-system, sans-serif, 'Impact', 'Arial Black'"
          font-weight="900"
          font-size="58"
          text-anchor="middle"
          letter-spacing="5"
          fill="#3A86FF"
          stroke="#1E1E24"
          stroke-width="10"
          stroke-linejoin="round"
          paint-order="stroke fill">BYE BYE!</text>
    <text x="470" y="128"
          font-family="system-ui, -apple-system, sans-serif, 'Impact', 'Arial Black'"
          font-weight="900"
          font-size="58"
          text-anchor="middle"
          letter-spacing="5"
          fill="#8338EC">BYE BYE!</text>
  </g>

  <!-- 3. WALKING AWAY LEGS & SNEAKERS -->
  <g id="bye-legs">
    <!-- Ground Shadow -->
    <ellipse cx="512" cy="970" rx="270" ry="24" fill="#000000" opacity="0.18"/>

    <!-- Left Leg: Stepping forward -->
    <path d="M 420,740 L 400,865 L 455,870 L 465,740 Z"
          fill="url(#byePantsGrad)" stroke="#1E1E24" stroke-width="10" stroke-linejoin="round"/>
    <!-- Right Leg: Pushing off back -->
    <path d="M 540,740 L 565,865 L 620,860 L 585,740 Z"
          fill="url(#byePantsGrad)" stroke="#1E1E24" stroke-width="10" stroke-linejoin="round"/>

    <!-- Left Sneaker -->
    <path d="M 385,865 C 360,865 330,885 325,915 C 320,945 355,955 425,955 C 470,955 480,935 475,905 C 470,875 445,865 385,865 Z"
          fill="url(#byeShoeGrad)" stroke="#1E1E24" stroke-width="10" stroke-linejoin="round"/>
    <path d="M 325,930 L 475,930" stroke="#FF006E" stroke-width="7" stroke-linecap="round"/>

    <!-- Right Sneaker -->
    <path d="M 625,860 C 655,860 685,880 690,910 C 695,940 660,950 590,950 C 550,950 540,930 545,900 C 550,870 575,860 625,860 Z"
          fill="url(#byeShoeGrad)" stroke="#1E1E24" stroke-width="10" stroke-linejoin="round"/>
    <path d="M 690,925 L 545,925" stroke="#FF006E" stroke-width="7" stroke-linecap="round"/>
  </g>

  <!-- 4. TORSO BACK WITH CUTE CHIBI BACKPACK -->
  <g id="bye-torso-back">
    <!-- Back of Jacket (character angled away) -->
    <path d="M 390,520 C 370,570 375,670 380,750 C 430,765 590,765 635,740 C 640,670 645,570 625,520 Z"
          fill="url(#byeJacketGrad)" stroke="#1E1E24" stroke-width="11" stroke-linejoin="round"/>

    <!-- Chubby Yellow Backpack on back -->
    <rect x="420" y="560" width="180" height="175" rx="35" fill="url(#byeBackpackGrad)" stroke="#1E1E24" stroke-width="10"/>
    <!-- Backpack pouch -->
    <rect x="440" y="640" width="140" height="75" rx="20" fill="#FFD166" stroke="#1E1E24" stroke-width="8"/>
    <!-- Backpack hanging loop -->
    <path d="M 485,560 C 485,535 535,535 535,560" fill="none" stroke="#1E1E24" stroke-width="8"/>

    <!-- Right Arm raised high waving goodbye backward -->
    <path d="M 620,530 C 665,490 735,410 755,335 C 760,315 725,300 710,320 C 685,365 625,470 580,510 Z"
          fill="url(#byeJacketGrad)" stroke="#1E1E24" stroke-width="10" stroke-linejoin="round"/>
    <!-- Waving hand Right -->
    <path d="M 750,335 C 770,315 780,275 760,255 C 740,235 710,245 700,270 C 685,240 650,255 650,280 C 640,260 610,280 620,310 C 625,335 640,350 670,365 C 700,380 735,355 750,335 Z"
          fill="#FFFFFF" stroke="#1E1E24" stroke-width="10" stroke-linejoin="round"/>

    <!-- Neck socket -->
    <ellipse cx="505" cy="515" rx="85" ry="25" fill="#1A1B26"/>
  </g>
</svg>`;

/**
 * Layer 3 — Front SVG
 * Backpack straps crossing over shoulders and turned jacket collar.
 */
export const BYE_BYE_FRONT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>
    <linearGradient id="byeFrontJacketGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#3A86FF"/>
      <stop offset="100%" stop-color="#023E8A"/>
    </linearGradient>
  </defs>

  <g id="bye-foreground-collar-and-straps">
    <!-- Turned jacket collar overlapping chin Y=495-555 -->
    <path d="M 425,495 C 460,525 550,525 585,495 C 605,530 575,565 505,565 C 435,565 405,530 425,495 Z"
          fill="url(#byeFrontJacketGrad)" stroke="#1E1E24" stroke-width="10" stroke-linejoin="round"/>

    <!-- Backpack shoulder strap Left -->
    <path d="M 435,510 C 430,550 435,620 440,680" fill="none" stroke="#FFBE0B" stroke-width="14" stroke-linecap="round"/>
    <path d="M 435,510 C 430,550 435,620 440,680" fill="none" stroke="#1E1E24" stroke-width="4" stroke-linecap="round"/>

    <!-- Backpack shoulder strap Right -->
    <path d="M 575,510 C 570,550 565,620 560,680" fill="none" stroke="#FFBE0B" stroke-width="14" stroke-linecap="round"/>
    <path d="M 575,510 C 570,550 565,620 560,680" fill="none" stroke="#1E1E24" stroke-width="4" stroke-linecap="round"/>
  </g>
</svg>`;

export const BYE_BYE_TEMPLATE: CartoonTemplateManifest = {
  id: 'bye-bye-12',
  name: 'BYE BYE!',
  description: 'Walking away with small yellow backpack while looking back and waving goodbye',
  canvas: {
    width: 1024,
    height: 1024
  },
  layers: {
    backSvg: BYE_BYE_BACK_SVG,
    frontSvg: BYE_BYE_FRONT_SVG
  },
  headSlot: {
    centerX: 0.50,
    centerY: 0.38,
    targetWidth: 0.43,
    targetEyeAngleDegrees: 4, // Looking back over shoulder tilt
    targetEyeY: 0.38,
    targetEyeDistance: 0.10,
    targetChinY: 0.49,
    targetFaceH: 0.25,
    neckAnchorX: 0.50,
    neckAnchorY: 0.52,
    collarOverlapY: 0.05,
    hairExtentRatio: 0.75,
    hairLayering: 'behind',
    defaultScale: 1.0,
    defaultRotation: 4
  },
  category: 'Greetings',
  tags: ['bye', 'goodbye', 'see ya', 'later', 'backpack', 'walk', 'wave']
};
