import { CartoonTemplateManifest } from '../types';

/**
 * ANGRY! — Cartoon Reactions Template
 * Pouting stance with crossed arms, stomping foot with dust puff, and comic steam clouds.
 */
export const ANGRY_BACK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>
    <linearGradient id="angBannerGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#E63946"/>
      <stop offset="100%" stop-color="#9B2226"/>
    </linearGradient>
    <linearGradient id="angJacketGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#E63946"/>
      <stop offset="100%" stop-color="#A8202A"/>
    </linearGradient>
    <linearGradient id="angPantsGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#1D3557"/>
      <stop offset="100%" stop-color="#0B132B"/>
    </linearGradient>
    <linearGradient id="angShoeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FFFFFF"/>
      <stop offset="100%" stop-color="#E2E8F0"/>
    </linearGradient>
  </defs>

  <!-- 1. STEAM CLOUDS & RAGE MARKS (Behind Head) -->
  <g id="ang-steam-elements">
    <!-- Steam puff Left (X=230, Y=250) -->
    <path d="M 230,280 C 190,270 170,230 200,200 C 220,180 260,190 270,210 C 290,190 330,200 330,230 C 330,260 280,290 230,280 Z"
          fill="#FFFFFF" stroke="#1E1E24" stroke-width="8" stroke-linejoin="round"/>
    <path d="M 240,250 C 220,230 250,210 270,225" fill="none" stroke="#D3D3D3" stroke-width="4"/>

    <!-- Steam puff Right (X=794, Y=250) -->
    <path d="M 794,280 C 834,270 854,230 824,200 C 804,180 764,190 754,210 C 734,190 694,200 694,230 C 694,260 744,290 794,280 Z"
          fill="#FFFFFF" stroke="#1E1E24" stroke-width="8" stroke-linejoin="round"/>
    <path d="M 784,250 C 804,230 774,210 754,225" fill="none" stroke="#D3D3D3" stroke-width="4"/>

    <!-- Comic Anger Cross / Pop Vein (Top Left) -->
    <path d="M 330,140 C 335,160 345,165 365,165 M 345,140 C 345,155 335,165 320,165" fill="none" stroke="#E63946" stroke-width="7" stroke-linecap="round"/>
    <path d="M 365,145 C 365,160 355,170 340,170 M 350,145 C 350,155 360,165 375,165" fill="none" stroke="#E63946" stroke-width="7" stroke-linecap="round"/>

    <!-- Stomp Dust Cloud at foot (Bottom Left) -->
    <path d="M 310,950 C 280,940 270,910 290,890 C 310,875 340,880 350,900 C 370,890 395,905 390,925 C 385,945 340,955 310,950 Z"
          fill="#FFFFFF" stroke="#1E1E24" stroke-width="7" stroke-linejoin="round"/>
    <line x1="280" y1="960" x2="250" y2="970" stroke="#E63946" stroke-width="6" stroke-linecap="round"/>
    <line x1="300" y1="970" x2="280" y2="985" stroke="#E63946" stroke-width="6" stroke-linecap="round"/>
  </g>

  <!-- 2. "ANGRY!" COMIC TITLE -->
  <g id="ang-caption">
    <!-- Jagged angry bubble -->
    <polygon points="512,45 570,80 650,55 640,120 730,125 680,180 750,215 670,250 512,230 354,250 274,215 344,180 294,125 384,120 374,55 454,80"
             fill="url(#angBannerGrad)" stroke="#1E1E24" stroke-width="11" stroke-linejoin="round"/>

    <text x="512" y="175"
          font-family="system-ui, -apple-system, sans-serif, 'Impact', 'Arial Black'"
          font-weight="900"
          font-size="76"
          text-anchor="middle"
          letter-spacing="5"
          fill="#FFFFFF"
          stroke="#1E1E24"
          stroke-width="11"
          stroke-linejoin="round"
          paint-order="stroke fill">ANGRY!</text>
    <text x="512" y="175"
          font-family="system-ui, -apple-system, sans-serif, 'Impact', 'Arial Black'"
          font-weight="900"
          font-size="76"
          text-anchor="middle"
          letter-spacing="5"
          fill="#FFFFFF">ANGRY!</text>
  </g>

  <!-- 3. CHIBI LEGS & STOMPING SNEAKERS -->
  <g id="ang-legs">
    <!-- Ground Shadow -->
    <ellipse cx="512" cy="970" rx="280" ry="24" fill="#000000" opacity="0.18"/>

    <!-- Left Stomping Leg (Lifted / Stomped firmly) -->
    <path d="M 405,750 L 360,865 L 420,875 L 450,750 Z"
          fill="url(#angPantsGrad)" stroke="#1E1E24" stroke-width="10" stroke-linejoin="round"/>
    <!-- Right Leg standing firm -->
    <path d="M 565,750 L 575,875 L 635,870 L 610,750 Z"
          fill="url(#angPantsGrad)" stroke="#1E1E24" stroke-width="10" stroke-linejoin="round"/>

    <!-- Stomping Sneaker Left -->
    <path d="M 350,865 C 320,865 290,885 285,915 C 280,945 315,955 385,955 C 430,955 440,935 435,905 C 430,875 405,865 350,865 Z"
          fill="url(#angShoeGrad)" stroke="#1E1E24" stroke-width="10" stroke-linejoin="round"/>
    <path d="M 285,930 L 435,930" stroke="#E63946" stroke-width="7" stroke-linecap="round"/>

    <!-- Sneaker Right -->
    <path d="M 645,870 C 675,870 705,890 710,920 C 715,950 680,960 610,960 C 565,960 555,940 560,910 C 565,880 590,870 645,870 Z"
          fill="url(#angShoeGrad)" stroke="#1E1E24" stroke-width="10" stroke-linejoin="round"/>
    <path d="M 710,935 L 560,935" stroke="#E63946" stroke-width="7" stroke-linecap="round"/>
  </g>

  <!-- 4. CHIBI BODY BACK -->
  <g id="ang-torso-back">
    <path d="M 380,520 C 355,570 360,670 370,750 C 420,765 604,765 654,750 C 664,670 669,570 644,520 Z"
          fill="url(#angJacketGrad)" stroke="#1E1E24" stroke-width="11" stroke-linejoin="round"/>

    <!-- Neck socket -->
    <ellipse cx="512" cy="525" rx="85" ry="25" fill="#1A1B26"/>
  </g>
