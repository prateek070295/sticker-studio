import { CartoonTemplateManifest } from '../types';

/**
 * OH NO! — Cartoon Reactions Template
 * Both hands on cheeks in comic shock, leaning backward with dramatic lightning impact lines.
 */
export const OH_NO_BACK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>
    <linearGradient id="onShockGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#FF5964"/>
      <stop offset="100%" stop-color="#D90429"/>
    </linearGradient>
    <linearGradient id="onSweaterGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#5E60CE"/>
      <stop offset="100%" stop-color="#48BFE3"/>
    </linearGradient>
    <linearGradient id="onPantsGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#2B2D42"/>
      <stop offset="100%" stop-color="#1B1C2A"/>
    </linearGradient>
    <linearGradient id="onShoeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FFFFFF"/>
      <stop offset="100%" stop-color="#E2E8F0"/>
    </linearGradient>
  </defs>

  <!-- 1. DRAMATIC SHOCK RAYS & LIGHTNING IMPACT -->
  <g id="on-shock-lines">
    <!-- Shock radiating lines -->
    <line x1="160" y1="220" x2="260" y2="280" stroke="#FF5964" stroke-width="8" stroke-linecap="round"/>
    <line x1="120" y1="340" x2="230" y2="360" stroke="#FF5964" stroke-width="8" stroke-linecap="round"/>
    <line x1="150" y1="460" x2="250" y2="440" stroke="#FF5964" stroke-width="8" stroke-linecap="round"/>

    <line x1="864" y1="220" x2="764" y2="280" stroke="#FF5964" stroke-width="8" stroke-linecap="round"/>
    <line x1="904" y1="340" x2="794" y2="360" stroke="#FF5964" stroke-width="8" stroke-linecap="round"/>
    <line x1="874" y1="460" x2="774" y2="440" stroke="#FF5964" stroke-width="8" stroke-linecap="round"/>

    <!-- Giant cartoon sweat drop (Top right of head) -->
    <path d="M 750,260 C 720,290 700,320 710,345 C 720,365 745,370 765,360 C 785,345 780,310 750,260 Z"
          fill="#48CAE4" stroke="#1E1E24" stroke-width="6"/>
  </g>

  <!-- 2. "OH NO!" VIBRANT COMIC BANNER -->
  <g id="on-caption">
    <!-- Spiky shock speech bubble -->
    <polygon points="512,40 550,85 640,60 635,115 720,110 690,165 765,190 715,230 735,270 512,250 289,270 309,230 259,190 334,165 304,110 389,115 384,60 474,85"
             fill="url(#onShockGrad)" stroke="#1E1E24" stroke-width="12" stroke-linejoin="round"/>

    <text x="512" y="180"
          font-family="system-ui, -apple-system, sans-serif, 'Impact', 'Arial Black'"
          font-weight="900"
          font-size="74"
          text-anchor="middle"
          letter-spacing="5"
          fill="#FFFFFF"
          stroke="#1E1E24"
          stroke-width="11"
          stroke-linejoin="round"
          paint-order="stroke fill">OH NO!</text>
    <text x="512" y="180"
          font-family="system-ui, -apple-system, sans-serif, 'Impact', 'Arial Black'"
          font-weight="900"
          font-size="74"
          text-anchor="middle"
          letter-spacing="5"
          fill="#FFFFFF">OH NO!</text>
  </g>

  <!-- 3. CHIBI LEGS & SNEAKERS (Leaning back in surprise) -->
  <g id="on-legs">
    <!-- Ground Shadow -->
    <ellipse cx="512" cy="970" rx="270" ry="24" fill="#000000" opacity="0.18"/>

    <!-- Left Leg straight back -->
    <path d="M 430,750 L 400,875 L 460,875 L 475,750 Z"
          fill="url(#onPantsGrad)" stroke="#1E1E24" stroke-width="10" stroke-linejoin="round"/>
    <!-- Right Leg straight back -->
    <path d="M 545,750 L 560,875 L 620,875 L 590,750 Z"
          fill="url(#onPantsGrad)" stroke="#1E1E24" stroke-width="10" stroke-linejoin="round"/>

    <!-- Sneaker Left -->
    <path d="M 390,875 C 360,875 330,895 325,925 C 320,955 355,965 425,965 C 470,965 480,945 475,915 C 470,885 445,875 390,875 Z"
          fill="url(#onShoeGrad)" stroke="#1E1E24" stroke-width="10" stroke-linejoin="round"/>
    <path d="M 325,940 L 475,940" stroke="#FF5964" stroke-width="7" stroke-linecap="round"/>

    <!-- Sneaker Right -->
    <path d="M 630,875 C 660,875 690,895 695,925 C 700,955 665,965 595,965 C 550,965 540,945 545,915 C 550,885 575,875 630,875 Z"
          fill="url(#onShoeGrad)" stroke="#1E1E24" stroke-width="10" stroke-linejoin="round"/>
    <path d="M 695,940 L 545,940" stroke="#FF5964" stroke-width="7" stroke-linecap="round"/>
  </g>

  <!-- 4. CHIBI BODY & ARMS REACHING UP TO CHEEKS (Back Skeleton) -->
  <g id="on-torso-back">
    <!-- Torso -->
    <path d="M 385,520 C 365,580 370,680 375,750 C 420,765 600,765 645,750 C 650,680 655,580 635,520 Z"
          fill="url(#onSweaterGrad)" stroke="#1E1E24" stroke-width="11" stroke-linejoin="round"/>

    <!-- Left Upper Arm reaching up toward left cheek -->
    <path d="M 385,550 C 330,520 280,440 310,380 C 325,355 365,370 360,400 C 345,445 375,500 410,540 Z"
          fill="url(#onSweaterGrad)" stroke="#1E1E24" stroke-width="10" stroke-linejoin="round"/>

    <!-- Right Upper Arm reaching up toward right cheek -->
    <path d="M 635,550 C 690,520 740,440 710,380 C 695,355 655,370 660,400 C 675,445 645,500 610,540 Z"
          fill="url(#onSweaterGrad)" stroke="#1E1E24" stroke-width="10" stroke-linejoin="round"/>

    <!-- Neck pocket shadow -->
    <ellipse cx="512" cy="525" rx="85" ry="25" fill="#1A1B26"/>
  </g>
