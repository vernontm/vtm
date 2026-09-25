import React from 'react';
import { View, Text } from 'react-native';
import { C, T, F } from '../../lib/theme';
import { Tile, Label, Button, Dot, Avatar, Progress } from '../ui';
import { firstName } from '../../lib/imsg';
import { NextUpTile, TeamTodayTile, SmallTile, fmtMoney, fmtDay, fmtAge, plural } from './shared';

// The HR home: what is next, who is working (with time to approve), what is
// waiting for review, who is onboarding, and the pay period. A missing
// section renders nothing and the layout closes up.
export default function HrHome({ navigation, home }) {
  const go = (name, params) => navigation.navigate(name, params);
  const queue = Array.isArray(home.review_queue) ? home.review_queue : null;
  const onboarding = Array.isArray(home.onboarding) ? home.onboarding.filter(Boolean) : [];
  const payroll = home.payroll || null;

  return (
    <>
      <NextUpTile event={home.next_up} onPress={() => go('Calendar')} />

      {home.team_today ? (
        <TeamTodayTile team={home.team_today} onPress={() => go('Time')} action={{ label: 'Approve time', icon: 'checkmark-circle-outline', onPress: () => go('Time') }} />
      ) : null}

      {/* Review queue */}
      {queue ? (
        <Tile onPress={() => go('Tasks')} style={{ gap: 10, paddingVertical: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Label>Review queue</Label>
            <Text style={T.meta}>{queue.length ? plural(queue.length, 'waiting', 'waiting') : 'all clear'}</Text>
          </View>
          {queue.length === 0 ? <Text style={T.sub}>Nothing to review right now. Tap to open Tasks.</Text> : null}
          {queue.slice(0, 5).map(item => (
            <View key={item.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Dot color={Number(item.age_hours) > 24 || item.urgent ? C.amberDot : C.slate} />
              <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                <Text numberOfLines={1} style={[T.body, { fontFamily: F.semi }]}>{item.title}</Text>
                <Text numberOfLines={1} style={T.sub}>{[item.from_name ? `from ${firstName(item.from_name)}` : null, fmtAge(item.age_hours), item.link_label].filter(Boolean).join(' · ')}</Text>
              </View>
              <Button label="Review" small onPress={() => go('Tasks')} />
            </View>
          ))}
          {queue.length > 5 ? <Text style={T.meta}>{queue.length - 5} more in Tasks</Text> : null}
        </Tile>
      ) : null}

      {/* Onboarding */}
      {onboarding.length > 0 ? (
        <Tile style={{ gap: 12, paddingVertical: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Label>Onboarding</Label>
            <Text style={T.meta}>{plural(onboarding.length, 'person', 'people')} starting</Text>
          </View>
          {onboarding.map(p => {
            const total = Number(p.steps_total) || 0;
            const done = Number(p.steps_done) || 0;
            return (
              <View key={p.member_id || p.name} style={{ gap: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <Avatar name={p.name} size={40} tone="white" />
                  <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                    <Text numberOfLines={1} style={[T.title, { fontSize: 16 }]}>{p.name}</Text>
                    <Text numberOfLines={1} style={T.sub}>{p.next_step ? `Next: ${p.next_step}` : 'All steps done'}</Text>
                  </View>
                  <Text style={[T.title, { fontSize: 14 }]}>{done} of {total}</Text>
                </View>
                <Progress value={total ? done / total : 0} />
              </View>
            );
          })}
        </Tile>
      ) : null}

      {/* Payroll */}
      {payroll ? (
        <Tile onPress={() => go('Time')} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14 }}>
          <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
            <Label>Payroll</Label>
            <Text style={[T.h3, { fontSize: 26, lineHeight: 28 }]}>{fmtMoney(payroll.total)}</Text>
            <Text numberOfLines={1} style={T.sub}>{[payroll.period_label, payroll.due_on ? `due ${fmtDay(payroll.due_on)}` : null].filter(Boolean).join(' · ')}</Text>
          </View>
          <Button label="Run pay" small kind="white" onPress={() => go('Time')} />
        </Tile>
      ) : null}

      {home.team_unread !== undefined ? (
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <SmallTile icon="people-circle-outline" title="Team" dot={Number(home.team_unread) > 0}
            sub={Number(home.team_unread) > 0 ? plural(Number(home.team_unread), 'unread chat') : 'No unread chats'}
            onPress={() => navigation.getParent()?.navigate('Inbox', { screen: 'MessagesList', params: { mode: 'team' } })} />
        </View>
      ) : null}
    </>
  );
}
