import { createNavigationContainerRef } from '@react-navigation/native';

// One navigation ref for the whole app, so pushes, the dock and header
// buttons can jump anywhere without threading props through.
export const navigationRef = createNavigationContainerRef();

// A tapped message push opens that conversation (Inbox lives inside Tabs).
export function goToConversation(phone, draft) {
  if (!phone || !navigationRef.isReady()) return;
  navigationRef.navigate('Tabs', { screen: 'Inbox', params: { screen: 'Conversation', params: { phone, draft: draft || undefined, draftAt: draft ? Date.now() : undefined } } });
}

// A team chat room (internal chat lives in the Inbox stack too).
export function goToTeamChat(room) {
  if (!room || !navigationRef.isReady()) return;
  navigationRef.navigate('Tabs', { screen: 'Inbox', params: { screen: 'TeamChat', params: { room } } });
}

// The assistant is a full-screen space above the tabs.
export function openAssistant(params) {
  if (!navigationRef.isReady()) return;
  navigationRef.navigate('Assistant', params);
}

// A space off Home (Calendar, People, Tasks, Time, Settings, ClientDetail).
export function openSpace(name, params) {
  if (!navigationRef.isReady()) return;
  navigationRef.navigate('Tabs', { screen: 'Home', params: { screen: name, params } });
}
