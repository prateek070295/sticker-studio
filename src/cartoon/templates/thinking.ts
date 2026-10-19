import { CartoonTemplateManifest } from '../types';

/**
 * THINKING... — Cartoon Reactions Template
 * Pensive sitting pose with hand under chin, floating question marks and comic thought bubble.
 */
export const THINKING_BACK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>
    <linearGradient id="thThoughtGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FFFFFF"/>
      <stop offset="100%" stop-color="#E2E8F0"/>
    </linearGradient>
    <linearGradient id="thJacketGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#F4A261"/>
      <stop offset="100%" stop-color="#E76F51"/>
    </linearGradient>
    <linearGradient id="thPantsGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#264653"/>
      <stop offset="100%" stop-color="#1B333D"/>
    </linearGradient>
    <linearGradient id="thShoeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FFFFFF"/>
      <stop offset="100%" stop-color="#E2E8F0"/>
    </linearGradient>
  </defs>

  <!-- 1. THOUGHT BUBBLE & FLOATING QUESTION MARKS -->
  <g id="th-bubbles">
    <!-- Thought Bubble Little Trail Circles (Screen-Right) -->
    <circle cx="680" cy="270" r="16" fill="url(#thThoughtGrad)" stroke="#1E1E24" stroke-width="6"/>
    <circle cx="720" cy="220" r="24" fill="url(#thThoughtGrad)" stroke="#1E1E24" stroke-width="7"/>

    <!-- Main Fluffy Cloud Thought Bubble -->
    <path d="M 760,190 C 740,150 780,100 830,110 C 860,80 910,90 930,125 C 970,120 990,165 980,205 C 1000,240 970,285 930,285 C 910,315 860,315 830,290 C 790,310 750,270 760,230 C 740,215 745,200 760,190 Z"
          fill="url(#thThoughtGrad)" stroke="#1E1E24" stroke-width="9" stroke-linejoin="round"/>

    <!-- Bold Question Mark inside thought cloud -->
    <text x="865" y="235"
          font-family="system-ui, -apple-system, sans-serif, 'Impact', 'Arial Black'"
          font-weight="900"
          font-size="92"
          text-anchor="middle"
          fill="#E76F51"
          stroke="#1E1E24"
          stroke-width="8"
          stroke-linejoin="round"
          paint-order="stroke fill">?</text>

    <!-- Floating "?" (Left) -->
    <text x="210" y="240"
          font-family="system-ui, -apple-system, sans-serif, 'Impact', 'Arial Black'"
          font-weight="900"
          font-size="64"
          text-anchor="middle"
          fill="#2A9D8F"
          stroke="#1E1E24"
          stroke-width="7"
          stroke-linejoin="round"
          paint-order="stroke fill">?</text>
  </g>

  <!-- 2. "THINKING..." CAPTION BANNER -->
  <g id="th-caption">
    <rect x="230" y="65" width="460" height="80" rx="40" fill="#2A9D8F" stroke="#1E1E24" stroke-width="10"/>
    <rect x="237" y="72" width="446" height="66" rx="33" fill="#E9C46A"/>

    <text x="460" y="122"
          font-family="system-ui, -apple-system, sans-serif, 'Impact', 'Arial Black'"
          font-weight="900"
          font-size="46"
          text-anchor="middle"
          letter-spacing="5"
          fill="#1E1E24">THINKING...</text>
  </g>

  <!-- 3. WOODEN STOOL & CHIBI LEGS (Pensive sitting pose) -->
  <g id="th-sitting-pose">
    <!-- Ground Shadow -->
    <ellipse cx="512" cy="970" rx="270" ry="24" fill="#000000" opacity="0.18"/>

    <!-- Wooden Stool Seat & Legs -->
    <ellipse cx="512" cy="770" rx="190" ry="25" fill="#E76F51" stroke="#1E1E24" stroke-width="9"/>
    <!-- Stool Legs -->
    <line x1="390" y1="785" x2="370" y2="950" stroke="#1E1E24" stroke-width="12" stroke-linecap="round"/>
    <line x1="634" y1="785" x2="654" y2="950" stroke="#1E1E24" stroke-width="12" stroke-linecap="round"/>
    <line x1="512" y1="790" x2="512" y2="950" stroke="#1E1E24" stroke-width="10" stroke-linecap="round"/>

    <!-- Sitting Legs (dangling over stool) -->
    <!-- Left Leg -->
    <path d="M 430,730 L 415,860 L 470,865 L 475,730 Z"
          fill="url(#thPantsGrad)" stroke="#1E1E24" stroke-width="10" stroke-linejoin="round"/>
    <!-- Right Leg -->
    <path d="M 545,730 L 550,865 L 605,860 L 590,730 Z"
          fill="url(#thPantsGrad)" stroke="#1E1E24" stroke-width="10" stroke-linejoin="round"/>

    <!-- Sneaker Left -->
    <path d="M 400,860 C 370,860 340,880 335,910 C 330,940 365,950 435,950 C 475,950 485,930 480,905 C 475,875 450,860 400,860 Z"
          fill="url(#thShoeGrad)" stroke="#1E1E24" stroke-width="10" stroke-linejoin="round"/>
    <path d="M 335,925 L 480,925" stroke="#2A9D8F" stroke-width="7" stroke-linecap="round"/>

    <!-- Sneaker Right -->
    <path d="M 620,860 C 650,860 680,880 685,910 C 690,940 655,950 585,950 C 545,950 535,930 540,905 C 545,875 570,860 620,860 Z"
          fill="url(#thShoeGrad)" stroke="#1E1E24" stroke-width="10" stroke-linejoin="round"/>
    <path d="M 685,925 L 540,925" stroke="#2A9D8F" stroke-width="7" stroke-linecap="round"/>
  </g>

  <!-- 4. TORSO BACK & ARM POSE -->
  <g id="th-torso-back">
    <!-- Torso sitting -->
    <path d="M 390,510 C 365,560 370,660 380,740 C 430,760 590,760 640,740 C 650,660 655,560 630,510 Z"
          fill="url(#thJacketGrad)" stroke="#1E1E24" stroke-width="11" stroke-linejoin="round"/>

    <!-- Left Arm resting on knee -->
    <path d="M 390,530 C 330,560 340,660 400,700 C 420,710 440,680 430,660 C 390,630 380,580 410,550 Z"
          fill="url(#thJacketGrad)" stroke="#1E1E24" stroke-width="10" stroke-linejoin="round"/>
    <circle cx="415" cy="690" r="24" fill="#FFFFFF" stroke="#1E1E24" stroke-width="9"/>

    <!-- Neck socket -->
    <ellipse cx="505" cy="515" rx="85" ry="25" fill="#1A1B26"/>
  </g>