</svg>`;

/**
 * Layer 3 — Front SVG
 * Hands pressed against cheeks in Macauley Culkin shock, and high scarf collar.
 */
export const OH_NO_FRONT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>
    <linearGradient id="onScarfGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FF5964"/>
      <stop offset="100%" stop-color="#D90429"/>
    </linearGradient>
  </defs>

  <g id="on-foreground-hands-and-collar">
    <!-- Puffy cute scarf covering neck cutoff Y=505-570 -->
    <path d="M 425,505 C 460,535 564,535 599,505 C 615,545 585,580 512,580 C 439,580 409,545 425,505 Z"
          fill="url(#onScarfGrad)" stroke="#1E1E24" stroke-width="10" stroke-linejoin="round"/>
    <!-- Scarf fringe fold -->
    <path d="M 490,550 L 485,630 L 535,630 L 530,550 Z"
          fill="url(#onScarfGrad)" stroke="#1E1E24" stroke-width="8" stroke-linejoin="round"/>
    <line x1="490" y1="630" x2="490" y2="645" stroke="#FFE600" stroke-width="4"/>
    <line x1="510" y1="630" x2="510" y2="645" stroke="#FFE600" stroke-width="4"/>
    <line x1="530" y1="630" x2="530" y2="645" stroke="#FFE600" stroke-width="4"/>

    <!-- Left Chubby Hand clasping Left Cheek (Screen-Left X=310, Y=430) -->
    <path d="M 310,410 C 290,425 285,465 310,480 C 335,495 365,475 365,450 C 365,425 335,400 310,410 Z"
          fill="#FFFFFF" stroke="#1E1E24" stroke-width="10" stroke-linejoin="round"/>
    <!-- Cute finger crease marks -->
    <path d="M 330,425 C 345,435 350,445 350,455" fill="none" stroke="#1E1E24" stroke-width="5" stroke-linecap="round"/>
    <path d="M 315,445 C 325,455 330,465 330,470" fill="none" stroke="#1E1E24" stroke-width="5" stroke-linecap="round"/>

    <!-- Right Chubby Hand clasping Right Cheek (Screen-Right X=714, Y=430) -->
    <path d="M 714,410 C 734,425 739,465 714,480 C 689,495 659,475 659,450 C 659,425 689,400 714,410 Z"
          fill="#FFFFFF" stroke="#1E1E24" stroke-width="10" stroke-linejoin="round"/>
    <!-- Cute finger crease marks -->
    <path d="M 694,425 C 679,435 674,445 674,455" fill="none" stroke="#1E1E24" stroke-width="5" stroke-linecap="round"/>
    <path d="M 709,445 C 699,455 694,465 694,470" fill="none" stroke="#1E1E24" stroke-width="5" stroke-linecap="round"/>
  </g>
</svg>`;

export const OH_NO_TEMPLATE: CartoonTemplateManifest = {
  id: 'oh-no-04',
  name: 'OH NO!',
  description: 'Hands clutching cheeks in comic shock, leaning back with lightning accents and sweat drop',
  canvas: {
    width: 1024,
    height: 1024
  },
  layers: {
    backSvg: OH_NO_BACK_SVG,
    frontSvg: OH_NO_FRONT_SVG
  },
  headSlot: {
    centerX: 0.50,
    centerY: 0.39,
    targetWidth: 0.43,
    targetEyeAngleDegrees: 0,
    targetEyeY: 0.39,
    targetEyeDistance: 0.10,
    targetChinY: 0.49,
    targetFaceH: 0.25,
    neckAnchorX: 0.50,
    neckAnchorY: 0.52,
    collarOverlapY: 0.05,
    hairExtentRatio: 0.75,
    hairLayering: 'front',
    defaultScale: 1.0,
    defaultRotation: 0
  },
  category: 'Reactions',
  tags: ['oh no', 'shock', 'gasp', 'surprise', 'omg', 'yikes']
};
