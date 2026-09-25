import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F, T, R, GRAD, AURORA } from '../lib/theme';

// The Aura primitives every screen is built from. Keep them small: a tile, a
// header, chips, pills, avatars, the orb. Layout stays in the screens.

export const initials = (name) => {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

// Full-screen white ground. Aurora adds the soft wash at the top (Home, assistant).
export function Screen({ children, aurora = false, style }) {
  return (
    <View style={[{ flex: 1, backgroundColor: C.bg }, style]}>
      {aurora ? <Aurora /> : null}
      {children}
    </View>
  );
}

export function Aurora({ height = 320 }) {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, height, overflow: 'hidden' }}>
      <LinearGradient colors={[AURORA.lilac, 'rgba(237,233,254,0)']} start={{ x: 0.15, y: 0 }} end={{ x: 0.55, y: 0.9 }} style={{ position: 'absolute', left: -60, top: -40, width: 320, height: 300, borderRadius: 160 }} />
      <LinearGradient colors={[AURORA.sky, 'rgba(219,234,254,0)']} start={{ x: 0.8, y: 0 }} end={{ x: 0.3, y: 0.9 }} style={{ position: 'absolute', right: -80, top: -60, width: 320, height: 300, borderRadius: 160 }} />
      <LinearGradient colors={[AURORA.mint, 'rgba(220,252,231,0)']} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={{ position: 'absolute', left: 90, top: 60, width: 240, height: 220, borderRadius: 120 }} />
    </View>
  );
}

// Screen header: optional back circle, display title, sub line, right slot.
export function HeaderBar({ title, sub, onBack, right, children }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 18, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      {onBack ? <IconButton icon="chevron-back" onPress={onBack} label="Back" /> : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        {children || (
          <>
            <Text numberOfLines={1} style={[T.h2, { fontSize: onBack ? 26 : 30, lineHeight: onBack ? 30 : 34 }]}>{title}</Text>
            {sub ? <Text numberOfLines={1} style={[T.sub, { marginTop: 1 }]}>{sub}</Text> : null}
          </>
        )}
      </View>
      {right}
    </View>
  );
}

export function Tile({ children, style, onPress, white = false, disabled }) {
  const base = [{ backgroundColor: white ? C.bg : C.tile, borderRadius: R.tile, padding: 16 }, white ? { borderWidth: 1, borderColor: C.line } : null, style];
  if (onPress) return <TouchableOpacity activeOpacity={0.75} onPress={onPress} disabled={disabled} style={base}>{children}</TouchableOpacity>;
  return <View style={base}>{children}</View>;
}

export function Label({ children, style, right }) {
  if (right) {
    return (
      <View style={[{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 }, style]}>
        <Text style={T.label}>{children}</Text>
        {typeof right === 'string' ? <Text style={T.meta}>{right}</Text> : right}
      </View>
    );
  }
  return <Text style={[T.label, style]}>{children}</Text>;
}

// Initials avatar. `tone` picks the fill: white (on a tile), tile (on white), ink, violet, cyan.
const TONES = {
  white: { bg: '#FFFFFF', fg: C.ink },
  tile: { bg: C.tile, fg: C.ink },
  ink: { bg: C.ink, fg: '#FFFFFF' },
  violet: { bg: C.violet, fg: '#FFFFFF' },
  cyan: { bg: C.cyan, fg: C.ink },
  blue: { bg: C.blueSoft, fg: C.blue },
  amber: { bg: C.amberSoft, fg: C.amber },
  green: { bg: C.greenSoft, fg: C.green },
  red: { bg: C.redSoft, fg: C.red },
};
export function Avatar({ name, size = 44, tone = 'white', style }) {
  const t = TONES[tone] || TONES.white;
  const text = initials(name);
  // A bare phone number has no initials worth showing: use a person glyph.
  const anonymous = !/[a-z]/i.test(text);
  return (
    <View style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center' }, style]}>
      {anonymous ? <Ionicons name="person" size={Math.round(size * 0.45)} color={t.fg} /> : (
        <Text style={{ fontFamily: F.bold, fontSize: Math.round(size * 0.32), color: t.fg, letterSpacing: 0.3 }}>{text}</Text>
      )}
    </View>
  );
}

