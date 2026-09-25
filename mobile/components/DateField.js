// Cross-platform date/time picker field.
//  - Web (the browser demo): renders the native <input type="date"/"time">,
//    which opens the browser's built-in picker.
//  - iOS/Android (Expo Go / builds): opens the native system picker.
// Value in/out: date -> "YYYY-MM-DD", time -> "HH:MM" (24h).
import React, { useState } from 'react';
import { Platform, TouchableOpacity, Text } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { C } from '../lib/theme';

const pad = (n) => String(n).padStart(2, '0');

export default function DateField({ value, onChange, mode = 'date', style }) {
  const [show, setShow] = useState(false);

  if (Platform.OS === 'web') {
    return (
      <input
        type={mode}
        value={value || ''}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        style={{
          background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 10,
          padding: '11px 12px', fontSize: 15, color: C.text, colorScheme: 'dark',
          fontFamily: 'inherit', minWidth: 0, width: '100%', boxSizing: 'border-box',
          ...style,
        }}
      />
    );
  }

  const asDate = () => {
    const now = new Date();
    if (mode === 'time') {
      const [h, m] = String(value || '10:00').split(':').map(Number);
      now.setHours(h || 10, m || 0, 0, 0);
      return now;
    }
    return value ? new Date(`${value}T12:00:00`) : now;
  };

  const label = mode === 'time'
    ? (value || 'Pick a time')
    : (value ? new Date(`${value}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Pick a date');

  return (
    <>
      <TouchableOpacity onPress={() => setShow(true)}
        style={[{ backgroundColor: C.surface2, borderColor: C.border, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12 }, style]}>
        <Text style={{ color: value ? C.text : C.muted, fontSize: 15 }}>{label}</Text>
      </TouchableOpacity>
      {show && (
        <DateTimePicker
          value={asDate()}
          mode={mode}
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(event, d) => {
            setShow(false);
            if (!d || event.type === 'dismissed') return;
            if (mode === 'time') onChange(`${pad(d.getHours())}:${pad(d.getMinutes())}`);
            else onChange(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
          }}
        />
      )}
    </>
  );
}
