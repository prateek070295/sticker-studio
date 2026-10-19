import { CartoonTemplateManifest } from '../types';

/**
 * LOL! — Cartoon Reactions Template
 * Bent-over laughing body pose, hands on knees, laughing tear sparkles and explosive comic caption.
 */
export const LOL_BACK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>
    <linearGradient id="lolBubbleGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FFE600"/>
      <stop offset="100%" stop-color="#FF9E00"/>
    </linearGradient>
    <linearGradient id="lolSweaterGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#06D6A0"/>
      <stop offset="100%" stop-color="#059669"/>
    </linearGradient>
    <linearGradient id="lolPantsGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#118AB2"/>
      <stop offset="100%" stop-color="#073B4C"/>
    </linearGradient>
    <linearGradient id="lolShoeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FFFFFF"/>
      <stop offset="100%" stop-color="#E2E8F0"/>
    </linearGradient>
  </defs>

  <!-- 1. EXPLOSIVE "LOL!" COMIC BUBBLE (Upper Right) -->
  <g id="lol-bubble-group">
    <!-- Laughing tears / water droplets -->
    <path d="M 220,290 C 200,260 210,230 230,220 C 250,210 270,240 250,270 Z" fill="#9BF6FF" stroke="#1E1E24" stroke-width="6"/>
    <path d="M 790,290 C 810,260 800,230 780,220 C 760,210 740,240 760,270 Z" fill="#9BF6FF" stroke="#1E1E24" stroke-width="6"/>
    <circle cx="210" cy="320" r="12" fill="#9BF6FF" stroke="#1E1E24" stroke-width="5"/>
    <circle cx="810" cy="320" r="12" fill="#9BF6FF" stroke="#1E1E24" stroke-width="5"/>

    <!-- Comic Burst Star behind LOL -->
    <polygon points="512,30 545,95 620,65 625,140 700,135 680,205 750,230 705,290 760,340 690,375 720,445 645,450 640,520 575,490 540,555 490,500 440,555 425,485 355,510 365,440 290,435 325,370 255,335 315,285 270,225 340,205 320,135 395,140 400,65 475,95"
             fill="url(#lolBubbleGrad)" stroke="#1E1E24" stroke-width="12" stroke-linejoin="round"/>

    <!-- "LOL!" Hand-drawn Typography -->
    <text x="512" y="170"
          font-family="system-ui, -apple-system, sans-serif, 'Impact', 'Arial Black'"
          font-weight="900"
          font-size="82"
          text-anchor="middle"
          letter-spacing="6"
          fill="#FFFFFF"
          stroke="#1E1E24"
          stroke-width="12"
          stroke-linejoin="round"
          paint-order="stroke fill">LOL!</text>
    <text x="512" y="170"
          font-family="system-ui, -apple-system, sans-serif, 'Impact', 'Arial Black'"
          font-weight="900"
          font-size="82"
          text-anchor="middle"
          letter-spacing="6"
          fill="#FFFFFF">LOL!</text>
  </g>

  <!-- 2. LEGS & SNEAKERS (Bent wide laughing stance) -->
  <g id="lol-legs">
    <!-- Ground Shadow -->
    <ellipse cx="512" cy="970" rx="300" ry="24" fill="#000000" opacity="0.18"/>

    <!-- Left Leg wide -->
    <path d="M 380,740 L 330,870 L 395,875 L 430,740 Z"
          fill="url(#lolPantsGrad)" stroke="#1E1E24" stroke-width="10" stroke-linejoin="round"/>
    <!-- Right Leg wide -->
    <path d="M 594,740 L 629,875 L 694,870 L 644,740 Z"
          fill="url(#lolPantsGrad)" stroke="#1E1E24" stroke-width="10" stroke-linejoin="round"/>

    <!-- Left Sneaker -->
    <path d="M 320,870 C 290,870 260,895 255,925 C 250,955 285,965 355,965 C 400,965 410,945 405,915 C 400,885 375,870 320,870 Z"
          fill="url(#lolShoeGrad)" stroke="#1E1E24" stroke-width="10" stroke-linejoin="round"/>
    <path d="M 255,940 L 405,940" stroke="#EF476F" stroke-width="7" stroke-linecap="round"/>

    <!-- Right Sneaker -->
    <path d="M 704,870 C 734,870 764,895 769,925 C 774,955 739,965 669,965 C 624,965 614,945 619,915 C 624,885 649,870 704,870 Z"
          fill="url(#lolShoeGrad)" stroke="#1E1E24" stroke-width="10" stroke-linejoin="round"/>
    <path d="M 769,940 L 619,940" stroke="#EF476F" stroke-width="7" stroke-linecap="round"/>
  </g>

  <!-- 3. BENT-OVER TORSO & ARMS CLUTCHING KNEES (Back Silhouette) -->
  <g id="lol-torso-back">
    <!-- Chubby bent-forward sweater body -->
    <path d="M 370,520 C 330,580 340,680 360,750 C 420,770 604,770 664,750 C 684,680 694,580 654,520 Z"
          fill="url(#lolSweaterGrad)" stroke="#1E1E24" stroke-width="11" stroke-linejoin="round"/>

    <!-- Arm Left reaching to knee -->
    <path d="M 380,540 C 310,600 290,680 330,760 C 345,785 385,765 375,735 C 345,670 375,610 410,565 Z"
          fill="url(#lolSweaterGrad)" stroke="#1E1E24" stroke-width="10" stroke-linejoin="round"/>
    <!-- Fist clutching knee -->
    <circle cx="345" cy="765" r="26" fill="#FFFFFF" stroke="#1E1E24" stroke-width="9"/>

    <!-- Arm Right reaching to knee -->
    <path d="M 644,540 C 714,600 734,680 694,760 C 679,785 639,765 649,735 C 679,670 649,610 614,565 Z"
          fill="url(#lolSweaterGrad)" stroke="#1E1E24" stroke-width="10" stroke-linejoin="round"/>
    <!-- Fist clutching knee -->
    <circle cx="679" cy="765" r="26" fill="#FFFFFF" stroke="#1E1E24" stroke-width="9"/>

    <!-- Deep neck socket -->
    <ellipse cx="512" cy="530" rx="90" ry="26" fill="#1A1B26"/>
  </g>
