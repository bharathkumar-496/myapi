const express = require('express');
const app = express();
app.use(express.json());

let events = [];
let nextId = 1;

const CATEGORIES = ['Music', 'Tech', 'Sports', 'Workshop', 'Festival'];

function checkField(name, v) {
  if (name === 'title' || name === 'venue') {
    if (typeof v !== 'string') return { ok: false, msg: name + ' must be a string' };
    const t = v.trim();
    if (t.length < 1 || t.length > 200)
      return { ok: false, msg: name + ' must be 1 to 200 characters' };
    return { ok: true, value: t };
  }
  if (name === 'category') {
    if (typeof v !== 'string' || !CATEGORIES.includes(v))
      return { ok: false, msg: 'category must be exactly one of Music, Tech, Sports, Workshop, Festival' };
    return { ok: true, value: v };
  }
  if (name === 'ticketPrice') {
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0 || v > 50000)
      return { ok: false, msg: 'ticketPrice must be a number > 0 and <= 50000' };
    return { ok: true, value: v };
  }
  if (name === 'seatsAvailable') {
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0)
      return { ok: false, msg: 'seatsAvailable must be a non-negative whole number' };
    return { ok: true, value: v };
  }
  if (name === 'isOnline') {
    if (typeof v !== 'boolean') return { ok: false, msg: 'isOnline must be true or false' };
    return { ok: true, value: v };
  }
}

const FIELDS = ['title', 'venue', 'category', 'ticketPrice', 'seatsAvailable', 'isOnline'];

function isObject(b) {
  return b !== null && typeof b === 'object' && !Array.isArray(b);
}

function validate(body, requireAll) {
  if (!isObject(body)) return { error: 'body must be a JSON object' };
  const clean = {};
  for (const f of FIELDS) {
    if (body[f] === undefined) {
      if (requireAll) return { error: f + ' is required' };
      continue;
    }
    const r = checkField(f, body[f]);
    if (!r.ok) return { error: r.msg };
    clean[f] = r.value;
  }
  if (Object.keys(clean).length === 0) return { error: 'no valid fields sent' };
  return { clean };
}

function findIndex(idText) {
  return events.findIndex(e => String(e.id) === idText);
}

app.post('/api/events', (req, res) => {
  const r = validate(req.body, true);
  if (r.error) return res.status(400).json({ error: r.error });
  const event = { id: nextId++, ...r.clean };
  events.push(event);
  res.status(201).json(event);
});

app.get('/api/events', (req, res) => {
  const q = req.query;

  const isPosInt = s => /^[0-9]+$/.test(s) && Number(s) >= 1;
  let page = 1, limit = 10;
  if (q.page !== undefined) {
    if (!isPosInt(q.page)) return res.status(400).json({ error: 'invalid page' });
    page = Number(q.page);
  }
  if (q.limit !== undefined) {
    if (!isPosInt(q.limit) || Number(q.limit) > 50)
      return res.status(400).json({ error: 'invalid limit' });
    limit = Number(q.limit);
  }

  if (q.category !== undefined && !CATEGORIES.includes(q.category))
    return res.status(400).json({ error: 'invalid category' });
  if (q.isOnline !== undefined && q.isOnline !== 'true' && q.isOnline !== 'false')
    return res.status(400).json({ error: 'invalid isOnline' });

  const isNum = s => typeof s === 'string' && s.trim() !== '' && Number.isFinite(Number(s));
  if (q.minPrice !== undefined && !isNum(q.minPrice))
    return res.status(400).json({ error: 'invalid minPrice' });
  if (q.maxPrice !== undefined && !isNum(q.maxPrice))
    return res.status(400).json({ error: 'invalid maxPrice' });

  if (q.sort !== undefined && !['title', 'ticketPrice', 'seatsAvailable'].includes(q.sort))
    return res.status(400).json({ error: 'invalid sort' });
  if (q.order !== undefined && !['asc', 'desc'].includes(q.order))
    return res.status(400).json({ error: 'invalid order' });

  let list = events.slice();
  if (q.category !== undefined) list = list.filter(e => e.category === q.category);
  if (q.isOnline !== undefined) list = list.filter(e => e.isOnline === (q.isOnline === 'true'));
  if (q.minPrice !== undefined) list = list.filter(e => e.ticketPrice >= Number(q.minPrice));
  if (q.maxPrice !== undefined) list = list.filter(e => e.ticketPrice <= Number(q.maxPrice));

  if (typeof q.search === 'string' && q.search.trim() !== '') {
    const s = q.search.trim().toLowerCase();
    list = list.filter(e =>
      e.title.toLowerCase().includes(s) || e.venue.toLowerCase().includes(s));
  }

  if (q.sort !== undefined) {
    const dir = q.order === 'desc' ? -1 : 1;
    list.sort((a, b) => {
      let x = a[q.sort], y = b[q.sort];
      if (q.sort === 'title') { x = x.toLowerCase(); y = y.toLowerCase(); }
      if (x < y) return -1 * dir;
      if (x > y) return 1 * dir;
      return 0;
    });
  }

  const total = list.length;
  const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
  const start = (page - 1) * limit;
  const data = list.slice(start, start + limit);

  res.json({ data, page, limit, total, totalPages });
});

app.get('/api/events/:id', (req, res) => {
  const i = findIndex(req.params.id);
  if (i === -1) return res.status(404).json({ error: 'Record not found' });
  res.json(events[i]);
});

app.put('/api/events/:id', (req, res) => {
  const i = findIndex(req.params.id);
  if (i === -1) return res.status(404).json({ error: 'Record not found' });
  const r = validate(req.body, true);
  if (r.error) return res.status(400).json({ error: r.error });
  events[i] = { id: events[i].id, ...r.clean };
  res.json(events[i]);
});

app.patch('/api/events/:id', (req, res) => {
  const i = findIndex(req.params.id);
  if (i === -1) return res.status(404).json({ error: 'Record not found' });
  const r = validate(req.body, false);
  if (r.error) return res.status(400).json({ error: r.error });
  events[i] = { ...events[i], ...r.clean, id: events[i].id };
  res.json(events[i]);
});

app.delete('/api/events/:id', (req, res) => {
  const i = findIndex(req.params.id);
  if (i === -1) return res.status(404).json({ error: 'Record not found' });
  events.splice(i, 1);
  res.status(204).end();
});

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed' || err instanceof SyntaxError)
    return res.status(400).json({ error: 'Malformed JSON' });
  res.status(500).json({ error: 'Server error' });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log('Server running on port ' + PORT));