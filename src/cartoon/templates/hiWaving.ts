import { CartoonTemplateManifest } from '../types';

/**
 * Layer 1 — Back SVG
 * Contains:
 * - "HI!" explosive comic pop-art greeting bubble with motion accents
 * - Chibi character body in stylish hooded streetwear
 * - Right arm raised waving hello enthusiastically
 * - Left hand resting playfully at hip
 * - Chunky cute sneakers and grounding shadow
 * - Neck pocket ready to receive photographic head
 */
export const HI_WAVING_BACK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>
    <!-- Gradients for vibrant chibi illustration -->
    <linearGradient id="bubbleGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FFE600"/>
      <stop offset="100%" stop-color="#FF9500"/>
    </linearGradient>
    <linearGradient id="jacketGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#3A86FF"/>
      <stop offset="100%" stop-color="#0056D2"/>
    </linearGradient>
    <linearGradient id="hoodieGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FF5A5F"/>
      <stop offset="100%" stop-color="#E02438"/>
    </linearGradient>
    <linearGradient id="pantsGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#2B2D42"/>
      <stop offset="100%" stop-color="#1B1C2A"/>
    </linearGradient>
    <linearGradient id="shoeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FFFFFF"/>
      <stop offset="100%" stop-color="#E2E8F0"/>
    </linearGradient>
    <filter id="stickerShadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="6" stdDeviation="4" flood-color="#000000" flood-opacity="0.15"/>
    </filter>
  </defs>

  <!-- 1. POPPING "HI!" BUBBLE & ACCENTS (Upper Right) -->
  <g id="hi-bubble-group">
    <!-- Star Sparkles around bubble -->
    <path d="M 680,180 Q 695,180 695,165 Q 695,180 710,180 Q 695,180 695,195 Q 695,180 680,180 Z" fill="#FFE600" stroke="#1E1E24" stroke-width="4"/>
    <path d="M 940,240 Q 950,240 950,230 Q 950,240 960,240 Q 950,240 950,250 Q 950,240 940,240 Z" fill="#FFE600" stroke="#1E1E24" stroke-width="4"/>
    <path d="M 720,110 Q 730,110 730,100 Q 730,110 740,110 Q 730,110 730,120 Q 730,110 720,110 Z" fill="#FF5A5F" stroke="#1E1E24" stroke-width="3"/>

    <!-- Dynamic Action Rays behind bubble -->
    <path d="M 690,140 L 660,110" stroke="#FF5A5F" stroke-width="6" stroke-linecap="round"/>
    <path d="M 830,95 L 835,65" stroke="#FF5A5F" stroke-width="6" stroke-linecap="round"/>
    <path d="M 940,135 L 970,110" stroke="#FF5A5F" stroke-width="6" stroke-linecap="round"/>

    <!-- Bold Pop Bubble Body -->
    <path d="M 720,130 C 790,100 900,105 935,160 C 970,210 960,285 905,325 C 860,355 780,355 730,325 C 700,305 675,275 680,230 C 685,185 695,145 720,130 Z"
          fill="url(#bubbleGrad)" stroke="#1E1E24" stroke-width="12" stroke-linejoin="round"/>

    <!-- Bubble Pointer tail -->
    <polygon points="730,315 670,360 710,280" fill="url(#bubbleGrad)" stroke="#1E1E24" stroke-width="12" stroke-linejoin="round"/>
    <!-- Inner cover to hide overlap border of tail -->
    <polygon points="733,310 675,355 712,285" fill="url(#bubbleGrad)"/>

    <!-- High-impact "HI!" Comic Typography -->
    <!-- "H" -->
    <path d="M 735,185 L 765,185 L 765,225 L 805,225 L 805,185 L 835,185 L 835,290 L 805,290 L 805,250 L 765,250 L 765,290 L 735,290 Z"
          fill="#FFFFFF" stroke="#1E1E24" stroke-width="10" stroke-linejoin="round"/>
    <!-- "I" -->
    <path d="M 855,185 L 885,185 L 885,290 L 855,290 Z"
          fill="#FFFFFF" stroke="#1E1E24" stroke-width="10" stroke-linejoin="round"/>
    <!-- "!" -->
    <path d="M 905,185 L 928,185 L 922,258 L 911,258 Z"
          fill="#FFFFFF" stroke="#1E1E24" stroke-width="9" stroke-linejoin="round"/>
    <circle cx="916.5" cy="278.5" r="11.5" fill="#FFFFFF" stroke="#1E1E24" stroke-width="9"/>

    <!-- Shiny Highlight curves on letters -->
    <path d="M 742,192 L 742,282" stroke="#FFF7C2" stroke-width="4" stroke-linecap="round"/>
    <path d="M 862,192 L 862,282" stroke="#FFF7C2" stroke-width="4" stroke-linecap="round"/>
  </g>

  <!-- 2. WAVING HAND & MOTION LINES (Top Left) -->
  <g id="waving-hand-group">
    <!-- Motion Action Curves -->
    <path d="M 230,280 C 215,310 215,350 235,380" fill="none" stroke="#3A86FF" stroke-width="7" stroke-linecap="round"/>
    <path d="M 205,295 C 190,325 190,355 205,375" fill="none" stroke="#3A86FF" stroke-width="5" stroke-linecap="round"/>

    <!-- Raised Left-arm (Screen-left, Character's right) -->
    <path d="M 405,530 C 350,490 280,410 260,335 C 255,315 285,300 300,320 C 330,365 390,470 435,510 Z"
          fill="url(#jacketGrad)" stroke="#1E1E24" stroke-width="10" stroke-linejoin="round"/>

    <!-- Puffy Cute Chibi Waving Hand / Glove -->
    <!-- Palm & Fingers -->
    <path d="M 265,335 C 245,315 235,275 255,255 C 275,235 305,245 315,270 C 330,240 365,255 365,280 C 375,260 405,280 395,310 C 390,335 375,350 345,365 C 315,380 280,355 265,335 Z"
          fill="#FFFFFF" stroke="#1E1E24" stroke-width="10" stroke-linejoin="round"/>
    <!-- Finger detail creases -->
    <path d="M 315,275 C 320,300 325,315 330,325" fill="none" stroke="#1E1E24" stroke-width="6" stroke-linecap="round"/>
    <path d="M 355,290 C 355,310 355,325 350,335" fill="none" stroke="#1E1E24" stroke-width="6" stroke-linecap="round"/>
    <!-- Thumb fold -->
    <path d="M 275,285 C 285,305 295,315 305,315" fill="none" stroke="#1E1E24" stroke-width="6" stroke-linecap="round"/>
  </g>

  <!-- 3. CHIBI LEGS & SNEAKERS (Bottom) -->
  <g id="chibi-legs">
    <!-- Grounding Contact Shadow -->
    <ellipse cx="512" cy="980" rx="280" ry="24" fill="#000000" opacity="0.18"/>

    <!-- Left Leg (Screen-Left) -->
    <path d="M 430,750 L 410,870 L 465,875 L 475,750 Z"
          fill="url(#pantsGrad)" stroke="#1E1E24" stroke-width="10" stroke-linejoin="round"/>
    <!-- Right Leg (Screen-Right) -->
    <path d="M 545,750 L 555,875 L 610,870 L 590,750 Z"
          fill="url(#pantsGrad)" stroke="#1E1E24" stroke-width="10" stroke-linejoin="round"/>

    <!-- Sneaker Left -->
    <path d="M 400,870 C 370,870 335,890 330,925 C 325,955 360,965 430,965 C 475,965 485,945 480,915 C 475,885 450,870 400,870 Z"
          fill="url(#shoeGrad)" stroke="#1E1E24" stroke-width="10" stroke-linejoin="round"/>
    <path d="M 330,940 L 478,940" stroke="#FF5A5F" stroke-width="8" stroke-linecap="round"/>
    <!-- Sneaker sole -->
    <path d="M 330,950 C 360,968 440,968 475,950" fill="none" stroke="#1E1E24" stroke-width="7"/>

    <!-- Sneaker Right -->
    <path d="M 620,870 C 650,870 685,890 690,925 C 695,955 660,965 590,965 C 545,965 535,945 540,915 C 545,885 570,870 620,870 Z"
          fill="url(#shoeGrad)" stroke="#1E1E24" stroke-width="10" stroke-linejoin="round"/>
    <path d="M 690,940 L 542,940" stroke="#FF5A5F" stroke-width="8" stroke-linecap="round"/>
    <!-- Sneaker sole -->
    <path d="M 690,950 C 660,968 580,968 545,950" fill="none" stroke="#1E1E24" stroke-width="7"/>
  </g>

  <!-- 4. CHIBI TORSO & JACKET BACK -->
  <g id="chibi-torso-back">
    <!-- Main Chubby Jacket Body -->
    <path d="M 390,530 C 365,580 370,680 375,750 C 420,765 600,765 645,750 C 650,680 655,580 630,530 Z"
          fill="url(#jacketGrad)" stroke="#1E1E24" stroke-width="11" stroke-linejoin="round"/>

    <!-- Jacket Hem Band -->
    <path d="M 373,730 C 430,755 590,755 647,730 L 646,755 C 590,775 430,775 374,755 Z"
          fill="#FF5A5F" stroke="#1E1E24" stroke-width="9" stroke-linejoin="round"/>

    <!-- Arm Rest on Hip (Screen-Right) -->
    <path d="M 620,535 C 670,560 705,620 695,680 C 685,730 650,735 635,705 C 625,680 615,640 610,610 Z"
          fill="url(#jacketGrad)" stroke="#1E1E24" stroke-width="10" stroke-linejoin="round"/>
    <!-- Chibi Fist on Hip -->
    <circle cx="640" cy="705" r="28" fill="#FFFFFF" stroke="#1E1E24" stroke-width="9"/>

    <!-- Back Hood Rim curve (visible behind neck) -->
    <path d="M 395,525 C 440,495 580,495 625,525 C 600,555 420,555 395,525 Z"
          fill="url(#hoodieGrad)" stroke="#1E1E24" stroke-width="10" stroke-linejoin="round"/>

    <!-- Deep Neck Well Shadow (where photo head neck base will sit) -->
    <ellipse cx="512" cy="535" rx="90" ry="28" fill="#1A1B26"/>
  </g>
</svg>`;

/**
 * Layer 3 — Front SVG
 * Contains:
 * - Overlapping hooded jacket collar & wide open lapels
 * - Drawstrings with cute golden aglets
 * - Center zipper and stylish lapel stitching
 *
 * This layer is drawn ON TOP of the photographic head (Layer 2).
 * Its geometry spans from Y=505 to Y=620 across X=390 to X=630,
 * completely concealing the lower photographic neck boundary
 * and preventing any visible seam, cutoff, or floating-head appearance.
 */
export const HI_WAVING_FRONT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>
    <linearGradient id="frontCollarGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FF6B6B"/>
      <stop offset="100%" stop-color="#E02438"/>
    </linearGradient>
    <linearGradient id="lapelGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#4D96FF"/>
      <stop offset="100%" stop-color="#0056D2"/>
    </linearGradient>
  </defs>

  <g id="overlapping-collar-layer">
    <!-- Inner Dark Crewneck / Undershirt (prevents chest bleed, caps neck cleanly) -->
    <path d="M 445,515 C 475,548 549,548 579,515 C 570,580 454,580 445,515 Z"
          fill="#1E1E28" stroke="#1E1E24" stroke-width="8" stroke-linejoin="round"/>
    <!-- Subtle Inner Crewneck Ribbing Accent -->
    <path d="M 456,525 C 480,550 544,550 568,525" fill="none" stroke="#2B2D42" stroke-width="4" stroke-linecap="round"/>

    <!-- Left Collar Flap (Screen-Left) -->
    <path d="M 400,515 C 420,545 440,575 480,595 C 470,565 445,530 425,510 Z"
          fill="url(#frontCollarGrad)" stroke="#1E1E24" stroke-width="10" stroke-linejoin="round"/>

    <!-- Right Collar Flap (Screen-Right) -->
    <path d="M 620,515 C 600,545 580,575 540,595 C 550,565 575,530 595,510 Z"
          fill="url(#frontCollarGrad)" stroke="#1E1E24" stroke-width="10" stroke-linejoin="round"/>

    <!-- Center Wide Jacket V-Collar Lapels -->
    <path d="M 415,515 C 455,545 490,560 512,560 C 534,560 569,545 609,515 C 625,545 615,590 580,615 C 545,635 475,635 440,615 C 405,590 395,545 415,515 Z"
          fill="url(#lapelGrad)" stroke="#1E1E24" stroke-width="11" stroke-linejoin="round"/>

    <!-- Inner Red Collar Accent Trim -->
    <path d="M 435,535 C 470,560 495,570 512,570 C 529,570 554,560 589,535 C 575,570 545,595 512,595 C 479,595 449,570 435,535 Z"
          fill="url(#frontCollarGrad)" stroke="#1E1E24" stroke-width="7" stroke-linejoin="round"/>

    <!-- Front Zipper & Pull-tab -->
    <line x1="512" y1="570" x2="512" y2="650" stroke="#1E1E24" stroke-width="8" stroke-linecap="round"/>
    <line x1="512" y1="580" x2="512" y2="640" stroke="#FFE600" stroke-width="4"/>
    <circle cx="512" cy="600" r="8" fill="#FFE600" stroke="#1E1E24" stroke-width="4"/>

    <!-- Hoodie Drawstrings Hanging down -->
    <!-- Left string -->
    <path d="M 450,580 C 440,610 445,640 435,670" fill="none" stroke="#FFFFFF" stroke-width="7" stroke-linecap="round"/>
    <path d="M 450,580 C 440,610 445,640 435,670" fill="none" stroke="#1E1E24" stroke-width="2"/>
    <rect x="430" y="668" width="10" height="16" rx="4" fill="#FFE600" stroke="#1E1E24" stroke-width="3"/>

    <!-- Right string -->
    <path d="M 570,580 C 580,610 575,640 585,670" fill="none" stroke="#FFFFFF" stroke-width="7" stroke-linecap="round"/>
    <path d="M 570,580 C 580,610 575,640 585,670" fill="none" stroke="#1E1E24" stroke-width="2"/>
    <rect x="580" y="668" width="10" height="16" rx="4" fill="#FFE600" stroke="#1E1E24" stroke-width="3"/>
  </g>
</svg>`;

/**
 * Manifest for the "HI! Waving" Cartoon Template
 */
export const HI_WAVING_TEMPLATE: CartoonTemplateManifest = {
  id: 'hi-waving-01',
  name: 'HI! Waving',
  description: 'Cheerful chibi character waving hello with a vibrant comic pop bubble',
  canvas: {
    width: 1024,
    height: 1024
  },
  layers: {
    backSvg: HI_WAVING_BACK_SVG,
    frontSvg: HI_WAVING_FRONT_SVG
  },
  headSlot: {
    // Center point for the photographic head
    centerX: 0.50, // 512px
    centerY: 0.40, // 410px
    targetWidth: 0.44, // 450px wide head (oversized chibi ratio)
    targetEyeAngleDegrees: 0, // Upright horizontal eye-line
    targetEyeY: 0.40, // 410px
    targetEyeDistance: 0.1025, // ~105px target eye span
    targetChinY: 0.50, // 512px (rests chin naturally on collar at Y=515)
    targetFaceH: 0.254, // 260px (ideal chibi face height)
    neckAnchorX: 0.50, // 512px
    neckAnchorY: 0.53, // 542px (tucks behind collar at Y=515-560)
    collarOverlapY: 0.055, // ~56px overlap buffer
    hairExtentRatio: 0.85, // Clamps hair to upper torso/shoulder level
    hairLayering: 'front', // 'front' or 'behind'
    defaultScale: 1.0,
    defaultRotation: 0
  },
  category: 'Greetings',
  tags: ['hi', 'hello', 'waving', 'cheerful', 'chibi', 'streetwear']
};

export const ALL_CARTOON_TEMPLATES: Record<string, CartoonTemplateManifest> = {
  'hi-waving-01': HI_WAVING_TEMPLATE
};
