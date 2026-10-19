import { CartoonTemplateManifest } from '../types';

/**
 * LOVE YOU — Cartoon Reactions Template
 * Chibi character hugging an oversized glossy red heart with floating love sparkles.
 */
export const LOVE_YOU_BACK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>
    <linearGradient id="lyHeartGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FF3366"/>
      <stop offset="60%" stop-color="#E60039"/>
      <stop offset="100%" stop-color="#B3002D"/>
    </linearGradient>
    <linearGradient id="lyJacketGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FF85A2"/>
      <stop offset="100%" stop-color="#FF5C8A"/>
    </linearGradient>
    <linearGradient id="lyPantsGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#4A4E69"/>
      <stop offset="100%" stop-color="#22223B"/>
    </linearGradient>
    <linearGradient id="lyShoeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FFFFFF"/>
      <stop offset="100%" stop-color="#F2E9E4"/>
    </linearGradient>
    <linearGradient id="lyTextGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#FFFFFF"/>
      <stop offset="100%" stop-color="#FFE5EC"/>
    </linearGradient>
  </defs>

  <!-- 1. FLOATING HEARTS & SPARKLES -->
  <g id="ly-sparkles">
    <!-- Floating mini heart top left -->
    <path d="M 210,180 C 185,150 145,160 145,195 C 145,230 210,265 210,265 C 210,265 275,230 275,195 C 275,160 235,150 210,180 Z"
          fill="#FF758F" stroke="#1E1E24" stroke-width="6"/>
    <!-- Floating mini heart top right -->
    <path d="M 830,190 C 810,165 775,175 775,200 C 775,230 830,260 830,260 C 830,260 885,230 885,200 C 885,175 850,165 830,190 Z"
          fill="#FF4D6D" stroke="#1E1E24" stroke-width="6"/>
    <!-- Sparkles -->
    <path d="M 160,290 Q 170,290 170,280 Q 170,290 180,290 Q 170,290 170,300 Q 170,290 160,290 Z" fill="#FFE600" stroke="#1E1E24" stroke-width="3"/>
    <path d="M 870,280 Q 880,280 880,270 Q 880,280 890,280 Q 880,280 880,290 Q 880,280 870,280 Z" fill="#FFE600" stroke="#1E1E24" stroke-width="3"/>
    <path d="M 750,130 Q 760,130 760,120 Q 760,130 770,130 Q 760,130 760,140 Q 760,130 750,130 Z" fill="#FF758F" stroke="#1E1E24" stroke-width="3"/>
  </g>

  <!-- 2. "LOVE YOU" HEADER BANNER -->
  <g id="ly-caption-group">
    <ellipse cx="512" cy="115" rx="270" ry="55" fill="#C9184A" stroke="#1E1E24" stroke-width="10"/>
    <ellipse cx="512" cy="110" rx="260" ry="50" fill="#FF4D6D"/>

    <!-- Text: "LOVE YOU" -->
    <text x="512" y="128"
          font-family="system-ui, -apple-system, sans-serif, 'Impact', 'Arial Black'"
          font-weight="900"
          font-size="64"
          text-anchor="middle"
          letter-spacing="4"
          fill="url(#lyTextGrad)"
          stroke="#1E1E24"
          stroke-width="10"
          stroke-linejoin="round"
          paint-order="stroke fill">LOVE YOU</text>
    <!-- Text Highlight Inset -->
    <text x="512" y="128"
          font-family="system-ui, -apple-system, sans-serif, 'Impact', 'Arial Black'"
          font-weight="900"
          font-size="64"
          text-anchor="middle"
          letter-spacing="4"
          fill="#FFFFFF">LOVE YOU</text>
  </g>

  <!-- 3. CHIBI LEGS & FEET -->
  <g id="ly-legs">
    <!-- Ground Shadow -->
    <ellipse cx="512" cy="970" rx="260" ry="22" fill="#000000" opacity="0.18"/>

    <!-- Left Leg (Pigeon-toed cute stance) -->
    <path d="M 440,750 L 420,875 L 475,875 L 480,750 Z"
          fill="url(#lyPantsGrad)" stroke="#1E1E24" stroke-width="10" stroke-linejoin="round"/>
    <!-- Right Leg -->
    <path d="M 540,750 L 545,875 L 600,875 L 580,750 Z"
          fill="url(#lyPantsGrad)" stroke="#1E1E24" stroke-width="10" stroke-linejoin="round"/>

    <!-- Sneaker Left (angled inward) -->
    <path d="M 405,875 C 380,875 350,895 345,925 C 340,955 375,965 445,965 C 485,965 495,945 490,920 C 485,890 460,875 405,875 Z"
          fill="url(#lyShoeGrad)" stroke="#1E1E24" stroke-width="10" stroke-linejoin="round"/>
    <path d="M 345,940 L 490,940" stroke="#FF4D6D" stroke-width="7" stroke-linecap="round"/>

    <!-- Sneaker Right (angled inward) -->
    <path d="M 615,875 C 640,875 670,895 675,925 C 680,955 645,965 575,965 C 535,965 525,945 530,920 C 535,890 560,875 615,875 Z"
          fill="url(#lyShoeGrad)" stroke="#1E1E24" stroke-width="10" stroke-linejoin="round"/>
    <path d="M 675,940 L 530,940" stroke="#FF4D6D" stroke-width="7" stroke-linecap="round"/>
  </g>

  <!-- 4. CHIBI BODY & GIANT HEART BACKDROP -->
  <g id="ly-torso-and-heart-base">
    <!-- Torso silhouette behind heart -->
    <path d="M 390,500 C 370,550 375,670 380,750 C 430,765 590,765 640,750 C 645,670 650,550 630,500 Z"
          fill="url(#lyJacketGrad)" stroke="#1E1E24" stroke-width="11" stroke-linejoin="round"/>

    <!-- Giant Huggable Heart (Lower Body Area) -->
    <path d="M 512,540 C 470,470 340,460 310,560 C 280,660 380,750 512,850 C 644,750 744,660 714,560 C 684,460 554,470 512,540 Z"
          fill="url(#lyHeartGrad)" stroke="#1E1E24" stroke-width="12" stroke-linejoin="round"/>

    <!-- Heart Gloss Highlights -->
    <path d="M 360,540 C 340,580 340,640 370,680" fill="none" stroke="#FFFFFF" stroke-width="12" stroke-linecap="round" opacity="0.6"/>
    <ellipse cx="370" cy="530" rx="14" ry="9" fill="#FFFFFF" opacity="0.75" transform="rotate(-30 370 530)"/>

    <!-- Neck pocket shadow for photo head -->
    <ellipse cx="512" cy="505" rx="85" ry="25" fill="#1A1B26"/>
  </g>
