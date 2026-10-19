import { CartoonTemplateManifest } from '../types';
import { HI_WAVING_TEMPLATE } from './hiWaving';
import { LOVE_YOU_TEMPLATE } from './loveYou';
import { LOL_TEMPLATE } from './lol';
import { OH_NO_TEMPLATE } from './ohNo';
import { ANGRY_TEMPLATE } from './angry';
import { SLEEPY_TEMPLATE } from './sleepy';
import { THANK_YOU_TEMPLATE } from './thankYou';
import { LETS_GO_TEMPLATE } from './letsGo';
import { WOW_TEMPLATE } from './wow';
import { THINKING_TEMPLATE } from './thinking';
import { YUMMY_TEMPLATE } from './yummy';
import { BYE_BYE_TEMPLATE } from './byeBye';

export {
  HI_WAVING_TEMPLATE,
  LOVE_YOU_TEMPLATE,
  LOL_TEMPLATE,
  OH_NO_TEMPLATE,
  ANGRY_TEMPLATE,
  SLEEPY_TEMPLATE,
  THANK_YOU_TEMPLATE,
  LETS_GO_TEMPLATE,
  WOW_TEMPLATE,
  THINKING_TEMPLATE,
  YUMMY_TEMPLATE,
  BYE_BYE_TEMPLATE,
};

/**
 * Complete 12-Sticker Personalized Reactions Pack Collection
 */
export const CARTOON_REACTIONS_PACK: CartoonTemplateManifest[] = [
  HI_WAVING_TEMPLATE,    // 01: HI!
  LOVE_YOU_TEMPLATE,     // 02: LOVE YOU
  LOL_TEMPLATE,          // 03: LOL!
  OH_NO_TEMPLATE,        // 04: OH NO!
  ANGRY_TEMPLATE,        // 05: ANGRY!
  SLEEPY_TEMPLATE,       // 06: SLEEPY
  THANK_YOU_TEMPLATE,    // 07: THANK YOU!
  LETS_GO_TEMPLATE,      // 08: LET'S GO!
  WOW_TEMPLATE,          // 09: WOW!
  THINKING_TEMPLATE,     // 10: THINKING...
  YUMMY_TEMPLATE,        // 11: YUMMY!
  BYE_BYE_TEMPLATE,      // 12: BYE BYE!
];

export const ALL_CARTOON_TEMPLATES: Record<string, CartoonTemplateManifest> = {
  [HI_WAVING_TEMPLATE.id]: HI_WAVING_TEMPLATE,
  [LOVE_YOU_TEMPLATE.id]: LOVE_YOU_TEMPLATE,
  [LOL_TEMPLATE.id]: LOL_TEMPLATE,
  [OH_NO_TEMPLATE.id]: OH_NO_TEMPLATE,
  [ANGRY_TEMPLATE.id]: ANGRY_TEMPLATE,
  [SLEEPY_TEMPLATE.id]: SLEEPY_TEMPLATE,
  [THANK_YOU_TEMPLATE.id]: THANK_YOU_TEMPLATE,
  [LETS_GO_TEMPLATE.id]: LETS_GO_TEMPLATE,
  [WOW_TEMPLATE.id]: WOW_TEMPLATE,
  [THINKING_TEMPLATE.id]: THINKING_TEMPLATE,
  [YUMMY_TEMPLATE.id]: YUMMY_TEMPLATE,
  [BYE_BYE_TEMPLATE.id]: BYE_BYE_TEMPLATE,
};
