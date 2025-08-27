// backend/api/auth/admin/login.js
import server from '../../../../src/app.js';
export default function handler(req, res) {
  return server(req, res); // forwards any method (GET/POST/OPTIONS) to Express
}
// optional but fine to keep
// export const config = { runtime: 'nodejs20.x' };
