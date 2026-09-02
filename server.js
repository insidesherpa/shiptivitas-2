import express from "express";
import Database from "better-sqlite3";

const app = express();

app.use(express.json());

app.get("/", (req, res) => {
  return res.status(200).send({
    message: "SHIPTIVITY API. Read documentation to see API docs",
  });
});

// We are keeping one connection alive for the rest of the life application for simplicity
const db = new Database("./clients.db");

// Don't forget to close connection when gets terminated
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

  const client = db.prepare("select * from clients where id = ? limit 1").get(id);

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
 * Get all of the clients. Optional filter 'status'
 * GET /api/v1/clients?status={status}
 */
app.get("/api/v1/clients", (req, res) => {
  const status = req.query.status;

  if (status) {
    if (status !== "backlog" && status !== "in-progress" && status !== "complete") {
      return res.status(400).send({
        message: "Invalid status provided.",
        long_message: "Status can only be one of the following: [backlog | in-progress | complete].",
      });
    }

    const clients = db.prepare("select * from clients where status = ?").all(status);

    return res.status(200).send(clients);
  }

  const clients = db.prepare("select * from clients").all();

  return res.status(200).send(clients);
});

/**
 * Get a client based on the id provided.
 * GET /api/v1/clients/{client_id}
 */
app.get("/api/v1/clients/:id", (req, res) => {
  const id = parseInt(req.params.id, 10);

  const { valid, messageObj } = validateId(id);

  if (!valid) {
    return res.status(400).send(messageObj);
  }

  return res.status(200).send(db.prepare("select * from clients where id = ?").get(id));
});

/**
 * Update client information.
 *
 * PUT /api/v1/clients/{client_id}
 *
 * Data:
 * status (optional): 'backlog' | 'in-progress' | 'complete'
 * priority (optional): integer
 */
app.put("/api/v1/clients/:id", (req, res) => {
  const id = parseInt(req.params.id, 10);

  const { valid, messageObj } = validateId(id);

  if (!valid) {
    return res.status(400).send(messageObj);
  }

  let { status, priority } = req.body;

  let clients = db.prepare("select * from clients").all();

  const client = clients.find((client) => client.id === id);

  // Validate status
  if (status && status !== "backlog" && status !== "in-progress" && status !== "complete") {
    return res.status(400).send({
      message: "Invalid status provided.",
      long_message: "Status can only be one of the following: [backlog | in-progress | complete].",
    });
  }

  // Validate priority
  if (priority !== undefined) {
    priority = Number(priority);

    if (!Number.isInteger(priority) || priority < 1) {
      return res.status(400).send({
        message: "Invalid priority provided.",
        long_message: "Priority can only be positive integer.",
      });
    }
  }

  const oldStatus = client.status;
  const newStatus = status || oldStatus;

  // Get clients in the old lane, excluding the client being moved
  const oldLane = clients
    .filter((c) => c.status === oldStatus && c.id !== client.id)
    .sort((a, b) => a.priority - b.priority);

  // Get clients in the new lane, excluding the client being moved
  const newLane = clients
    .filter((c) => c.status === newStatus && c.id !== client.id)
    .sort((a, b) => a.priority - b.priority);

  // If moving to another lane, close the gap in the old lane
  if (newStatus !== oldStatus) {
    oldLane.forEach((c, index) => {
      c.priority = index + 1;

      db.prepare("UPDATE clients SET priority = ? WHERE id = ?").run(c.priority, c.id);
    });
  }

  // Determine the new position
  let newPriority;

  if (priority !== undefined) {
    newPriority = Math.min(priority, newLane.length + 1);
  } else {
    // If no priority is supplied, put the client at the bottom
    newPriority = newLane.length + 1;
  }

  // Insert the client into the requested position
  newLane.splice(newPriority - 1, 0, client);

  // Rebuild the lane priorities
  newLane.forEach((c, index) => {
    c.status = newStatus;
    c.priority = index + 1;

    db.prepare("UPDATE clients SET status = ?, priority = ? WHERE id = ?").run(c.status, c.priority, c.id);
  });

  // Return the latest data from the database
  clients = db.prepare("select * from clients").all();

  return res.status(200).send(clients);
});

app.listen(3001);

console.log("app running on port ", 3001);
