
const express = require("express");
const router = express.Router();

const {
  getClients,
  reorderClients,
} = require("../controllers/clientController");

router.get("/", getClients);
router.put("/reorder", reorderClients);

module.exports = router;
