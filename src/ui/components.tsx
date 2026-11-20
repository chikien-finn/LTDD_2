import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Pressable,
  PressableProps,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, RADIUS, shadow } from './theme';

export type IconName = React.ComponentProps<typeof Ionicons>['name'];

/* ------------------------------------------------------------------ */
/* ScalePress – nút bấm co giãn mượt khi chạm                          */
/* ------------------------------------------------------------------ */
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type ScalePressProps = Omit<PressableProps, 'style' | 'children'> & {
  style?: StyleProp<ViewStyle>;
  scaleTo?: number;
  children?: React.ReactNode;
};

export function ScalePress({
  style,
  scaleTo = 0.98,
  children,
  onPressIn,
  onPressOut,
  disabled,
  ...rest
}: ScalePressProps) {
  const scale = useRef(new Animated.Value(1)).current;

  const animateTo = (value: number) =>
    Animated.timing(scale, {
      toValue: value,
      duration: 100,
      useNativeDriver: true,
    }).start();

  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      onPressIn={(e) => {
        animateTo(scaleTo);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        animateTo(1);
        onPressOut?.(e);
      }}
      style={[style, { transform: [{ scale }] }, disabled ? { opacity: 0.55 } : null]}
    >
      {children}
    </AnimatedPressable>
  );
}

/* ------------------------------------------------------------------ */
/* PulseDot – chấm trạng thái kết nối nhẹ nhàng                       */
/* ------------------------------------------------------------------ */
export function PulseDot({ color, size = 8 }: { color: string; size?: number }) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(pulse, { toValue: 1, duration: 2000, useNativeDriver: true })
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.8] });
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0] });

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        style={{
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          opacity,
          transform: [{ scale }],
        }}
      />
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* ProgressBar                                                          */
/* ------------------------------------------------------------------ */
export function ProgressBar({ value, color }: { value: number; color: string }) {
  const pct = Math.max(0, Math.min(1, value));
  return (
    <View style={styles.track}>
      <View style={[styles.fill, { width: `${pct * 100}%`, backgroundColor: color }]} />
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* EmptyState                                                           */
/* ------------------------------------------------------------------ */
export function EmptyState({
  icon,
  title,
  desc,
}: {
  icon: IconName;
  title: string;
  desc: string;
}) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyRing}>
        <View style={styles.emptyIcon}>
          <Ionicons name={icon} size={28} color={COLORS.bronze} />
        </View>
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyDesc}>{desc}</Text>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Toast – thông báo nổi thay cho Alert                                */
/* ------------------------------------------------------------------ */
export type ToastType = 'success' | 'error' | 'info';
export type ToastData = { id: number; type: ToastType; title: string; message?: string };

const TOAST_CFG: Record<ToastType, { icon: IconName; color: string; soft: string }> = {
  success: { icon: 'checkmark-circle', color: COLORS.sage, soft: COLORS.sageSoft },
  error: { icon: 'alert-circle', color: COLORS.rose, soft: COLORS.roseSoft },
  info: { icon: 'information-circle', color: COLORS.bronze, soft: COLORS.amberSoft },
};

export function Toast({
  toast,
  top,
  onHide,
}: {
  toast: ToastData | null;
  top: number;
  onHide: () => void;
}) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!toast) return;
    anim.setValue(0);
    Animated.spring(anim, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 0 }).start();
    const timer = setTimeout(() => {
      Animated.timing(anim, { toValue: 0, duration: 220, useNativeDriver: true }).start(
        ({ finished }) => {
          if (finished) onHide();
        }
      );
    }, 2800);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast?.id]);

  if (!toast) return null;

  const cfg = TOAST_CFG[toast.type];
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [-140, 0] });
  const opacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' });

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.toast, { top, opacity, transform: [{ translateY }] }]}
    >
      <View style={[styles.toastIcon, { backgroundColor: cfg.soft }]}>
        <Ionicons name={cfg.icon} size={22} color={cfg.color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.toastTitle} numberOfLines={1}>
          {toast.title}
        </Text>
        {toast.message ? (
          <Text style={styles.toastMsg} numberOfLines={2}>
            {toast.message}
          </Text>
        ) : null}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.sand,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 3,
  },

  empty: {
    alignItems: 'center',
    paddingVertical: 34,
    paddingHorizontal: 24,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: COLORS.line,
  },
  emptyRing: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: COLORS.surfaceWarm,
    borderWidth: 1,
    borderColor: COLORS.line,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: COLORS.sand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.ink,
    marginBottom: 6,
  },
  emptyDesc: {
    fontSize: 13,
    color: COLORS.inkSoft,
    textAlign: 'center',
    lineHeight: 19,
  },

  toast: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 100,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: COLORS.line,
    ...shadow(3),
  },
  toastIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toastTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.ink,
  },
  toastMsg: {
    fontSize: 12,
    color: COLORS.inkSoft,
    marginTop: 2,
    lineHeight: 17,
  },
});
