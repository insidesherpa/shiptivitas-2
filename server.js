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
 *    Data:
 *      status (optional): 'backlog' | 'in-progress' | 'complete',
 *      priority (optional): integer,
 *
 */
app.put('/api/v1/clients/:id', (req, res) => {
  const id = parseInt(req.params.id , 10);
  const { valid, messageObj } = validateId(id);
  if (!valid) {
    res.status(400).send(messageObj);
  }

  let { status, priority } = req.body;
  let clients = db.prepare('select * from clients').all();
  const client = clients.find(client => client.id === id);

  const currentStatus = client.status;
  const currentPriority = client.priority;

  const targetStatus = status !== undefined ? status : currentStatus;
  let targetPriority = priority !== undefined ? priority : null;

  // Validate status if provided
  if (status !== undefined && status !== 'backlog' && status !== 'in-progress' && status !== 'complete') {
    return res.status(400).send({
      'message': 'Invalid status provided.',
      'long_message': 'Status can only be one of the following: [backlog | in-progress | complete].',
    });
  }

  // Validate priority if provided
  if (priority !== undefined) {
    const { valid, messageObj } = validatePriority(priority);
    if (!valid) {
      return res.status(400).send(messageObj);
    }
  }

  const executeUpdates = db.transaction(() => {
    if (targetStatus !== currentStatus) {
      // 1. Shift priorities down in the old swimlane to close the gap
      db.prepare('UPDATE clients SET priority = priority - 1 WHERE status = ? AND priority > ?')
        .run(currentStatus, currentPriority);

      // 2. Determine new priority if not specified (place at the bottom)
      if (targetPriority === null) {
        const row = db.prepare('SELECT COALESCE(MAX(priority), 0) + 1 AS nextPriority FROM clients WHERE status = ?').get(targetStatus);
        targetPriority = row.nextPriority;
      } else {
        // 3. Shift priorities up in the new swimlane to make room
        db.prepare('UPDATE clients SET priority = priority + 1 WHERE status = ? AND priority >= ?')
          .run(targetStatus, targetPriority);
      }

      // 4. Update the client
      db.prepare('UPDATE clients SET status = ?, priority = ? WHERE id = ?')
        .run(targetStatus, targetPriority, id);

    } else if (targetPriority !== null && targetPriority !== currentPriority) {
      // Reordering in the same swimlane
      if (targetPriority < currentPriority) {
        // Moving up: shift intermediate clients down (add 1)
        db.prepare('UPDATE clients SET priority = priority + 1 WHERE status = ? AND priority >= ? AND priority < ?')
          .run(currentStatus, targetPriority, currentPriority);
      } else {
        // Moving down: shift intermediate clients up (subtract 1)
        db.prepare('UPDATE clients SET priority = priority - 1 WHERE status = ? AND priority > ? AND priority <= ?')
          .run(currentStatus, currentPriority, targetPriority);
      }

      // Update current client priority
      db.prepare('UPDATE clients SET priority = ? WHERE id = ?')
        .run(targetPriority, id);
    }
  });

  executeUpdates();

  // Re-fetch all clients to send the updated database state back
  clients = db.prepare('SELECT * FROM clients').all();
  return res.status(200).send(clients);
});

app.listen(3001);
console.log('app running on port ', 3001);
