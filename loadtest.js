import http from 'k6/http';
import { sleep } from 'k6';

const SUPABASE_URL = 'https://rxskfvquuvxmwrgcnqij.supabase.co';
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ4c2tmdnF1dXZ4bXdyZ2NucWlqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE0MjkzOTMsImV4cCI6MjA4NzAwNTM5M30.GJJxNpezwq4-Ui5rgZMwj6D6J8zOzIjBvzvi5gtfbZQ';

const HEADERS = {
  'apikey': KEY,
  'Authorization': `Bearer ${KEY}`,
  'Content-Type': 'application/json',
};

export const options = {
  stages: [
    { duration: '30s', target: 50  },
    { duration: '1m',  target: 200 },
    { duration: '30s', target: 0   },
  ],
  thresholds: {
    http_req_failed:   ['rate<0.01'],   // less than 1% errors
    http_req_duration: ['p(95)<2000'],  // 95% of requests under 2s
  },
};

export default function () {
  http.get(
    `${SUPABASE_URL}/rest/v1/submissions?visibility=eq.public&select=*`,
    { headers: HEADERS }
  );
  sleep(1);
}