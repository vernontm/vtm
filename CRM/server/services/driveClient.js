/**
 * driveClient.js
 * Google Drive API wrapper for finding Meet recordings.
 * Reuses the same OAuth2 tokens as gmailClient.
 *
 * User's Meet Recordings folder ID: 1ORMSlsp95-GRb0abHAIJMof-Mpw9STaO
 */

const { google } = require('googleapis');
const { getAuthenticatedClient } = require('./gmailClient');

// The user's dedicated Meet Recordings folder (from the Drive URL they shared)
const MEET_RECORDINGS_FOLDER_ID = '1ORMSlsp95-GRb0abHAIJMof-Mpw9STaO';

async function getDrive() {
  try {
    const auth = await getAuthenticatedClient();
    return google.drive({ version: 'v3', auth });
  } catch (err) {
    throw new Error('DRIVE_RECONNECT_NEEDED');
  }
}

/**
 * Find a Meet recording in Drive for a given meeting.
 * Strategy: search the Meet Recordings folder for .mp4 files whose name
 * contains key words from the meeting title, created within 24h of the meeting.
 *
 * @param {string} meetingTitle  - Calendar event title
 * @param {string} startTime     - ISO start time of the meeting
 * @returns {object|null} - { fileId, name, webViewLink, previewUrl, durationSeconds } or null
 */
async function findRecordingForMeeting(meetingTitle, startTime) {
  try {
    const drive = await getDrive();

    // Build name-based search terms from the title (skip short words)
    const words = (meetingTitle || '')
      .split(/\s+/)
      .filter(w => w.length > 2)
      .slice(0, 3);

    // Date window: ±1 day around the meeting
    const meetDate = startTime ? new Date(startTime) : null;
    const timeMin  = meetDate ? new Date(meetDate.getTime() - 86400000).toISOString() : null;
    const timeMax  = meetDate ? new Date(meetDate.getTime() + 86400000).toISOString() : null;

    // Primary search: video files in the specific folder
    let query = `mimeType='video/mp4' and '${MEET_RECORDINGS_FOLDER_ID}' in parents and trashed = false`;
    if (timeMin && timeMax) {
      query += ` and createdTime >= '${timeMin}' and createdTime <= '${timeMax}'`;
    }

    let resp = await drive.files.list({
      q: query,
      fields: 'files(id, name, webViewLink, size, videoMediaMetadata, createdTime)',
      orderBy: 'createdTime desc',
      pageSize: 20,
    });

    let files = resp.data.files || [];

    // If we have title words, filter in JS for the best match
    if (words.length > 0 && files.length > 0) {
      const lowerTitle = meetingTitle.toLowerCase();
      const scored = files.map(f => {
        const lowerName = (f.name || '').toLowerCase();
        let score = 0;
        words.forEach(w => { if (lowerName.includes(w.toLowerCase())) score++; });
        if (lowerName.includes(lowerTitle)) score += 10; // exact match bonus
        return { ...f, _score: score };
      });
      scored.sort((a, b) => b._score - a._score);
      files = scored.filter(f => f._score > 0);
    }

    // Fallback: if no date-filtered results, search broader (no date constraint)
    if (files.length === 0 && words.length > 0) {
      const fallbackQuery = `mimeType='video/mp4' and '${MEET_RECORDINGS_FOLDER_ID}' in parents and trashed = false and name contains '${words[0].replace(/'/g, "\\'")}' `;
      const fallback = await drive.files.list({
        q: fallbackQuery,
        fields: 'files(id, name, webViewLink, size, videoMediaMetadata, createdTime)',
        orderBy: 'createdTime desc',
        pageSize: 5,
      });
      files = fallback.data.files || [];
    }

    if (files.length === 0) return null;

    const best = files[0];
    const durationSeconds = best.videoMediaMetadata?.durationMillis
      ? Math.round(parseInt(best.videoMediaMetadata.durationMillis) / 1000)
      : null;

    return {
      fileId:          best.id,
      name:            best.name,
      webViewLink:     best.webViewLink,
      previewUrl:      `https://drive.google.com/file/d/${best.id}/preview`,
      durationSeconds,
      createdTime:     best.createdTime,
      size:            best.size,
    };
  } catch (err) {
    if (err.message === 'DRIVE_RECONNECT_NEEDED') throw err;
    // Drive API errors (403 scope, etc.)
    const code = err.code || err.response?.status;
    const msg  = err.message || '';
    if (code === 401 || code === 403 || msg.includes('insufficientPermissions') || msg.includes('invalid_grant')) {
      throw new Error('DRIVE_RECONNECT_NEEDED');
    }
    console.error('[DriveClient] findRecording error:', err.message);
    return null; // Non-fatal — recording just not found
  }
}

/**
 * List all files in the Meet Recordings folder (for debugging / manual refresh).
 */
async function listRecordingsFolder() {
  try {
    const drive = await getDrive();
    const resp  = await drive.files.list({
      q:       `'${MEET_RECORDINGS_FOLDER_ID}' in parents and trashed = false`,
      fields:  'files(id, name, mimeType, webViewLink, createdTime, size, videoMediaMetadata)',
      orderBy: 'createdTime desc',
      pageSize: 50,
    });
    return resp.data.files || [];
  } catch (err) {
    console.error('[DriveClient] listRecordingsFolder error:', err.message);
    return [];
  }
}

module.exports = { findRecordingForMeeting, listRecordingsFolder, MEET_RECORDINGS_FOLDER_ID };
