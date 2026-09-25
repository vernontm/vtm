import React, { useMemo } from 'react';
import { View, Text, Linking, Alert } from 'react-native';
import { countRoutineItem } from '../../lib/api';
import { goToConversation } from '../../lib/nav';
import { C, T } from '../../lib/theme';
import { Tile, Label, Button, Dot, Avatar, Progress } from '../ui';
import { NextUpTile, SmallTile, StatBox, PlusOne, plural } from './shared';

// Kaitlyn's home: her next call, today's outreach count, the leads, what to
// read before the call, her tasks, and the inbox. A missing section renders
// nothing and the layout closes up.
export default function SalesHome({ navigation, home, threads, tasks, updateHome }) {
  const go = (name, params) => navigation.navigate(name, params);
  const outreach = home.outreach || null;
  const counters = outreach?.counters || {};
  const main = (outreach?.items || []).find(it => Number(it.target) > 0) || null;
  const leads = home.leads || null;
  const bc = home.before_call || null;
  const unread = useMemo(() => (threads || []).filter(t => (t.unread || 0) > 0).length, [threads]);

  // +1 on the main outreach count: update now, tell the server, put it back if that fails.
  const bump = async () => {
    if (!main) return;
    const next = (Number(main.count) || 0) + 1;
    const set = (count) => updateHome(h => ({ ...h, outreach: { ...h.outreach, items: (h.outreach?.items || []).map(x => x.item_id === main.item_id ? { ...x, count } : x) } }));
    set(next);
    try { await countRoutineItem(main.routine_id, main.item_id, outreach.period_key, next); }
    catch (e) { set(main.count); Alert.alert('Could not update', e.message); }
  };

  // Reply rate only when the server sends one (a fraction or a percent).
  const rate = outreach?.reply_rate;
  const replyRate = rate === undefined || rate === null || rate === '' ? null : `Reply rate ${Math.round(Number(rate) <= 1 ? Number(rate) * 100 : Number(rate))}%`;

  // Before the call: the first lines of the notes, else the last contact summary.
  const snippet = String(bc?.notes || bc?.last_contact_summary || '').trim().split(/\n+/).slice(0, 3).join('\n');
  const lastText = (bc?.last_texts || []).slice(-1)[0] || null;
  const bcPhone = bc?.phone || bc?.contact_phone || null;
  const openNotes = () => {
    if (bc?.discovery_notes_url) return Linking.openURL(bc.discovery_notes_url);
    if (bcPhone) goToConversation(bcPhone);
  };

  const count = Number(main?.count) || 0, target = Number(main?.target) || 0;
  const hot = Number(leads?.hot) || 0, warm = Number(leads?.warm) || 0, open = Number(leads?.open) || 0;

  return (
    <>
      <NextUpTile label="My next call" event={home.next_up} sub="Only events that include your email" onPress={() => go('Calendar', { role: 'sales' })} />

      {/* Outreach today */}
      {outreach ? (
        <Tile onPress={() => go('Tasks')} style={{ gap: 12, paddingVertical: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Label>Outreach today</Label>
            {main ? <Text style={T.meta}>{count >= target ? 'target hit' : `${target - count} to go`}</Text> : null}
          </View>
          {main ? (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Text numberOfLines={1} adjustsFontSizeToFit style={[T.numeral, { fontSize: 36, lineHeight: 40, color: count >= target ? C.green : C.ink }]}>{count} of {target}</Text>
                  <Text numberOfLines={1} style={T.sub}>{main.text}</Text>
                </View>
                <PlusOne size={44} onPress={bump} label={`Add one to ${main.text}`} />
              </View>
              <Progress value={target ? count / target : 0} fill={count >= target ? C.green : C.ink} />
            </>
          ) : (
            <Text style={T.sub}>No counted target on today's list. Tap to open your tasks.</Text>
          )}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <StatBox n={counters.text_sent} label="texts" />
            <StatBox n={counters.meeting_created} label="booked" />
            <StatBox n={counters.lead_created} label="leads" />
          </View>
          {replyRate ? <Text style={T.sub}>{replyRate}</Text> : null}
        </Tile>
      ) : null}

      {/* Leads */}
      {leads ? (
        <Tile onPress={() => go('People', { tab: 'leads' })} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14 }}>
          <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
            <Label>Leads</Label>
            <Text style={[T.h3, { fontSize: 26, lineHeight: 28, color: hot ? C.red : C.ink }]}>{hot || open}</Text>
            <Text style={T.sub}>{hot ? 'hot, waiting on you' : open === 1 ? 'open lead' : 'open leads'}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Dot color={C.amberDot} />
            <Text style={[T.meta, { color: C.amber }]}>{warm} warm</Text>
          </View>
        </Tile>
      ) : null}

      {/* Before your call */}
      {bc ? (
        <Tile style={{ gap: 10, paddingVertical: 14 }}>
          <Label>Before your call</Label>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Avatar name={bc.name || bc.business} size={44} tone="white" />
            <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
              <Text numberOfLines={1} style={T.title}>{bc.name || bc.business || 'Your next contact'}</Text>
              {bc.business && bc.business !== bc.name ? <Text numberOfLines={1} style={T.sub}>{bc.business}</Text> : null}
            </View>
          </View>
          {snippet ? <Text numberOfLines={3} style={[T.body, { fontSize: 14, lineHeight: 20 }]}>{snippet}</Text> : <Text style={T.sub}>No notes on file yet.</Text>}
          {lastText?.body ? (
            <Text numberOfLines={2} style={T.sub}>{lastText.direction === 'out' ? 'You last texted: ' : 'They last texted: '}{lastText.body}</Text>
          ) : null}
          {(bc.discovery_notes_url || bcPhone) ? (
            <View style={{ flexDirection: 'row' }}>
              <Button label="Open notes" small kind="white" icon={bc.discovery_notes_url ? 'document-text-outline' : 'chatbubble-outline'} onPress={openNotes} />
            </View>
          ) : null}
        </Tile>
      ) : null}

      {/* Tasks · Sales */}
      <Tile onPress={() => go('Tasks')} style={{ gap: 8, paddingVertical: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Label>Tasks · Sales</Label>
          <Text style={[T.title, { fontSize: 18 }]}>{tasks.total ? `${tasks.done} of ${tasks.total} done` : 'Nothing on the list'}</Text>
        </View>
        <Progress value={tasks.total ? tasks.done / tasks.total : 0} />
        <Text numberOfLines={1} style={T.sub}>{tasks.next ? `Next: ${tasks.next}` : tasks.total ? 'All done for today' : 'Add a task or set up a daily list'}</Text>
      </Tile>

      {/* Inbox */}
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <SmallTile icon="chatbubble-outline" title="Inbox" dot={unread > 0} sub={unread ? plural(unread, 'unread text') : 'No unread texts'}
          onPress={() => navigation.getParent()?.navigate('Inbox')} />
      </View>
    </>
  );
}
