import React from 'react';
import { View, Text } from 'react-native';
import { C, T, F } from '../../lib/theme';
import { Tile, Label, Button, Dot } from '../ui';
import { NextUpTile, TeamTodayTile, SmallTile, fmtMoney, plural } from './shared';

// Ray's home: what is next, who is working, what is held up, and the money.
// No leads tile and no clock tile here. A missing section renders nothing
// and the layout closes up.
const MONEY_TABS = new Set(['invoice', 'manual_invoice', 'payment', 'plan']);

export default function CeoHome({ navigation, home }) {
  const go = (name, params) => navigation.navigate(name, params);
  const held = Array.isArray(home.held_up) ? home.held_up : null;
  const money = home.money || null;
  const plans = money?.client_plans || {};
  const outstanding = money?.outstanding || {};

  // Nudging an invoice, payment or plan happens in Money; an agreement or a
  // quiet hot lead is handled from the client's activity.
  const nudge = (item) => {
    if (MONEY_TABS.has(item.kind)) return go('Money', { tab: 'invoices' });
    go('ClientDetail', { client: { id: item.client_id, business_name: item.client_name }, tab: 'activity' });
  };

  const monthShort = String(money?.month || '').slice(0, 3);
  const prev = Number(money?.collected_prev_month) || 0;
  const cur = Number(money?.collected_month) || 0;
  const trend = prev > 0
    ? (cur === prev ? 'level with last month' : cur > prev ? `up ${Math.round(((cur - prev) / prev) * 100)}% on last month` : `down ${Math.round(((prev - cur) / prev) * 100)}% on last month`)
    : plural(Number(money?.payments_this_week) || 0, 'payment', 'payments') + ' this week';

  return (
    <>
      <NextUpTile event={home.next_up} onPress={() => go('Calendar')} />

      {home.team_today ? <TeamTodayTile team={home.team_today} onPress={() => go('Time')} /> : null}

      {/* Held up */}
      {held ? (
        <Tile onPress={() => go('Money', { tab: 'invoices' })} style={{ gap: 10, paddingVertical: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Label>Held up</Label>
            <Text style={T.meta}>{held.length ? plural(held.length, 'item') : 'all clear'}</Text>
          </View>
          {held.length === 0 ? <Text style={T.sub}>Nothing is waiting on anyone. Tap to open Money.</Text> : null}
          {held.slice(0, 5).map(item => (
            <View key={`${item.kind}-${item.id}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Dot color={item.severity === 'red' ? C.redDot : C.amberDot} />
              <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                <Text numberOfLines={1} style={[T.body, { fontFamily: F.semi }]}>{item.title}</Text>
                {item.sub ? <Text numberOfLines={1} style={T.sub}>{item.sub}</Text> : null}
              </View>
              <Button label="Nudge" small kind="white" onPress={() => nudge(item)} />
            </View>
          ))}
          {held.length > 5 ? <Text style={T.meta}>{held.length - 5} more in Money</Text> : null}
        </Tile>
      ) : null}

      {/* Collected and client plans */}
      {money ? (
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Tile onPress={() => go('Money', { tab: 'overview' })} style={{ flex: 1, minHeight: 118, justifyContent: 'space-between', gap: 10 }}>
            <Label>Collected{monthShort ? ` · ${monthShort}` : ''}</Label>
            <View style={{ gap: 2 }}>
              <Text numberOfLines={1} adjustsFontSizeToFit style={[T.numeral, { fontSize: 30, lineHeight: 34, letterSpacing: -1 }]}>{fmtMoney(cur)}</Text>
              <Text numberOfLines={1} style={T.sub}>{trend}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Dot color={outstanding.overdue > 0 ? C.redDot : outstanding.total > 0 ? C.amberDot : C.green} />
              <Text numberOfLines={1} style={[T.meta, { color: outstanding.overdue > 0 ? C.red : outstanding.total > 0 ? C.amber : C.green, flexShrink: 1 }]}>
                {outstanding.total > 0 ? `${fmtMoney(outstanding.total)} outstanding` : 'nothing outstanding'}
              </Text>
            </View>
          </Tile>
          <Tile onPress={() => go('Money', { tab: 'subscriptions' })} style={{ flex: 1, minHeight: 118, justifyContent: 'space-between', gap: 10 }}>
            <Label>Client plans</Label>
            <View style={{ gap: 2 }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
                <Text numberOfLines={1} adjustsFontSizeToFit style={[T.numeral, { fontSize: 30, lineHeight: 34, letterSpacing: -1, flexShrink: 1 }]}>{fmtMoney(plans.mrr)}</Text>
                <Text style={[T.meta, { color: C.ink }]}>/ mo</Text>
              </View>
              <Text numberOfLines={1} style={T.sub}>{plural(Number(plans.active) || 0, 'active plan')}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Dot color={plans.past_due > 0 ? C.redDot : C.green} />
              <Text numberOfLines={1} style={[T.meta, { color: plans.past_due > 0 ? C.red : C.green }]}>{plans.past_due > 0 ? `${plans.past_due} past due` : 'all current'}</Text>
            </View>
          </Tile>
        </View>
      ) : null}

      {/* Team chat and clients */}
      {(home.team_unread !== undefined || home.clients_active !== undefined) ? (
        <View style={{ flexDirection: 'row', gap: 12 }}>
          {home.team_unread !== undefined ? (
            <SmallTile icon="people-circle-outline" title="Team" dot={Number(home.team_unread) > 0}
              sub={Number(home.team_unread) > 0 ? plural(Number(home.team_unread), 'unread chat') : 'No unread chats'}
              onPress={() => navigation.getParent()?.navigate('Inbox', { screen: 'MessagesList', params: { mode: 'team' } })} />
          ) : null}
          {home.clients_active !== undefined ? (
            <SmallTile icon="people-outline" title="Clients" sub={`${Number(home.clients_active) || 0} active`} onPress={() => go('People')} />
          ) : null}
        </View>
      ) : null}
    </>
  );
}
