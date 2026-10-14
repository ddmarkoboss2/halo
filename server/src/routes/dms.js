import express from 'express';
import { requireAuth } from '../auth.js';
import { get } from '../db.js';
import { listDmsForUser } from '../bootstrap.js';
import { bad, wrap } from '../http.js';
import { notifyState } from '../events.js';
import { createDm, findDm, getUserById, publicUser, serializeDm } from '../store.js';

export const dmRoutes = express.Router();
dmRoutes.use(requireAuth);

dmRoutes.get(
  '/',
  wrap((req, res) => {
    res.json({ dms: listDmsForUser(req.user.id) });
  }),
);

dmRoutes.post(
  '/',
  wrap((req, res) => {
    const otherId = String(req.body?.userId ?? '');
    if (otherId === req.user.id) return bad(res, 'You cannot DM yourself');
    const other = getUserById(otherId);
    if (!other) return bad(res, 'That user does not exist', 404);

    let dm = findDm(req.user.id, otherId);
    if (!dm) {
      dm = createDm(req.user.id, otherId);
      notifyState([req.user.id, otherId], 'dm-created');
    }
    res.status(201).json({ dm: serializeDm(dm, req.user.id) });
  }),
);

dmRoutes.get(
  '/:dmId',
  wrap((req, res) => {
    const dm = get('SELECT * FROM dms WHERE id = ?', req.params.dmId);
    if (!dm || (dm.user_a !== req.user.id && dm.user_b !== req.user.id)) {
      return bad(res, 'Conversation not found', 404);
    }
    const otherId = dm.user_a === req.user.id ? dm.user_b : dm.user_a;
    res.json({ dm: serializeDm(dm, req.user.id), participant: publicUser(getUserById(otherId)) });
  }),
);

