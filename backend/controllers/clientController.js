
const mongoose = require("mongoose");
const Client = require("../models/client");

const VALID_STATUSES = [
  "backlog",
  "in-progress",
  "complete",
];

// GET /api/clients
async function getClients(req, res) {
  try {
    const clients = await Client.find()
      .sort({ status: 1, position: 1, _id: 1 })
      .lean();

    res.json(clients);
  } catch (error) {
    console.error("Failed to fetch clients:", error);
    res.status(500).json({ message: "Failed to fetch clients" });
  }
}

// PUT /api/clients/reorder
async function reorderClients(req, res) {
  try {
    const { lanes } = req.body;

    if (!lanes || typeof lanes !== "object" || Array.isArray(lanes)) {
      return res.status(400).json({ message: "Invalid lanes payload" });
    }

    const laneKeys = Object.keys(lanes);

    if (
      laneKeys.length !== VALID_STATUSES.length ||
      !VALID_STATUSES.every(status => Array.isArray(lanes[status])) ||
      laneKeys.some(status => !VALID_STATUSES.includes(status))
    ) {
      return res.status(400).json({
        message: "Provide arrays for backlog, in-progress and complete",
      });
    }

    const allIds = VALID_STATUSES.flatMap(status => lanes[status]);

    if (
      allIds.some(id => typeof id !== "string" || !id.trim()) ||
      new Set(allIds).size !== allIds.length
    ) {
      return res.status(400).json({
        message: "Client IDs must be non-empty strings without duplicates",
      });
    }

    if (allIds.some(id => !mongoose.isValidObjectId(id))) {
      return res.status(400).json({
        message: "One or more client IDs are invalid",
      });
    }

    const existingClients = await Client.find(
      {},
      { _id: 1 }
    ).lean();

    // Require a complete board snapshot so no client is accidentally omitted.
    const existingIds = new Set(
      existingClients.map(client => String(client._id))
    );

    if (
      existingIds.size !== allIds.length ||
      allIds.some(id => !existingIds.has(id))
    ) {
      return res.status(400).json({
        message: "The submitted lanes must contain every existing client exactly once",
      });
    }

    const operations = VALID_STATUSES.flatMap(status =>
      lanes[status].map((id, position) => ({
        updateOne: {
          filter: { _id: new mongoose.Types.ObjectId(id) },
          update: {
            $set: { status, position },
          },
        },
      }))
    );

    if (operations.length > 0) {
      await Client.bulkWrite(operations, { ordered: true });
    }

    const clients = await Client.find()
      .sort({ status: 1, position: 1, _id: 1 })
      .lean();

    return res.json({
      message: "Board order saved",
      clients,
    });
  } catch (error) {
    console.error("Failed to save board order:", error);
    return res.status(500).json({
      message: "Failed to save board order",
    });
  }
}

module.exports = { getClients, reorderClients };
