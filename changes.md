# Technical Change Documentation: Client Status & Priority Reordering Engine

This document outlines the changes implemented in the latest git commit compared to the previous state (`160bbbb`). It details what was changed, the design rationale, the operational risks of not applying these changes, and how they map directly to the project's Acceptance Criteria.

---

## 1. Summary of Changes

### A. Dependency Upgrades
* **package․json** & **package-lock․json**:
  * Upgraded `better-sqlite3` from `^5.4.0` (released 2019) to `^11.3.0`.
  * Re-generated lockfile using modern NPM configurations.

### B. Core API Server Logic
* **server․js**:
  * Replaced the empty update block inside `PUT /api/v1/clients/:id` with a database transaction-based reordering engine.
  * Added validation for status parameters.
  * Added validation for priority parameters.
  * Added automatic column updates and priority shift queries in SQLite.
  * Re-fetched the clients from the database before sending the HTTP response to prevent returning stale data.

---

## 2. Rationale & Implementation Details

### Why We Upgraded `better-sqlite3`
* **Compatibility with Node.js 22**: Older versions of `better-sqlite3` (such as `5.4.0`) compile native C++ modules under the C++11 standard. The modern V8 engine headers shipped with Node.js 22 require C++17 support. This mismatch caused compile-time errors during `npm install`. Upgrading to `11.3.0` provides prebuilt binaries compatible with modern Node.js runtimes and supports fallback C++17 compilation out of the box.

### Why We Chose Database Transactions for Priority Reordering
* **Atomicity (All-or-Nothing)**: Reordering elements requires multiple updates (shifting priorities up/down for adjacent records and updating the target record). Wrapping these in `db.transaction()` guarantees database consistency, even if the server crashes mid-request.
* **No Memory Overhead**: Instead of retrieving records into JavaScript memory, looping through arrays, incrementing values, and saving them back, the engine utilizes standard SQL mathematical updates (`priority = priority + 1` or `priority = priority - 1`). This is faster, consumes less RAM, and scales efficiently.

---

## 3. Risk Assessment: Impact of Not Applying These Changes

| Risk Area | If Not Implemented |
| :--- | :--- |
| **Environment Blocks** | Development teams using Node.js v22+ will be blocked from installing dependencies and running the application due to C++ compilation errors. |
| **Data Integrity Issues** | Without automatic priority updates, multiple clients in the same swimlane could share the same priority, or gaps (e.g. priorities `1, 2, 5`) would appear. This violates the rule that priority is unique and ordered `1` to `N`. |
| **Race Conditions** | Without database transactions, concurrent requests could write overlapping priorities, corrupting the Kanban board ordering. |
| **Stale User Interface** | Returning cached or stale client data on a PUT response causes the frontend to display outdated states after a drag-and-drop event until the user manually refreshes the page. |

---

## 4. Mapping to Acceptance Criteria

### Criteria 1: "When a user moves a card from one swimlane to another, the database updates the position of the client accordingly."
* **Alignment**: The update engine identifies if `targetStatus !== currentStatus`. It automatically closes the priority gap in the old swimlane by decrementing priorities of all items below it:
  ```sql
  UPDATE clients SET priority = priority - 1 WHERE status = ? AND priority > ?
  ```
  It then shifts the priorities in the target swimlane to create room:
  ```sql
  UPDATE clients SET priority = priority + 1 WHERE status = ? AND priority >= ?
  ```
  Finally, it updates the status and priority of the target card.

### Criteria 2: "When a user rearranges a card in the same swimlane, the database updates the position of the client accordingly."
* **Alignment**: The engine identifies if `targetStatus === currentStatus` and the priority changed. 
  * If the card was moved **up** (lower priority value), it shifts the intermediate cards **down** (adding 1).
  * If the card was moved **down** (higher priority value), it shifts the intermediate cards **up** (subtracting 1).
  * This guarantees that cards are inserted at the exact destination index while all adjacent cards shift predictably.

### Criteria 3: "When a user refreshes the page, the cards position and order should remain in the same spot as before."
* **Alignment**: All mutations are immediately committed to the persistent SQLite database (`clients.db`). When the page is refreshed, the backend serves the current state directly from the DB, ensuring UI persistence.
