// Aura: the VTM app's light design system. White ground, soft tiles instead
// of cards, ink for every primary action, one gradient reserved for the
// assistant, and a soft aurora only at the top of Home and the assistant.
export const C = {
  bg: '#FFFFFF',
  tile: '#F5F5F8',
  tile2: '#ECECF1',
  ink: '#0B0B10',
  slate: '#575B66',
  line: 'rgba(11,11,16,0.08)',
  blue: '#1D4ED8',
  blueSoft: '#E6EEFF',
  green: '#15803D',
  greenSoft: '#DCFCE7',
  amber: '#B45309',
  amberDot: '#F59E0B',
  amberSoft: '#FEF3C7',
  red: '#B91C1C',
  redDot: '#DC2626',
  redSoft: '#FEE2E2',
  violet: '#7C5CFF',
  cyan: '#22D3EE',
  // Names the older screens still use; they now resolve to the light palette
  // so nothing renders dark while screens are converted one by one.
  surface: '#FFFFFF',
  surface2: '#F5F5F8',
  surface3: '#ECECF1',
  border: 'rgba(11,11,16,0.08)',
  text: '#0B0B10',
  muted: '#575B66',
};

// The assistant's gradient (violet to cyan) and the aurora tints.
export const GRAD = ['#7C5CFF', '#22D3EE'];
export const AURORA = { lilac: '#EDE9FE', sky: '#DBEAFE', mint: '#DCFCE7' };

// Type: Bricolage Grotesque for display, Manrope for everything else. The
// families are loaded in App.js; these are the exact face names.
export const F = {
  display: 'BricolageGrotesque_800ExtraBold',
  displayBold: 'BricolageGrotesque_700Bold',
  regular: 'Manrope_400Regular',
  body: 'Manrope_500Medium',
  semi: 'Manrope_600SemiBold',
  bold: 'Manrope_700Bold',
};

// Text presets. Spread into a Text style: <Text style={[T.h1, { ... }]} />
export const T = {
  h1: { fontFamily: F.display, fontSize: 34, lineHeight: 38, letterSpacing: -1, color: C.ink },
  h2: { fontFamily: F.display, fontSize: 28, lineHeight: 32, letterSpacing: -0.8, color: C.ink },
  h3: { fontFamily: F.display, fontSize: 22, lineHeight: 26, letterSpacing: -0.5, color: C.ink },
  numeral: { fontFamily: F.display, fontSize: 44, lineHeight: 44, letterSpacing: -1.6, color: C.ink },
  title: { fontFamily: F.displayBold, fontSize: 17, lineHeight: 22, color: C.ink },
  body: { fontFamily: F.body, fontSize: 15, lineHeight: 21, color: C.ink },
  message: { fontFamily: F.body, fontSize: 16, lineHeight: 23, color: C.ink },
  sub: { fontFamily: F.body, fontSize: 13, lineHeight: 18, color: C.slate },
  meta: { fontFamily: F.bold, fontSize: 12, lineHeight: 16, color: C.slate },
  label: { fontFamily: F.bold, fontSize: 11, lineHeight: 14, letterSpacing: 1.1, color: C.slate, textTransform: 'uppercase' },
  button: { fontFamily: F.bold, fontSize: 14, lineHeight: 18, color: C.ink },
};

export const R = { tile: 24, row: 16, chip: 18, pill: 999 };

// A tile: the Aura card. Older screens import `card`; it is a tile now.
export const card = { backgroundColor: C.tile, borderRadius: R.tile, padding: 16 };