</svg>`;

/**
 * Layer 3 — Front SVG
 * Chunky sweater turtleneck collar.
 */
export const LOL_FRONT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>
    <linearGradient id="lolCollarGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FFE600"/>
      <stop offset="100%" stop-color="#FFB703"/>
    </linearGradient>
  </defs>

  <g id="lol-front-collar">
    <!-- Oversized chunky ribbed sweater rollneck overlapping chin base Y=505-570 -->
    <path d="M 425,505 C 465,540 559,540 599,505 C 615,545 585,585 512,585 C 439,585 409,545 425,505 Z"
          fill="url(#lolCollarGrad)" stroke="#1E1E24" stroke-width="10" stroke-linejoin="round"/>

    <!-- Knit ribbing vertical accents -->
    <line x1="465" y1="520" x2="465" y2="565" stroke="#1E1E24" stroke-width="4" stroke-linecap="round"/>
    <line x1="490" y1="525" x2="490" y2="575" stroke="#1E1E24" stroke-width="4" stroke-linecap="round"/>
    <line x1="512" y1="528" x2="512" y2="578" stroke="#1E1E24" stroke-width="4" stroke-linecap="round"/>
    <line x1="534" y1="525" x2="534" y2="575" stroke="#1E1E24" stroke-width="4" stroke-linecap="round"/>
    <line x1="559" y1="520" x2="559" y2="565" stroke="#1E1E24" stroke-width="4" stroke-linecap="round"/>
  </g>
</svg>`;

export const LOL_TEMPLATE: CartoonTemplateManifest = {
  id: 'lol-03',
  name: 'LOL!',
  description: 'Bent-over laughing body pose clutching knees with tear drops and explosive comic starburst',
  canvas: {
    width: 1024,
    height: 1024
  },
  layers: {
    backSvg: LOL_BACK_SVG,
    frontSvg: LOL_FRONT_SVG
  },
  headSlot: {
    centerX: 0.50,
    centerY: 0.39,
    targetWidth: 0.44,
    targetEyeAngleDegrees: 0,
    targetEyeY: 0.39,
    targetEyeDistance: 0.10,
    targetChinY: 0.50,
    targetFaceH: 0.25,
    neckAnchorX: 0.50,
    neckAnchorY: 0.53,
    collarOverlapY: 0.05,
    hairExtentRatio: 0.80,
    hairLayering: 'front',
    defaultScale: 1.0,
    defaultRotation: 0
  },
  category: 'Humor',
  tags: ['lol', 'laugh', 'funny', 'haha', 'rofl', 'burst']
};
