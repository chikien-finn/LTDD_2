import { Platform, ViewStyle } from 'react-native';

/**
 * Bảng màu "Be Trắng cao cấp" – Ivory, Sand, Espresso & Champagne
 */
export const COLORS = {
  // Nền & bề mặt
  bg: '#F7F3EC',
  surface: '#FFFFFF',
  surfaceWarm: '#FBF8F3',
  sand: '#F2EBDF',
  sandDeep: '#E7DDCC',
  line: '#ECE4D6',
  lineStrong: '#DCCFBB',

  // Chữ
  ink: '#1F1A16',
  inkSoft: '#5E554C',
  inkMuted: '#A0958A',

  // Nhấn chính
  espresso: '#2A221C',
  mocha: '#4E3E31',
  champagne: '#E2C893',
  champagneSoft: 'rgba(226, 200, 147, 0.16)',
  bronze: '#9C7444',

  // Trạng thái
  sage: '#3F7A5C',
  sageSoft: '#E8F2EC',
  sageLine: '#CFE3D7',
  rose: '#C2554A',
  roseSoft: '#FBEDEA',
  roseLine: '#F1D3CD',
  amber: '#A8732F',
  amberSoft: '#FAF0E1',
  amberLine: '#EBD6B5',
  teal: '#4F7F86',
  tealSoft: '#E7F0F1',

  shadow: '#5A4632',
};

export const RADIUS = {
  sm: 10,
  md: 14,
  lg: 20,
  xl: 26,
  pill: 999,
};

export const MONO = Platform.select({ ios: 'Menlo', default: 'monospace' });

export const shadow = (level: 1 | 2 | 3): ViewStyle => {
  const map = {
    1: { h: 2, r: 6, o: 0.05, e: 1 },
    2: { h: 6, r: 16, o: 0.08, e: 3 },
    3: { h: 12, r: 24, o: 0.16, e: 10 },
  } as const;
  const s = map[level];
  return {
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: s.h },
    shadowRadius: s.r,
    shadowOpacity: s.o,
    elevation: s.e,
  };
};