</svg>`;

/**
 * Layer 3 — Front SVG
 * Right arm reaching up with cute index finger resting delicately under chin, and collared polo neck.
 */
export const THINKING_FRONT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>
    <linearGradient id="thFrontJacketGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#F4A261"/>
      <stop offset="100%" stop-color="#E76F51"/>
    </linearGradient>
    <linearGradient id="thFrontCollarGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FFFFFF"/>
      <stop offset="100%" stop-color="#F8EDEB"/>
    </linearGradient>
  </defs>

  <g id="th-foreground-chin-hand-and-collar">
    <!-- Polo Collar overlapping lower chin Y=495-555 -->
    <path d="M 430,495 C 465,525 545,525 580,495 C 600,530 570,565 505,565 C 440,565 410,530 430,495 Z"
          fill="url(#thFrontCollarGrad)" stroke="#1E1E24" stroke-width="10" stroke-linejoin="round"/>

    <!-- Right Arm bending sharply upward to chin (Screen-Right) -->
    <path d="M 630,530 C 670,560 670,620 620,660 C 580,670 560,630 570,590 C 575,565 585,540 600,520 Z"
          fill="url(#thFrontJacketGrad)" stroke="#1E1E24" stroke-width="10" stroke-linejoin="round"/>

    <!-- Chubby fist resting under chin (X=560, Y=505) -->
    <circle cx="560" cy="515" r="24" fill="#FFFFFF" stroke="#1E1E24" stroke-width="9"/>
    <!-- Index finger tapping side of jaw -->
    <path d="M 550,515 L 565,475 C 570,460 588,468 582,485 L 570,515 Z"
          fill="#FFFFFF" stroke="#1E1E24" stroke-width="7" stroke-linejoin="round"/>
  </g>
</svg>`;

export const THINKING_TEMPLATE: CartoonTemplateManifest = {
  id: 'thinking-10',
  name: 'THINKING...',
  description: 'Pensive sitting pose on stool with hand under chin, floating question marks and thought bubble',
  canvas: {
    width: 1024,
    height: 1024
  },
  layers: {
    backSvg: THINKING_BACK_SVG,
    frontSvg: THINKING_FRONT_SVG
  },
  headSlot: {
    centerX: 0.49,
    centerY: 0.38,
    targetWidth: 0.43,
    targetEyeAngleDegrees: -4, // Pensive inquisitive tilt
    targetEyeY: 0.38,
    targetEyeDistance: 0.10,
    targetChinY: 0.49,
    targetFaceH: 0.25,
    neckAnchorX: 0.49,
    neckAnchorY: 0.52,
    collarOverlapY: 0.05,
    hairExtentRatio: 0.75,
    hairLayering: 'front',
    defaultScale: 1.0,
    defaultRotation: -4
  },
  category: 'Status',
  tags: ['thinking', 'curious', 'question', 'hmm', 'ponder', 'wonder', 'idea']
};
