
const mongoose = require("mongoose");

const clientSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: "",
    },
    status: {
      type: String,
      enum: ["backlog", "in-progress", "complete"],
      default: "backlog",
      required: true,
    },
    position: {
      type: Number,
      default: 0,
      min: 0,
      required: true,
    },
  },
  { timestamps: true }
);

clientSchema.index({ status: 1, position: 1 });

module.exports = mongoose.model("Client", clientSchema);
