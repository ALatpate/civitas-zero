import http from 'k6/http';
import { sleep, check } from 'k6';

export const options = {
  stages: [
    { duration: '5s', target: 50 }, // Ramp up to 50 concurrent spectator connections
    { duration: '15s', target: 50 }, // Sustain peak load
    { duration: '10s', target: 0 },   // Ramp down gracefully
  ],
};

export default function () {
  // Simulating 50 humans actively polling the backend for civilizational state updates
  // Adjust endpoint depending on whether you are load testing REST /api/world/state or specific feeds
  const res = http.get('http://127.0.0.1:8000/api/world/state');
  
  check(res, {
    'status is 200': (r) => r.status === 200,
    'latency is under 100ms': (r) => r.timings.duration < 100, // Important for realtime feel
    'latency is under 500ms': (r) => r.timings.duration < 500, // Acceptable degradation
  });
  
  // Real clients poll every 1-2 seconds, so we sleep for 1s
  sleep(1);
}