</svg>`;

/**
 * Layer 3 — Front SVG
 * Crossed arms tightly folded across chest and high puffed jacket collar.
 */
export const ANGRY_FRONT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>
    <linearGradient id="angFrontJacketGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FF4D6D"/>
      <stop offset="100%" stop-color="#C9184A"/>
    </linearGradient>
  </defs>

  <g id="ang-foreground-crossed-arms">
    <!-- High puffy jacket collar overlapping lower chin Y=505-570 -->
    <path d="M 425,505 C 465,540 559,540 599,505 C 625,545 595,585 512,585 C 429,585 399,545 425,505 Z"
          fill="url(#angFrontJacketGrad)" stroke="#1E1E24" stroke-width="10" stroke-linejoin="round"/>

    <!-- Puffy collar zip seam -->
    <line x1="512" y1="540" x2="512" y2="585" stroke="#FFE600" stroke-width="4"/>

    <!-- Left Arm folded over chest -->
    <path d="M 360,560 C 350,620 400,670 512,670 C 580,670 630,640 640,610 C 640,580 610,575 580,590 C 530,615 450,615 400,575 Z"
          fill="url(#angFrontJacketGrad)" stroke="#1E1E24" stroke-width="10" stroke-linejoin="round"/>
    <!-- Left Hand tucked under right bicep -->
    <ellipse cx="615" cy="595" rx="22" ry="18" fill="#FFFFFF" stroke="#1E1E24" stroke-width="8"/>

    <!-- Right Arm folded over chest overlapping left -->
    <path d="M 664,560 C 674,620 624,670 512,670 C 444,670 394,640 384,610 C 384,580 414,575 444,590 C 494,615 574,615 624,575 Z"
          fill="url(#angFrontJacketGrad)" stroke="#1E1E24" stroke-width="10" stroke-linejoin="round"/>
    <!-- Right Hand tucked under left bicep -->
    <ellipse cx="409" cy="595" rx="22" ry="18" fill="#FFFFFF" stroke="#1E1E24" stroke-width="8"/>
  </g>
</svg>`;

export const ANGRY_TEMPLATE: CartoonTemplateManifest = {
  id: 'angry-05',
  name: 'ANGRY!',
  description: 'Pouting stance with crossed arms, stomping foot with dust puff, and comic steam clouds',
  canvas: {
    width: 1024,
    height: 1024
  },
  layers: {
    backSvg: ANGRY_BACK_SVG,
    frontSvg: ANGRY_FRONT_SVG
  },
  headSlot: {
    centerX: 0.50,
    centerY: 0.39,
    targetWidth: 0.44,
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
  tags: ['angry', 'mad', 'pout', 'stomp', 'rage', 'steam']
};
