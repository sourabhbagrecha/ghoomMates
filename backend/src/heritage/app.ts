import { Router } from 'express';
import { ApiError } from '../http.ts';
import { cityOf, liveCrowds } from './crowd.ts';

// Live crowd levels across a city's heritage sites. Public: it holds no user data. Mount under /api/heritage.
export function createHeritageApp() {
  const router = Router();

  router.get('/:city/live', (req, res) => {
    const city = cityOf(req.params.city);
    if (!city) throw new ApiError(404, 'NOT_FOUND', `No crowd data for ${req.params.city} yet`);
    // ?at= lets a demo show a chosen moment, e.g. the sunset rush
    const at = typeof req.query.at === 'string' ? new Date(req.query.at) : new Date();
    if (Number.isNaN(at.getTime())) throw new ApiError(400, 'VALIDATION_ERROR', 'at must be an ISO date-time');
    res.json(liveCrowds(city, at));
  });

  return router;
}
