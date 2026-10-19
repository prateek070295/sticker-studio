import { CartoonTemplateManifest } from '../types';

/**
 * WOW! — Cartoon Reactions Template
 * Jumping high with both arms stretched overhead, rainbow starburst explosion and celebration confetti.
 */
export const WOW_BACK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>
    <linearGradient id="wowBurstGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FFE600"/>
      <stop offset="50%" stop-color="#FF5400"/>
      <stop offset="100%" stop-color="#FF0054"/>
    </linearGradient>
    <linearGradient id="wowJerseyGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#7209B7"/>
      <stop offset="100%" stop-color="#3F37C9"/>
    </linearGradient>
    <linearGradient id="wowShortsGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#4CC9F0"/>
      <stop offset="100%" stop-color="#4895EF"/>
    </linearGradient>
    <linearGradient id="wowShoeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FFFFFF"/>
      <stop offset="100%" stop-color="#E2E8F0"/>
    </linearGradient>
  </defs>

  <!-- 1. JUMPING STARBURST & CONFETTI (Behind Character) -->
  <g id="wow-starburst">
    <!-- Big Celebration Starburst (radiating behind head and torso) -->
    <polygon points="512,50 540,150 630,90 610,190 710,160 660,250 760,260 680,330 770,370 670,410 740,480 640,490 680,570 590,540 600,630 520,570 480,630 460,540 380,570 410,490 320,480 380,410 290,370 370,330 300,260 390,250 350,160 440,190 430,90 500,150"
             fill="url(#wowBurstGrad)" stroke="#1E1E24" stroke-width="11" stroke-linejoin="round"/>

    <!-- Confetti Diamonds & Circles -->
    <circle cx="210" cy="180" r="14" fill="#4CC9F0" stroke="#1E1E24" stroke-width="4"/>
    <circle cx="830" cy="180" r="14" fill="#4CC9F0" stroke="#1E1E24" stroke-width="4"/>
    <rect x="230" y="270" width="18" height="18" fill="#F72585" stroke="#1E1E24" stroke-width="4" transform="rotate(25 239 279)"/>
    <rect x="790" y="270" width="18" height="18" fill="#F72585" stroke="#1E1E24" stroke-width="4" transform="rotate(25 799 279)"/>
  </g>

  <!-- 2. "WOW!" HEADER BANNER -->
  <g id="wow-caption">
    <!-- Pop Oval Banner -->
    <ellipse cx="512" cy="115" rx="220" ry="55" fill="#F72585" stroke="#1E1E24" stroke-width="10"/>
    <ellipse cx="512" cy="110" rx="210" ry="50" fill="#FFE600"/>

    <text x="512" y="130"
          font-family="system-ui, -apple-system, sans-serif, 'Impact', 'Arial Black'"
          font-weight="900"
          font-size="66"
          text-anchor="middle"
          letter-spacing="5"
          fill="#F72585"
          stroke="#1E1E24"
          stroke-width="11"
          stroke-linejoin="round"
          paint-order="stroke fill">WOW!</text>
    <text x="512" y="130"
          font-family="system-ui, -apple-system, sans-serif, 'Impact', 'Arial Black'"
          font-weight="900"
          font-size="66"
          text-anchor="middle"
          letter-spacing="5"
          fill="#FFFFFF">WOW!</text>
  </g>

  <!-- 3. JUMPING LEGS (High in mid-air above ground shadow) -->
  <g id="wow-legs">
    <!-- Distant Ground Shadow below airborne feet -->
    <ellipse cx="512" cy="970" rx="180" ry="16" fill="#000000" opacity="0.14"/>

    <!-- Left Leg (tucked up high) -->
    <path d="M 440,730 L 400,820 L 455,835 L 485,730 Z"
          fill="url(#wowShortsGrad)" stroke="#1E1E24" stroke-width="10" stroke-linejoin="round"/>
    <!-- Left Sneaker (kicking out) -->
    <path d="M 390,820 C 360,820 330,835 325,865 C 320,895 355,905 425,905 C 470,905 480,885 475,855 C 470,825 445,820 390,820 Z"
          fill="url(#wowShoeGrad)" stroke="#1E1E24" stroke-width="10" stroke-linejoin="round"/>
    <path d="M 325,880 L 475,880" stroke="#F72585" stroke-width="7" stroke-linecap="round"/>

    <!-- Right Leg (tucked up high) -->
    <path d="M 545,730 L 575,835 L 630,820 L 590,730 Z"
          fill="url(#wowShortsGrad)" stroke="#1E1E24" stroke-width="10" stroke-linejoin="round"/>
    <!-- Right Sneaker (kicking out) -->
    <path d="M 640,820 C 670,820 700,835 705,865 C 710,895 675,905 605,905 C 560,905 550,885 555,855 C 560,825 585,820 640,820 Z"
          fill="url(#wowShoeGrad)" stroke="#1E1E24" stroke-width="10" stroke-linejoin="round"/>
    <path d="M 705,880 L 555,880" stroke="#F72585" stroke-width="7" stroke-linecap="round"/>
  </g>

  <!-- 4. TORSO BACK & ARMS REACHING OVERHEAD -->
  <g id="wow-torso-back">
    <!-- Jersey Body -->
    <path d="M 390,520 C 370,570 375,660 380,730 C 425,750 600,750 645,730 C 650,660 655,570 635,520 Z"
          fill="url(#wowJerseyGrad)" stroke="#1E1E24" stroke-width="11" stroke-linejoin="round"/>

    <!-- Arm Left reaching high up into the air -->
    <path d="M 405,530 C 350,470 280,340 260,250 C 255,230 290,215 305,235 C 335,280 400,450 435,505 Z"
          fill="url(#wowJerseyGrad)" stroke="#1E1E24" stroke-width="10" stroke-linejoin="round"/>
    <!-- Chibi open rejoicing hand Left -->
    <ellipse cx="270" cy="230" rx="28" ry="24" fill="#FFFFFF" stroke="#1E1E24" stroke-width="9"/>

    <!-- Arm Right reaching high up into the air -->
    <path d="M 620,530 C 675,470 745,340 765,250 C 770,230 735,215 720,235 C 690,280 625,450 590,505 Z"
          fill="url(#wowJerseyGrad)" stroke="#1E1E24" stroke-width="10" stroke-linejoin="round"/>
    <!-- Chibi open rejoicing hand Right -->
    <ellipse cx="755" cy="230" rx="28" ry="24" fill="#FFFFFF" stroke="#1E1E24" stroke-width="9"/>

    <!-- Neck socket -->
    <ellipse cx="512" cy="520" rx="85" ry="25" fill="#1A1B26"/>
  </g>
