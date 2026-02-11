const Database = require("better-sqlite3");
const fs = require("fs");

const db = new Database("./clients.db");
let dbData = null;

db.prepare("drop table if exists clients").run();
db.prepare(
  `create table clients (
  id integer primary key autoincrement,
  name text not null,
  status integer not null,
  description text,
  priority integer not null
)`,
).run();

fs.readFile("db.txt", "utf-8", (err, data) => {
  if (err) {
    console.error("Error reading db.txt file:", err);
    return;
  } else {
    dbData = JSON.parse(data);
    dbData.forEach((client) => {
      db.prepare(
        "insert into clients (name, status, description, priority) values (?, ?, ?, ?)",
      ).run(client.name, client.status, client.description, client.priority);
    });
    console.log("Database seeded successfully.");
  }
});
