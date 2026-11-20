import { Router } from 'express';
import { ApiError } from '../http.ts';
import { asVibe, VIBE_AXES } from '../voice/experiences.ts';
import { GUIDE_BY_ID, GUIDES, guideFor, ITEM_KINDS, rankItems, TRAVELLERS, type ItemKind, type Month, type Traveller } from './index.ts';

// The destination inventory. Public and read-only: it holds no user data. Mount under /api/places.
export function createPlacesApp() {
  const router = Router();

  // Every guide, without its items: what the destination picker and GhoomMate need to know we cover a place
  router.get('/', (_req, res) => {
    res.json({
      guides: GUIDES.map(g => ({
        id: g.id, name: g.name, state: g.state, lat: g.lat, lng: g.lng, summary: g.summary, bestMonths: g.bestMonths,
        budgetPerDayRupees: g.budgetPerDayRupees, idealDays: g.idealDays, items: g.items.length, gems: g.items.filter(i => i.gem).length,
      })),
    });
  });

  // ?destination=Spiti%20valley → the guide id we have for a free-text destination
  router.get('/match', (req, res) => {
    const guide = guideFor(typeof req.query.destination === 'string' ? req.query.destination : '');
    res.json({ guide: guide ? { id: guide.id, name: guide.name } : null });
  });

  // One guide in full. Filters: kind (comma list), gems=1, traveller, month (1–12), maxCost, and a vibe as
  // adventure=0.8&food=0.3… to rank items for a person (each item then carries match 0–100).
  router.get('/:id', (req, res) => {
    const guide = GUIDE_BY_ID.get(req.params.id) ?? guideFor(req.params.id);
    if (!guide) throw new ApiError(404, 'NOT_FOUND', `No guide for ${req.params.id} yet`);
    const q = req.query;
    const kinds = typeof q.kind === 'string' ? q.kind.split(',').filter((k): k is ItemKind => ITEM_KINDS.includes(k as ItemKind)) : undefined;
    const traveller = typeof q.traveller === 'string' && TRAVELLERS.includes(q.traveller as Traveller) ? q.traveller as Traveller : undefined;
    const month = Number(q.month);
    const maxCost = Number(q.maxCost);
    const vibe = VIBE_AXES.some(axis => typeof q[axis] === 'string')
      ? asVibe(Object.fromEntries(VIBE_AXES.map(axis => [axis, Number(q[axis] ?? 0) || 0])))
      : null;
    const items = rankItems(guide, {
      vibe, kinds, traveller,
      gems: q.gems === '1' || q.gems === 'true',
      month: Number.isInteger(month) && month >= 1 && month <= 12 ? month as Month : null,
      maxCostRupees: Number.isFinite(maxCost) && maxCost >= 0 && q.maxCost !== undefined ? maxCost : null,
    }).map(({ item, match }) => (match === null ? item : { ...item, match }));
    res.json({ guide: { ...guide, items } });
  });

  return router;
}
