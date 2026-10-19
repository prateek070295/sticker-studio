import { CartoonTemplateManifest } from '../types';

/**
 * THANK YOU! — Cartoon Reactions Template
 * Chibi character with hands pressed gratefully together, gentle cherry blossoms, and warm pastel glow.
 */
export const THANK_YOU_BACK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>
    <linearGradient id="tyBannerGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FFB4A2"/>
      <stop offset="100%" stop-color="#E5989B"/>
    </linearGradient>
    <linearGradient id="tySweaterGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#B5E48C"/>
      <stop offset="100%" stop-color="#76C893"/>
    </linearGradient>
    <linearGradient id="tyPantsGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#6D6875"/>
      <stop offset="100%" stop-color="#3D3A45"/>
    </linearGradient>
    <linearGradient id="tyShoeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FFFFFF"/>
      <stop offset="100%" stop-color="#E2E8F0"/>
    </linearGradient>
  </defs>

  <!-- 1. GENTLE BLOSSOMS & SPARKLES -->
  <g id="ty-petals">
    <!-- Blossom top-left -->
    <circle cx="230" cy="220" r="14" fill="#FFCDB2" stroke="#1E1E24" stroke-width="4"/>
    <circle cx="210" cy="200" r="14" fill="#FFCDB2" stroke="#1E1E24" stroke-width="4"/>
    <circle cx="250" cy="200" r="14" fill="#FFCDB2" stroke="#1E1E24" stroke-width="4"/>
    <circle cx="230" cy="180" r="14" fill="#FFCDB2" stroke="#1E1E24" stroke-width="4"/>
    <circle cx="230" cy="200" r="10" fill="#FFE600" stroke="#1E1E24" stroke-width="3"/>

    <!-- Blossom top-right -->
    <circle cx="794" cy="220" r="14" fill="#FFCDB2" stroke="#1E1E24" stroke-width="4"/>
    <circle cx="774" cy="200" r="14" fill="#FFCDB2" stroke="#1E1E24" stroke-width="4"/>
    <circle cx="814" cy="200" r="14" fill="#FFCDB2" stroke="#1E1E24" stroke-width="4"/>
    <circle cx="794" cy="180" r="14" fill="#FFCDB2" stroke="#1E1E24" stroke-width="4"/>
    <circle cx="794" cy="200" r="10" fill="#FFE600" stroke="#1E1E24" stroke-width="3"/>

    <!-- Falling petals -->
    <path d="M 180,310 C 160,330 180,350 200,340 C 210,320 200,300 180,310 Z" fill="#FFB4A2" stroke="#1E1E24" stroke-width="4"/>
    <path d="M 830,310 C 850,330 830,350 810,340 C 800,320 810,300 830,310 Z" fill="#FFB4A2" stroke="#1E1E24" stroke-width="4"/>
    <circle cx="160" cy="380" r="8" fill="#FFE600" stroke="#1E1E24" stroke-width="3"/>
    <circle cx="860" cy="380" r="8" fill="#FFE600" stroke="#1E1E24" stroke-width="3"/>
  </g>

  <!-- 2. "THANK YOU!" HEADER BANNER -->
  <g id="ty-caption">
    <rect x="220" y="70" width="584" height="90" rx="45" fill="url(#tyBannerGrad)" stroke="#1E1E24" stroke-width="10"/>
    <rect x="228" y="76" width="568" height="78" rx="39" fill="#FFF1E6"/>

    <text x="512" y="132"
          font-family="system-ui, -apple-system, sans-serif, 'Impact', 'Arial Black'"
          font-weight="900"
          font-size="54"
          text-anchor="middle"
          letter-spacing="5"
          fill="#B55D68"
          stroke="#1E1E24"
          stroke-width="9"
          stroke-linejoin="round"
          paint-order="stroke fill">THANK YOU!</text>
    <text x="512" y="132"
          font-family="system-ui, -apple-system, sans-serif, 'Impact', 'Arial Black'"
          font-weight="900"
          font-size="54"
          text-anchor="middle"
          letter-spacing="5"
          fill="#FFFFFF">THANK YOU!</text>
  </g>

  <!-- 3. CHIBI LEGS & FEET -->
  <g id="ty-legs">
    <!-- Ground Shadow -->
    <ellipse cx="512" cy="970" rx="270" ry="24" fill="#000000" opacity="0.18"/>

    <!-- Left Leg -->
    <path d="M 440,750 L 420,875 L 475,875 L 480,750 Z"
          fill="url(#tyPantsGrad)" stroke="#1E1E24" stroke-width="10" stroke-linejoin="round"/>
    <!-- Right Leg -->
    <path d="M 540,750 L 545,875 L 600,875 L 580,750 Z"
          fill="url(#tyPantsGrad)" stroke="#1E1E24" stroke-width="10" stroke-linejoin="round"/>

    <!-- Left Sneaker -->
    <path d="M 405,875 C 380,875 350,895 345,925 C 340,955 375,965 445,965 C 485,965 495,945 490,920 C 485,890 460,875 405,875 Z"
          fill="url(#tyShoeGrad)" stroke="#1E1E24" stroke-width="10" stroke-linejoin="round"/>
    <path d="M 345,940 L 490,940" stroke="#76C893" stroke-width="7" stroke-linecap="round"/>

    <!-- Right Sneaker -->
    <path d="M 615,875 C 640,875 670,895 675,925 C 680,955 645,965 575,965 C 535,965 525,945 530,920 C 535,890 560,875 615,875 Z"
          fill="url(#tyShoeGrad)" stroke="#1E1E24" stroke-width="10" stroke-linejoin="round"/>
    <path d="M 675,940 L 530,940" stroke="#76C893" stroke-width="7" stroke-linecap="round"/>
  </g>

  <!-- 4. CHIBI BODY BACK -->
  <g id="ty-torso-back">
    <path d="M 390,510 C 365,560 370,670 375,750 C 420,765 600,765 645,750 C 650,670 655,560 630,510 Z"
          fill="url(#tySweaterGrad)" stroke="#1E1E24" stroke-width="11" stroke-linejoin="round"/>

    <!-- Outer shoulders curving to joined hands -->
    <path d="M 390,520 C 350,560 380,660 450,680" fill="none" stroke="url(#tySweaterGrad)" stroke-width="48" stroke-linecap="round"/>
    <path d="M 390,520 C 350,560 380,660 450,680" fill="none" stroke="#1E1E24" stroke-width="10" stroke-linecap="round"/>

    <path d="M 630,520 C 670,560 640,660 570,680" fill="none" stroke="url(#tySweaterGrad)" stroke-width="48" stroke-linecap="round"/>
    <path d="M 630,520 C 670,560 640,660 570,680" fill="none" stroke="#1E1E24" stroke-width="10" stroke-linecap="round"/>

    <!-- Neck socket -->
    <ellipse cx="512" cy="515" rx="85" ry="25" fill="#1A1B26"/>
  </g>
