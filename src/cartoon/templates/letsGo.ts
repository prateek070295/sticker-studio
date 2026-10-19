import { CartoonTemplateManifest } from '../types';

/**
 * LET'S GO! — Cartoon Reactions Template
 * Energetic running pose with sneakers, wind streaks, and forward-pointing enthusiasm.
 */
export const LETS_GO_BACK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>
    <linearGradient id="lgBannerGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FF9E00"/>
      <stop offset="100%" stop-color="#FF5400"/>
    </linearGradient>
    <linearGradient id="lgJacketGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#48CAE4"/>
      <stop offset="100%" stop-color="#0077B6"/>
    </linearGradient>
    <linearGradient id="lgPantsGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#2B2D42"/>
      <stop offset="100%" stop-color="#1B1C2A"/>
    </linearGradient>
    <linearGradient id="lgShoeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FFFFFF"/>
      <stop offset="100%" stop-color="#FFE600"/>
    </linearGradient>
  </defs>

  <!-- 1. SPEED TRAILS & MOTION DASHES -->
  <g id="lg-speed-lines">
    <!-- Back trail lines -->
    <line x1="80" y1="520" x2="260" y2="520" stroke="#FFE600" stroke-width="8" stroke-linecap="round"/>
    <line x1="120" y1="570" x2="280" y2="570" stroke="#FF9E00" stroke-width="7" stroke-linecap="round"/>
    <line x1="60" y1="620" x2="220" y2="620" stroke="#FFE600" stroke-width="8" stroke-linecap="round"/>
    <line x1="100" y1="680" x2="250" y2="680" stroke="#FF5400" stroke-width="6" stroke-linecap="round"/>

    <!-- Dust smoke puff behind running foot -->
    <path d="M 230,880 C 190,870 170,830 200,810 C 220,790 260,800 270,820 C 290,800 330,810 330,840 C 330,870 280,890 230,880 Z"
          fill="#FFFFFF" stroke="#1E1E24" stroke-width="7" stroke-linejoin="round"/>
  </g>

  <!-- 2. "LET'S GO!" BANNER (Top) -->
  <g id="lg-caption">
    <!-- Slanted dynamic speed banner -->
    <polygon points="210,65 790,65 760,165 180,165"
             fill="url(#lgBannerGrad)" stroke="#1E1E24" stroke-width="11" stroke-linejoin="round"/>
    <polygon points="216,72 780,72 753,158 189,158" fill="#FFB703"/>

    <text x="490" y="132"
          font-family="system-ui, -apple-system, sans-serif, 'Impact', 'Arial Black'"
          font-weight="900"
          font-size="62"
          text-anchor="middle"
          letter-spacing="5"
          fill="#FFFFFF"
          stroke="#1E1E24"
          stroke-width="10"
          stroke-linejoin="round"
          paint-order="stroke fill">LET'S GO!</text>
    <text x="490" y="132"
          font-family="system-ui, -apple-system, sans-serif, 'Impact', 'Arial Black'"
          font-weight="900"
          font-size="62"
          text-anchor="middle"
          letter-spacing="5"
          fill="#FFFFFF">LET'S GO!</text>
  </g>

  <!-- 3. RUNNING LEGS & SNEAKERS (Dynamic stride) -->
  <g id="lg-legs">
    <!-- Trailing Ground Shadow -->
    <ellipse cx="490" cy="970" rx="310" ry="22" fill="#000000" opacity="0.18"/>

    <!-- Left Leg: Striding backward -->
    <path d="M 390,730 L 260,820 L 290,870 L 440,760 Z"
          fill="url(#lgPantsGrad)" stroke="#1E1E24" stroke-width="10" stroke-linejoin="round"/>
    <!-- Sneaker Left (pointing back-down) -->
    <path d="M 240,820 C 220,840 200,880 220,910 C 240,940 280,920 310,870 C 310,850 280,830 240,820 Z"
          fill="url(#lgShoeGrad)" stroke="#1E1E24" stroke-width="10" stroke-linejoin="round"/>
    <path d="M 215,860 L 290,890" stroke="#FF5400" stroke-width="6" stroke-linecap="round"/>

    <!-- Right Leg: Striding forward -->
    <path d="M 520,740 L 620,830 L 670,800 L 580,720 Z"
          fill="url(#lgPantsGrad)" stroke="#1E1E24" stroke-width="10" stroke-linejoin="round"/>
    <!-- Sneaker Right (landing firmly forward) -->
    <path d="M 640,810 C 670,810 710,830 720,865 C 730,900 690,925 615,925 C 570,925 560,895 570,860 C 580,830 605,810 640,810 Z"
          fill="url(#lgShoeGrad)" stroke="#1E1E24" stroke-width="10" stroke-linejoin="round"/>
    <path d="M 720,885 L 570,885" stroke="#FF5400" stroke-width="7" stroke-linecap="round"/>
  </g>

  <!-- 4. TORSO BACK -->
  <g id="lg-torso-back">
    <!-- Windbreaker Torso leaning forward -->
    <path d="M 380,510 C 350,560 360,660 380,740 C 430,760 590,750 630,720 C 640,650 640,550 610,500 Z"
          fill="url(#lgJacketGrad)" stroke="#1E1E24" stroke-width="11" stroke-linejoin="round"/>

    <!-- Back arm pumping back (Screen-left) -->
    <path d="M 380,530 C 310,560 260,630 290,690 C 305,715 345,695 335,665 C 315,620 345,580 395,550 Z"
          fill="url(#lgJacketGrad)" stroke="#1E1E24" stroke-width="10" stroke-linejoin="round"/>
    <circle cx="310" cy="695" r="24" fill="#FFFFFF" stroke="#1E1E24" stroke-width="9"/>

    <!-- Neck socket -->
    <ellipse cx="505" cy="515" rx="85" ry="25" fill="#1A1B26"/>
  </g>
