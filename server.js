import express from 'express';
import Database from 'better-sqlite3';

const app = express();

app.use(express.json());

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
}

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
  }
}

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
    const clients = db.prepare('select * from clients where status = ?').all(status);
    return res.status(200).send(clients);
  }
  const statement = db.prepare('select * from clients');
  const clients = statement.all();
  return res.status(200).send(clients);
});

/**
 * Get a client based on the id provided.
 * GET /api/v1/clients/{client_id} - get client by id
 */
app.get('/api/v1/clients/:id', (req, res) => {
  const id = parseInt(req.params.id , 10);
  const { valid, messageObj } = validateId(id);
  if (!valid) {
    res.status(400).send(messageObj);
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
 * Data:
 *   status (optional): 'backlog' | 'in-progress' | 'complete',
 *   priority (optional): integer,
 *
 */
app.put('/api/v1/clients/:id', (req, res) => {
  const id = parseInt(req.params.id , 10);
  const { valid, messageObj } = validateId(id);
  if (!valid) {
    return res.status(400).send(messageObj);
  }

  let { status, priority } = req.body;
  let clients = db.prepare('select * from clients').all();
  const client = clients.find(c => c.id === id);

  /* ---------- Update code below ----------*/

  // Validate priority if provided
  if (priority !== undefined) {
    priority = parseInt(priority, 10);
    const { valid: pValid, messageObj: pMsg } = validatePriority(priority);
    if (!pValid) {
      return res.status(400).send(pMsg);
    }
  }

  // Validate status if provided
  const validStatuses = ['backlog', 'in-progress', 'complete'];
  if (status !== undefined && !validStatuses.includes(status)) {
    return res.status(400).send({
      'message': 'Invalid status provided.',
      'long_message': 'Status can only be one of the following: [backlog | in-progress | complete].',
    });
  }

  // Determine the target status and priority
  const targetStatus = status !== undefined ? status : client.status;
  const targetPriority = priority !== undefined ? priority : client.priority;

  // Get clients in the target lane (excluding the current client), sorted by priority
  const targetLaneClients = clients
    .filter(c => c.status === targetStatus && c.id !== id)
    .sort((a, b) => a.priority - b.priority);

  // Insert current client at the desired priority position
  targetLaneClients.splice(targetPriority - 1, 0, { ...client, status: targetStatus });

  // Re-assign sequential priorities in the target lane
  const updateStmt = db.prepare('update clients set status = ?, priority = ? where id = ?');
  targetLaneClients.forEach((c, index) => {
    updateStmt.run(targetStatus, index + 1, c.id);
  });

  // If status changed, re-compact the old lane priorities
  if (status !== undefined && status !== client.status) {
    const oldLaneClients = clients
      .filter(c => c.status === client.status && c.id !== id)
      .sort((a, b) => a.priority - b.priority);

    oldLaneClients.forEach((c, index) => {
      updateStmt.run(c.status, index + 1, c.id);
    });
  }

  // Return updated full client list
  return res.status(200).send(db.prepare('select * from clients').all());
});

app.listen(3001);
console.log('app running on port ', 3001);
