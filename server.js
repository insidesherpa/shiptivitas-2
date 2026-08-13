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
app.put("/api/v1/clients/:id", (req, res) => {
  const id = parseInt(req.params.id, 10);

  // Validate client ID
  const { valid, messageObj } = validateId(id);

  if (!valid) {
    return res.status(400).send(messageObj);
  }

  const { status, priority } = req.body;

  // Get the current client
  const client = db.prepare("SELECT * FROM clients WHERE id = ?").get(id);

  const oldStatus = client.status;
  const oldPriority = client.priority;

  // If neither status nor priority is provided
  if (status === undefined && priority === undefined) {
    return res.status(400).send({
      message: "Nothing to update.",
    });
  }

  // If a value is not provided, keep the existing value
  const newStatus = status ?? oldStatus;
  let newPriority = priority ?? oldPriority;

  // If status changes but priority is not provided,
  // put the client at the bottom of the new swimlane.
  if (status !== undefined && priority === undefined) {
    const result = db
      .prepare("SELECT COUNT(*) AS count FROM clients WHERE status = ?")
      .get(newStatus);

    newPriority = result.count + 1;
  }

  // Use a transaction so that all database changes either
  // succeed together or are rolled back together.
  const updateClient = db.transaction(() => {
    
    // CASE 1: Client stays in the same swimlane

    if (oldStatus === newStatus) {
      // Moving UP
      //
      // Example:
      // A 1
      // B 2
      // C 3
      // D 4
      //
      // Move D: 4 -> 2
      //
      // B: 2 -> 3
      // C: 3 -> 4
      // D: 4 -> 2
      if (newPriority < oldPriority) {
        db.prepare(
          `
          UPDATE clients
          SET priority = priority + 1
          WHERE status = ?
            AND priority >= ?
            AND priority < ?
            AND id != ?
        `,
        ).run(oldStatus, newPriority, oldPriority, id);
      }

      // Moving DOWN
      //
      // Example:
      // A 1
      // B 2
      // C 3
      // D 4
      //
      // Move A: 1 -> 3
      //
      // B: 2 -> 1
      // C: 3 -> 2
      // A: 1 -> 3
      // ---------------------------------------------------
      else if (newPriority > oldPriority) {
        db.prepare(
          `
          UPDATE clients
          SET priority = priority - 1
          WHERE status = ?
            AND priority > ?
            AND priority <= ?
            AND id != ?
        `,
        ).run(oldStatus, oldPriority, newPriority, id);
      }

      // Finally update the moved client
      db.prepare(
        `
        UPDATE clients
        SET status = ?,
            priority = ?
        WHERE id = ?
      `,
      ).run(newStatus, newPriority, id);
    }

    // CASE 2: Client moves to another swimlane
    else {
      // Step 1:
      // Remove the client from the old swimlane.
      // Everyone below the old position moves UP by 1.
      // Example:
      // A 1
      // B 2  <-- moving
      // C 3
      // D 4
      // Becomes:
      // A 1
      // C 2
      // D 3
      db.prepare(
        `
        UPDATE clients
        SET priority = priority - 1
        WHERE status = ?
          AND priority > ?
      `,
      ).run(oldStatus, oldPriority);
      // Step 2:
      // Make space in the new swimlane.
      //
      // Everyone at or below the destination position
      // moves DOWN by 1.
      //
      // Example:
      // D 1
      // E 2
      // F 3
      //
      // Insert client at position 2:
      //
      // D 1
      // E 3
      // F 4
      db.prepare(
        `
        UPDATE clients
        SET priority = priority + 1
        WHERE status = ?
          AND priority >= ?
      `,
      ).run(newStatus, newPriority);

      // Step 3:
      // Finally move the client to the new swimlane
      // and assign its new priority.
      db.prepare(
        `
        UPDATE clients
        SET status = ?,
            priority = ?
        WHERE id = ?
      `,
      ).run(newStatus, newPriority, id);
    }
  });

  // Execute the transaction
  updateClient();

  // Return the updated clients
  const clients = db
    .prepare(
      `
      SELECT *
      FROM clients
      ORDER BY status, priority
    `,
    )
    .all();

  return res.status(200).send(clients);
});

app.listen(3001);
console.log('app running on port ', 3001);
