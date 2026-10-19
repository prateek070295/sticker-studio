import { CartoonTemplateManifest } from '../types';
import {
  STICKER_01,
  STICKER_02,
  STICKER_03,
  STICKER_04,
  STICKER_05,
  STICKER_06,
  STICKER_07,
  STICKER_08,
  STICKER_09,
  STICKER_10,
  STICKER_11,
  STICKER_12,
  BUTTERFERN_REACTIONS_PACK,
  BUTTERFERN_REACTIONS_BY_ID,
} from './ButterfernReactions';

// Aliases for backward compatibility
export const HI_WAVING_TEMPLATE = STICKER_01;
export const LOVE_YOU_TEMPLATE = STICKER_02;
export const LOL_TEMPLATE = STICKER_03;
export const OH_NO_TEMPLATE = STICKER_04;
export const ANGRY_TEMPLATE = STICKER_05;
export const SLEEPY_TEMPLATE = STICKER_06;
export const THANK_YOU_TEMPLATE = STICKER_07;
export const LETS_GO_TEMPLATE = STICKER_08;
export const WOW_TEMPLATE = STICKER_09;
export const THINKING_TEMPLATE = STICKER_10;
export const YUMMY_TEMPLATE = STICKER_11;
export const BYE_BYE_TEMPLATE = STICKER_12;

export {
  STICKER_01,
  STICKER_02,
  STICKER_03,
  STICKER_04,
  STICKER_05,
  STICKER_06,
  STICKER_07,
  STICKER_08,
  STICKER_09,
  STICKER_10,
  STICKER_11,
  STICKER_12,
  BUTTERFERN_REACTIONS_PACK,
  BUTTERFERN_REACTIONS_BY_ID,
};

/**
 * Complete 12-Sticker Personalized Reactions Pack Collection
 * (Little Big Feelings original vector illustrations)
 */
export const CARTOON_REACTIONS_PACK: CartoonTemplateManifest[] = BUTTERFERN_REACTIONS_PACK;

export const ALL_CARTOON_TEMPLATES: Record<string, CartoonTemplateManifest> = BUTTERFERN_REACTIONS_BY_ID;
