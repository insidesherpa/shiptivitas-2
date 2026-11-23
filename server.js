import express from 'express';
import Database from 'better-sqlite3';

const app = express();

app.use(express.json());

// Enable CORS for frontend requests
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, PUT, POST, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.get('/', (req, res) => {
  return res.status(200).send({'message': 'SHIPTIVITY API. Read documentation to see API docs'});
});

// We are keeping one connection alive for the rest of the life application for simplicity
const db = new Database('./clients.db');

// Don't forget to close connection when server gets terminated
const closeDb = () => db.close();
process.on('SIGTERM', closeDb);
process.on('SIGINT', closeDb);

/**
 * Validate id input
 * @param {any} id
 */
const validateId = (id) => {
  if (Number.isNaN(id)) {
    return {
      valid: false,
      messageObj: {
        'message': 'Invalid id provided.',
        'long_message': 'Id can only be integer.',
      },
    };
  }
  const client = db.prepare('select * from clients where id = ? limit 1').get(id);
  if (!client) {
    return {
      valid: false,
      messageObj: {
        'message': 'Invalid id provided.',
        'long_message': 'Cannot find client with that id.',
      },
    };
  }
  return {
    valid: true,
  };
};

/**
 * Validate priority input
 * @param {any} priority
 */
const validatePriority = (priority) => {
  if (Number.isNaN(priority)) {
    return {
      valid: false,
      messageObj: {
        'message': 'Invalid priority provided.',
        'long_message': 'Priority can only be positive integer.',
      },
    };
  }
  return {
    valid: true,
  };
};

/**
 * Get all of the clients. Optional filter 'status'
 * GET /api/v1/clients?status={status} - list all clients, optional parameter status: 'backlog' | 'in-progress' | 'complete'
 */
app.get('/api/v1/clients', (req, res) => {
  const status = req.query.status;
  if (status) {
    // status can only be either 'backlog' | 'in-progress' | 'complete'
    if (status !== 'backlog' && status !== 'in-progress' && status !== 'complete') {
      return res.status(400).send({
        'message': 'Invalid status provided.',
        'long_message': 'Status can only be one of the following: [backlog | in-progress | complete].',
      });
    }
    const clients = db.prepare('select * from clients where status = ? order by priority asc').all(status);
    return res.status(200).send(clients);
  }
  const statement = db.prepare('select * from clients order by priority asc');
  const clients = statement.all();
  return res.status(200).send(clients);
});

/**
 * Get a client based on the id provided.
 * GET /api/v1/clients/{client_id} - get client by id
 */
app.get('/api/v1/clients/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { valid, messageObj } = validateId(id);
  if (!valid) {
    return res.status(400).send(messageObj);
  }
  return res.status(200).send(db.prepare('select * from clients where id = ?').get(id));
});

/**
 * Update client information based on the parameters provided.
 * When status is provided, the client status will be changed
 * When priority is provided, the client priority will be changed with the rest of the clients accordingly
 * Note that priority = 1 means it has the highest priority (should be on top of the swimlane).
 * No client on the same status should not have the same priority.
 * This API should return list of clients on success
 *
 * PUT /api/v1/clients/{client_id} - change the status of a client
 *    Data:
 *      status (optional): 'backlog' | 'in-progress' | 'complete',
 *      priority (optional): integer,
 *
 */
app.put('/api/v1/clients/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { valid, messageObj } = validateId(id);
  if (!valid) {
    return res.status(400).send(messageObj);
  }

  let { status, priority } = req.body;

  // Validate status if provided
  if (status !== undefined) {
    if (status !== 'backlog' && status !== 'in-progress' && status !== 'complete') {
      return res.status(400).send({
        'message': 'Invalid status provided.',
        'long_message': 'Status can only be one of the following: [backlog | in-progress | complete].',
      });
    }
  }

  // Validate priority if provided
  if (priority !== undefined) {
    priority = parseInt(priority, 10);
    const pValidation = validatePriority(priority);
    if (!pValidation.valid || priority <= 0) {
      return res.status(400).send({
        'message': 'Invalid priority provided.',
        'long_message': 'Priority can only be positive integer.',
      });
    }
  }

  let clients = db.prepare('select * from clients').all();
  const client = clients.find(c => c.id === id);

  /* ---------- Update code below ----------*/
  const oldStatus = client.status;
  const oldPriority = client.priority;
  const targetStatus = status !== undefined ? status : oldStatus;

  const updateClientTransaction = db.transaction(() => {
    if (targetStatus !== oldStatus) {
      // 1. Moving between swimlanes:
      // Remove from old swimlane: shift down priorities of cards after oldPriority in oldStatus
      db.prepare(`
        UPDATE clients
        SET priority = priority - 1
        WHERE status = ? AND priority > ?
      `).run(oldStatus, oldPriority);

      // Determine targetPriority in new swimlane
      const row = db.prepare('SELECT COUNT(*) as count FROM clients WHERE status = ?').get(targetStatus);
      const laneCount = row.count || 0;

      let targetPriority;
      if (priority === undefined) {
        // Lowest priority (biggest number) in new swimlane
        targetPriority = laneCount + 1;
      } else {
        // Clamp between 1 and laneCount + 1
        targetPriority = Math.min(Math.max(1, priority), laneCount + 1);
        // Shift existing cards in targetStatus at or above targetPriority to make room
        db.prepare(`
          UPDATE clients
          SET priority = priority + 1
          WHERE status = ? AND priority >= ?
        `).run(targetStatus, targetPriority);
      }

      // Update client to new status and priority
      db.prepare(`
        UPDATE clients
        SET status = ?, priority = ?
        WHERE id = ?
      `).run(targetStatus, targetPriority, id);

    } else {
      // 2. Reordering within the same swimlane
      if (priority !== undefined && priority !== oldPriority) {
        const row = db.prepare('SELECT COUNT(*) as count FROM clients WHERE status = ?').get(targetStatus);
        const laneCount = row.count || 0;
        const targetPriority = Math.min(Math.max(1, priority), laneCount);

        if (targetPriority < oldPriority) {
          // Moving UP: shift items in [targetPriority, oldPriority - 1] DOWN (increment priority)
          db.prepare(`
            UPDATE clients
            SET priority = priority + 1
            WHERE status = ? AND priority >= ? AND priority < ?
          `).run(targetStatus, targetPriority, oldPriority);
        } else if (targetPriority > oldPriority) {
          // Moving DOWN: shift items in [oldPriority + 1, targetPriority] UP (decrement priority)
          db.prepare(`
            UPDATE clients
            SET priority = priority - 1
            WHERE status = ? AND priority > ? AND priority <= ?
          `).run(targetStatus, oldPriority, targetPriority);
        }

        // Update client priority
        db.prepare(`
          UPDATE clients
          SET priority = ?
          WHERE id = ?
        `).run(targetPriority, id);
      }
    }
  });

  updateClientTransaction();

  clients = db.prepare('select * from clients order by priority asc').all();

  return res.status(200).send(clients);
});

app.listen(3001);
console.log('app running on port ', 3001);
