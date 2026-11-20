import { Platform, ViewStyle } from 'react-native';

/**
 * Bảng màu "Clean Modern Retail & IoT" – Slate, Clean White, Emerald & Cobalt
 */
export const COLORS = {
  // Nền & bề mặt sạch sẽ, hiện đại
  bg: '#F8FAFC',          // Slate 50 siêu sáng sạch
  surface: '#FFFFFF',     // Trắng tinh khiết
  surfaceWarm: '#F1F5F9', // Slate 100
  sand: '#F1F5F9',        // Slate 100 (thay cho be xỉn)
  sandDeep: '#E2E8F0',    // Slate 200
  line: '#E2E8F0',        // Đường viền hairline sắc nét
  lineStrong: '#CBD5E1',  // Slate 300

  // Chữ phân cấp tương phản cao
  ink: '#0F172A',         // Slate 900
  inkSoft: '#475569',     // Slate 600
  inkMuted: '#94A3B8',    // Slate 400

  // Điểm nhấn công nghệ
  primary: '#2563EB',     // Cobalt Blue 600
  primarySoft: '#EFF6FF', // Blue 50
  espresso: '#0F172A',    // Slate 900 (giữ tương thích)
  mocha: '#1E293B',       // Slate 800
  champagne: '#2563EB',   // Cobalt Blue (thay thế ánh vàng xỉn)
  champagneSoft: '#DBEAFE',
  bronze: '#334155',      // Slate 700

  // Màu trạng thái chuẩn quốc tế
  sage: '#10B981',        // Emerald 500 - Hợp lệ / Đã thanh toán
  sageSoft: '#ECFDF5',    // Emerald 50
  sageLine: '#A7F3D0',    // Emerald 200
  rose: '#EF4444',        // Red 500 - Cảnh báo trộm / Chưa trả
  roseSoft: '#FEF2F2',    // Red 50
  roseLine: '#FECACA',    // Red 200
  amber: '#F59E0B',       // Amber 500 - Nhiệt độ / Cảnh báo phụ
  amberSoft: '#FFFBEB',   // Amber 50
  amberLine: '#FDE68A',   // Amber 200
  teal: '#0EA5E9',        // Sky 500 - Độ ẩm
  tealSoft: '#F0F9FF',    // Sky 50

  shadow: '#0F172A',      // Bóng đổ trung tính mềm mại
};

export const RADIUS = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
};

export const MONO = Platform.select({ ios: 'Menlo', default: 'monospace' });

export const shadow = (level: 1 | 2 | 3): ViewStyle => {
  const map = {
    1: { h: 1, r: 4, o: 0.04, e: 1 },
    2: { h: 4, r: 12, o: 0.06, e: 3 },
    3: { h: 8, r: 20, o: 0.08, e: 6 },
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
