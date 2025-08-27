// before: import server from '../../../../src/app.js';
import server from '../../../src/app.js';
export default function handler(req, res) {
  return server(req, res);
}
