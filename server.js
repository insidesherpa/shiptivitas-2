import express from "express";

import Database from "better-sqlite3";

const app = express();

app.use(express.json());

app.get("/", (req, res) => {
  return res
    .status(200)
    .send({ message: "SHIPTIVITY API. Read documentation to see API docs" });
});

// We are keeping one connection alive for the rest of the life application for simplicity
const db = new Database("./clients.db");

// Don't forget to close connection when server gets terminated
const closeDb = () => db.close();
process.on("SIGTERM", closeDb);
process.on("SIGINT", closeDb);

/**
 * Validate id input
 * @param {any} id
 */
const validateId = (id) => {
  if (Number.isNaN(id)) {
    return {
      valid: false,
      messageObj: {
        message: "Invalid id provided.",
        long_message: "Id can only be integer.",
      },
    };
  }
  const client = db
    .prepare("select * from clients where id = ? limit 1")
    .get(id);
  if (!client) {
    return {
      valid: false,
      messageObj: {
        message: "Invalid id provided.",
        long_message: "Cannot find client with that id.",
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
        message: "Invalid priority provided.",
        long_message: "Priority can only be positive integer.",
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
app.get("/api/v1/clients", (req, res) => {
  const status = req.query.status;
  if (status) {
    // status can only be either 'backlog' | 'in-progress' | 'complete'
    if (
      status !== "backlog" &&
      status !== "in-progress" &&
      status !== "complete"
    ) {
      return res.status(400).send({
        message: "Invalid status provided.",
        long_message:
          "Status can only be one of the following: [backlog | in-progress | complete].",
      });
    }
    const clients = db
      .prepare("select * from clients where status = ?")
      .all(status);
    return res.status(200).send(clients);
  }
  const statement = db.prepare("select * from clients");
  const clients = statement.all();
  return res.status(200).send(clients);
});

/**
 * Get a client based on the id provided.
 * GET /api/v1/clients/{client_id} - get client by id
 */
app.get("/api/v1/clients/:id", (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { valid, messageObj } = validateId(id);
  if (!valid) {
    res.status(400).send(messageObj);
  }
  return res
    .status(200)
    .send(db.prepare("select * from clients where id = ?").get(id));
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
  const { valid, messageObj } = validateId(id);
  if (!valid) {
    res.status(400).send(messageObj);
  }

  let { status, priority } = req.body;
  let clients = db.prepare("select * from clients").all();
  const client = clients.find((client) => client.id === id);

  /* ---------- Update code below ----------*/


  // Check if 'status' is provided and validate its value.

if (status && !["backlog", "in-progress", "complete"].includes(status)) {
  return res.status(400).send({
    message: "Invalid status provided.",
    long_message: "Status can only be one of the following: [backlog | in-progress | complete].",
  });
}

// Store the new status, existing status, and existing priority.
const newStatus = status;
const oldStatus = client.status;
const oldPriority = client.priority;

// Check if the status and priority are changing.
const statusChanged = oldStatus !== newStatus;
const priorityChanged = priority !== undefined && oldPriority !== priority;

// Update conditions based on the simplified logic.
if (statusChanged || priorityChanged) {
  // Reorder clients based on the changes.
  client.status = newStatus;
  client.priority = priorityChanged ? priority - 0.5 : Number.MAX_SAFE_INTEGER;

  const clientsWithDifferentStatus = clients.filter((client) => client.status !== oldStatus && client.status !== newStatus);
  
  const clientsWithOldStatus = clients
    .filter((client) => client.status === oldStatus)
    .sort((a, b) => a.priority - b.priority)
    .map((client, index) => ({ ...client, priority: index + 1 }));

  const clientsWithNewStatus = clients
    .filter((client) => client.status === newStatus)
    .sort((a, b) => a.priority - b.priority)
    .map((client, index) => ({ ...client, priority: index + 1 }));

  client.priority = clientsWithNewStatus.length;
  clients = [...clientsWithDifferentStatus, ...clientsWithOldStatus, ...clientsWithNewStatus];

  // Update the entire rows of the table in the database.
  const updateStmt = db.prepare("update clients set status = ?, priority = ? where id = ?");
  clients.forEach((client) => {
    updateStmt.run(client.status, client.priority, client.id);
  });
}

return res.status(200).send(clients);

});

app.listen(3001);
console.log("app running on port ", 3001);