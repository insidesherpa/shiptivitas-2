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
  return res.status(400).send(messageObj);
  }

  let { status, priority } = req.body;
  let clients = db.prepare('select * from clients').all();
  const client = clients.find(client => client.id === id);
  if (!client) {
  return res.status(404).send({
    message: 'Client not found.',
  });
}

  /* ---------- Update code below ----------*/
  // Validate the supplied status.
  const validStatuses = ['backlog', 'in-progress', 'complete'];

  if (status !== undefined && !validStatuses.includes(status)) {
    return res.status(400).send({
      message: 'Invalid status provided.',
      long_message: 'Status can only be backlog, in-progress, or complete.',
    });
  }

  // Validate the supplied priority.
  if (
    priority !== undefined &&
    (!Number.isInteger(priority) || priority < 1)
  ) {
    return res.status(400).send({
      message: 'Invalid priority provided.',
      long_message: 'Priority must be a positive integer.',
    });
  }

  // If neither field is supplied, leave the client unchanged.
  if (status === undefined && priority === undefined) {
    return res.status(200).send(clients);
  }

  const originalStatus = client.status;
  const targetStatus = status === undefined ? originalStatus : status;

  // If status is unchanged and no priority was supplied, do nothing.
  if (targetStatus === originalStatus && priority === undefined) {
    return res.status(200).send(clients);
  }

  // Remove the moving client from the lists before inserting it.
  const remainingClients = clients.filter(item => item.id !== id);

  const targetClients = remainingClients
    .filter(item => item.status === targetStatus)
    .sort((a, b) => a.priority - b.priority || a.id - b.id);

  // A status-only update puts the client last.
  // A supplied priority inserts it at the requested position.
  const insertionIndex = priority === undefined
    ? targetClients.length
    : Math.min(priority - 1, targetClients.length);

  targetClients.splice(insertionIndex, 0, {
    ...client,
    status: targetStatus,
  });

  // Rebuild the order of the original status and target status.
  const statusesToUpdate = originalStatus === targetStatus
    ? [targetStatus]
    : [originalStatus, targetStatus];

  const updatedOrder = {};

  statusesToUpdate.forEach(currentStatus => {
    if (currentStatus === targetStatus) {
      updatedOrder[currentStatus] = targetClients;
    } else {
      updatedOrder[currentStatus] = remainingClients
        .filter(item => item.status === currentStatus)
        .sort((a, b) => a.priority - b.priority || a.id - b.id);
    }
  });

  // Update all affected rows atomically.
  const updateClient = db.prepare(
    'UPDATE clients SET status = ?, priority = ? WHERE id = ?'
  );

  const saveChanges = db.transaction(() => {
    statusesToUpdate.forEach(currentStatus => {
      updatedOrder[currentStatus].forEach((item, index) => {
        updateClient.run(
          currentStatus,
          index + 1,
          item.id
        );
      });
    });
  });

  saveChanges();

  // Return the updated client list in priority order within each status.
  clients = db.prepare(
    `SELECT * FROM clients
     ORDER BY
       CASE status
         WHEN 'backlog' THEN 1
         WHEN 'in-progress' THEN 2
         WHEN 'complete' THEN 3
         ELSE 4
       END,
       priority ASC`
  ).all();




  return res.status(200).send(clients);
});

app.listen(3001);
console.log('app running on port ', 3001);