</svg>`;

/**
 * Layer 3 — Front SVG
 * Forefront arms hugging the giant heart, and overlapping cozy collar.
 */
export const LOVE_YOU_FRONT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>
    <linearGradient id="lyFrontArmGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FF85A2"/>
      <stop offset="100%" stop-color="#FF5C8A"/>
    </linearGradient>
    <linearGradient id="lyFrontCollarGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FFFFFF"/>
      <stop offset="100%" stop-color="#FFCCD5"/>
    </linearGradient>
  </defs>

  <g id="ly-foreground-arms-and-collar">
    <!-- Puffy cute turtleneck collar concealing lower neck cutoff -->
    <path d="M 435,485 C 470,515 554,515 589,485 C 600,520 575,550 512,550 C 449,550 424,520 435,485 Z"
          fill="url(#lyFrontCollarGrad)" stroke="#1E1E24" stroke-width="10" stroke-linejoin="round"/>
    <!-- Collar knit ribs -->
    <line x1="480" y1="500" x2="480" y2="535" stroke="#FF758F" stroke-width="4" stroke-linecap="round"/>
    <line x1="512" y1="505" x2="512" y2="540" stroke="#FF758F" stroke-width="4" stroke-linecap="round"/>
    <line x1="544" y1="500" x2="544" y2="535" stroke="#FF758F" stroke-width="4" stroke-linecap="round"/>

    <!-- Left Arm wrapping around the heart -->
    <path d="M 330,570 C 350,650 420,680 470,680 C 475,680 475,650 450,640 C 410,630 365,600 350,560 Z"
          fill="url(#lyFrontArmGrad)" stroke="#1E1E24" stroke-width="10" stroke-linejoin="round"/>
    <!-- Left Hand / Mitten resting on heart center -->
    <ellipse cx="465" cy="660" rx="28" ry="24" fill="#FFFFFF" stroke="#1E1E24" stroke-width="9"/>

    <!-- Right Arm wrapping around the heart -->
    <path d="M 694,570 C 674,650 604,680 554,680 C 549,680 549,650 574,640 C 614,630 659,600 674,560 Z"
          fill="url(#lyFrontArmGrad)" stroke="#1E1E24" stroke-width="10" stroke-linejoin="round"/>
    <!-- Right Hand / Mitten resting on heart center -->
    <ellipse cx="559" cy="660" rx="28" ry="24" fill="#FFFFFF" stroke="#1E1E24" stroke-width="9"/>
  </g>
</svg>`;

export const LOVE_YOU_TEMPLATE: CartoonTemplateManifest = {
  id: 'love-you-02',
  name: 'LOVE YOU',
  description: 'Chibi character hugging an oversized glowing red heart with floating love sparkles',
  canvas: {
    width: 1024,
    height: 1024
  },
  layers: {
    backSvg: LOVE_YOU_BACK_SVG,
    frontSvg: LOVE_YOU_FRONT_SVG
  },
  headSlot: {
    centerX: 0.50,
    centerY: 0.38,
    targetWidth: 0.43,
    targetEyeAngleDegrees: 0,
    targetEyeY: 0.38,
    targetEyeDistance: 0.10,
    targetChinY: 0.48,
    targetFaceH: 0.25,
    neckAnchorX: 0.50,
    neckAnchorY: 0.51,
    collarOverlapY: 0.05,
    hairExtentRatio: 0.80,
    hairLayering: 'behind',
    defaultScale: 1.0,
    defaultRotation: 0
  },
  category: 'Affection',
  tags: ['love', 'heart', 'hug', 'cute', 'sweet', 'romance']
};
