/** Exported face style unions for boolala.boo face pipeline. */

export type EyeShape =
  | 'round'
  | 'square'
  | 'tall'
  | 'wide'
  | 'sleepy'
  | 'star'
  | 'diamond'
  | 'droopy'
  | 'angry'
  | 'crescent'
  | 'slit'
  | 'heart'
  | 'hex'
  | 'void'
  | 'triple'
  | 'blob'
  | 'cross';

export type EyeArchetype = 'masks' | 'goggle' | 'cyclops-giant' | 'cluster' | 'mismatched';

export type MouthStyle = 'closed-line' | 'zigzag' | 'open-maw' | 'tongue-out' | 'tiny';
export type LipCurveKind = 'smile' | 'scowl' | 'wave' | 'skew' | 'flat';

export type EarStyle =
  | 'lobe'
  | 'pointy'
  | 'floppy'
  | 'notch'
  | 'bat'
  | 'shell'
  | 'asymmetric_stub';

export type NoseStyle = 'button' | 'beak' | 'slit' | 'bulb' | 'snout' | 'patch';

export type ToothStyle =
  | 'row_even'
  | 'fang_pair'
  | 'buck'
  | 'shark'
  | 'gap_grin'
  | 'stump'
  | 'gold_cap';

export type AccentStyle =
  | 'mole'
  | 'freckle_cluster'
  | 'cheek_blush'
  | 'wart'
  | 'dimple'
  | 'sparkle';

export type HairStyle =
  | 'mohawk'
  | 'curtain'
  | 'afro_puff'
  | 'spikes'
  | 'braid'
  | 'wild_mane'
  | 'bald_patch';

export type MustacheStyle = 'walrus' | 'pencil' | 'handlebar' | 'stubble' | 'fu_manchu';

export type BrowStyle = 'straight' | 'angry' | 'surprised' | 'bushy' | 'thin' | 'unibrow';

export type LidStyle = 'heavy' | 'monolid' | 'droopy' | 'wide' | 'sleepy_half';

export type LashStyle = 'spike' | 'fan' | 'clump' | 'lower_only' | 'spider';

export interface EyeSlot {
  x: number;
  y: number;
  w: number;
  h: number;
  shape: EyeShape;
  side: -1 | 1 | 0;
}