</svg>`;

/**
 * Layer 3 — Front SVG
 * Hands gently pressed together in gratitude, and soft knit collar.
 */
export const THANK_YOU_FRONT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>
    <linearGradient id="tyCollarGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FFFFFF"/>
      <stop offset="100%" stop-color="#D8F3DC"/>
    </linearGradient>
  </defs>

  <g id="ty-foreground-hands-and-collar">
    <!-- Puffy cute sweater collar overlapping chin base Y=495-555 -->
    <path d="M 430,495 C 465,525 559,525 594,495 C 610,530 580,565 512,565 C 444,565 414,530 430,495 Z"
          fill="url(#tyCollarGrad)" stroke="#1E1E24" stroke-width="10" stroke-linejoin="round"/>

    <!-- Left hand pressed in prayer/gratitude -->
    <path d="M 495,580 C 480,590 480,650 495,680 C 512,680 512,580 495,580 Z"
          fill="#FFFFFF" stroke="#1E1E24" stroke-width="9" stroke-linejoin="round"/>
    <!-- Right hand pressed in prayer/gratitude -->
    <path d="M 529,580 C 544,590 544,650 529,680 C 512,680 512,580 529,580 Z"
          fill="#FFFFFF" stroke="#1E1E24" stroke-width="9" stroke-linejoin="round"/>

    <!-- Hand creases -->
    <line x1="512" y1="585" x2="512" y2="675" stroke="#1E1E24" stroke-width="4"/>

    <!-- Warm floating heart above hands -->
    <path d="M 512,550 C 498,530 475,535 475,555 C 475,575 512,595 512,595 C 512,595 549,575 549,555 C 549,535 526,530 512,550 Z"
          fill="#FF758F" stroke="#1E1E24" stroke-width="5"/>
  </g>
</svg>`;

export const THANK_YOU_TEMPLATE: CartoonTemplateManifest = {
  id: 'thank-you-07',
  name: 'THANK YOU!',
  description: 'Grateful pose with hands pressed together, gentle blossoms, and warm pastel styling',
  canvas: {
    width: 1024,
    height: 1024
  },
  layers: {
    backSvg: THANK_YOU_BACK_SVG,
    frontSvg: THANK_YOU_FRONT_SVG
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
    hairExtentRatio: 0.80,
    hairLayering: 'front',
    defaultScale: 1.0,
    defaultRotation: 0
  },
  category: 'Gratitude',
  tags: ['thank you', 'thanks', 'grateful', 'blessed', 'namaste', 'flowers', 'kind']
};