</svg>`;

/**
 * Layer 3 — Front SVG
 * Athletic jersey crewneck and chest emblem.
 */
export const WOW_FRONT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>
    <linearGradient id="wowCollarGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FFE600"/>
      <stop offset="100%" stop-color="#FF9E00"/>
    </linearGradient>
  </defs>

  <g id="wow-front-collar">
    <!-- Sporty athletic crewneck ribbing overlapping lower chin Y=500-565 -->
    <path d="M 430,500 C 465,535 559,535 594,500 C 610,540 580,575 512,575 C 444,575 414,540 430,500 Z"
          fill="url(#wowCollarGrad)" stroke="#1E1E24" stroke-width="10" stroke-linejoin="round"/>
    <!-- Ribbing accent stripe -->
    <path d="M 445,515 C 475,545 549,545 579,515" fill="none" stroke="#F72585" stroke-width="5" stroke-linecap="round"/>

    <!-- Gold Star on chest -->
    <polygon points="512,580 519,598 538,598 523,610 528,628 512,618 496,628 501,610 486,598 505,598"
             fill="#FFE600" stroke="#1E1E24" stroke-width="4"/>
  </g>
</svg>`;

export const WOW_TEMPLATE: CartoonTemplateManifest = {
  id: 'wow-09',
  name: 'WOW!',
  description: 'Airborne jumping pose with arms outstretched in victory and exploding rainbow starburst',
  canvas: {
    width: 1024,
    height: 1024
  },
  layers: {
    backSvg: WOW_BACK_SVG,
    frontSvg: WOW_FRONT_SVG
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
    neckAnchorY: 0.52,
    collarOverlapY: 0.05,
    hairExtentRatio: 0.75,
    hairLayering: 'behind',
    defaultScale: 1.0,
    defaultRotation: 0
  },
  category: 'Excitement',
  tags: ['wow', 'omg', 'super', 'awesome', 'jump', 'starburst', 'celebrate']
};
