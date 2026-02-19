import http from 'k6/http';
import { sleep } from 'k6';

const SUPABASE_URL = 'https://rxskfvquuvxmwrgcnqij.supabase.co';
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ4c2tmdnF1dXZ4bXdyZ2NucWlqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE0MjkzOTMsImV4cCI6MjA4NzAwNTM5M30.GJJxNpezwq4-Ui5rgZMwj6D6J8zOzIjBvzvi5gtfbZQ';

const HEADERS = {
  'apikey': KEY,
  'Authorization': `Bearer ${KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=minimal',
};

const PROMPTS = [0, 1, 2, 3, 4];
const AUTHORS = ['Alex', 'Jordan', 'Taylor', 'Morgan', 'Casey', 'Riley', 'Jamie', 'Avery', 'Quinn', 'Blake'];
const RESPONSES = [
  'Really enjoyed the keynote speaker, very insightful!',
  'The venue was great but parking was a bit difficult.',
  'Loved the networking opportunities, met some great people.',
  'Sessions ran a bit long, could use tighter scheduling.',
  'Excellent organisation, everything ran smoothly.',
  'Would love more breakout sessions next time.',
  'Food and refreshments were fantastic.',
  'The app was really helpful for navigating the schedule.',
  'Great event overall, will definitely attend again.',
  'More Q&A time with speakers would be appreciated.',
];

function uid() {
  return `test_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export const options = {
  scenarios: {
    burst_submit: {
      executor: 'constant-vus',
      vus: 200,
      duration: '10s',  // all 200 users hammering submits for 10 seconds
    },
  },
  thresholds: {
    http_req_failed:   ['rate<0.01'],
    http_req_duration: ['p(95)<3000'],
  },
};

export default function () {
  const payload = JSON.stringify({
    id:         uid(),
    prompt_idx: PROMPTS[Math.floor(Math.random() * PROMPTS.length)],
    prompt:     `Test prompt ${Math.floor(Math.random() * 5)}`,
    text:       RESPONSES[Math.floor(Math.random() * RESPONSES.length)],
    author:     AUTHORS[Math.floor(Math.random() * AUTHORS.length)],
    visibility: 'public',
    upvotes:    0,
    timestamp:  Date.now(),
  });

  http.post(
    `${SUPABASE_URL}/rest/v1/submissions`,
    payload,
    { headers: HEADERS }
  );

  sleep(0.1); // tiny pause so requests aren't literally the same millisecond
}