// Round icon button: tile fill by default, ink when `dark`.
export function IconButton({ icon, onPress, label, size = 44, dark = false, white = false, style, color }) {
  const bg = dark ? C.ink : white ? C.bg : C.tile;
  return (
    <TouchableOpacity onPress={onPress} accessibilityLabel={label} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }, white ? { borderWidth: 1, borderColor: C.line } : null, style]}>
      <Ionicons name={icon} size={Math.round(size * 0.5)} color={color || (dark ? '#FFFFFF' : C.ink)} />
    </TouchableOpacity>
  );
}

// Pill buttons. Primary is ink with white text; soft is a tile; outline is a hairline.
export function Button({ label, onPress, kind = 'primary', icon, busy, disabled, style, small }) {
  const h = small ? 36 : 44;
  const styles = {
    primary: { backgroundColor: C.ink, color: '#FFFFFF' },
    soft: { backgroundColor: C.tile, color: C.ink },
    white: { backgroundColor: '#FFFFFF', color: C.ink },
    outline: { backgroundColor: 'transparent', color: C.ink, borderWidth: 1.5, borderColor: C.ink },
    danger: { backgroundColor: 'transparent', color: C.red, borderWidth: 1, borderColor: 'rgba(185,28,28,0.5)' },
  }[kind] || {};
  const { color, ...box } = styles;
  return (
    <TouchableOpacity onPress={onPress} disabled={disabled || busy} activeOpacity={0.8}
      style={[{ height: h, paddingHorizontal: small ? 14 : 18, borderRadius: h / 2, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, opacity: disabled || busy ? 0.55 : 1 }, box, style]}>
      {busy ? <ActivityIndicator color={color} /> : (
        <>
          {icon ? <Ionicons name={icon} size={small ? 16 : 18} color={color} /> : null}
          <Text style={[T.button, { color, fontSize: small ? 13 : 14 }]}>{label}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

// Selectable chip (filters, roles, kinds).
export function Chip({ label, active, onPress, icon, color, style }) {
  const fg = active ? '#FFFFFF' : (color || C.ink);
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8}
      style={[{ height: 36, paddingHorizontal: 14, borderRadius: R.chip, backgroundColor: active ? C.ink : C.tile, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 }, style]}>
      {icon ? <Ionicons name={icon} size={14} color={fg} /> : null}
      <Text style={{ fontFamily: F.bold, fontSize: 13, color: fg }}>{label}</Text>
    </TouchableOpacity>
  );
}

// Segmented control inside a tile track (Mine / Unassigned / All). An option
// may carry `badge` (a count) and `badgeColor`; the count sits in a small
// colored circle next to the label.
export function Segmented({ options, value, onChange, style }) {
  return (
    <View style={[{ flexDirection: 'row', gap: 4, padding: 4, borderRadius: 18, backgroundColor: C.tile }, style]}>
      {options.map(o => {
        const on = o.value === value;
        const badge = Number(o.badge) || 0;
        return (
          <TouchableOpacity key={o.value} onPress={() => onChange(o.value)} activeOpacity={0.8}
            style={{ flex: 1, height: 38, borderRadius: 14, backgroundColor: on ? '#FFFFFF' : 'transparent', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, shadowColor: '#000', shadowOpacity: on ? 0.08 : 0, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: on ? 1 : 0 }}>
            <Text style={{ fontFamily: F.bold, fontSize: 14, color: on ? C.ink : C.slate }}>{o.label}</Text>
            {badge > 0 ? (
              <View style={{ minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6, backgroundColor: o.badgeColor || C.ink, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontFamily: F.bold, fontSize: 11, color: '#FFFFFF' }}>{badge > 99 ? '99+' : badge}</Text>
              </View>
            ) : null}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// Two-way switch that floats above the dock (Tasks / Reminders).
export function FloatingSwitch({ options, value, onChange, bottom = 104 }) {
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom, alignItems: 'center' }}>
      <View style={{ flexDirection: 'row', gap: 4, padding: 4, borderRadius: 24, backgroundColor: C.tile, width: 240, shadowColor: '#FFFFFF', shadowOpacity: 1, shadowRadius: 0, shadowOffset: { width: 0, height: 0 }, borderWidth: 4, borderColor: '#FFFFFF' }}>
        {options.map(o => {
          const on = o.value === value;
          return (
            <TouchableOpacity key={o.value} onPress={() => onChange(o.value)} activeOpacity={0.8}
              style={{ flex: 1, height: 40, borderRadius: 20, backgroundColor: on ? C.ink : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontFamily: F.bold, fontSize: 14, color: on ? '#FFFFFF' : C.slate }}>{o.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

// Round checkbox for tasks and reminders.
export function Check({ done, onPress, label, size = 24 }) {
  return (
    <TouchableOpacity onPress={onPress} accessibilityRole="checkbox" accessibilityState={{ checked: !!done }} accessibilityLabel={label} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: done ? C.ink : '#FFFFFF', borderWidth: done ? 0 : 1.5, borderColor: 'rgba(11,11,16,0.25)', alignItems: 'center', justifyContent: 'center' }}>
      {done ? <Ionicons name="checkmark" size={size * 0.62} color="#FFFFFF" /> : null}
    </TouchableOpacity>
  );
}

export function Dot({ color = C.ink, size = 8, style }) {
  return <View style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }, style]} />;
}

export function Progress({ value = 0, height = 6, track = '#FFFFFF', fill = C.ink, style }) {
  const pct = Math.max(0, Math.min(100, Math.round(value * 100)));
  return (
    <View style={[{ height, borderRadius: height / 2, backgroundColor: track, overflow: 'hidden' }, style]}>
      <View style={{ width: `${pct}%`, height, borderRadius: height / 2, backgroundColor: fill }} />
    </View>
  );
}

// The assistant's orb.
export function Orb({ size = 58, onPress, label = 'Open the assistant', style, icon = 'sparkles' }) {
  const inner = (
    <LinearGradient colors={GRAD} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      style={[{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', shadowColor: '#7C5CFF', shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 8 }, elevation: 6 }, style]}>
      <Ionicons name={icon} size={Math.round(size * 0.45)} color="#FFFFFF" />
    </LinearGradient>
  );
  if (!onPress) return inner;
  return <TouchableOpacity onPress={onPress} accessibilityLabel={label} activeOpacity={0.85}>{inner}</TouchableOpacity>;
}

// Gradient-outlined chip for assistant suggestions.
export function GradientChip({ label, onPress, style }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={style}>
      <LinearGradient colors={GRAD} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ padding: 1.5, borderRadius: 18 }}>
        <View style={{ height: 33, paddingHorizontal: 12, borderRadius: 17, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontFamily: F.bold, fontSize: 13, color: C.ink }}>{label}</Text>
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
}

// Temperature and kind helpers shared by People and Inbox.
export const TEMP = {
  hot: { label: 'Hot', color: C.red, dot: C.redDot },
  warm: { label: 'Warm', color: C.amber, dot: C.amberDot },
  cold: { label: 'Cold', color: C.slate, dot: '#64748B' },
};
export const KIND_COLOR = { lead: C.amber, client: C.green, contact: C.blue };

export function Empty({ icon = 'sparkles-outline', title, sub }) {
  return (
    <View style={{ alignItems: 'center', gap: 6, paddingVertical: 36 }}>
      <Ionicons name={icon} size={28} color={C.slate} />
      <Text style={T.title}>{title}</Text>
      {sub ? <Text style={[T.sub, { textAlign: 'center' }]}>{sub}</Text> : null}
    </View>
  );
}

export const DOCK_SPACE = 118;   // bottom padding that clears the floating dock
