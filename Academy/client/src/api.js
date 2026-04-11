import { supabase } from './lib/supabase';

const BASE = '/api/academy';

async function request(path, options = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  const res = await fetch(`${BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...options,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.detail || `${res.status}: ${res.statusText}`);
  }

  return res.json();
}

// ── Public (no auth) ──
export async function getPublicCourses() {
  const res = await fetch(`${BASE}/courses?public=true`);
  if (!res.ok) throw new Error('Failed to load courses');
  return res.json();
}
export async function getPublicCourse(slug) {
  const res = await fetch(`${BASE}/courses?slug=${slug}&public=true`);
  if (!res.ok) throw new Error('Course not found');
  return res.json();
}

// ── Courses ──
export const getCourses = () => request('/courses');
export const getCourse = (slug) => request(`/courses?slug=${slug}`);

// ── Lessons ──
export const getLessons = (courseId) => request(`/lessons?course_id=${courseId}`);
export const getLesson = (id) => request(`/lessons?id=${id}`);

// ── Progress ──
export const getProgress = (courseId) => request(`/progress?course_id=${courseId}`);
export const updateProgress = (data) => request('/progress', { method: 'POST', body: JSON.stringify(data) });

// ── Quizzes ──
export const getQuiz = (lessonId) => request(`/quizzes?lesson_id=${lessonId}`);
export const submitQuiz = (data) => request('/quizzes', { method: 'POST', body: JSON.stringify(data) });

// ── Homework ──
export const getHomework = (lessonId) => request(`/homework?lesson_id=${lessonId}`);
export const submitHomework = (data) => request('/homework', { method: 'POST', body: JSON.stringify(data) });

// ── Messages ──
export const getMessages = () => request('/messages');
export const sendMessage = (data) => request('/messages', { method: 'POST', body: JSON.stringify(data) });

// ── Community ──
export const getCommunityPosts = (page = 0) => request(`/community?page=${page}`);
export const createCommunityPost = (data) => request('/community', { method: 'POST', body: JSON.stringify(data) });
export const createCommunityReply = (postId, data) => request(`/community?action=reply&post_id=${postId}`, { method: 'POST', body: JSON.stringify(data) });

// ── Notifications ──
export const getNotifications = () => request('/notifications');
export const markNotificationRead = (id) => request(`/notifications?id=${id}`, { method: 'PUT' });
export const markAllNotificationsRead = () => request('/notifications?action=read-all', { method: 'PUT' });

// ── Recommendations ──
export const getRecommendations = () => request('/recommendations');

// ── Profile ──
export const getProfile = () => request('/profile');
export const updateProfile = (data) => request('/profile', { method: 'PUT', body: JSON.stringify(data) });

// ── Billing ──
export const getBillingStatus = () => request('/billing');
export const createCheckoutSession = (priceId) => request('/billing?action=create-checkout', { method: 'POST', body: JSON.stringify({ price_id: priceId }) });
export const createCustomerPortal = () => request('/billing?action=customer-portal', { method: 'POST' });
