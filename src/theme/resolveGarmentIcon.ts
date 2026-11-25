import { MaterialCommunityIcons } from '@expo/vector-icons';
import { GARMENT_ICONS, GarmentIconName } from './garmentIcons';

export type MciName = keyof typeof MaterialCommunityIcons.glyphMap;

export type ResolvedGarmentIcon =
  | { set: 'garment'; name: GarmentIconName }
  | { set: 'mci'; name: MciName };

const garment = (name: GarmentIconName): ResolvedGarmentIcon => ({ set: 'garment', name });
const mci = (name: MciName): ResolvedGarmentIcon => ({ set: 'mci', name });

// First match wins: a multi-garment name ("Suit 3 Pc (Shirt, Coat, Pant)") must hit its main garment first.
const RULES: [RegExp, ResolvedGarmentIcon][] = [
  [/steam iron/i, mci('iron')],
  [/wash\s*&\s*fold|premium laundry/i, mci('washing-machine')],
  [/trolley|suitcase/i, mci('bag-suitcase')],
  [/laptop/i, mci('laptop')],
  [/back\s*pack|bag\s*pack|school bag/i, mci('bag-personal')],
  [/hand\s*bag|shoulder bag|purse/i, garment('handbag')],
  [/helmet/i, mci('racing-helmet')],
  [/sandals?|slippers?|crocs|sports|sneakers?/i, mci('shoe-sneaker')],
  [/shoes?\b|boots?\b/i, mci('shoe-formal')],
  [/sofa/i, mci('sofa')],
  [/carpet|\brug\b|\bmat\b/i, mci('rug')],
  [/curtain/i, garment('curtain')],
  [/pillow|cushion/i, garment('pillow')],
  [/blanket|quilt|duvet|comforter|razai/i, garment('blanket')],
  [/bed\s*(sheet|cover)/i, mci('bed')],
  [/bath\s*robe/i, garment('cardigan')],
  [/towel|handkerchief|napkin/i, garment('towel')],
  [/lehenga|lehanga|ghagra|choli/i, garment('lehenga')],
  [/saree|\bsari\b/i, garment('saree')],
  [/innerwear|undergarment/i, mci('lingerie')],
  [/kurti/i, garment('kurti')],
  [/kurta|sherwani|anarkali|salwar suit/i, garment('kurta')],
  [/dhoti|lungi/i, garment('dhoti')],
  [/track\s*suit|^hoodie/i, garment('hoodie')],
  [/waist\s*coat/i, garment('vest')],
  [/\bsuit\b/i, garment('suit')],
  [/school uniform/i, garment('shirt')],
  [/sweater|cardigan|pullover/i, garment('sweater')],
  [/blazer|jacket|\b(over)?coat\b/i, garment('coat')],
  [/blouse|\btop\b/i, garment('top')],
  [/night\s*dress|nighty|night\s*gown/i, garment('nightdress')],
  [/pyjama|pajama|trouser|\bpants?\b|leggings?|palazzo|salwar|churidar/i, garment('trousers')],
  [/jeans/i, garment('jeans')],
  [/shorts/i, garment('shorts')],
  [/skirt|petticoat/i, garment('skirt')],
  [/frock/i, garment('frock')],
  [/dupatta|shawl|stole|scarf|muffler/i, garment('dupatta')],
  [/dress|gown/i, garment('dress')],
  [/t-?\s?shirt/i, garment('tshirt')],
  [/shirt/i, garment('shirt')],
  [/\btie\b/i, mci('tie')],
  [/\bbelt\b/i, garment('belt')],
  [/\b(cap|hat)s?\b/i, garment('cap')],
  [/glove/i, garment('gloves')],
  [/socks?\b/i, garment('sock')],
];

// Assigned by the backend at seed time, not chosen by an admin, so a name match outranks them.
const AUTO_ASSIGNED = new Set([
  'hanger',
  'iron',
  'washing-machine',
  'bag-suitcase',
  'laptop',
  'bag-personal',
  'bag-backpack',
  'shoe-formal',
  'shoe-sneaker',
  'bed',
  'pillow',
  'blanket',
  'curtains',
  'sofa',
  'rug',
  'tshirt-crew',
  'tie',
]);

const hasKey = (map: object, key: string) => Object.prototype.hasOwnProperty.call(map, key);

const iconFromKey = (key: string): ResolvedGarmentIcon | null => {
  if (hasKey(GARMENT_ICONS, key)) return garment(key as GarmentIconName);
  if (hasKey(MaterialCommunityIcons.glyphMap, key)) return mci(key as MciName);
  return null;
};

export const resolveGarmentIcon = (itemName: string, iconKey?: string | null): ResolvedGarmentIcon => {
  const key = iconKey?.trim().toLowerCase();
  if (key && !AUTO_ASSIGNED.has(key)) {
    const chosen = iconFromKey(key);
    if (chosen) return chosen;
  }
  const match = RULES.find(([pattern]) => pattern.test(itemName));
  if (match) return match[1];
  return (key && iconFromKey(key)) || mci('hanger');
};