</svg>`;

/**
 * Layer 3 — Front SVG
 * Front arm pumping forward pointing enthusiastically, and sporty high windbreaker collar.
 */
export const LETS_GO_FRONT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>
    <linearGradient id="lgFrontJacketGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#48CAE4"/>
      <stop offset="100%" stop-color="#0096C7"/>
    </linearGradient>
  </defs>

  <g id="lg-foreground-collar-and-arm">
    <!-- Sporty windbreaker collar overlapping chin base Y=495-560 -->
    <path d="M 420,495 C 460,530 550,530 590,495 C 610,535 580,575 505,575 C 430,575 400,535 420,495 Z"
          fill="url(#lgFrontJacketGrad)" stroke="#1E1E24" stroke-width="10" stroke-linejoin="round"/>

    <!-- Zip pull -->
    <line x1="505" y1="525" x2="505" y2="580" stroke="#FFE600" stroke-width="4"/>

    <!-- Forward pumping arm (Screen-right, pointing ahead) -->
    <path d="M 590,520 C 660,540 730,580 770,550 C 790,535 770,495 730,510 C 680,530 630,500 590,500 Z"
          fill="url(#lgFrontJacketGrad)" stroke="#1E1E24" stroke-width="10" stroke-linejoin="round"/>
    <!-- Pointing Fist forward -->
    <circle cx="765" cy="535" r="26" fill="#FFFFFF" stroke="#1E1E24" stroke-width="9"/>
    <!-- Pointing finger -->
    <path d="M 770,520 L 810,510 C 825,505 830,525 815,535 L 775,545 Z"
          fill="#FFFFFF" stroke="#1E1E24" stroke-width="7" stroke-linejoin="round"/>
  </g>
</svg>`;

export const LETS_GO_TEMPLATE: CartoonTemplateManifest = {
  id: 'lets-go-08',
  name: "LET'S GO!",
  description: 'Energetic running forward pose with sneakers, speed streaks and windbreaker adventure styling',
  canvas: {
    width: 1024,
    height: 1024
  },
  layers: {
    backSvg: LETS_GO_BACK_SVG,
    frontSvg: LETS_GO_FRONT_SVG
  },
  headSlot: {
    centerX: 0.50,
    centerY: 0.38,
    targetWidth: 0.43,
    targetEyeAngleDegrees: 5, // Energetic forward momentum tilt
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
    defaultRotation: 5
  },
  category: 'Excitement',
  tags: ['lets go', 'run', 'fast', 'energy', 'adventure', 'hype', 'active']
};
